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

      if (existingAnn) {
        // If we already have attachment metadata, reuse it so we don't overwrite it with null
        if (existingAnn.atchmnflSeqNo && !normalized.atchmnflSeqNo) {
          normalized.atchmnflSeqNo = existingAnn.atchmnflSeqNo;
          normalized.atchmnflSn = existingAnn.atchmnflSn;
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
