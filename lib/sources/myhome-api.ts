import { SourceProvider, FetchOptions, RateLimitPolicy } from "./provider";
import { MyHomeAnnouncement, MyHomeAnnouncementSchema, NormalizedAnnouncement } from "../validators";

const extractCanonicalId = (url: string | null | undefined, instt: string | null | undefined, defaultId: string): string => {
  if (!url) return defaultId;

  const insttLower = (instt || "").toLowerCase();
  const urlLower = url.toLowerCase();

  // LH (한국토지주택공사)
  if (insttLower.includes("lh") || insttLower.includes("토지주택") || urlLower.includes("lh.or.kr")) {
    const match = url.match(/[?&]panId=([^&]+)/);
    if (match) return match[1];
  }

  // SH (서울주택도시공사)
  if (insttLower.includes("sh") || insttLower.includes("서울주택") || urlLower.includes("i-sh.co.kr")) {
    const match = url.match(/[?&]seq=([^&]+)/);
    if (match) return `sh-${match[1]}`;
  }

  // GH (경기주택도시공사)
  if (insttLower.includes("gh") || insttLower.includes("경기주택") || urlLower.includes("gh.or.kr")) {
    const match = url.match(/[?&]pbancNo=([^&]+)/) || url.match(/[?&]bizCd=([^&]+)/);
    if (match) return `gh-${match[1]}`;
  }

  // iH (인천도시공사)
  if (insttLower.includes("ih") || insttLower.includes("인천도시") || urlLower.includes("ih.co.kr")) {
    const match = url.match(/[?&]seq=([^&]+)/) || url.match(/[?&]msg_seq=([^&]+)/) || url.match(/[?&]dataSid=([^&]+)/);
    if (match) return `ih-${match[1]}`;
  }

  // BMC (부산도시공사)
  if (insttLower.includes("bmc") || insttLower.includes("부산도시") || urlLower.includes("bmc.busan.kr")) {
    const match = url.match(/[?&]dataSid=([^&]+)/);
    if (match) return `bmc-${match[1]}`;
  }

  return defaultId;
};

export class MyHomeApiProvider implements SourceProvider<MyHomeAnnouncement> {
  providerId = "myhome_api";
  private baseUri = "http://apis.data.go.kr/1613000/HWSPR02/rsdtRcritNtcList";

  async fetchIndex(options: FetchOptions): Promise<MyHomeAnnouncement[]> {
    const apiKey = process.env.PUBLIC_DATA_API_KEY || "";
    const { page = 1, perPage = 80 } = options;

    console.log(`[MyHome] Fetching public rental housing announcements (Page ${page})...`);

    try {
      const params = new URLSearchParams({
        serviceKey: apiKey.trim(),
        numOfRows: perPage.toString(),
        pageNo: page.toString(),
        _type: "json"
      });

      const url = `${this.baseUri}?${params.toString()}`;
      console.log(`[MyHome] Request URL: ${url.replace(apiKey.trim(), "HIDDEN_KEY")}`);

      const response = await fetch(url);
      const text = await response.text();

      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error(`[MyHome] Failed to parse JSON response.`);
        console.error(`[MyHome] Raw response: ${text.substring(0, 300)}`);
        return [];
      }

      // Check standard public portal response format: response.body.items.item or response.body.item
      const rawItems = data?.response?.body?.items?.item || data?.response?.body?.item;
      if (!rawItems) {
        console.log(`[MyHome] No items found in response body.`);
        return [];
      }

      // Handle both single object and array responses (data.go.kr standard gotcha)
      const itemsList = Array.isArray(rawItems) ? rawItems : [rawItems];
      console.log(`[MyHome] Successfully fetched ${itemsList.length} items.`);

      return itemsList.map((item: any) => {
        try {
          return MyHomeAnnouncementSchema.parse(item);
        } catch (e: any) {
          console.error(`[MyHome] Validation failed for item:`, e.message);
          return null;
        }
      }).filter(Boolean) as MyHomeAnnouncement[];

    } catch (error: any) {
      console.error(`[MyHome] Fetch error:`, error.message);
      return [];
    }
  }

  async fetchDetail(id: string): Promise<MyHomeAnnouncement> {
    throw new Error("Method not implemented.");
  }

  normalize(raw: MyHomeAnnouncement): NormalizedAnnouncement {
    const cleanDate = (d: string | null | undefined) => {
      if (!d) return null;
      // Extract numbers only to convert YYYY.MM.DD or YYYYMMDD to YYYY-MM-DD
      const cleaned = d.replace(/[^\d]/g, '');
      if (cleaned.length === 8) {
        return `${cleaned.substring(0, 4)}-${cleaned.substring(4, 6)}-${cleaned.substring(6, 8)}`;
      }
      return d;
    };

    const cleanInstt = (instt: string | null | undefined) => {
      if (!instt) return "공공임대";
      // Clean and normalize institution names
      if (instt.includes("토지주택") || instt.includes("LH")) return "LH(한국토지주택공사)";
      if (instt.includes("서울주택") || instt.includes("SH")) return "SH(서울주택도시공사)";
      if (instt.includes("경기주택") || instt.includes("GH")) return "GH(경기주택도시공사)";
      if (instt.includes("인천도시") || instt.includes("iH")) return "iH(인천도시공사)";
      return instt;
    };

    const pblancId = raw.pblancId;
    const announceUrl = raw.pcUrl || raw.url || null;
    const insttName = cleanInstt(raw.suplyInsttNm);
    
    // Extract canonical ID prioritizing the direct link (url) over the portal detail link (pcUrl)
    const canonicalId = extractCanonicalId(raw.url || raw.pcUrl || null, insttName, pblancId);

    const slug = `myhome-${raw.pblancNm}-${canonicalId}`
      .replace(/\s+/g, "-")
      .replace(/[^\p{L}\p{N}-]/gu, "")
      .replace(/-+/g, "-")
      .toLowerCase();

    const announceDate = cleanDate(raw.rcritPblancDe);
    const applyStartDate = cleanDate(raw.beginDe);
    const applyEndDate = cleanDate(raw.endDe);

    return {
      housingMgmtNo: canonicalId,
      announceNo: canonicalId,
      name: raw.pblancNm,
      slug,
      supplyType: raw.suplyTyNm || "공공임대",
      status: this.calculateStatus(applyStartDate, applyEndDate),
      announceDate,
      applyStartDate,
      applyEndDate,
      winnerAnnounceDate: null,
      contractStartDate: null,
      contractEndDate: null,
      moveInDate: null,
      address: raw.fullAdres || null,
      builderName: insttName,
      developerName: insttName,
      totalHouseholds: null,
      regionCode: null,
      externalSourceKey: `${this.providerId}:${canonicalId}`,
      pblancUrl: announceUrl,
      homepageAdres: null,
      displayStatus: raw.sttusNm || null,
    };
  }

  private calculateStatus(start: string | null, end: string | null): "UPCOMING" | "OPEN" | "CLOSED" {
    const now = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];
    if (start && start > now) return "UPCOMING";
    if (end && end < now) return "CLOSED";
    return "OPEN";
  }

  getStableExternalId(raw: MyHomeAnnouncement): string {
    const canonicalId = extractCanonicalId(raw.url || raw.pcUrl || null, raw.suplyInsttNm, raw.pblancId);
    return `${this.providerId}:${canonicalId}`;
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
