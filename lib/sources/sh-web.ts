import { SourceProvider, FetchOptions, RateLimitPolicy } from "./provider";
import { SHAnnouncement, SHAnnouncementSchema, NormalizedAnnouncement } from "../validators";

export class SHWebProvider implements SourceProvider<SHAnnouncement> {
  providerId = "sh_web";
  private baseUrl = "https://www.i-sh.co.kr";

  async fetchIndex(options: FetchOptions): Promise<SHAnnouncement[]> {
    console.log("[SHWeb] Starting web scraping for SH announcements...");

    const targets = [
      {
        url: `${this.baseUrl}/main/lay2/program/S1T294C295/www/brd/m_241/list.do`,
        type: "notice" as const,
        boardId: "S1T294C295",
        menuId: "m_241",
        domain: "main",
        label: "공고 및 공지 (분양/공지)"
      },
      {
        url: `${this.baseUrl}/app/lay2/program/S1T294C297/www/brd/m_247/list.do`,
        type: "rent" as const,
        boardId: "S1T294C297",
        menuId: "m_247",
        domain: "app",
        label: "임대공고"
      }
    ];

    const promises = targets.map(async ({ url, type, boardId, menuId, domain, label }) => {
      try {
        console.log(`[SHWeb] Fetching ${label} list from ${url}...`);
        const res = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
          }
        });

        if (!res.ok) {
          throw new Error(`HTTP error ${res.status}`);
        }

        const html = await res.text();
        const items: SHAnnouncement[] = [];

        const trRegex = /<tr>([\s\S]*?)<\/tr>/gi;
        let trMatch;

        while ((trMatch = trRegex.exec(html)) !== null) {
          const innerHtml = trMatch[1];
          const onclickMatch = innerHtml.match(/getDetailView\(['"]?(\d+)['"]?\)/i);
          
          if (onclickMatch) {
            const seq = onclickMatch[1];

            // Extract td text values in order
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

            if (cols.length >= 4) {
              // Usually cols[0]: 번호, cols[1]: 제목, cols[2]: 담당부서, cols[3]: 등록일, cols[4]: 조회수
              // Sometimes extra spacing/columns exist, let's map carefully
              const title = cols[1] || "";
              const dept = cols[2] || null;
              
              // Date is normally formatted as YYYY-MM-DD
              const dateMatch = innerHtml.match(/\d{4}-\d{2}-\d{2}/);
              const date = dateMatch ? dateMatch[0] : (cols[3] || null);
              
              // Views is the last numeric column
              const viewsVal = cols[4] || cols[cols.length - 1];
              const views = viewsVal && /^\d+$/.test(viewsVal) ? parseInt(viewsVal) : null;

              items.push({
                seq,
                title,
                dept,
                date,
                views,
                _type: type,
                boardId,
                menuId,
                domain
              });
            }
          }
        }

        console.log(`[SHWeb] Finished ${label}: Found ${items.length} items.`);
        return items;
      } catch (err: any) {
        console.error(`[SHWeb] Error fetching ${label}:`, err.message);
        return [];
      }
    });

    const results = await Promise.all(promises);
    
    // Validate with schema and filter
    return results.flat().map(item => {
      try {
        return SHAnnouncementSchema.parse(item);
      } catch (e: any) {
        console.error(`[SHWeb] Parse error:`, e.message, item);
        return null;
      }
    }).filter(Boolean) as SHAnnouncement[];
  }

  async fetchDetail(id: string): Promise<SHAnnouncement> {
    throw new Error("Method not implemented.");
  }

  normalize(raw: SHAnnouncement): NormalizedAnnouncement {
    const cleanTitle = raw.title.trim();
    const slug = `sh-${cleanTitle}-${raw.seq}`
      .replace(/\s+/g, "-")
      .replace(/[^\w-가-힣]/g, "")
      .toLowerCase();

    // Map board path dynamically based on notice / rent type
    const pblancUrl = `${this.baseUrl}/${raw.domain}/lay2/program/${raw.boardId}/www/brd/${raw.menuId}/view.do?seq=${raw.seq}`;

    const isRental = 
      raw._type === "rent" || 
      /임대|행복주택|국민임대|영구임대|매입임대|전세임대|장기전세|희망하우징|청년주택|사회주택|원룸/i.test(cleanTitle);

    return {
      housingMgmtNo: `sh-${raw.seq}`,
      announceNo: `sh-${raw.seq}`,
      name: cleanTitle,
      slug,
      supplyType: isRental ? "SH임대주택" : "SH분양주택",
      status: "OPEN",
      displayStatus: "접수중",
      announceDate: raw.date || null,
      applyStartDate: raw.date || null,
      applyEndDate: null,
      winnerAnnounceDate: null,
      contractStartDate: null,
      contractEndDate: null,
      moveInDate: null,
      address: "서울", // SH is always Seoul area
      builderName: "SH(서울주택도시공사)",
      developerName: "SH(서울주택도시공사)",
      totalHouseholds: null,
      regionCode: "11", // Seoul Sido Code
      externalSourceKey: this.getStableExternalId(raw),
      pblancUrl,
      homepageAdres: this.baseUrl,
      atchmnflSeqNo: null,
      atchmnflSn: null,
    };
  }

  getStableExternalId(raw: SHAnnouncement): string {
    return `${this.providerId}:${raw.seq}`;
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
