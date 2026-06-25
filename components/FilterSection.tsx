"use client";

import { useRouter, useSearchParams } from "next/navigation";

interface FilterSectionProps {
  currentCategory: string;
  currentSort: string;
}

export function FilterSection({ 
  currentCategory,
  currentSort
}: FilterSectionProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

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
        {/* Sort Filter */}
        <div className="relative min-w-[150px]">
          <select 
            value={currentSort}
            onChange={(e) => updateFilter("sort", e.target.value)}
            className="w-full appearance-none rounded-lg border bg-card px-4 py-2 pr-10 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary shadow-sm"
          >
            <option value="announceDesc">모집공고일 최신순</option>
            <option value="startAsc">청약시작일 빠른순</option>
            <option value="startDesc">청약시작일 늦은순</option>
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-muted-foreground border-l ml-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
          </div>
        </div>

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
