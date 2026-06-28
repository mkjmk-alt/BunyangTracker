import { SourceProvider, FetchOptions, RateLimitPolicy } from "./provider";
import { BMCAnnouncement, NormalizedAnnouncement } from "../validators";

export class BMCWebProvider implements SourceProvider<BMCAnnouncement> {
  providerId = "bmc_web";
  private baseUrl = "https://www.bmc.busan.kr";

  async fetchIndex(options: FetchOptions): Promise<BMCAnnouncement[]> {
    console.log("[BMCWeb] Starting web scraping for BMC announcements...");

    try {
      const url = `${this.baseUrl}/board/list.do?boardId=BBS_0000004`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      });

      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}`);
      }

      const html = await res.text();
      const items: BMCAnnouncement[] = [];

      // Find table rows <tr>
      const trRegex = /<tr>([\s\S]*?)<\/tr>/gi;
      let trMatch;

      while ((trMatch = trRegex.exec(html)) !== null) {
        const content = trMatch[1];
        
        // Find anchor tag with dataSid in href
        const detailMatch = content.match(/href="\/board\/view\.do\?boardId=BBS_0000004[^"]*?dataSid=(\d+)"[^>]*>([\s\S]*?)<\/a>/i);
        if (detailMatch) {
          const dataSid = detailMatch[1];
          const title = detailMatch[2]
            .replace(/<[^>]*>/g, "")
            .replace(/\s+/g, " ")
            .trim();

          // Find dates YYYY.MM.DD
          const dateMatch = content.match(/\d{4}\.\d{2}\.\d{2}/);
          const rawDate = dateMatch ? dateMatch[0].replace(/\./g, "-") : null;

          items.push({
            dataSid,
            title,
            date: rawDate
          });
        }
      }

      console.log(`[BMCWeb] Found ${items.length} announcements.`);
      return items;
    } catch (err: any) {
      console.error(`[BMCWeb] Error fetching BMC list:`, err.message);
      return [];
    }
  }

  async fetchDetail(id: string): Promise<BMCAnnouncement> {
    throw new Error("Method not implemented.");
  }

  normalize(raw: BMCAnnouncement): NormalizedAnnouncement {
    const cleanTitle = raw.title.trim();
    const slug = `bmc-${cleanTitle}-${raw.dataSid}`
      .replace(/\s+/g, "-")
      .replace(/[^\w-가-힣]/g, "")
      .toLowerCase();

    const pblancUrl = `${this.baseUrl}/board/view.do?boardId=BBS_0000004&dataSid=${raw.dataSid}`;

    // ponytail: Analyze title text to determine if it is rental or sale
    const isRental = /임대|행복주택|국민임대|영구임대|매입임대|전세임대|장기전세|희망하우징|청년주택|사회주택|원룸/i.test(cleanTitle);

    return {
      housingMgmtNo: `bmc-${raw.dataSid}`,
      announceNo: `bmc-${raw.dataSid}`,
      name: cleanTitle,
      slug,
      supplyType: isRental ? "BMC임대주택" : "BMC분양주택",
      status: "OPEN",
      displayStatus: "접수중",
      announceDate: raw.date || null,
      applyStartDate: raw.date || null,
      applyEndDate: null,
      winnerAnnounceDate: null,
      contractStartDate: null,
      contractEndDate: null,
      moveInDate: null,
      address: "부산", // BMC is always Busan area
      builderName: "BMC(부산도시공사)",
      developerName: "BMC(부산도시공사)",
      totalHouseholds: null,
      regionCode: "260", // Busan area code
      externalSourceKey: this.getStableExternalId(raw),
      pblancUrl,
      homepageAdres: null,
      atchmnflSeqNo: null,
      atchmnflSn: null,
    };
  }

  getStableExternalId(raw: BMCAnnouncement): string {
    return `bmc_web:${raw.dataSid}`;
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
