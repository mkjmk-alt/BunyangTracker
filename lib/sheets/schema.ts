import type { SheetsTableMap, SheetsTableName } from "./types";
import { gzipSync, gunzipSync } from "node:zlib";

type ColumnKind = "string" | "nullableString" | "number" | "nullableNumber" | "boolean" | "json" | "dateTime" | "nullableDateTime";

export type ColumnDefinition<T> = {
  key: keyof T & string;
  kind: ColumnKind;
};

export type TableDefinition<T> = {
  title: string;
  key: keyof T & string;
  columns: ColumnDefinition<T>[];
};

const column = <T>(key: keyof T & string, kind: ColumnKind): ColumnDefinition<T> => ({ key, kind });

const announcements: TableDefinition<SheetsTableMap["announcements"]> = {
  title: "공고목록",
  key: "announceNo",
  columns: [
    column("id", "string"), column("projectId", "string"), column("housingMgmtNo", "string"),
    column("projectName", "string"), column("projectSlug", "string"), column("regionId", "nullableString"),
    column("address", "nullableString"), column("builderName", "nullableString"), column("developerName", "nullableString"),
    column("totalHouseholds", "nullableNumber"), column("projectSourceProviderId", "nullableString"),
    column("projectExternalSourceKey", "nullableString"), column("projectMetadata", "json"),
    column("announceNo", "string"), column("supplyType", "string"), column("status", "string"),
    column("displayStatus", "nullableString"), column("announceDate", "nullableString"),
    column("applyStartDate", "nullableString"), column("applyEndDate", "nullableString"),
    column("winnerAnnounceDate", "nullableString"), column("contractStartDate", "nullableString"),
    column("contractEndDate", "nullableString"), column("moveInDate", "nullableString"),
    column("totalSupplyHouseholds", "nullableNumber"), column("generalSupplyHouseholds", "nullableNumber"),
    column("specialSupplyHouseholds", "nullableNumber"), column("sourceProviderId", "nullableString"),
    column("externalSourceKey", "nullableString"), column("rawPayloadId", "nullableString"),
    column("pblancUrl", "nullableString"), column("homepageAdres", "nullableString"), column("metadata", "json"),
    column("atchmnflSeqNo", "nullableString"), column("atchmnflSn", "nullableString"),
    column("isBookmarked", "boolean"), column("fingerprint", "nullableString"),
    column("latestSnapshotId", "nullableString"), column("latestSnapshotData", "json"),
    column("createdAt", "dateTime"), column("updatedAt", "dateTime"),
  ],
};

const syncRuns: TableDefinition<SheetsTableMap["syncRuns"]> = {
  title: "수집이력",
  key: "id",
  columns: [
    column("id", "string"), column("providerId", "string"), column("providerName", "string"),
    column("providerDisplayName", "nullableString"), column("status", "string"), column("startedAt", "dateTime"),
    column("finishedAt", "nullableDateTime"), column("totalFetched", "nullableNumber"),
    column("totalNormalized", "nullableNumber"), column("totalUpserted", "nullableNumber"),
    column("totalChanged", "nullableNumber"), column("totalErrors", "nullableNumber"),
    column("errorSummary", "nullableString"), column("metadata", "json"),
  ],
};

const snapshots: TableDefinition<SheetsTableMap["snapshots"]> = {
  title: "스냅샷",
  key: "id",
  columns: [
    column("id", "string"), column("announcementId", "string"), column("syncRunId", "string"),
    column("snapshotData", "json"), column("fingerprint", "string"), column("snapshottedAt", "dateTime"),
  ],
};

const units: TableDefinition<SheetsTableMap["units"]> = {
  title: "세대정보",
  key: "id",
  columns: [
    column("id", "string"), column("announcementId", "string"), column("unitType", "string"),
    column("supplyArea", "nullableString"), column("exclusiveArea", "nullableString"),
    column("generalSupply", "nullableNumber"), column("specialSupply", "nullableNumber"),
    column("priceMin", "nullableNumber"), column("priceMax", "nullableNumber"),
    column("floorMin", "nullableNumber"), column("floorMax", "nullableNumber"),
  ],
};

const changeEvents: TableDefinition<SheetsTableMap["changeEvents"]> = {
  title: "변경이력",
  key: "id",
  columns: [
    column("id", "string"), column("eventType", "string"), column("entityType", "string"),
    column("entityId", "string"), column("syncRunId", "nullableString"), column("previousData", "json"),
    column("currentData", "json"), column("diffSummary", "nullableString"), column("severity", "string"),
    column("detectedAt", "dateTime"), column("notifiedAt", "nullableDateTime"),
  ],
};

const rawPayloads: TableDefinition<SheetsTableMap["rawPayloads"]> = {
  title: "원본응답",
  key: "id",
  columns: [
    column("id", "string"), column("syncRunId", "string"), column("providerId", "string"),
    column("externalKey", "string"), column("payload", "json"), column("fetchedAt", "dateTime"),
    column("isProcessed", "boolean"),
  ],
};

const userFollows: TableDefinition<SheetsTableMap["userFollows"]> = {
  title: "알림설정",
  key: "id",
  columns: [
    column("id", "string"), column("userId", "string"), column("projectId", "string"),
    column("notifyScheduleChange", "boolean"), column("notifyMusoonwi", "boolean"),
    column("notifyNewAnnouncement", "boolean"), column("createdAt", "dateTime"),
  ],
};

const notificationDeliveries: TableDefinition<SheetsTableMap["notificationDeliveries"]> = {
  title: "알림발송",
  key: "id",
  columns: [
    column("id", "string"), column("userId", "string"), column("changeEventId", "string"),
    column("channel", "string"), column("status", "string"), column("sentAt", "nullableDateTime"),
    column("errorMessage", "nullableString"),
  ],
};

export const SHEETS_SCHEMA: { [K in SheetsTableName]: TableDefinition<SheetsTableMap[K]> } = {
  announcements,
  syncRuns,
  snapshots,
  units,
  changeEvents,
  rawPayloads,
  userFollows,
  notificationDeliveries,
};

export const SHEETS_TABLE_NAMES = Object.keys(SHEETS_SCHEMA) as SheetsTableName[];

export function serializeCell(value: unknown, kind: ColumnKind): string | number | boolean {
  if (value === null || value === undefined) return "";
  if (kind === "dateTime" || kind === "nullableDateTime") {
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }
  if (kind === "json") {
    const json = value === null ? "" : JSON.stringify(value);
    return json.length > 45_000 ? `__gzip_base64__:${gzipSync(json).toString("base64")}` : json;
  }
  if (kind === "boolean") return Boolean(value);
  if (kind === "number" || kind === "nullableNumber") return Number(value);
  return String(value);
}

export function parseCell(value: unknown, kind: ColumnKind): unknown {
  const empty = value === "" || value === null || value === undefined;
  if (kind === "nullableString" || kind === "nullableNumber" || kind === "nullableDateTime") {
    if (empty) return null;
  }
  if (kind === "string") return empty ? "" : String(value);
  if (kind === "nullableString") return String(value);
  if (kind === "number" || kind === "nullableNumber") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : kind === "number" ? 0 : null;
  }
  if (kind === "boolean") return value === true || String(value).toLowerCase() === "true";
  if (kind === "dateTime" || kind === "nullableDateTime") {
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? (kind === "dateTime" ? new Date(0) : null) : date;
  }
  if (kind === "json") {
    if (empty) return null;
    try {
      const serialized = String(value);
      const json = serialized.startsWith("__gzip_base64__:")
        ? gunzipSync(Buffer.from(serialized.slice("__gzip_base64__:".length), "base64")).toString("utf8")
        : serialized;
      return JSON.parse(json);
    } catch {
      return null;
    }
  }
  return value;
}

export function recordToRow<K extends SheetsTableName>(table: K, record: SheetsTableMap[K]) {
  return SHEETS_SCHEMA[table].columns.map((definition) =>
    serializeCell(record[definition.key], definition.kind)
  );
}

export function rowToRecord<K extends SheetsTableName>(table: K, row: unknown[]): SheetsTableMap[K] {
  const result: Record<string, unknown> = {};
  SHEETS_SCHEMA[table].columns.forEach((definition, index) => {
    result[definition.key] = parseCell(row[index], definition.kind);
  });
  return result as SheetsTableMap[K];
}

export function tableHeaders<K extends SheetsTableName>(table: K) {
  return SHEETS_SCHEMA[table].columns.map((definition) => definition.key);
}
