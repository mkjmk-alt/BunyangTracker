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
