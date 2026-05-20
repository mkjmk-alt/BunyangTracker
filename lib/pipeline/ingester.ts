import { db } from "../db";
import { 
  sourceProviders,
  sourceSyncRuns, 
  rawSourcePayloads, 
  housingProjects, 
  announcements, 
  announcementSnapshots,
  announcementUnits,
  changeEvents 
} from "../db/schema";
import { SourceProvider } from "../sources/provider";
import { compareAnnouncements, generateDiffSummary } from "../diff/announcement-diff";
import { generateFingerprint } from "../normalize/announcement";
import { eq } from "drizzle-orm";

export class Ingester {
  constructor(private provider: SourceProvider<any>) {}

  async processItem(syncRunId: string, rawData: any) {
    const providerId = this.provider.providerId;
    const externalKey = this.provider.getStableExternalId(rawData);
    
    // 1. Raw Payload 저장
    const [rawPayload] = await db.insert(rawSourcePayloads).values({
      syncRunId,
      providerId: await this.getProviderUuid(providerId),
      externalKey,
      payload: rawData,
    }).returning();

    // 2. Normalize
    const normalized = this.provider.normalize(rawData);
    const fingerprint = generateFingerprint(normalized);

    // 3. Housing Project Upsert
    console.log(`[Ingester] Upserting project: ${normalized.name} (${normalized.housingMgmtNo})`);
    const [project] = await db.insert(housingProjects).values({
      housingMgmtNo: normalized.housingMgmtNo,
      name: normalized.name,
      slug: normalized.slug,
      address: normalized.address,
      builderName: normalized.builderName,
      developerName: normalized.developerName,
      totalHouseholds: normalized.totalHouseholds,
      externalSourceKey: normalized.externalSourceKey,
    }).onConflictDoUpdate({
      target: housingProjects.housingMgmtNo,
      set: {
        name: normalized.name,
        address: normalized.address,
        updatedAt: new Date(),
      }
    }).returning();

    if (!project) {
      console.error(`[Ingester] Failed to upsert project: ${normalized.name}`);
      return;
    }

    // 4. Announcement Upsert & Diff
    try {
      // Check if announcement already exists first to optimize performance
      const existingAnn = await db.query.announcements.findFirst({
        where: eq(announcements.announceNo, normalized.announceNo),
      });

      let shouldFetchAttachments = true;
      let shouldFetchUnits = true;

      if (existingAnn) {
        // If we already have attachment metadata, reuse it and skip scraping
        if (existingAnn.atchmnflSeqNo && existingAnn.atchmnflSeqNo !== "NONE") {
          normalized.atchmnflSeqNo = existingAnn.atchmnflSeqNo;
          normalized.atchmnflSn = existingAnn.atchmnflSn;
          shouldFetchAttachments = false;
        }

        // Check if we already have units in the database
        const [existingUnits] = await db
          .select({ id: announcementUnits.id })
          .from(announcementUnits)
          .where(eq(announcementUnits.announcementId, existingAnn.id))
          .limit(1);
        if (existingUnits) {
          shouldFetchUnits = false;
        }
      }

      // ApplyHome specific logic: Discover attachment metadata if missing and required
      if (shouldFetchAttachments && normalized.externalSourceKey.startsWith("applyhome") && (!normalized.atchmnflSeqNo || !normalized.atchmnflSn)) {
        const { ApplyHomeApiProvider } = await import("../sources/applyhome-api");
        const provider = new ApplyHomeApiProvider();
        const attachments = await provider.discoverAttachments(normalized.housingMgmtNo, normalized.announceNo, normalized.pblancUrl || undefined, normalized.supplyType);
        if (attachments.seqNo && attachments.sn) {
          normalized.atchmnflSeqNo = attachments.seqNo;
          normalized.atchmnflSn = attachments.sn;
          console.log(`[Ingester] Discovered attachments for ${normalized.name}: ${attachments.seqNo}, ${attachments.sn}`);
        }
      }

      console.log(`[Ingester] Upserting announcement: ${normalized.announceNo} for project: ${project.id}`);

      const [announcement] = await db.insert(announcements).values({
        projectId: project.id,
        announceNo: normalized.announceNo,
        supplyType: normalized.supplyType,
        status: normalized.status,
        announceDate: normalized.announceDate,
        applyStartDate: normalized.applyStartDate,
        applyEndDate: normalized.applyEndDate,
        winnerAnnounceDate: normalized.winnerAnnounceDate,
        contractStartDate: normalized.contractStartDate,
        contractEndDate: normalized.contractEndDate,
        moveInDate: normalized.moveInDate,
        pblancUrl: normalized.pblancUrl,
        homepageAdres: normalized.homepageAdres,
        atchmnflSeqNo: normalized.atchmnflSeqNo,
        atchmnflSn: normalized.atchmnflSn,
        externalSourceKey: normalized.externalSourceKey,
        rawPayloadId: rawPayload.id,
        fingerprint,
      }).onConflictDoUpdate({
        target: announcements.announceNo,
        set: {
          status: normalized.status,
          applyStartDate: normalized.applyStartDate,
          applyEndDate: normalized.applyEndDate,
          pblancUrl: normalized.pblancUrl,
          homepageAdres: normalized.homepageAdres,
          atchmnflSeqNo: normalized.atchmnflSeqNo,
          atchmnflSn: normalized.atchmnflSn,
          fingerprint,
          updatedAt: new Date(),
        }
      }).returning();

      if (!announcement) {
        console.error(`[Ingester] Failed to upsert announcement: ${normalized.announceNo}`);
        return;
      }

      // 4.5. Fetch and Save Units (only if we don't have them yet or it's a new announcement)
      if (shouldFetchUnits && (this.provider as any).fetchUnits) {
        console.log(`[Ingester] Fetching units for: ${normalized.announceNo}`);
        const rawItem = (rawPayload.payload as any);
        const units = await (this.provider as any).fetchUnits(
          normalized.housingMgmtNo, 
          normalized.announceNo,
          rawItem._type // Use attached type
        );

        if (units.length > 0) {
          // Clear existing units first
          await db.delete(announcementUnits).where(eq(announcementUnits.announcementId, announcement.id));
          
          // Insert new units
          await db.insert(announcementUnits).values(
            units.map((u: any) => ({
              announcementId: announcement.id,
              ...u
            }))
          );
          console.log(`[Ingester] Saved ${units.length} units for ${normalized.announceNo}`);
        }
      }

      // 5. Change Detection
      if (existingAnn?.fingerprint !== fingerprint) {
        // Fetch latest snapshot
        const latestSnapshot = existingAnn?.latestSnapshotId 
          ? await db.query.announcementSnapshots.findFirst({ where: eq(announcementSnapshots.id, existingAnn.latestSnapshotId) })
          : null;

        const diff = compareAnnouncements(latestSnapshot?.snapshotData as any, normalized);
        
        if (diff.hasChanged) {
          await db.insert(changeEvents).values({
            eventType: diff.eventType,
            entityType: "announcement",
            entityId: announcement.id,
            syncRunId,
            previousData: latestSnapshot?.snapshotData,
            currentData: normalized,
            diffSummary: generateDiffSummary(diff),
            severity: diff.severity,
          });
        }

        // 6. Create Snapshot
        const [snapshot] = await db.insert(announcementSnapshots).values({
          announcementId: announcement.id,
          syncRunId,
          snapshotData: normalized,
          fingerprint,
        }).returning();

        // Update announcement with latest snapshot ID
        await db.update(announcements)
          .set({ latestSnapshotId: snapshot.id })
          .where(eq(announcements.id, announcement.id));
      }
    } catch (error: any) {
      console.error(`[Ingester] CRITICAL ERROR upserting announcement ${normalized.announceNo}:`);
      console.error(error); // Log the full error object
      if (error.detail) console.error(`[Ingester] Error Detail:`, error.detail);
    }
  }

  private async getProviderUuid(name: string): Promise<string> {
    const provider = await db.query.sourceProviders.findFirst({
      where: (p, { eq }) => eq(p.name, name),
    });
    if (!provider) {
      const [newProvider] = await db.insert(sourceProviders).values({ 
        name,
        displayName: name,
        isActive: true,
      }).returning();
      return newProvider.id;
    }
    return provider.id;
  }
}
