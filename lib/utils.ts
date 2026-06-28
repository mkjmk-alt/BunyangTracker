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
