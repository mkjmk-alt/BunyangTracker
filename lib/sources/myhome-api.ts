import { SourceProvider, FetchOptions, RateLimitPolicy } from "./provider";
import { MyHomeAnnouncement, MyHomeAnnouncementSchema, NormalizedAnnouncement } from "../validators";
import { createTimeoutSignal } from "./fetch-timeout";

const API_FETCH_TIMEOUT_MS = 12000;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function getNestedRecord(record: JsonRecord, key: string): JsonRecord | null {
  const value = record[key];
  return isRecord(value) ? value : null;
}

function getResponseItems(data: unknown): unknown[] {
  if (!isRecord(data)) return [];

  const response = getNestedRecord(data, "response");
  const body = response ? getNestedRecord(response, "body") : null;
  if (!body) return [];

  const itemsWrapper = getNestedRecord(body, "items");
  const rawItems = itemsWrapper?.item ?? body.item;
  if (!rawItems) return [];

  return Array.isArray(rawItems) ? rawItems : [rawItems];
}

function getTotalCount(data: unknown): number {
  if (!isRecord(data)) return 0;

  const response = getNestedRecord(data, "response");
  const body = response ? getNestedRecord(response, "body") : null;
  if (!body) return 0;

  return Number(body.totalCount || 0);
}

function cleanDate(value: string | null | undefined): string | null {
  if (!value) return null;

  const cleaned = value.replace(/[^\d]/g, "");
  if (cleaned.length === 8) {
    return `${cleaned.substring(0, 4)}-${cleaned.substring(4, 6)}-${cleaned.substring(6, 8)}`;
  }

  return value;
}

function normalizeInstitutionName(instt: string | null | undefined): string {
  if (!instt) return "공공임대";

  if (instt.includes("한국토지주택") || instt.includes("LH")) return "LH(한국토지주택공사)";
  if (instt.includes("서울주택") || instt.includes("SH")) return "SH(서울주택도시공사)";
  if (instt.includes("경기주택") || instt.includes("GH")) return "GH(경기주택도시공사)";
  if (instt.includes("인천도시") || instt.includes("iH")) return "iH(인천도시공사)";
  if (instt.includes("부산도시") || instt.includes("BMC")) return "BMC(부산도시공사)";

  return instt;
}

function extractCanonicalId(url: string | null | undefined, instt: string | null | undefined, defaultId: string): string {
  const insttLower = (instt || "").toLowerCase();
  const urlLower = (url || "").toLowerCase();

  if (insttLower.includes("lh") || insttLower.includes("한국토지주택") || urlLower.includes("lh.or.kr")) {
    const match = url?.match(/[?&]panId=([^&]+)/);
    if (match) return match[1];
  }

  if (insttLower.includes("sh") || insttLower.includes("서울주택") || urlLower.includes("i-sh.co.kr")) {
    const match = url?.match(/[?&]seq=([^&]+)/);
    if (match) return `sh-${match[1]}`;
  }

  if (insttLower.includes("gh") || insttLower.includes("경기주택") || urlLower.includes("gh.or.kr")) {
    const match = url?.match(/[?&]pbancNo=([^&]+)/) || url?.match(/[?&]bizCd=([^&]+)/);
    if (match) return `gh-${match[1]}`;
  }

  if (insttLower.includes("ih") || insttLower.includes("인천도시") || urlLower.includes("ih.co.kr")) {
    const match = url?.match(/[?&]seq=([^&]+)/) || url?.match(/[?&]msg_seq=([^&]+)/) || url?.match(/[?&]dataSid=([^&]+)/);
    if (match) return `ih-${match[1]}`;
  }

  if (insttLower.includes("bmc") || insttLower.includes("부산도시") || urlLower.includes("bmc.busan.kr")) {
    const match = url?.match(/[?&]dataSid=([^&]+)/);
    if (match) return `bmc-${match[1]}`;
  }

  return defaultId;
}

export class MyHomeApiProvider implements SourceProvider<MyHomeAnnouncement> {
  providerId = "myhome_api";
  private baseUri = "http://apis.data.go.kr/1613000/HWSPR02/rsdtRcritNtcList";

  async fetchIndex(options: FetchOptions): Promise<MyHomeAnnouncement[]> {
    const apiKey = process.env.PUBLIC_DATA_API_KEY || "";
    const { page = 1, perPage = 30, maxPages = 1 } = options;
    const supplyTypes = options.myhomeKeywords?.filter(Boolean) || [];

    console.log(`[MyHome] Fetching public rental housing announcements (Page ${page}, perPage ${perPage})...`);

    try {
      const allItems: unknown[] = [];

      for (let currentPage = page; currentPage < page + maxPages; currentPage++) {
        const params = new URLSearchParams({
          serviceKey: apiKey.trim(),
          numOfRows: perPage.toString(),
          pageNo: currentPage.toString(),
          _type: "json",
        });

        const url = `${this.baseUri}?${params.toString()}`;
        console.log(`[MyHome] Request URL: ${url.replace(apiKey.trim(), "HIDDEN_KEY")}`);

        const response = await fetch(url, { signal: createTimeoutSignal(API_FETCH_TIMEOUT_MS) });
        const text = await response.text();

        let data: unknown;
        try {
          data = JSON.parse(text);
        } catch {
          console.error("[MyHome] Failed to parse JSON response.");
          console.error(`[MyHome] Raw response: ${text.substring(0, 300)}`);
          break;
        }

        const pageItems = getResponseItems(data);
        if (pageItems.length === 0) break;

        allItems.push(...pageItems);

        const totalCount = getTotalCount(data);
        const fetchedAllKnownItems = totalCount > 0 && allItems.length >= totalCount;
        if (pageItems.length < perPage || fetchedAllKnownItems) break;
      }

      const filteredItems = supplyTypes.length
        ? allItems.filter((item) => {
            const suplyTyNm = isRecord(item) ? asString(item.suplyTyNm) : null;
            return suplyTyNm ? supplyTypes.includes(suplyTyNm) : false;
          })
        : allItems;

      console.log(`[MyHome] Successfully fetched ${filteredItems.length} items.`);

      return filteredItems
        .map((item) => {
          try {
            return MyHomeAnnouncementSchema.parse(item);
          } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            console.error("[MyHome] Validation failed for item:", message);
            return null;
          }
        })
        .filter(Boolean) as MyHomeAnnouncement[];
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[MyHome] Fetch error:", message);
      return [];
    }
  }

  async fetchDetail(): Promise<MyHomeAnnouncement> {
    throw new Error("Method not implemented.");
  }

  normalize(raw: MyHomeAnnouncement): NormalizedAnnouncement {
    const pblancId = raw.pblancId;
    const announceUrl = raw.url || raw.pcUrl || null;
    const insttName = normalizeInstitutionName(raw.suplyInsttNm);
    const canonicalId = extractCanonicalId(raw.url || raw.pcUrl || null, insttName, pblancId);

    const slug = `myhome-${raw.pblancNm}-${canonicalId}`
      .replace(/\s+/g, "-")
      .replace(/[^\p{L}\p{N}-]/gu, "")
      .replace(/-+/g, "-")
      .toLowerCase();

    const announceDate = cleanDate(raw.rcritPblancDe);
    const applyStartDate = cleanDate(raw.beginDe);
    const applyEndDate = cleanDate(raw.endDe);
    const winnerAnnounceDate = cleanDate(raw.przwnerPresnatnDe);

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
      winnerAnnounceDate,
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
    const now = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split("T")[0];
    if (start && start > now) return "UPCOMING";
    if (end && end < now) return "CLOSED";
    return "OPEN";
  }

  getStableExternalId(raw: MyHomeAnnouncement): string {
    const insttName = normalizeInstitutionName(raw.suplyInsttNm);
    const canonicalId = extractCanonicalId(raw.url || raw.pcUrl || null, insttName, raw.pblancId);
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
