import { SourceProvider, FetchOptions, RateLimitPolicy } from "./provider";
import { IHAnnouncement, NormalizedAnnouncement } from "../validators";

export class IHWebProvider implements SourceProvider<IHAnnouncement> {
  providerId = "ih_web";
  private baseUrl = "https://www.ih.co.kr";

  async fetchIndex(options: FetchOptions): Promise<IHAnnouncement[]> {
    console.log("[IHWeb] Starting web scraping for iH announcements...");

    try {
      const url = `${this.baseUrl}/main/bbs/bbsMsgList.do?bcd=notice`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      });

      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}`);
      }

      const html = await res.text();
      const items: IHAnnouncement[] = [];

      // Split by title paragraph to isolate each announcement row cleanly
      const parts = html.split(/<p class="title"[^>]*>/gi);
      for (let i = 1; i < parts.length; i++) {
        const content = parts[i];
        
        // Find links
        const detailMatch = content.match(/href="\/main\/bbs\/bbsMsgDetail\.do\?msg_seq=(\d+)[^"]*?"\s*>([\s\S]*?)<\/a>/i);
        if (detailMatch) {
          const seq = detailMatch[1];
          const title = detailMatch[2]
            .replace(/<[^>]*>/g, "")
            .replace(/\s+/g, " ")
            .trim();

          // Find publish date (YYYY.MM.DD)
          const dateMatch = content.match(/\d{4}\.\d{2}\.\d{2}/);
          const rawDate = dateMatch ? dateMatch[0].replace(/\./g, "-") : null;

          items.push({
            seq,
            title,
            date: rawDate
          });
        }
      }

      console.log(`[IHWeb] Found ${items.length} announcements.`);
      return items;
    } catch (err: any) {
      console.error(`[IHWeb] Error fetching iH list:`, err.message);
      return [];
    }
  }

  async fetchDetail(id: string): Promise<IHAnnouncement> {
    throw new Error("Method not implemented.");
  }

  normalize(raw: IHAnnouncement): NormalizedAnnouncement {
    const cleanTitle = raw.title.trim();
    const slug = `ih-${cleanTitle}-${raw.seq}`
      .replace(/\s+/g, "-")
      .replace(/[^\w-가-힣]/g, "")
      .toLowerCase();

    const pblancUrl = `${this.baseUrl}/main/bbs/bbsMsgDetail.do?msg_seq=${raw.seq}&bcd=notice`;

    // ponytail: Analyze title text to determine if it is rental or sale
    const isRental = /임대|행복주택|국민임대|영구임대|매입임대|전세임대|장기전세|희망하우징|청년주택|사회주택|원룸/i.test(cleanTitle);

    return {
      housingMgmtNo: `ih-${raw.seq}`,
      announceNo: `ih-${raw.seq}`,
      name: cleanTitle,
      slug,
      supplyType: isRental ? "IH임대주택" : "IH분양주택",
      status: "OPEN",
      displayStatus: "접수중",
      announceDate: raw.date || null,
      applyStartDate: raw.date || null,
      applyEndDate: null,
      winnerAnnounceDate: null,
      contractStartDate: null,
      contractEndDate: null,
      moveInDate: null,
      address: "인천", // iH is always Incheon area
      builderName: "iH(인천도시공사)",
      developerName: "iH(인천도시공사)",
      totalHouseholds: null,
      regionCode: "280", // Incheon area code
      externalSourceKey: this.getStableExternalId(raw),
      pblancUrl,
      homepageAdres: null,
      atchmnflSeqNo: null,
      atchmnflSn: null,
    };
  }

  getStableExternalId(raw: IHAnnouncement): string {
    return `ih_web:${raw.seq}`;
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
