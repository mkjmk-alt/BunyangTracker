import { describe, expect, it } from "vitest";
import { parseCell, recordToRow, rowToRecord, serializeCell } from "./schema";
import type { AnnouncementRecord } from "./types";

function announcement(): AnnouncementRecord {
  return {
    id: "announcement-id",
    projectId: "project-id",
    housingMgmtNo: "20260001",
    projectName: "테스트 단지",
    projectSlug: "test-project",
    regionId: null,
    address: "서울특별시",
    builderName: null,
    developerName: null,
    totalHouseholds: 120,
    projectSourceProviderId: "lh_api",
    projectExternalSourceKey: "lh_api:1",
    projectMetadata: { verified: true },
    announceNo: "A-1",
    supplyType: "국민임대",
    status: "OPEN",
    displayStatus: "접수중",
    announceDate: "2026-07-14",
    applyStartDate: "2026-07-15",
    applyEndDate: "2026-07-20",
    winnerAnnounceDate: null,
    contractStartDate: null,
    contractEndDate: null,
    moveInDate: null,
    totalSupplyHouseholds: null,
    generalSupplyHouseholds: null,
    specialSupplyHouseholds: null,
    sourceProviderId: "lh_api",
    externalSourceKey: "lh_api:1",
    rawPayloadId: null,
    pblancUrl: "https://example.com",
    homepageAdres: null,
    metadata: { sourceProviders: ["lh_api"] },
    atchmnflSeqNo: null,
    atchmnflSn: null,
    isBookmarked: true,
    fingerprint: "fingerprint",
    latestSnapshotId: null,
    latestSnapshotData: null,
    createdAt: new Date("2026-07-14T00:00:00.000Z"),
    updatedAt: new Date("2026-07-14T01:00:00.000Z"),
  };
}

describe("Google Sheets row codec", () => {
  it("preserves announcement values", () => {
    const source = announcement();
    const decoded = rowToRecord("announcements", recordToRow("announcements", source));
    expect(decoded).toEqual(source);
  });

  it("compresses and restores oversized JSON cells", () => {
    const source = { content: "x".repeat(60_000) };
    const encoded = serializeCell(source, "json");
    expect(String(encoded)).toMatch(/^__gzip_base64__:/);
    expect(parseCell(encoded, "json")).toEqual(source);
  });
});
