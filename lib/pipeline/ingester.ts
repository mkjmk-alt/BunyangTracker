import { randomUUID } from "node:crypto";
import { compareAnnouncements, generateDiffSummary } from "../diff/announcement-diff";
import { generateFingerprint } from "../normalize/announcement";
import {
  appendChangeEvents,
  appendRawPayloads,
  appendSnapshots,
  listAnnouncementRecords,
  upsertAnnouncements,
} from "../sheets/repository";
import type { AnnouncementRecord } from "../sheets/types";
import { SourceProvider } from "../sources/provider";

export class Ingester {
  constructor(private provider: SourceProvider<any>) {}

  async processItem(syncRunId: string, rawData: any) {
    const providerId = this.provider.providerId;
    const externalKey = this.provider.getStableExternalId(rawData);
    const rawPayloadId = randomUUID();
    await appendRawPayloads([{
      id: rawPayloadId,
      syncRunId,
      providerId,
      externalKey,
      payload: rawData,
      fetchedAt: new Date(),
      isProcessed: true,
    }]);

    const normalized = this.provider.normalize(rawData);
    const fingerprint = generateFingerprint(normalized);
    const existingRows = await listAnnouncementRecords();
    const existing = existingRows.find((row) => row.announceNo === normalized.announceNo);
    const existingProject = existingRows.find((row) => row.housingMgmtNo === normalized.housingMgmtNo);
    const now = new Date();

    const record: AnnouncementRecord = {
      id: existing?.id || randomUUID(),
      projectId: existingProject?.projectId || randomUUID(),
      housingMgmtNo: normalized.housingMgmtNo,
      projectName: normalized.name,
      projectSlug: normalized.slug,
      regionId: existingProject?.regionId || null,
      address: normalized.address || null,
      builderName: normalized.builderName || null,
      developerName: normalized.developerName || null,
      totalHouseholds: normalized.totalHouseholds ?? null,
      projectSourceProviderId: providerId,
      projectExternalSourceKey: normalized.externalSourceKey || null,
      projectMetadata: existingProject?.projectMetadata || null,
      announceNo: normalized.announceNo,
      supplyType: normalized.supplyType,
      status: normalized.status,
      displayStatus: normalized.displayStatus || null,
      announceDate: normalized.announceDate,
      applyStartDate: normalized.applyStartDate,
      applyEndDate: normalized.applyEndDate,
      winnerAnnounceDate: normalized.winnerAnnounceDate,
      contractStartDate: normalized.contractStartDate,
      contractEndDate: normalized.contractEndDate,
      moveInDate: normalized.moveInDate,
      totalSupplyHouseholds: existing?.totalSupplyHouseholds ?? null,
      generalSupplyHouseholds: existing?.generalSupplyHouseholds ?? null,
      specialSupplyHouseholds: existing?.specialSupplyHouseholds ?? null,
      sourceProviderId: providerId,
      externalSourceKey: normalized.externalSourceKey || null,
      rawPayloadId,
      pblancUrl: normalized.pblancUrl || null,
      homepageAdres: normalized.homepageAdres || null,
      metadata: existing?.metadata || null,
      atchmnflSeqNo: normalized.atchmnflSeqNo || existing?.atchmnflSeqNo || null,
      atchmnflSn: normalized.atchmnflSn || existing?.atchmnflSn || null,
      isBookmarked: existing?.isBookmarked || false,
      fingerprint,
      latestSnapshotId: existing?.latestSnapshotId || null,
      latestSnapshotData: existing?.latestSnapshotData || null,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    if (existing?.fingerprint !== fingerprint) {
      const diff = compareAnnouncements(existing?.latestSnapshotData as any, normalized);
      if (diff.hasChanged) {
        await appendChangeEvents([{
          id: randomUUID(),
          eventType: diff.eventType,
          entityType: "announcement",
          entityId: record.id,
          syncRunId,
          previousData: existing?.latestSnapshotData || null,
          currentData: normalized,
          diffSummary: generateDiffSummary(diff),
          severity: diff.severity,
          detectedAt: now,
          notifiedAt: null,
        }]);
      }

      const snapshotId = randomUUID();
      await appendSnapshots([{
        id: snapshotId,
        announcementId: record.id,
        syncRunId,
        snapshotData: normalized,
        fingerprint,
        snapshottedAt: now,
      }]);
      record.latestSnapshotId = snapshotId;
      record.latestSnapshotData = normalized;
    }

    await upsertAnnouncements([record]);
  }
}
