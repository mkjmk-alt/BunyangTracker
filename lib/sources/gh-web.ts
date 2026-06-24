import { SourceProvider, FetchOptions, RateLimitPolicy } from "./provider";
import { GHAnnouncement, GHAnnouncementSchema, NormalizedAnnouncement } from "../validators";

export class GHWebProvider implements SourceProvider<GHAnnouncement> {
  providerId = "gh_web";
  private baseUrl = "https://apply.gh.or.kr";

  async fetchIndex(options: FetchOptions): Promise<GHAnnouncement[]> {
    console.log("[GHWeb] Starting web scraping for GH announcements...");

    // GH uses local CAs (GPKI) that node cannot verify. Disable TLS strict validation.
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

    const url = `${this.baseUrl}/sb/sr/sr7310/selectPbancList.do`;
    try {
      console.log(`[GHWeb] Fetching announcement list from ${url}...`);
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        }
      });

      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}`);
      }

      const html = await res.text();
      const items: GHAnnouncement[] = [];

      const trRegex = /<tr([^>]+)>([\s\S]*?)<\/tr>/gi;
      let trMatch;

      while ((trMatch = trRegex.exec(html)) !== null) {
        const tagAttrs = trMatch[1];
        const innerHtml = trMatch[2];

        if (tagAttrs.includes("data-pbancno")) {
          const pbancNo = tagAttrs.match(/data-pbancno="([^"]+)"/)?.[1];
          const bizCd = tagAttrs.match(/data-bizcd="([^"]+)"/)?.[1];
          const rcritNmtm = tagAttrs.match(/data-rcritnmtm="([^"]+)"/)?.[1];
          const bizTyCd = tagAttrs.match(/data-biztycd="([^"]+)"/)?.[1];

          if (pbancNo && bizCd && rcritNmtm && bizTyCd) {
            // Extract td values
            const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
            let tdMatch;
            const cols: string[] = [];

            while ((tdMatch = tdRegex.exec(innerHtml)) !== null) {
              const cleanText = tdMatch[1]
                .replace(/<[^>]*>/g, "")
                .replace(/\s+/g, " ")
                .trim();
              cols.push(cleanText);
            }

            if (cols.length >= 6) {
              const type = cols[1] || "";
              const region = cols[2] || null;
              const title = cols[3] || "";
              const bizName = cols[4] || null;
              const docDate = cols[5] || null;

              items.push({
                pbancNo,
                bizCd,
                rcritNmtm,
                bizTyCd,
                type,
                region,
                title,
                bizName,
                docDate
              });
            }
          }
        }
      }

      console.log(`[GHWeb] Finished fetching: Found ${items.length} items.`);
      
      // Validate with schema and filter
      return items.map(item => {
        try {
          return GHAnnouncementSchema.parse(item);
        } catch (e: any) {
          console.error(`[GHWeb] Parse error:`, e.message, item);
          return null;
        }
      }).filter(Boolean) as GHAnnouncement[];
    } catch (err: any) {
      console.error(`[GHWeb] Error fetching GH list:`, err.message);
      return [];
    }
  }

  async fetchDetail(id: string): Promise<GHAnnouncement> {
    throw new Error("Method not implemented.");
  }

  normalize(raw: GHAnnouncement): NormalizedAnnouncement {
    const cleanTitle = raw.title.trim();
    const slug = `gh-${cleanTitle}-${raw.pbancNo}`
      .replace(/\s+/g, "-")
      .replace(/[^\w-가-힣]/g, "")
      .toLowerCase();

    // Determine details page URI based on GH's logic
    let detailPath = "/sb/sr/sr7150/selectPbancDetailView.do";
    if (raw.bizTyCd === "06") {
      detailPath = "/sb/sr/sr7155/selectPbancDetailView.do";
    } else if (raw.bizTyCd === "07") {
      detailPath = "/sb/sr/sr7170/selectPbancDetailView.do";
    }

    const pblancUrl = `${this.baseUrl}${detailPath}?pbancNo=${raw.pbancNo}&bizCd=${raw.bizCd}&rcritNmtm=${raw.rcritNmtm}&bizTyCd=${raw.bizTyCd}`;

    const address = raw.region ? `경기 ${raw.region}` : "경기";

    return {
      housingMgmtNo: `gh-${raw.pbancNo}`,
      announceNo: `gh-${raw.pbancNo}`,
      name: cleanTitle,
      slug,
      supplyType: `GH${raw.type}`,
      status: "OPEN",
      displayStatus: "접수중",
      announceDate: raw.docDate || null,
      applyStartDate: raw.docDate || null,
      applyEndDate: null,
      winnerAnnounceDate: null,
      contractStartDate: null,
      contractEndDate: null,
      moveInDate: null,
      address,
      builderName: "GH(경기주택도시공사)",
      developerName: "GH(경기주택도시공사)",
      totalHouseholds: null,
      regionCode: "41", // Gyeonggi Sido Code
      externalSourceKey: this.getStableExternalId(raw),
      pblancUrl,
      homepageAdres: this.baseUrl,
      atchmnflSeqNo: null,
      atchmnflSn: null,
    };
  }

  getStableExternalId(raw: GHAnnouncement): string {
    return `${this.providerId}:${raw.pbancNo}`;
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
