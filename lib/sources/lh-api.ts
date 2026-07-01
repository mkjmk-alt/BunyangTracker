import { SourceProvider, FetchOptions, RateLimitPolicy } from "./provider";
import { LHAnnouncement, LHAnnouncementSchema, NormalizedAnnouncement } from "../validators";
import { format, subYears } from "date-fns";
import { normalizeDate } from "../normalize/announcement";

export class LHApiProvider implements SourceProvider<LHAnnouncement> {
  providerId = "lh_api";
  // Updated with exact endpoint confirmed from data.go.kr
  private baseUri = "http://apis.data.go.kr/B552555/lhLeaseNoticeInfo1/lhLeaseNoticeInfo1";

  async fetchIndex(options: FetchOptions): Promise<LHAnnouncement[]> {
    const apiKey = process.env.PUBLIC_DATA_API_KEY || "";
    const { page = 1, perPage = 20 } = options;
    
    console.log(`[LH] Starting public housing fetch (Page ${page})...`);

    const today = new Date();
    const oneYearAgo = subYears(today, 1);
    
    const startDate = format(oneYearAgo, "yyyy.MM.dd");
    const endDate = format(today, "yyyy.MM.dd");

    // ponytail: Categories expanded to include 13 (주거복지/임대), 39 (신혼희망타운/분양), and 54 (이익공유형/뉴홈)
    const categories = ["05", "06", "13", "31", "39", "54"];

    const promises = categories.map(async (cat) => {
      try {
        const params = new URLSearchParams({
          serviceKey: apiKey.trim(),
          PG_SZ: perPage.toString(),
          PAGE: page.toString(),
          UPP_AIS_TP_CD: cat,
          PAN_NT_ST_DT: startDate,
          CLSG_DT: endDate,
          _type: "json", // Confirming _type instead of returnType
        });

        const url = `${this.baseUri}?${params.toString()}`;
        console.log(`[LH] Fetching category ${cat} from ${startDate} to ${endDate}...`);
        
        const response = await fetch(url);
        const text = await response.text();
        
        let data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          console.error(`[LH] Failed to parse JSON for cat ${cat}.`);
          console.error(`[LH] Raw response (first 300 chars): ${text.substring(0, 300)}`);
          return [];
        }

        // Corrected path based on LH API JSON structure: [ { "dsList": [...] } ]
        // Usually, the response is an array where the first or second element contains the list
        const items = (data[1]?.dsList || data[0]?.dsList || []);

        console.log(`[LH] Category ${cat}: Received ${items.length} items`);

        return items.map((item: any) => {
          try {
            return LHAnnouncementSchema.parse(item);
          } catch (e: any) {
            console.error(`[LH] Parse error in cat ${cat}:`, e.message);
            return null;
          }
        }).filter(Boolean);
      } catch (error: any) {
        console.error(`[LH] Error fetching category ${cat}:`, error.message);
        return [];
      }
    });

    const results = await Promise.all(promises);
    return results.flat() as LHAnnouncement[];
  }

  async fetchDetail(id: string): Promise<LHAnnouncement> {
    throw new Error("Method not implemented.");
  }

  normalize(raw: LHAnnouncement): NormalizedAnnouncement {
    const cleanDate = (d: string | null | undefined) => {
      if (!d) return null;
      return d.replace(/\./g, '-');
    };

    const slug = `lh-${raw.PAN_NM}-${raw.PAN_ID}`
      .replace(/\s+/g, "-")
      .replace(/[^\w-가-힣]/g, "")
      .toLowerCase();

    return {
      housingMgmtNo: raw.PAN_ID,
      announceNo: raw.PAN_ID,
      name: raw.PAN_NM,
      slug,
      supplyType: raw.AIS_TP_CD_NM || "공공주택",
      status: this.calculateStatus(raw),
      announceDate: cleanDate(raw.PAN_NT_ST_DT),
      applyStartDate: cleanDate(raw.PAN_NT_ST_DT),
      applyEndDate: cleanDate(raw.CLSG_DT),
      winnerAnnounceDate: null,
      contractStartDate: null,
      contractEndDate: null,
      moveInDate: null,
      address: raw.CNP_CD_NM || null,
      builderName: "LH(한국토지주택공사)",
      developerName: "LH(한국토지주택공사)",
      totalHouseholds: null,
      regionCode: null,
      externalSourceKey: `${this.providerId}:${raw.PAN_ID}`,
      pblancUrl: raw.DTL_URL || null,
      homepageAdres: raw.HMPG_ADRES || null,
      displayStatus: raw.PAN_SS || null,
    };
  }

  private calculateStatus(raw: LHAnnouncement): "UPCOMING" | "OPEN" | "CLOSED" {
    const now = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];
    const end = raw.CLSG_DT ? raw.CLSG_DT.replace(/\./g, '-') : null;
    const start = raw.PAN_NT_ST_DT ? raw.PAN_NT_ST_DT.replace(/\./g, '-') : null;
    
    if (start && start > now) return "UPCOMING";
    if (end && end < now) return "CLOSED";
    return "OPEN";
  }

  getStableExternalId(raw: any): string {
    return `${this.providerId}:${raw.PAN_ID}`;
  }

  supportsBackfill(): boolean {
    return false;
  }

  getRateLimitPolicy(): RateLimitPolicy {
    return {
      requestsPerSecond: 2,
      delayMs: 500,
    };
  }
}
