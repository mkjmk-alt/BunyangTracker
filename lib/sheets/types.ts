export type JsonValue = unknown;

export type AnnouncementRecord = {
  id: string;
  projectId: string;
  housingMgmtNo: string;
  projectName: string;
  projectSlug: string;
  regionId: string | null;
  address: string | null;
  builderName: string | null;
  developerName: string | null;
  totalHouseholds: number | null;
  projectSourceProviderId: string | null;
  projectExternalSourceKey: string | null;
  projectMetadata: JsonValue;
  announceNo: string;
  supplyType: string;
  status: string;
  displayStatus: string | null;
  announceDate: string | null;
  applyStartDate: string | null;
  applyEndDate: string | null;
  winnerAnnounceDate: string | null;
  contractStartDate: string | null;
  contractEndDate: string | null;
  moveInDate: string | null;
  totalSupplyHouseholds: number | null;
  generalSupplyHouseholds: number | null;
  specialSupplyHouseholds: number | null;
  sourceProviderId: string | null;
  externalSourceKey: string | null;
  rawPayloadId: string | null;
  pblancUrl: string | null;
  homepageAdres: string | null;
  metadata: JsonValue;
  atchmnflSeqNo: string | null;
  atchmnflSn: string | null;
  isBookmarked: boolean;
  fingerprint: string | null;
  latestSnapshotId: string | null;
  latestSnapshotData: JsonValue;
  createdAt: Date;
  updatedAt: Date;
};

export type ProjectRecord = {
  id: string;
  housingMgmtNo: string;
  name: string;
  slug: string;
  regionId: string | null;
  address: string | null;
  builderName: string | null;
  developerName: string | null;
  totalHouseholds: number | null;
  sourceProviderId: string | null;
  externalSourceKey: string | null;
  metadata: JsonValue;
  createdAt: Date;
  updatedAt: Date;
};

export type AnnouncementWithProject = Omit<
  AnnouncementRecord,
  | "housingMgmtNo"
  | "projectName"
  | "projectSlug"
  | "regionId"
  | "address"
  | "builderName"
  | "developerName"
  | "totalHouseholds"
  | "projectSourceProviderId"
  | "projectExternalSourceKey"
  | "projectMetadata"
> & {
  project: ProjectRecord;
};

export type SyncRunRecord = {
  id: string;
  providerId: string;
  providerName: string;
  providerDisplayName: string | null;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  totalFetched: number | null;
  totalNormalized: number | null;
  totalUpserted: number | null;
  totalChanged: number | null;
  totalErrors: number | null;
  errorSummary: string | null;
  metadata: JsonValue;
};

export type SnapshotRecord = {
  id: string;
  announcementId: string;
  syncRunId: string;
  snapshotData: JsonValue;
  fingerprint: string;
  snapshottedAt: Date;
};

export type UnitRecord = {
  id: string;
  announcementId: string;
  unitType: string;
  supplyArea: string | null;
  exclusiveArea: string | null;
  generalSupply: number | null;
  specialSupply: number | null;
  priceMin: number | null;
  priceMax: number | null;
  floorMin: number | null;
  floorMax: number | null;
};

export type ChangeEventRecord = {
  id: string;
  eventType: string;
  entityType: string;
  entityId: string;
  syncRunId: string | null;
  previousData: JsonValue;
  currentData: JsonValue;
  diffSummary: string | null;
  severity: string;
  detectedAt: Date;
  notifiedAt: Date | null;
};

export type RawPayloadRecord = {
  id: string;
  syncRunId: string;
  providerId: string;
  externalKey: string;
  payload: JsonValue;
  fetchedAt: Date;
  isProcessed: boolean;
};

export type UserFollowRecord = {
  id: string;
  userId: string;
  projectId: string;
  notifyScheduleChange: boolean;
  notifyMusoonwi: boolean;
  notifyNewAnnouncement: boolean;
  createdAt: Date;
};

export type NotificationDeliveryRecord = {
  id: string;
  userId: string;
  changeEventId: string;
  channel: string;
  status: string;
  sentAt: Date | null;
  errorMessage: string | null;
};

export type SheetsTableMap = {
  announcements: AnnouncementRecord;
  syncRuns: SyncRunRecord;
  snapshots: SnapshotRecord;
  units: UnitRecord;
  changeEvents: ChangeEventRecord;
  rawPayloads: RawPayloadRecord;
  userFollows: UserFollowRecord;
  notificationDeliveries: NotificationDeliveryRecord;
};

export type SheetsTableName = keyof SheetsTableMap;
