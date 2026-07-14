import { inArray } from "drizzle-orm";
import { db } from "../lib/db";
import {
  announcements,
  announcementSnapshots,
  announcementUnits,
  changeEvents,
  housingProjects,
  notificationDeliveries,
  rawSourcePayloads,
  sourceProviders,
  sourceSyncRuns,
  userFollows,
} from "../lib/db/schema";
import { sheetsStore } from "../lib/sheets/store";
import type {
  AnnouncementRecord,
  NotificationDeliveryRecord,
  RawPayloadRecord,
  SnapshotRecord,
  SyncRunRecord,
  UnitRecord,
  UserFollowRecord,
} from "../lib/sheets/types";

const includeHistory = process.argv.includes("--include-history");

function asNumber(value: string | number | null) {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function loadLatestSnapshots(ids: string[]) {
  const rows = [];
  for (let index = 0; index < ids.length; index += 200) {
    rows.push(
      ...(await db
        .select()
        .from(announcementSnapshots)
        .where(inArray(announcementSnapshots.id, ids.slice(index, index + 200))))
    );
  }
  return rows;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("마이그레이션 원본 DATABASE_URL이 필요합니다.");
  await sheetsStore.initialize();

  const [providerRows, projectRows, announcementRows, syncRows, unitRows, eventRows, followRows, deliveryRows] =
    await Promise.all([
      db.select().from(sourceProviders),
      db.select().from(housingProjects),
      db.select().from(announcements),
      db.select().from(sourceSyncRuns),
      db.select().from(announcementUnits),
      db.select().from(changeEvents),
      db.select().from(userFollows),
      db.select().from(notificationDeliveries),
    ]);

  const providerMap = new Map(providerRows.map((row) => [row.id, row]));
  const projectMap = new Map(projectRows.map((row) => [row.id, row]));
  const latestIds = announcementRows.flatMap((row) => (row.latestSnapshotId ? [row.latestSnapshotId] : []));
  const latestSnapshots = await loadLatestSnapshots(latestIds);
  const latestSnapshotMap = new Map(latestSnapshots.map((row) => [row.id, row]));

  const sheetAnnouncements: AnnouncementRecord[] = announcementRows.flatMap((row) => {
    const project = projectMap.get(row.projectId);
    if (!project) {
      console.warn(`단지를 찾지 못해 공고를 건너뜁니다: ${row.announceNo}`);
      return [];
    }
    return [{
      id: row.id,
      projectId: project.id,
      housingMgmtNo: project.housingMgmtNo,
      projectName: project.name,
      projectSlug: project.slug,
      regionId: project.regionId,
      address: project.address,
      builderName: project.builderName,
      developerName: project.developerName,
      totalHouseholds: project.totalHouseholds,
      projectSourceProviderId: project.sourceProviderId,
      projectExternalSourceKey: project.externalSourceKey,
      projectMetadata: project.metadata,
      announceNo: row.announceNo,
      supplyType: row.supplyType,
      status: row.status,
      displayStatus: row.displayStatus,
      announceDate: row.announceDate,
      applyStartDate: row.applyStartDate,
      applyEndDate: row.applyEndDate,
      winnerAnnounceDate: row.winnerAnnounceDate,
      contractStartDate: row.contractStartDate,
      contractEndDate: row.contractEndDate,
      moveInDate: row.moveInDate,
      totalSupplyHouseholds: row.totalSupplyHouseholds,
      generalSupplyHouseholds: row.generalSupplyHouseholds,
      specialSupplyHouseholds: row.specialSupplyHouseholds,
      sourceProviderId: row.sourceProviderId,
      externalSourceKey: row.externalSourceKey,
      rawPayloadId: row.rawPayloadId,
      pblancUrl: row.pblancUrl,
      homepageAdres: row.homepageAdres,
      metadata: row.metadata,
      atchmnflSeqNo: row.atchmnflSeqNo,
      atchmnflSn: row.atchmnflSn,
      isBookmarked: row.isBookmarked ?? false,
      fingerprint: row.fingerprint,
      latestSnapshotId: row.latestSnapshotId,
      latestSnapshotData: row.latestSnapshotId ? latestSnapshotMap.get(row.latestSnapshotId)?.snapshotData ?? null : null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }];
  });

  const sheetSyncRuns: SyncRunRecord[] = syncRows.map((row) => {
    const provider = providerMap.get(row.providerId);
    return {
      ...row,
      providerName: provider?.name || row.providerId,
      providerDisplayName: provider?.displayName || provider?.name || null,
    };
  });

  const sheetUnits: UnitRecord[] = unitRows.map((row) => ({
    ...row,
    supplyArea: row.supplyArea,
    exclusiveArea: row.exclusiveArea,
    priceMin: asNumber(row.priceMin),
    priceMax: asNumber(row.priceMax),
  }));
  const sheetFollows: UserFollowRecord[] = followRows.map((row) => ({
    ...row,
    notifyScheduleChange: row.notifyScheduleChange ?? true,
    notifyMusoonwi: row.notifyMusoonwi ?? true,
    notifyNewAnnouncement: row.notifyNewAnnouncement ?? true,
  }));
  const sheetDeliveries: NotificationDeliveryRecord[] = deliveryRows;

  const snapshotRows = includeHistory ? await db.select().from(announcementSnapshots) : latestSnapshots;
  const sheetSnapshots: SnapshotRecord[] = snapshotRows;
  const sheetRawPayloads: RawPayloadRecord[] = includeHistory
    ? (await db.select().from(rawSourcePayloads)).map((row) => ({ ...row, isProcessed: row.isProcessed ?? false }))
    : [];

  await sheetsStore.replace("announcements", sheetAnnouncements);
  await sheetsStore.replace("syncRuns", sheetSyncRuns);
  await sheetsStore.replace("units", sheetUnits);
  await sheetsStore.replace("changeEvents", eventRows);
  await sheetsStore.replace("snapshots", sheetSnapshots);
  await sheetsStore.replace("rawPayloads", sheetRawPayloads);
  await sheetsStore.replace("userFollows", sheetFollows);
  await sheetsStore.replace("notificationDeliveries", sheetDeliveries);

  console.log(`공고 ${sheetAnnouncements.length}건, 수집이력 ${sheetSyncRuns.length}건, 변경이력 ${eventRows.length}건을 이전했습니다.`);
  console.log(
    includeHistory
      ? `전체 스냅샷 ${sheetSnapshots.length}건과 원본응답 ${sheetRawPayloads.length}건을 포함했습니다.`
      : "최신 스냅샷만 이전했습니다. 전체 원본/스냅샷이 필요하면 --include-history 옵션을 사용하세요."
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
