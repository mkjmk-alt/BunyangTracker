import { SourceProvider, FetchOptions, RateLimitPolicy } from "./provider";
import { ApplyHomeApt, ApplyHomeAptSchema, NormalizedAnnouncement } from "../validators";
import { format } from "date-fns";
import { normalizeDate } from "../normalize/announcement";

const ENDPOINTS = {
  APT: "getAPTLttotPblancDetail",
  OFCTL_URBTY: "getUrbtyOfctlLttotPblancDetail",
  REMAINDER: "getRemndrLttotPblancDetail",
  PUBLIC_RENT: "getPblPvtRentLttotPblancDetail",
  OPTIONAL: "getOPTLttotPblancDetail"
};

const ENDPOINTS_MDL = {
  APT: "getAPTLttotPblancMdlDetail",
  OFCTL_URBTY: "getUrbtyOfctlLttotPblancMdlDetail",
  REMAINDER: "getRemndrLttotPblancMdlDetail",
  PUBLIC_RENT: "getPblPvtRentLttotPblancMdlDetail",
  OPTIONAL: "getOPTLttotPblancMdlDetail"
};

export class ApplyHomeApiProvider implements SourceProvider<ApplyHomeApt> {
  providerId = "applyhome_api";
  private baseUri = "https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1";

  async fetchIndex(options: FetchOptions): Promise<ApplyHomeApt[]> {
    const apiKey = process.env.PUBLIC_DATA_API_KEY || "";
    const { page = 1, perPage = 20 } = options;
    
    console.log(`[ApplyHome] Starting multi-type fetch (Page ${page})...`);

    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const dateStr = oneYearAgo.toISOString().split('T')[0];

    const promises = Object.entries(ENDPOINTS).map(async ([type, operation]) => {
      try {
        const params = new URLSearchParams({
          page: page.toString(),
          perPage: perPage.toString(),
          returnType: "JSON",
          "cond[RCRIT_PBLANC_DE::GTE]": dateStr,
          serviceKey: apiKey.trim()
        });
        
        if (type === 'APT') {
          params.append("cond[HOUSE_SECD::EQ]", "01");
        }

        const url = `${this.baseUri}/${operation}?${params.toString()}`;
        console.log(`[ApplyHome] Fetching ${type}...`);
        
        const response = await fetch(url);
        const text = await response.text();
        const data = JSON.parse(text);
        const items = (data.data || []).map((item: any) => ({ ...item, _type: type }));

        console.log(`[ApplyHome] ${type}: Received ${items.length} items`);

        return items.map((item: any) => {
          try {
            const normalizedItem = {
              ...item,
              SUBSCRPT_RCEPT_BGNDE: item.SUBSCRPT_RCEPT_BGNDE || item.RCEPT_BGNDE,
              SUBSCRPT_RCEPT_ENDDE: item.SUBSCRPT_RCEPT_ENDDE || item.RCEPT_ENDDE,
            };
            return ApplyHomeAptSchema.parse(normalizedItem);
          } catch (e: any) {
            console.error(`[ApplyHome] Parse error in ${type} (${item?.HOUSE_NM}):`, e.message);
            return null;
          }
        }).filter(Boolean);
      } catch (error: any) {
        console.error(`[ApplyHome] Error fetching ${type}:`, error.message);
        return [];
      }
    });

    const results = await Promise.all(promises);
    return results.flat() as ApplyHomeApt[];
  }

  async fetchDetail(id: string): Promise<ApplyHomeApt> {
    const apiKey = process.env.PUBLIC_DATA_API_KEY || "";
    if (!apiKey) throw new Error("PUBLIC_DATA_API_KEY is not defined");

    // ponytail: search across endpoints until matching project is found
    for (const [type, operation] of Object.entries(ENDPOINTS)) {
      try {
        const params = new URLSearchParams({
          page: "1",
          perPage: "10",
          returnType: "JSON",
          "cond[HOUSE_MANAGE_NO::EQ]": id,
          serviceKey: apiKey.trim()
        });

        const url = `${this.baseUri}/${operation}?${params.toString()}`;
        const res = await fetch(url);
        if (!res.ok) continue;

        const text = await res.text();
        const data = JSON.parse(text);
        const rawItem = data.data?.[0];

        if (rawItem) {
          const item = {
            ...rawItem,
            _type: type,
            SUBSCRPT_RCEPT_BGNDE: rawItem.SUBSCRPT_RCEPT_BGNDE || rawItem.RCEPT_BGNDE,
            SUBSCRPT_RCEPT_ENDDE: rawItem.SUBSCRPT_RCEPT_ENDDE || rawItem.RCEPT_ENDDE,
          };
          return ApplyHomeAptSchema.parse(item);
        }
      } catch (e: any) {
        console.error(`[ApplyHome] Error in fetchDetail for ${type} (ID: ${id}):`, e.message);
      }
    }
    throw new Error(`Announcement ${id} not found in any ApplyHome API endpoints`);
  }

  async fetchUnits(houseManageNo: string, pblancNo: string, type: string = "APT"): Promise<any[]> {
    const apiKey = process.env.PUBLIC_DATA_API_KEY || "";
    const operation = (ENDPOINTS_MDL as any)[type] || ENDPOINTS_MDL.APT;
    
    try {
      const params = new URLSearchParams({
        page: "1",
        perPage: "100",
        returnType: "JSON",
        "cond[HOUSE_MANAGE_NO::EQ]": houseManageNo,
        "cond[PBLANC_NO::EQ]": pblancNo,
        serviceKey: apiKey.trim()
      });

      const url = `${this.baseUri}/${operation}?${params.toString()}`;
      const response = await fetch(url);
      const data = await response.json();
      const items = data.data || [];

      return items.map((unit: any) => ({
        unitType: unit.MODEL_NM || unit.GP_NM || "UNKNOWN",
        supplyArea: unit.SUPLY_AR ? parseFloat(unit.SUPLY_AR) : null,
        exclusiveArea: unit.EXCLSV_AR ? parseFloat(unit.EXCLSV_AR) : null,
        generalSupply: unit.SUPLY_HSHLDCO ? parseInt(unit.SUPLY_HSHLDCO) : null,
        specialSupply: unit.SPSPLY_HSHLDCO ? parseInt(unit.SPSPLY_HSHLDCO) : 0,
        priceMax: unit.LTTOT_TOP_AMOUNT ? parseInt(unit.LTTOT_TOP_AMOUNT) : null,
      }));
    } catch (e) {
      console.error(`[ApplyHome] Failed to fetch units for ${houseManageNo}:`, e);
      return [];
    }
  }

  async discoverAttachments(houseManageNo: string, pblancNo: string, pblancUrl?: string, supplyType: string = "APT"): Promise<{ seqNo: string | null, sn: string | null }> {
    let url = pblancUrl;
    
    // Fallback to the known URL if pblancUrl is not provided
    if (!url) {
      let endpoint = "selectAPTLttotPblancDetail.do";
      
      if (supplyType.includes("무순위") || supplyType.includes("잔여세대") || supplyType.includes("임의공급")) {
        endpoint = "selectAPTRemndrLttotPblancDetailView.do";
      } else if (supplyType.includes("오피스텔") || supplyType.includes("도시형") || supplyType.includes("민간임대") || supplyType.includes("생활숙박")) {
        endpoint = "selectUrbtyOfctlLttotPblancDetailView.do"; // Fallback guess for officetel
      }

      url = `https://www.applyhome.co.kr/ai/aia/${endpoint}?houseManageNo=${houseManageNo}&pblancNo=${pblancNo}`;
    } else if (!url.startsWith("http")) {
      url = `https://www.applyhome.co.kr${url.startsWith("/") ? "" : "/"}${url}`;
    }

    try {
      const response = await fetch(url);
      const text = await response.text();
      
      const regexes = [
        /atchmnflSeqNo=(\d+)&atchmnflSn=(\d+)/,
        /atchmnflSeqNo=(\d+)&amp;atchmnflSn=(\d+)/,
        /getAtchmnfl\(['"]?(\d+)['"]?,\s*['"]?(\d+)['"]?\)/,
        /fileDownload\(['"]?(\d+)['"]?,\s*['"]?(\d+)['"]?\)/,
        /javascript:fileDown\(['"]?(\d+)['"]?,\s*['"]?(\d+)['"]?\)/
      ];
      
      let match = null;
      for (const r of regexes) {
        match = text.match(r);
        if (match) break;
      }
      
      if (match) {
        return { seqNo: match[1], sn: match[2] };
      }
      return { seqNo: "NONE", sn: "NONE" };
    } catch (e) {
      console.error(`[ApplyHome] Failed to discover attachments for ${houseManageNo}:`, e);
      return { seqNo: null, sn: null };
    }
  }

  normalize(raw: any): NormalizedAnnouncement {
    const slug = `${raw.HOUSE_NM}-${raw.PBLANC_NO}-${raw.HOUSE_MANAGE_NO}`
      .replace(/\s+/g, "-")
      .replace(/[^\w-가-힣]/g, "")
      .toLowerCase();
    
    return {
      housingMgmtNo: raw.HOUSE_MANAGE_NO.toString(),
      announceNo: raw.PBLANC_NO.toString(),
      name: raw.HOUSE_NM,
      slug,
      supplyType: raw.HOUSE_SECD_NM || "UNKNOWN",
      status: this.calculateStatus(raw),
      announceDate: normalizeDate(raw.RCRIT_PBLANC_DE),
      applyStartDate: normalizeDate(raw.RCEPT_BGNDE || raw.SUBSCRPT_RCEPT_BGNDE),
      applyEndDate: normalizeDate(raw.RCEPT_ENDDE || raw.SUBSCRPT_RCEPT_ENDDE),
      winnerAnnounceDate: normalizeDate(raw.PRZWNER_PRESNATN_DE),
      contractStartDate: normalizeDate(raw.CNTRCT_CNCLS_BGNDE),
      contractEndDate: normalizeDate(raw.CNTRCT_CNCLS_ENDDE),
      moveInDate: raw.MVN_PREARNGE_YM && /^\d{6}$/.test(raw.MVN_PREARNGE_YM)
        ? `${raw.MVN_PREARNGE_YM.substring(0, 4)}-${raw.MVN_PREARNGE_YM.substring(4, 6)}-01`
        : null,
      address: raw.HSSPLY_ADRES || null,
      builderName: raw.CNSTRCT_ENTRPS_NM || null,
      developerName: raw.BSNS_MBY_NM || null,
      totalHouseholds: typeof raw.TOT_SUPLY_HSHLDCO === 'number' 
        ? raw.TOT_SUPLY_HSHLDCO 
        : parseInt(raw.TOT_SUPLY_HSHLDCO || "0"),
      regionCode: raw.SUBSCRPT_AREA_CODE?.toString() || null,
      externalSourceKey: this.getStableExternalId(raw),
      pblancUrl: raw.PBLANC_URL || null,
      homepageAdres: raw.HMPG_ADRES || null,
      atchmnflSeqNo: raw.ATCHMNFL_SEQ_NO?.toString() || null,
      atchmnflSn: raw.ATCHMNFL_SN?.toString() || null,
      displayStatus: this.getDisplayStatus(this.calculateStatus(raw)),
    };
  }

  private getDisplayStatus(status: string): string {
    const map: Record<string, string> = {
      UPCOMING: "공고예정",
      OPEN: "접수중",
      CLOSED: "접수마감",
      CANCELLED: "공고취소",
      CORRECTED: "정정공고중",
    };
    return map[status] || status;
  }

  private calculateStatus(raw: any): "UPCOMING" | "OPEN" | "CLOSED" {
    const now = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];
    const startDate = raw.RCEPT_BGNDE || raw.SUBSCRPT_RCEPT_BGNDE;
    const endDate = raw.RCEPT_ENDDE || raw.SUBSCRPT_RCEPT_ENDDE;
    
    if (!startDate || !endDate) return "OPEN";
    const start = normalizeDate(startDate);
    const end = normalizeDate(endDate);
    
    if (start && start > now) return "UPCOMING";
    if (end && end < now) return "CLOSED";
    return "OPEN";
  }

  getStableExternalId(raw: any): string {
    return `${this.providerId}:${raw.PBLANC_NO}`;
  }

  supportsBackfill(): boolean {
    return true;
  }

  getRateLimitPolicy(): RateLimitPolicy {
    return {
      requestsPerSecond: 5,
      delayMs: 200,
    };
  }
}
