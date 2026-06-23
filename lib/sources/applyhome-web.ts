import { SourceProvider, FetchOptions, RateLimitPolicy } from "./provider";
import { NormalizedAnnouncement } from "../validators";

export interface ApplyHomeWebAnnouncement {
  houseManageNo: string;
  pblancNo: string;
  name: string;
  supplyType: string;
  announceDate: string | null;
  applyStartDate: string | null;
  applyEndDate: string | null;
  winnerAnnounceDate: string | null;
  builderName: string | null;
  address: string | null;
  _type: "APT" | "Remainder" | "Other";
  houseSecd?: string | null;
}

export class ApplyHomeWebProvider implements SourceProvider<ApplyHomeWebAnnouncement> {
  providerId = "applyhome_web";
  private baseUrl = "https://www.applyhome.co.kr/ai/aia";

  async fetchIndex(options: FetchOptions): Promise<ApplyHomeWebAnnouncement[]> {
    console.log("[ApplyHomeWeb] Starting web scraping for real-time announcements...");
    
    const targets = [
      {
        url: `${this.baseUrl}/selectAPTLttotPblancListView.do`,
        type: "APT" as const,
        label: "아파트"
      },
      {
        url: `${this.baseUrl}/selectAPTRemndrLttotPblancListView.do`,
        type: "Remainder" as const,
        label: "무순위/잔여세대"
      },
      {
        url: `${this.baseUrl}/selectOtherLttotPblancListView.do`,
        type: "Other" as const,
        label: "오피스텔/도시형/임대"
      }
    ];

    const promises = targets.map(async ({ url, type, label }) => {
      try {
        console.log(`[ApplyHomeWeb] Fetching ${label} list from ${url}...`);
        const res = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
          }
        });
        
        if (!res.ok) {
          throw new Error(`HTTP error ${res.status}`);
        }
        
        const html = await res.text();
        const items: ApplyHomeWebAnnouncement[] = [];
        
        // Find rows matching <tr> tag with data-pbno and data-hmno
        const trRegex = /<tr([^>]+)>([\s\S]*?)<\/tr>/g;
        let match;
        
        while ((match = trRegex.exec(html)) !== null) {
          const tagContent = match[1];
          const innerHtml = match[2];
          
          if (tagContent.includes("data-pbno") && tagContent.includes("data-hmno")) {
            const pbnoMatch = tagContent.match(/data-pbno="([^"]+)"/);
            const hmnoMatch = tagContent.match(/data-hmno="([^"]+)"/);
            const honmMatch = tagContent.match(/data-honm="([^"]+)"/);
            
            if (pbnoMatch && hmnoMatch && honmMatch) {
              const pblancNo = pbnoMatch[1];
              const houseManageNo = hmnoMatch[1];
              const name = honmMatch[1];
              const hsecdMatch = tagContent.match(/data-hsecd="([^"]+)"/);
              const houseSecd = hsecdMatch ? hsecdMatch[1] : null;
              
              // Extract td text values in order
              const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
              let tdMatch;
              const cols: string[] = [];
              while ((tdMatch = tdRegex.exec(innerHtml)) !== null) {
                // Strip tags & whitespace
                const cleanText = tdMatch[1]
                  .replace(/<[^>]*>/g, "")
                  .replace(/\s+/g, " ")
                  .trim();
                cols.push(cleanText);
              }
              
              // Determine dates based on YYYY-MM-DD ~ YYYY-MM-DD pattern position
              let announceDate: string | null = null;
              let applyStartDate: string | null = null;
              let applyEndDate: string | null = null;
              let winnerAnnounceDate: string | null = null;
              
              const dateRangeIndex = cols.findIndex(col => 
                /\d{4}-\d{2}-\d{2}\s*~\s*\d{4}-\d{2}-\d{2}/.test(col)
              );
              
              if (dateRangeIndex !== -1) {
                const rangeParts = cols[dateRangeIndex].split("~").map(s => s.trim());
                if (rangeParts.length === 2) {
                  applyStartDate = rangeParts[0];
                  applyEndDate = rangeParts[1];
                }
                
                if (dateRangeIndex > 0) {
                  const preCol = cols[dateRangeIndex - 1];
                  if (/\d{4}-\d{2}-\d{2}/.test(preCol)) {
                    announceDate = preCol;
                  }
                }
                
                if (dateRangeIndex < cols.length - 1) {
                  const postCol = cols[dateRangeIndex + 1];
                  if (/\d{4}-\d{2}-\d{2}/.test(postCol)) {
                    winnerAnnounceDate = postCol;
                  }
                }
              }
              
              // Fallback if index-based detection is off (e.g. date columns not aligned)
              if (!announceDate) {
                const dates = cols.filter(col => /^\d{4}-\d{2}-\d{2}$/.test(col));
                if (dates.length >= 2) {
                  announceDate = dates[0];
                  winnerAnnounceDate = dates[1];
                } else if (dates.length === 1) {
                  announceDate = dates[0];
                }
              }
              
              // Determine supplyType and address
              let supplyType = "APT";
              let address: string | null = null;
              let builderName: string | null = null;
              
              if (type === "APT") {
                supplyType = "APT";
                address = cols[0] || null; // e.g. "제주"
                builderName = cols[4] || null; // Column 5 (index 4)
              } else if (type === "Remainder") {
                // Column 2 has "임의공급", "무순위" etc.
                supplyType = cols[1] || "무순위";
                address = cols[0] || null;
                builderName = cols[3] || null; // Column 4 (index 3)
              } else if (type === "Other") {
                supplyType = "도시형/오피스텔/생활숙박시설/민간임대";
                address = cols[0] || null;
                builderName = cols[3] || null; // Column 4 (index 3)
              }
              
              items.push({
                houseManageNo,
                pblancNo,
                name,
                supplyType,
                announceDate,
                applyStartDate,
                applyEndDate,
                winnerAnnounceDate,
                builderName,
                address,
                _type: type,
                houseSecd
              });
            }
          }
        }
        
        console.log(`[ApplyHomeWeb] Finished ${label}: Found ${items.length} items.`);
        return items;
      } catch (err: any) {
        console.error(`[ApplyHomeWeb] Error fetching ${label}:`, err.message);
        return [];
      }
    });

    const results = await Promise.all(promises);
    return results.flat();
  }

  async fetchDetail(id: string): Promise<ApplyHomeWebAnnouncement> {
    throw new Error("Method not implemented.");
  }

  normalize(raw: ApplyHomeWebAnnouncement): NormalizedAnnouncement {
    const slug = `${raw.name}-${raw.pblancNo}-${raw.houseManageNo}`
      .replace(/\s+/g, "-")
      .replace(/[^\w-가-힣]/g, "")
      .toLowerCase();

    const status = this.calculateStatus(raw);

    return {
      housingMgmtNo: raw.houseManageNo,
      announceNo: raw.pblancNo,
      name: raw.name,
      slug,
      supplyType: raw.supplyType,
      status,
      displayStatus: this.getDisplayStatus(status),
      announceDate: raw.announceDate,
      applyStartDate: raw.applyStartDate,
      applyEndDate: raw.applyEndDate,
      winnerAnnounceDate: raw.winnerAnnounceDate,
      contractStartDate: null,
      contractEndDate: null,
      moveInDate: null,
      address: raw.address,
      builderName: raw.builderName,
      developerName: null,
      totalHouseholds: null,
      regionCode: null,
      externalSourceKey: this.getStableExternalId(raw),
      pblancUrl: `${this.baseUrl}/${
        raw._type === "Remainder"
          ? "selectAPTRemndrLttotPblancDetailView.do"
          : raw._type === "Other"
          ? "selectPRMOLttotPblancDetailView.do"
          : "selectAPTLttotPblancDetail.do"
      }?houseManageNo=${raw.houseManageNo}&pblancNo=${raw.pblancNo}${
        raw._type === "Other" && raw.houseSecd
          ? `&houseSecd=${raw.houseSecd}`
          : ""
      }`,
      homepageAdres: null,
      atchmnflSeqNo: null,
      atchmnflSn: null,
    };
  }

  private calculateStatus(raw: ApplyHomeWebAnnouncement): "UPCOMING" | "OPEN" | "CLOSED" {
    const now = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];
    const start = raw.applyStartDate;
    const end = raw.applyEndDate;
    
    if (!start || !end) return "OPEN";
    
    if (start > now) return "UPCOMING";
    if (end < now) return "CLOSED";
    return "OPEN";
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

  getStableExternalId(raw: ApplyHomeWebAnnouncement): string {
    return `applyhome_web:${raw.pblancNo}`;
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
