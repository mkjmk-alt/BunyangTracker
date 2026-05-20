import { NormalizedAnnouncement } from "../validators";
import { parse, format } from "date-fns";

export function normalizeDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  // 청약홈 날짜 형식: 20231024 -> 2023-10-24
  if (/^\d{8}$/.test(dateStr)) {
    const parsed = parse(dateStr, "yyyyMMdd", new Date());
    return format(parsed, "yyyy-MM-dd");
  }
  return dateStr;
}

export function generateFingerprint(data: any): string {
  const str = JSON.stringify({
    announceDate: data.announceDate,
    applyStartDate: data.applyStartDate,
    applyEndDate: data.applyEndDate,
    winnerAnnounceDate: data.winnerAnnounceDate,
    status: data.status,
    totalHouseholds: data.totalHouseholds,
  });
  
  // Simple fast hash for fingerprinting
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  return hash.toString(16);
}
