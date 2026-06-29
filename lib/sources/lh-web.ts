import { SourceProvider, FetchOptions, RateLimitPolicy } from "./provider";
import { LHWebAnnouncement, LHWebAnnouncementSchema, NormalizedAnnouncement } from "../validators";

// ponytail: POST to the same URL the browser uses, parse server-rendered HTML table
export class LHWebProvider implements SourceProvider<LHWebAnnouncement> {
  providerId = "lh_web";
  private baseUrl = "https://apply.lh.or.kr";
  private listUrl = "/lhapply/apply/wt/wrtanc/selectWrtancList.do";

  async fetchIndex(options: FetchOptions): Promise<LHWebAnnouncement[]> {
    console.log("[LHWeb] Starting web scraping for LH announcements...");

    // mi=1026: 임대주택, mi=1027: 분양주택
    const targets = [
      { mi: "1026", label: "임대주택" },
      { mi: "1027", label: "분양주택" },
    ];

    const promises = targets.map(async ({ mi, label }) => {
      try {
        console.log(`[LHWeb] Fetching ${label} (mi=${mi})...`);
        const res = await fetch(`${this.baseUrl}${this.listUrl}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
          body: `mi=${mi}`,
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        const items: LHWebAnnouncement[] = [];

        // Parse <tr> rows containing wrtancInfoBtn links
        const trRegex = /<tr>([\s\S]*?)<\/tr>/gi;
        let trMatch;

        while ((trMatch = trRegex.exec(html)) !== null) {
          const inner = trMatch[1];
          const linkMatch = inner.match(
            /data-id1="([^"]+)"\s+data-id2="([^"]+)"\s+data-id3="([^"]+)"\s+data-id4="([^"]+)"/
          );
          if (!linkMatch) continue;

          const titleMatch = inner.match(/<span>([\s\S]*?)<\/span>/);
          let title = "";
          if (titleMatch) {
            const rawTitleHtml = titleMatch[1];
            // Remove nested em and span elements (and their inner contents) to exclude dynamic badges like "1일전", "new", "마감"
            const cleanTitleHtml = rawTitleHtml
              .replace(/<em\b[^>]*>[\s\S]*?<\/em>/gi, "")
              .replace(/<span\b[^>]*>[\s\S]*?<\/span>/gi, "");
            title = cleanTitleHtml
              .replace(/<[^>]*>/g, "")
              .replace(/\s+/g, " ")
              .trim();
          }
          if (!title) continue;

          // Extract <td> columns: [번호, 유형, 제목, 지역, 첨부, 공고일, 마감일, 상태, 조회수]
          const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
          let tdMatch;
          const cols: string[] = [];
          while ((tdMatch = tdRegex.exec(inner)) !== null) {
            cols.push(tdMatch[1].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim());
          }

          items.push({
            panId: linkMatch[1],
            ccrCnntSysDsCd: linkMatch[2],
            uppAisTpCd: linkMatch[3],
            aisTpCd: linkMatch[4],
            title,
            type: cols[1] || "",
            region: cols[3] || null,
            startDate: cols[5] || null,
            endDate: cols[6] || null,
            status: cols[7] || null,
            mi,
          });
        }

        console.log(`[LHWeb] ${label}: Found ${items.length} items.`);
        return items;
      } catch (err: any) {
        console.error(`[LHWeb] Error fetching ${label}:`, err.message);
        return [];
      }
    });

    const results = await Promise.all(promises);
    const flat = results.flat();

    // Validate and dedupe by panId
    const seen = new Set<string>();
    return flat
      .map((item) => {
        try {
          return LHWebAnnouncementSchema.parse(item);
        } catch (e: any) {
          console.error(`[LHWeb] Parse error:`, e.message);
          return null;
        }
      })
      .filter((item): item is LHWebAnnouncement => {
        if (!item || seen.has(item.panId)) return false;
        seen.add(item.panId);
        return true;
      });
  }

  async fetchDetail(id: string): Promise<LHWebAnnouncement> {
    throw new Error("Method not implemented.");
  }

  normalize(raw: LHWebAnnouncement): NormalizedAnnouncement {
    const cleanDate = (d: string | null | undefined) => {
      if (!d) return null;
      return d.replace(/\./g, "-");
    };

    const slug = `lh-web-${raw.title}-${raw.panId}`
      .replace(/\s+/g, "-")
      .replace(/[^\w-가-힣]/g, "")
      .toLowerCase();

    const detailUrl = `${this.baseUrl}/lhapply/apply/wt/wrtanc/selectWrtancInfo.do?panId=${raw.panId}&ccrCnntSysDsCd=${raw.ccrCnntSysDsCd}&uppAisTpCd=${raw.uppAisTpCd}&aisTpCd=${raw.aisTpCd}&mi=${raw.mi}`;

    return {
      housingMgmtNo: raw.panId,
      announceNo: raw.panId,
      name: raw.title,
      slug,
      supplyType: raw.type || (raw.mi === "1026" ? "LH임대" : "LH분양"),
      status: this.mapStatus(raw.status),
      displayStatus: raw.status || null,
      announceDate: cleanDate(raw.startDate),
      applyStartDate: cleanDate(raw.startDate),
      applyEndDate: cleanDate(raw.endDate),
      winnerAnnounceDate: null,
      contractStartDate: null,
      contractEndDate: null,
      moveInDate: null,
      address: raw.region || null,
      builderName: "LH(한국토지주택공사)",
      developerName: "LH(한국토지주택공사)",
      totalHouseholds: null,
      regionCode: null,
      externalSourceKey: `${this.providerId}:${raw.panId}`,
      pblancUrl: detailUrl,
      homepageAdres: this.baseUrl,
    };
  }

  private mapStatus(s: string | null | undefined): "UPCOMING" | "OPEN" | "CLOSED" {
    if (!s) return "OPEN";
    if (s.includes("공고중") || s.includes("접수중") || s.includes("정정공고")) return "OPEN";
    if (s.includes("마감") || s.includes("종료")) return "CLOSED";
    if (s.includes("예정")) return "UPCOMING";
    return "OPEN";
  }

  getStableExternalId(raw: LHWebAnnouncement): string {
    return `${this.providerId}:${raw.panId}`;
  }

  supportsBackfill(): boolean {
    return false;
  }

  getRateLimitPolicy(): RateLimitPolicy {
    return { requestsPerSecond: 1, delayMs: 1000 };
  }
}
