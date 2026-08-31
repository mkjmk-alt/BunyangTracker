import { describe, expect, it } from "vitest";
import {
  getApplyHomeAttachmentUrl,
  hasDownloadableAttachment,
  hasResolvedAttachmentLookup,
} from "./attachments";

describe("attachment helpers", () => {
  it("treats a complete NONE marker as a resolved lookup without a PDF", () => {
    expect(hasResolvedAttachmentLookup("NONE", "NONE")).toBe(true);
    expect(hasDownloadableAttachment("NONE", "NONE")).toBe(false);
  });

  it("keeps partial attachment metadata unresolved", () => {
    expect(hasResolvedAttachmentLookup("123", null)).toBe(false);
    expect(hasResolvedAttachmentLookup(null, "1")).toBe(false);
  });

  it("builds a PDF URL only when both attachment identifiers exist", () => {
    expect(
      getApplyHomeAttachmentUrl({
        houseManageNo: "20260001",
        pblancNo: "20260002",
        seqNo: "123",
        sn: "1",
      })
    ).toBe(
      "https://static.applyhome.co.kr/ai/aia/getAtchmnfl.do?houseManageNo=20260001&pblancNo=20260002&atchmnflSeqNo=123&atchmnflSn=1"
    );
    expect(
      getApplyHomeAttachmentUrl({
        houseManageNo: "20260001",
        pblancNo: "20260002",
        seqNo: "NONE",
        sn: "NONE",
      })
    ).toBeNull();
  });
});
