"use client";

import { useRouter, useSearchParams } from "next/navigation";

interface FilterSectionProps {
  currentStatus: string;
  currentType: string;
  currentCategory: string;
  currentRegion: string;
}

export function FilterSection({ 
  currentStatus, 
  currentType, 
  currentCategory,
  currentRegion 
}: FilterSectionProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const REGIONS = [
    "서울특별시", "경기도", "인천광역시", "부산광역시", "대구광역시", "광주광역시", "대전광역시", "울산광역시", "세종특별자치시", 
    "강원특별자치도", "충청북도", "충청남도", "전북특별자치도", "전라남도", "경상북도", "경상남도", "제주특별자치도"
  ];

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "ALL" && key !== "category") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    // If switching category, reset sub-type filter to ALL for consistency
    if (key === "category") {
      params.delete("type");
    }
    router.push(`/projects?${params.toString()}`);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Category Tabs */}
      <div className="flex p-1 bg-accent rounded-xl w-fit">
        <button
          onClick={() => updateFilter("category", "SALE")}
          className={`px-6 py-2 text-sm font-bold rounded-lg transition-all ${
            currentCategory === "SALE" 
              ? "bg-background text-primary shadow-sm" 
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          분양
        </button>
        <button
          onClick={() => updateFilter("category", "RENT")}
          className={`px-6 py-2 text-sm font-bold rounded-lg transition-all ${
            currentCategory === "RENT" 
              ? "bg-background text-primary shadow-sm" 
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          공공임대
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
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

        {/* Status Filter */}
        <div className="relative min-w-[120px]">
          <select 
            value={currentStatus}
            onChange={(e) => updateFilter("status", e.target.value)}
            className="w-full appearance-none rounded-lg border bg-card px-4 py-2 pr-10 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary shadow-sm"
          >
            <option value="ALL">모든 상태</option>
            <option value="UPCOMING">공고 예정</option>
            <option value="OPEN">접수 중</option>
            <option value="CLOSED">접수 마감</option>
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-muted-foreground border-l ml-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
          </div>
        </div>

        {/* Type Filter (Conditional based on category) */}
        {currentCategory === "SALE" ? (
          <div className="relative min-w-[140px]">
            <select 
              value={currentType}
              onChange={(e) => updateFilter("type", e.target.value)}
              className="w-full appearance-none rounded-lg border bg-card px-4 py-2 pr-10 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary shadow-sm"
            >
              <option value="ALL">모든 유형</option>
              <option value="APT">아파트(APT)</option>
              <option value="무순위">무순위</option>
              <option value="임의공급">임의공급</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-muted-foreground border-l ml-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
            </div>
          </div>
        ) : (
          <div className="relative min-w-[140px]">
            <select 
              value={currentType}
              onChange={(e) => updateFilter("type", e.target.value)}
              className="w-full appearance-none rounded-lg border bg-card px-4 py-2 pr-10 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary shadow-sm"
            >
              <option value="ALL">모든 유형</option>
              <option value="행복주택">행복주택</option>
              <option value="국민임대">국민임대</option>
              <option value="공공임대">공공임대</option>
              <option value="영구임대">영구임대</option>
              <option value="공공지원민간임대">민간임대</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-muted-foreground border-l ml-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
            </div>
          </div>
        )}

        {/* Search Input */}
        <div className="relative flex-1 min-w-[200px]">
          <input 
            type="text" 
            placeholder="주택명 검색..."
            defaultValue={searchParams.get("q") || ""}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                updateFilter("q", e.currentTarget.value);
              }
            }}
            className="w-full rounded-lg border bg-card pl-10 pr-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary shadow-sm"
          />
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          </div>
        </div>
      </div>
    </div>
  );
}
