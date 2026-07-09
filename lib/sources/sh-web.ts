import { SourceProvider, RateLimitPolicy } from "./provider";
import { SHAnnouncement, SHAnnouncementSchema, NormalizedAnnouncement } from "../validators";

type DetailDates = {
  start: string | null;
  end: string | null;
  winner: string | null;
};

export class SHWebProvider implements SourceProvider<SHAnnouncement> {
  providerId = "sh_web";
  private baseUrl = "https://www.i-sh.co.kr";

  private decodeHtml(text: string): string {
    return text
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&#40;/gi, "(")
      .replace(/&#41;/gi, ")")
      .replace(/&#39;/gi, "'")
      .replace(/&quot;/gi, '"');
  }

  private htmlToText(html: string): string {
    return this.decodeHtml(html)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<(br|\/p|\/div|\/tr|\/li|\/h[1-6])\b[^>]*>/gi, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private toDate(year: string, month: string, day: string): string {
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  private cleanCellHtml(html: string): string {
    return this.htmlToText(html);
  }

  private async readResponseText(res: Response): Promise<string> {
    const buffer = await res.arrayBuffer();
    const charset = res.headers.get("content-type")?.match(/charset=([^;]+)/i)?.[1]?.toLowerCase();
    if (charset?.includes("euc") || charset?.includes("ks_c") || charset?.includes("949")) {
      return new TextDecoder("euc-kr").decode(buffer);
    }

    const utf8Text = new TextDecoder("utf-8").decode(buffer);
    const replacementCount = (utf8Text.match(/\uFFFD/g) || []).length;
    return replacementCount > 20 ? new TextDecoder("euc-kr").decode(buffer) : utf8Text;
  }

  private extractDateRange(text: string, keywords: string[]): { start: string | null; end: string | null } {
    const dateRangeRegex = /(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*(?:일|\.)?[^~]{0,80}~\s*(?:(\d{4})\s*[.\-/년]\s*)?(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/i;

    for (const keyword of keywords) {
      const idx = text.indexOf(keyword);
      if (idx === -1) continue;

      const windowText = text.substring(idx, idx + 500);
      const match = windowText.match(dateRangeRegex);
      if (!match) continue;

      const startYear = match[1];
      const endYear = match[4] || startYear;
      return {
        start: this.toDate(startYear, match[2], match[3]),
        end: this.toDate(endYear, match[5], match[6]),
      };
    }

    return { start: null, end: null };
  }

  private extractSingleDate(text: string, keywords: string[]): string | null {
    const dateRegex = /(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/i;

    for (const keyword of keywords) {
      const idx = text.indexOf(keyword);
      if (idx === -1) continue;

      const windowText = text.substring(idx, idx + 250);
      const match = windowText.match(dateRegex);
      if (match) {
        return this.toDate(match[1], match[2], match[3]);
      }
    }

    return null;
  }

  private async fetchDetailDates(domain: string, boardId: string, menuId: string, seq: string): Promise<DetailDates> {
    try {
      const url = `${this.baseUrl}/${domain}/lay2/program/${boardId}/www/brd/${menuId}/view.do?seq=${seq}`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });

      if (!res.ok) return { start: null, end: null, winner: null };

      const text = this.htmlToText(await this.readResponseText(res));
      const applicationDates = this.extractDateRange(text, [
        "인터넷 청약신청",
        "청약신청",
        "청약 신청",
        "청약접수",
        "신청접수",
        "신청기간",
        "접수기간",
      ]);

      const winner =
        this.extractSingleDate(text, [
          "당첨자 및 예비자 발표",
          "당첨자 발표",
          "예비자 발표",
          "최종 당첨자",
        ]) ||
        this.extractSingleDate(text, [
          "서류심사대상자 발표",
          "서류심사 대상자 발표",
        ]);

      return {
        start: applicationDates.start,
        end: applicationDates.end,
        winner,
      };
    } catch (e) {
      console.error(`[SHWeb] Failed to parse detail dates for seq=${seq}`, e);
      return { start: null, end: null, winner: null };
    }
  }

  async fetchIndex(): Promise<SHAnnouncement[]> {
    console.log("[SHWeb] Starting web scraping for SH announcements...");

    const targets = [
      {
        url: `${this.baseUrl}/main/lay2/program/S1T294C295/www/brd/m_241/list.do`,
        type: "notice" as const,
        boardId: "S1T294C295",
        menuId: "m_241",
        domain: "main",
        label: "공고 및 공지",
      },
      {
        url: `${this.baseUrl}/app/lay2/program/S1T294C297/www/brd/m_247/list.do`,
        type: "rent" as const,
        boardId: "S1T294C297",
        menuId: "m_247",
        domain: "app",
        label: "임대공고",
      },
    ];

    const promises = targets.map(async ({ url, type, boardId, menuId, domain, label }) => {
      try {
        console.log(`[SHWeb] Fetching ${label} list from ${url}...`);
        const res = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
        });

        if (!res.ok) {
          throw new Error(`HTTP error ${res.status}`);
        }

        const html = await this.readResponseText(res);
        const items: SHAnnouncement[] = [];

        const trRegex = /<tr>([\s\S]*?)<\/tr>/gi;
        let trMatch;

        while ((trMatch = trRegex.exec(html)) !== null) {
          const innerHtml = trMatch[1];
          const onclickMatch = innerHtml.match(/getDetailView\(['"]?(\d+)['"]?\)/i);

          if (!onclickMatch) continue;

          const seq = onclickMatch[1];
          const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
          let tdMatch;
          const cols: string[] = [];

          while ((tdMatch = tdRegex.exec(innerHtml)) !== null) {
            cols.push(this.cleanCellHtml(tdMatch[1]));
          }

          if (cols.length < 4) continue;

          const title = cols[1] || "";
          const dept = cols[2] || null;
          const dateMatch = innerHtml.match(/\d{4}-\d{2}-\d{2}/);
          const date = dateMatch ? dateMatch[0] : (cols[3] || null);
          const viewsVal = cols[4] || cols[cols.length - 1];
          const views = viewsVal && /^\d+$/.test(viewsVal) ? parseInt(viewsVal, 10) : null;

          items.push({
            seq,
            title,
            dept,
            date,
            views,
            _type: type,
            boardId,
            menuId,
            domain,
          });
        }

        console.log(`[SHWeb] Fetching detailed dates for ${items.length} items in ${label}...`);
        await Promise.all(
          items.map(async (item) => {
            const dates = await this.fetchDetailDates(item.domain, item.boardId, item.menuId, item.seq);
            item.applyStartDate = dates.start;
            item.applyEndDate = dates.end;
            item.winnerAnnounceDate = dates.winner;
          })
        );

        console.log(`[SHWeb] Finished ${label}: Found ${items.length} items.`);
        return items;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[SHWeb] Error fetching ${label}:`, message);
        return [];
      }
    });

    const results = await Promise.all(promises);

    return results
      .flat()
      .map((item) => {
        try {
          return SHAnnouncementSchema.parse(item);
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          console.error("[SHWeb] Parse error:", message, item);
          return null;
        }
      })
      .filter(Boolean) as SHAnnouncement[];
  }

  async fetchDetail(): Promise<SHAnnouncement> {
    throw new Error("Method not implemented.");
  }

  normalize(raw: SHAnnouncement): NormalizedAnnouncement {
    const cleanTitle = raw.title.trim();
    const slug = `sh-${cleanTitle}-${raw.seq}`
      .replace(/\s+/g, "-")
      .replace(/[^\w가-힣-]/g, "")
      .toLowerCase();

    const pblancUrl = `${this.baseUrl}/${raw.domain}/lay2/program/${raw.boardId}/www/brd/${raw.menuId}/view.do?seq=${raw.seq}`;
    const isRental =
      raw._type === "rent" ||
      /임대|행복주택|국민임대|영구임대|매입임대|전세임대|장기전세|사회주택|청년주택|주거복지/i.test(cleanTitle);

    return {
      housingMgmtNo: `sh-${raw.seq}`,
      announceNo: `sh-${raw.seq}`,
      name: cleanTitle,
      slug,
      supplyType: isRental ? "SH임대주택" : "SH분양주택",
      status: this.calculateStatus(raw.applyStartDate, raw.applyEndDate),
      displayStatus: "접수중",
      announceDate: raw.date || null,
      applyStartDate: raw.applyStartDate || raw.date || null,
      applyEndDate: raw.applyEndDate || null,
      winnerAnnounceDate: raw.winnerAnnounceDate || null,
      contractStartDate: null,
      contractEndDate: null,
      moveInDate: null,
      address: "서울",
      builderName: "SH(서울주택도시공사)",
      developerName: "SH(서울주택도시공사)",
      totalHouseholds: null,
      regionCode: "11",
      externalSourceKey: this.getStableExternalId(raw),
      pblancUrl,
      homepageAdres: this.baseUrl,
      atchmnflSeqNo: null,
      atchmnflSn: null,
    };
  }

  private calculateStatus(start: string | null | undefined, end: string | null | undefined): "UPCOMING" | "OPEN" | "CLOSED" {
    const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split("T")[0];

    if (start && start > today) return "UPCOMING";
    if (end && end < today) return "CLOSED";
    return "OPEN";
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
