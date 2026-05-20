"use client";

import { useRouter, useSearchParams } from "next/navigation";

const REGIONS = [
  "서울특별시", "경기도", "인천광역시", "부산광역시", "대구광역시", "광주광역시", "대전광역시", "울산광역시", "세종특별자치시", 
  "강원특별자치도", "충청북도", "충청남도", "전북특별자치도", "전라남도", "경상북도", "경상남도", "제주특별자치도"
];

export function CalendarFilter({ 
  currentRegion, 
  currentCategory 
}: { 
  currentRegion: string;
  currentCategory: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "ALL") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.push(`/calendar?${params.toString()}`);
  };

  return (
    <div className="flex items-center gap-4">
      {/* Category Tabs */}
      <div className="flex p-1 bg-accent/50 rounded-xl border shadow-sm">
        <button
          onClick={() => updateFilter("category", "ALL")}
          className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${
            currentCategory === "ALL" 
              ? "bg-background text-primary shadow-sm" 
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          전체
        </button>
        <button
          onClick={() => updateFilter("category", "SALE")}
          className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${
            currentCategory === "SALE" 
              ? "bg-background text-primary shadow-sm" 
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          분양
        </button>
        <button
          onClick={() => updateFilter("category", "RENT")}
          className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${
            currentCategory === "RENT" 
              ? "bg-background text-primary shadow-sm" 
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          임대
        </button>
      </div>

      {/* Region Filter */}
      <div className="relative min-w-[120px]">
        <select 
          value={currentRegion}
          onChange={(e) => updateFilter("region", e.target.value)}
          className="w-full appearance-none rounded-lg border bg-card px-4 py-2 pr-10 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary shadow-sm"
        >
          <option value="ALL">전국</option>
          {REGIONS.map(region => (
            <option key={region} value={region}>{region}</option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-muted-foreground border-l ml-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
        </div>
      </div>
    </div>
  );
}
