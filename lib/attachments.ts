const NO_ATTACHMENT = "NONE";

function normalizeAttachmentPart(value: string | null | undefined) {
  return value?.trim() || null;
}

export function hasResolvedAttachmentLookup(
  seqNo: string | null | undefined,
  sn: string | null | undefined
) {
  return Boolean(normalizeAttachmentPart(seqNo) && normalizeAttachmentPart(sn));
}

export function hasDownloadableAttachment(
  seqNo: string | null | undefined,
  sn: string | null | undefined
) {
  const normalizedSeqNo = normalizeAttachmentPart(seqNo);
  const normalizedSn = normalizeAttachmentPart(sn);

  return Boolean(
    normalizedSeqNo &&
    normalizedSn &&
    normalizedSeqNo !== NO_ATTACHMENT &&
    normalizedSn !== NO_ATTACHMENT
  );
}

export function getApplyHomeAttachmentUrl(options: {
  houseManageNo: string;
  pblancNo: string;
  seqNo: string | null | undefined;
  sn: string | null | undefined;
}) {
  if (!hasDownloadableAttachment(options.seqNo, options.sn)) return null;

  const params = new URLSearchParams({
    houseManageNo: options.houseManageNo,
    pblancNo: options.pblancNo,
    atchmnflSeqNo: options.seqNo!.trim(),
    atchmnflSn: options.sn!.trim(),
  });

  return `https://static.applyhome.co.kr/ai/aia/getAtchmnfl.do?${params.toString()}`;
}
