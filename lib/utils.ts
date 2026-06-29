import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getApplyHomeUrl(houseManageNo: string, pblancNo: string, supplyType: string) {
  // supplyType is the Korean name (e.g., "아파트", "무순위", "오피스텔")
  let endpoint = "selectAPTLttotPblancDetail.do";
  
  if (supplyType.includes("무순위") || supplyType.includes("잔여세대")) {
    endpoint = "selectRemndrLttotPblancDetail.do";
  } else if (supplyType.includes("오피스텔") || supplyType.includes("도시형") || supplyType.includes("민간임대")) {
    endpoint = "selectUrbtyOfctlLttotPblancDetail.do";
  }

  return `https://www.applyhome.co.kr/ai/aia/${endpoint}?houseManageNo=${houseManageNo}&pblancNo=${pblancNo}`;
}

export function getKstDateString() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];
}

export function getDynamicStatus(
  applyStartDate: string | null | undefined, 
  applyEndDate: string | null | undefined, 
  kstToday?: string
) {
  const today = kstToday || getKstDateString();
  
  if (!applyStartDate || !applyEndDate) {
    return {
      status: "OPEN" as const,
      displayStatus: "접수중"
    };
  }

  if (applyStartDate > today) {
    return {
      status: "UPCOMING" as const,
      displayStatus: "공고예정"
    };
  }

  if (applyEndDate < today) {
    return {
      status: "CLOSED" as const,
      displayStatus: "접수마감"
    };
  }

  return {
    status: "OPEN" as const,
    displayStatus: "접수중"
  };
}

export function getSourceBadge(key: string | null | undefined) {
  if (!key) return null;
  if (key.startsWith("applyhome_web")) {
    return { 
      label: "[크롤러] 청약홈", 
      className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-900/30" 
    };
  }
  if (key.startsWith("applyhome_api")) {
    return { 
      label: "[API] 청약홈", 
      className: "bg-sky-100 text-sky-700 dark:bg-sky-950/30 dark:text-sky-400 border border-sky-200/50 dark:border-sky-900/30" 
    };
  }
  if (key.startsWith("lh_api")) {
    return { 
      label: "[API] LH", 
      className: "bg-purple-100 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400 border border-purple-200/50 dark:border-purple-900/30" 
    };
  }
  if (key.startsWith("lh_web")) {
    return { 
      label: "[크롤러] LH", 
      className: "bg-teal-100 text-teal-700 dark:bg-teal-950/30 dark:text-teal-400 border border-teal-200/50 dark:border-teal-900/30" 
    };
  }
  if (key.startsWith("sh_web")) {
    return { 
      label: "[크롤러] SH", 
      className: "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-200/50 dark:border-amber-900/30" 
    };
  }
  if (key.startsWith("gh_web")) {
    return { 
      label: "[크롤러] GH", 
      className: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-400 border border-indigo-200/50 dark:border-indigo-900/30" 
    };
  }
  if (key.startsWith("ih_web")) {
    return { 
      label: "[크롤러] iH", 
      className: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-400 border border-cyan-200/50 dark:border-cyan-900/30" 
    };
  }
  if (key.startsWith("bmc_web")) {
    return { 
      label: "[크롤러] BMC", 
      className: "bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 border border-blue-200/50 dark:border-blue-900/30" 
    };
  }
  if (key.startsWith("myhome_api")) {
    return { 
      label: "[API] 마이홈", 
      className: "bg-rose-100 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400 border border-rose-200/50 dark:border-rose-900/30" 
    };
  }
  return null;
}

export function isHousingRecruitment(title: string, providerName?: string): boolean {
  // ponytail: Official sales APIs (ApplyHome, LH API) contain raw apartment names (e.g. "로제비앙 엘가") 
  // without the words "모집" or "공고", and are 100% verified housing projects. Bypass filtering for these.
  if (providerName) {
    const lowerName = providerName.toLowerCase();
    if (lowerName.includes("applyhome") || lowerName === "lh_api") {
      return true;
    }
  }

  const cleanTitle = title.trim();

  // 1. Exclude keywords (noise, non-residential, administrative notices)
  const excludePattern = /결과\s*발표|선정\s*결과|심사\s*결과|당첨자|계약\s*결과|안내문|서류\s*제출|회의록|경진대회|확인증|평가위원|수행기관|안전점검|입찰|보조사업자|상가|토지|보상|공지사항/i;
  if (excludePattern.test(cleanTitle)) {
    return false;
  }

  // 2. Allowed positive matches (recruitment keywords)
  const includePattern = /모집|공고|입주자|입주대기자|재공급|선정/i;
  return includePattern.test(cleanTitle);
}
