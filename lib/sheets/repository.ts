import { randomUUID } from "node:crypto";
import { sheetsStore } from "./store";
import type {
  AnnouncementRecord,
  AnnouncementWithProject,
  ChangeEventRecord,
  NotificationDeliveryRecord,
  ProjectRecord,
  RawPayloadRecord,
  SnapshotRecord,
  SyncRunRecord,
  UnitRecord,
  UserFollowRecord,
} from "./types";

function toProject(record: AnnouncementRecord): ProjectRecord {
  return {
    id: record.projectId,
    housingMgmtNo: record.housingMgmtNo,
    name: record.projectName,
    slug: record.projectSlug,
    regionId: record.regionId,
    address: record.address,
    builderName: record.builderName,
    developerName: record.developerName,
    totalHouseholds: record.totalHouseholds,
    sourceProviderId: record.projectSourceProviderId,
    externalSourceKey: record.projectExternalSourceKey,
    metadata: record.projectMetadata,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function withProject(record: AnnouncementRecord): AnnouncementWithProject {
  const projectFields = new Set([
    "housingMgmtNo", "projectName", "projectSlug", "regionId", "address", "builderName",
    "developerName", "totalHouseholds", "projectSourceProviderId", "projectExternalSourceKey", "projectMetadata",
  ]);
  const announcement = Object.fromEntries(
    Object.entries(record).filter(([key]) => !projectFields.has(key))
  ) as Omit<AnnouncementWithProject, "project">;
  return { ...announcement, project: toProject(record) };
}

export async function listAnnouncementRecords() {
  return sheetsStore.read("announcements");
}

export async function listAnnouncements() {
  return (await listAnnouncementRecords()).map(withProject);
}

export async function listProjects() {
  const projects = new Map<string, ProjectRecord>();
  for (const record of await listAnnouncementRecords()) {
    const current = projects.get(record.projectId);
    if (!current || current.updatedAt < record.updatedAt) projects.set(record.projectId, toProject(record));
  }
  return Array.from(projects.values());
}

export async function getProjectBySlug(slug: string) {
  const records = (await listAnnouncementRecords())
    .filter((record) => record.projectSlug === slug)
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  if (records.length === 0) return null;
  const unitRows = await sheetsStore.read("units");
  const project = toProject(records[0]);
  return {
    ...project,
    announcements: records.map((record) => ({
      ...withProject(record),
      units: unitRows.filter((unit) => unit.announcementId === record.id),
    })),
  };
}

export async function upsertAnnouncements(records: AnnouncementRecord[]) {
  return sheetsStore.upsert("announcements", records, "announceNo");
}

export async function updateAnnouncement(id: string, patch: Partial<AnnouncementRecord>) {
  return sheetsStore.updateByKey("announcements", id, { ...patch, updatedAt: new Date() }, "id");
}

export async function deleteAnnouncements(ids: string[]) {
  const idSet = new Set(ids);
  const [announcements, units, snapshots] = await Promise.all([
    sheetsStore.deleteWhere("announcements", (record) => idSet.has(record.id)),
    sheetsStore.deleteWhere("units", (record) => idSet.has(record.announcementId)),
    sheetsStore.deleteWhere("snapshots", (record) => idSet.has(record.announcementId)),
  ]);
  return { announcements, units, snapshots };
}

export async function listSyncRuns() {
  return sheetsStore.read("syncRuns");
}

export async function upsertSyncRuns(records: SyncRunRecord[]) {
  return sheetsStore.upsert("syncRuns", records, "id");
}

export async function appendSnapshots(records: SnapshotRecord[]) {
  return sheetsStore.append("snapshots", records);
}

export async function appendChangeEvents(records: ChangeEventRecord[]) {
  return sheetsStore.append("changeEvents", records);
}

export async function listChangeEvents() {
  return sheetsStore.read("changeEvents");
}

export async function replaceAnnouncementUnits(announcementId: string, units: Omit<UnitRecord, "id" | "announcementId">[]) {
  const current = await sheetsStore.read("units");
  const next = [
    ...current.filter((unit) => unit.announcementId !== announcementId),
    ...units.map((unit) => ({ id: randomUUID(), announcementId, ...unit })),
  ];
  await sheetsStore.replace("units", next);
  return next.filter((unit) => unit.announcementId === announcementId);
}

export async function appendRawPayloads(records: RawPayloadRecord[]) {
  return sheetsStore.append("rawPayloads", records);
}

export async function listUserFollows() {
  return sheetsStore.read("userFollows");
}

export async function listNotificationDeliveries() {
  return sheetsStore.read("notificationDeliveries");
}

export async function appendNotificationDeliveries(records: NotificationDeliveryRecord[]) {
  return sheetsStore.append("notificationDeliveries", records);
}

export async function appendUserFollows(records: UserFollowRecord[]) {
  return sheetsStore.append("userFollows", records);
}

export async function loadOperationalTables() {
  return sheetsStore.readMany(["announcements", "syncRuns", "changeEvents", "units"]);
}
