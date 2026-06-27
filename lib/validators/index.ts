import { z } from "zod";

// 청약홈 API 응답 스케마 (APT 분양정보)
export const ApplyHomeAptSchema = z.object({
  HOUSE_MANAGE_NO: z.string(),
  PBLANC_NO: z.string(),
  HOUSE_NM: z.string(),
  BSNS_MBY_NM: z.string().optional().nullable(),
  CNSTRCT_ENTRPS_NM: z.string().optional().nullable(),
  HMPG_ADRES: z.string().optional().nullable(),
  RCRIT_PBLANC_DE: z.string().optional().nullable(),
  RCEPT_BGNDE: z.string().optional().nullable(),
  RCEPT_ENDDE: z.string().optional().nullable(),
  PRZWNER_PRESNATN_DE: z.string().optional().nullable(),
  CNTRCT_CNCLS_BGNDE: z.string().optional().nullable(),
  CNTRCT_CNCLS_ENDDE: z.string().optional().nullable(),
  HSSPLY_ADRES: z.string().optional().nullable(),
  HSSPLY_ZIP: z.string().optional().nullable(),
  TOT_SUPLY_HSHLDCO: z.coerce.number().optional().nullable(), // 자동 형변환 적용
  MVN_PREARNGE_YM: z.string().optional().nullable(),
  SUBSCRPT_AREA_CODE: z.string().optional().nullable(),
  HOUSE_SECD_NM: z.string().optional().nullable(),
  SUBSCRPT_RCEPT_BGNDE: z.string().optional().nullable(),
  SUBSCRPT_RCEPT_ENDDE: z.string().optional().nullable(),
  PBLANC_URL: z.string().optional().nullable(),
  ATCHMNFL_SEQ_NO: z.string().optional().nullable(),
  ATCHMNFL_SN: z.string().optional().nullable(),
});

export type ApplyHomeApt = z.infer<typeof ApplyHomeAptSchema>;

// 정규화된 공고 데이터 타입
export const NormalizedAnnouncementSchema = z.object({
  housingMgmtNo: z.string(),
  announceNo: z.string(),
  name: z.string(),
  slug: z.string(),
  supplyType: z.string(),
  status: z.enum(["UPCOMING", "OPEN", "CLOSED", "CANCELLED", "CORRECTED"]),
  displayStatus: z.string().nullable().optional(),
  announceDate: z.string().nullable(),
  applyStartDate: z.string().nullable(),
  applyEndDate: z.string().nullable(),
  winnerAnnounceDate: z.string().nullable(),
  contractStartDate: z.string().nullable(),
  contractEndDate: z.string().nullable(),
  moveInDate: z.string().nullable(),
  address: z.string().nullable(),
  builderName: z.string().nullable(),
  developerName: z.string().nullable(),
  totalHouseholds: z.number().nullable(),
  regionCode: z.string().nullable(),
  externalSourceKey: z.string(),
  pblancUrl: z.string().nullable().optional(),
  homepageAdres: z.string().nullable().optional(),
  atchmnflSeqNo: z.string().nullable().optional(),
  atchmnflSn: z.string().nullable().optional(),
  units: z.array(z.object({
    unitType: z.string(),
    supplyArea: z.number().nullable(),
    exclusiveArea: z.number().nullable(),
    generalSupply: z.number().nullable(),
    specialSupply: z.number().nullable(),
    priceMin: z.number().nullable(),
    priceMax: z.number().nullable(),
  })).optional(),
});

export type NormalizedAnnouncement = z.infer<typeof NormalizedAnnouncementSchema>;

// API 쿼리 파라미터 스케마
export const ProjectQuerySchema = z.object({
  region: z.string().optional(),
  supplyType: z.string().optional(),
  status: z.string().optional(),
  q: z.string().optional(),
  page: z.coerce.number().default(1),
  pageSize: z.coerce.number().default(20),
  sort: z.string().default("announceDate.desc"),
});

export type ProjectQuery = z.infer<typeof ProjectQuerySchema>;

// LH API 응답 스케마
export const LHAnnouncementSchema = z.object({
  PAN_ID: z.string(),
  PAN_NM: z.string(),
  AIS_TP_CD_NM: z.string().optional().nullable(),
  PAN_SS: z.string().optional().nullable(),
  PAN_NT_ST_DT: z.string().optional().nullable(),
  CLSG_DT: z.string().optional().nullable(),
  HMPG_ADRES: z.string().optional().nullable(),
  DTL_URL: z.string().optional().nullable(),
  AIS_TP_CD: z.string().optional().nullable(),
  UPP_AIS_TP_CD: z.string().optional().nullable(),
  CNP_CD_NM: z.string().optional().nullable(),
});

export type LHAnnouncement = z.infer<typeof LHAnnouncementSchema>;

// LH 웹 스크래핑 스케마
export const LHWebAnnouncementSchema = z.object({
  panId: z.string(),
  ccrCnntSysDsCd: z.string(),
  uppAisTpCd: z.string(),
  aisTpCd: z.string(),
  title: z.string(),
  type: z.string(),
  region: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
  mi: z.string(), // menu id: 1026=임대, 1027=분양
});

export type LHWebAnnouncement = z.infer<typeof LHWebAnnouncementSchema>;

// SH API/Web Scraping Schema
export const SHAnnouncementSchema = z.object({
  seq: z.string(),
  title: z.string(),
  dept: z.string().optional().nullable(),
  date: z.string().optional().nullable(),
  views: z.coerce.number().optional().nullable(),
  _type: z.enum(["notice", "rent"]),
  boardId: z.string(),
  menuId: z.string(),
  domain: z.string(),
});

export type SHAnnouncement = z.infer<typeof SHAnnouncementSchema>;

// GH Web Scraping Schema
export const GHAnnouncementSchema = z.object({
  pbancNo: z.string(),
  bizCd: z.string(),
  rcritNmtm: z.string(),
  bizTyCd: z.string(),
  type: z.string(),
  region: z.string().optional().nullable(),
  title: z.string(),
  bizName: z.string().optional().nullable(),
  docDate: z.string().optional().nullable(),
});

export type GHAnnouncement = z.infer<typeof GHAnnouncementSchema>;

// 마이홈 API 응답 스케마 (공공임대주택 모집공고)
export const MyHomeAnnouncementSchema = z.object({
  pblancId: z.coerce.string(),
  pblancNm: z.string(),
  fullAdres: z.string().optional().nullable(),
  rcritPblancDe: z.string().optional().nullable(),
  beginDe: z.string().optional().nullable(),
  endDe: z.string().optional().nullable(),
  suplyTyNm: z.string().optional().nullable(),
  suplyInsttNm: z.string().optional().nullable(),
  sttusNm: z.string().optional().nullable(),
  pcUrl: z.string().optional().nullable(),
  url: z.string().optional().nullable(),
}).passthrough();

export type MyHomeAnnouncement = z.infer<typeof MyHomeAnnouncementSchema>;
