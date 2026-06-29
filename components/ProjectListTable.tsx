"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getDynamicStatus, getSourceBadge } from "@/lib/utils";
import { BookmarkCheckbox } from "./BookmarkCheckbox";
import { StatusBadge } from "./StatusBadge";

export interface SerializedProjectAnnouncement {
  id: string;
  projectId: string | null;
  announceNo: string;
  supplyType: string;
  status: string;
  displayStatus: string | null;
  announceDate: string | null;
  applyStartDate: string | null;
  applyEndDate: string | null;
  winnerAnnounceDate: string | null;
  contractStartDate: string | null;
  contractEndDate: string | null;
  moveInDate: string | null;
  totalSupplyHouseholds: number | null;
  generalSupplyHouseholds: number | null;
  specialSupplyHouseholds: number | null;
  sourceProviderId: string | null;
  externalSourceKey: string | null;
  rawPayloadId: string | null;
  pblancUrl: string | null;
  homepageAdres: string | null;
  atchmnflSeqNo: string | null;
  atchmnflSn: string | null;
  isBookmarked: boolean | null;
  fingerprint: string | null;
  latestSnapshotId: string | null;
  createdAt: string;
  updatedAt: string;
  project: {
    id: string;
    housingMgmtNo: string;
    name: string;
    slug: string;
    regionId: string | null;
    address: string | null;
    builderName: string | null;
    developerName: string | null;
    totalHouseholds: number | null;
    sourceProviderId: string | null;
    externalSourceKey: string | null;
    metadata: any;
    createdAt: string;
    updatedAt: string;
  } | null;
}

interface Props {
  initialProjects: SerializedProjectAnnouncement[];
  kstToday: string;
  lastSyncStartedAt: number;
}

export function ProjectListTable({ initialProjects, kstToday, lastSyncStartedAt }: Props) {
  // Filter States
  const [selectedRegions, setSelectedRegions] = useState<Set<string>>(new Set());
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set());

  // Hidden/Restore States
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [showHiddenOnly, setShowHiddenOnly] = useState(false);

  // Dropdown open states
  const [regionFilterOpen, setRegionFilterOpen] = useState(false);
  const [typeFilterOpen, setTypeFilterOpen] = useState(false);
  const [statusFilterOpen, setStatusFilterOpen] = useState(false);

  // Helper to resolve region label
  const getRegionLabel = (ann: SerializedProjectAnnouncement) => {
    const address = ann.project?.address || "";
    const name = ann.project?.name || "";

    if (address.startsWith("서울") || name.includes("서울")) return "서울특별시";
    if (address.startsWith("경기") || name.includes("경기") || 
        name.includes("남양주") || name.includes("고양") || name.includes("용인") || 
        name.includes("성남") || name.includes("화성") || name.includes("평택") || 
        name.includes("수원") || name.includes("안산") || name.includes("부천")) return "경기도";
    if (address.startsWith("인천") || name.includes("인천")) return "인천광역시";
    if (address.startsWith("부산") || name.includes("부산")) return "부산광역시";
    if (address.startsWith("대구") || name.includes("대구")) return "대구광역시";
    if (address.startsWith("광주") || name.includes("광주")) return "광주광역시";
    if (address.startsWith("대전") || name.includes("대전")) return "대전광역시";
    if (address.startsWith("울산") || name.includes("울산")) return "울산광역시";
    if (address.startsWith("세종") || name.includes("세종")) return "세종특별자치시";
    if (address.startsWith("강원") || name.includes("강원")) return "강원특별자치도";
    if (address.startsWith("충북") || name.includes("충북")) return "충청북도";
    if (address.startsWith("충남") || name.includes("충남")) return "충청남도";
    if (address.startsWith("전북") || name.includes("전북")) return "전북특별자치도";
    if (address.startsWith("전남") || name.includes("전남")) return "전라남도";
    if (address.startsWith("경북") || name.includes("경북")) return "경상북도";
    if (address.startsWith("경남") || name.includes("경남")) return "경상남도";
    if (address.startsWith("제주") || name.includes("제주")) return "제주특별자치도";
    
    const splitAddr = address.split(" ")[0];
    return splitAddr && splitAddr.length > 1 ? splitAddr : "-";
  };

  // Get unique lists of data in current list
  const regionPriorityOrder = ["서울특별시", "인천광역시", "경기도"];
  const allRegions = Array.from(new Set(initialProjects.map(getRegionLabel))).sort((a, b) => {
    const idxA = regionPriorityOrder.indexOf(a);
    const idxB = regionPriorityOrder.indexOf(b);

    if (idxA !== -1 && idxB !== -1) {
      return idxA - idxB;
    }
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;

    return a.localeCompare(b);
  });
  const allTypes = Array.from(new Set(initialProjects.map(p => p.supplyType))).sort();
  const allStatuses = Array.from(
    new Set(
      initialProjects.map(p => getDynamicStatus(p.applyStartDate, p.applyEndDate, kstToday).displayStatus)
    )
  ).sort();

  // Reset to full selection when initialProjects changes
  useEffect(() => {
    setSelectedRegions(new Set(allRegions));
    setSelectedTypes(new Set(allTypes));
    
    // 기본 필터로 "공고예정", "접수중" 두 가지만 선택 상태로 초기 설정
    const defaultStatuses = ["공고예정", "접수중"];
    const filteredDefault = allStatuses.filter(s => defaultStatuses.includes(s));
    
    // "공고예정"이나 "접수중" 상태가 하나도 존재하지 않는 극단적 환경에서는 기본적으로 전체 선택 상태로 둠
    if (filteredDefault.length === 0) {
      setSelectedStatuses(new Set(allStatuses));
    } else {
      setSelectedStatuses(new Set(filteredDefault));
    }
  }, [initialProjects]);

  // Load hidden IDs from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem("hidden_announcement_ids");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setHiddenIds(new Set(parsed));
        }
      }
    } catch (err) {
      console.error("Failed to load hidden IDs:", err);
    }
  }, []);

  // Helper to hide an announcement
  const hideAnnouncement = (id: string) => {
    const next = new Set(hiddenIds);
    next.add(id);
    setHiddenIds(next);
    localStorage.setItem("hidden_announcement_ids", JSON.stringify(Array.from(next)));
  };

  // Helper to restore a hidden announcement
  const restoreAnnouncement = (id: string) => {
    const next = new Set(hiddenIds);
    next.delete(id);
    setHiddenIds(next);
    localStorage.setItem("hidden_announcement_ids", JSON.stringify(Array.from(next)));
  };

  // Toggle Handlers
  const toggleRegion = (region: string) => {
    const next = new Set(selectedRegions);
    if (next.has(region)) {
      next.delete(region);
    } else {
      next.add(region);
    }
    setSelectedRegions(next);
  };

  const toggleAllRegions = () => {
    if (selectedRegions.size === allRegions.length) {
      setSelectedRegions(new Set());
    } else {
      setSelectedRegions(new Set(allRegions));
    }
  };

  const toggleType = (type: string) => {
    const next = new Set(selectedTypes);
    if (next.has(type)) {
      next.delete(type);
    } else {
      next.add(type);
    }
    setSelectedTypes(next);
  };

  const toggleAllTypes = () => {
    if (selectedTypes.size === allTypes.length) {
      setSelectedTypes(new Set());
    } else {
      setSelectedTypes(new Set(allTypes));
    }
  };

  const toggleStatus = (status: string) => {
    const next = new Set(selectedStatuses);
    if (next.has(status)) {
      next.delete(status);
    } else {
      next.add(status);
    }
    setSelectedStatuses(next);
  };

  const toggleAllStatuses = () => {
    if (selectedStatuses.size === allStatuses.length) {
      setSelectedStatuses(new Set());
    } else {
      setSelectedStatuses(new Set(allStatuses));
    }
  };

  // Filtered List
  const filteredProjects = initialProjects.filter(p => {
    const isHidden = hiddenIds.has(p.id);
    if (showHiddenOnly && !isHidden) return false;
    if (!showHiddenOnly && isHidden) return false;

    const r = getRegionLabel(p);
    const t = p.supplyType;
    const s = getDynamicStatus(p.applyStartDate, p.applyEndDate, kstToday).displayStatus;

    return selectedRegions.has(r) && selectedTypes.has(t) && selectedStatuses.has(s);
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Active Filter summary bar for quick reset */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-muted/40 rounded-xl border text-xs">
        <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
          <span>필터 적용됨:</span>
          <span className="font-semibold text-foreground">지역 {selectedRegions.size}/{allRegions.length}</span>
          <span>•</span>
          <span className="font-semibold text-foreground">구분 {selectedTypes.size}/{allTypes.length}</span>
          <span>•</span>
          <span className="font-semibold text-foreground">상태 {selectedStatuses.size}/{allStatuses.length}</span>
          <span>•</span>
          <span>검색결과 <strong className="text-primary font-bold">{filteredProjects.length}</strong>개</span>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => {
              setSelectedRegions(new Set(allRegions));
              setSelectedTypes(new Set(allTypes));
              setSelectedStatuses(new Set(allStatuses));
            }}
            className="text-primary hover:underline font-semibold"
          >
            필터 초기화 (모두 선택)
          </button>
          <span className="text-muted-foreground/30">|</span>
          <label className="flex items-center gap-2 font-bold text-foreground cursor-pointer hover:text-primary transition-colors">
            <input 
              type="checkbox" 
              checked={showHiddenOnly} 
              onChange={(e) => setShowHiddenOnly(e.target.checked)} 
              className="rounded accent-primary w-4 h-4 cursor-pointer" 
            />
            <span>숨긴 공고만 모아보기 ({hiddenIds.size})</span>
          </label>
        </div>
      </div>

      <div className="w-full pb-4 max-w-full overflow-x-auto">
        {/* Desktop View: Table */}
        <div className="hidden md:block rounded-xl border bg-card subtle-shadow overflow-visible">
          <table className="w-full text-left text-sm whitespace-nowrap table-auto">
            <thead className="bg-muted/50 text-muted-foreground uppercase text-[10px] font-bold sticky top-0 z-10">
              <tr>
                <th className="px-4 py-4 w-10 text-center"></th>
                
                {/* Region Filter Header */}
                <th className="px-4 py-4 relative w-[180px]">
                  <div className="flex items-center gap-1.5">
                    <span>지역</span>
                    <button 
                      onClick={() => {
                        setRegionFilterOpen(!regionFilterOpen);
                        setTypeFilterOpen(false);
                        setStatusFilterOpen(false);
                      }} 
                      className={`p-1 rounded hover:bg-muted transition-colors ${
                        selectedRegions.size < allRegions.length ? "text-primary bg-primary/10" : "text-muted-foreground"
                      }`}
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path>
                      </svg>
                    </button>
                  </div>
                  {regionFilterOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setRegionFilterOpen(false)} />
                      <div className="absolute left-4 top-11 z-50 min-w-[200px] rounded-lg border bg-popover text-popover-foreground p-3 shadow-xl flex flex-col gap-2 subtle-shadow">
                        <div className="font-bold text-xs border-b pb-1 text-foreground flex justify-between">
                          <span>지역 다중 필터</span>
                          <button onClick={() => setRegionFilterOpen(false)} className="text-[10px] text-muted-foreground hover:underline">닫기</button>
                        </div>
                        <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer py-1 hover:bg-muted/50 rounded px-1 text-foreground">
                          <input 
                            type="checkbox" 
                            checked={selectedRegions.size === allRegions.length} 
                            onChange={toggleAllRegions} 
                            className="rounded accent-primary" 
                          />
                          <span>모두 선택</span>
                        </label>
                        <div className="flex flex-col gap-1 max-h-[200px] overflow-y-auto">
                          {allRegions.map(reg => (
                            <label key={reg} className="flex items-center gap-2 text-xs cursor-pointer py-0.5 hover:bg-muted/50 rounded px-1 text-muted-foreground hover:text-foreground">
                              <input 
                                type="checkbox" 
                                checked={selectedRegions.has(reg)} 
                                onChange={() => toggleRegion(reg)} 
                                className="rounded accent-primary" 
                              />
                              <span className="truncate">{reg}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </th>

                {/* Supply Type Filter Header */}
                <th className="px-4 py-4 relative w-[220px]">
                  <div className="flex items-center gap-1.5">
                    <span>구분</span>
                    <button 
                      onClick={() => {
                        setTypeFilterOpen(!typeFilterOpen);
                        setRegionFilterOpen(false);
                        setStatusFilterOpen(false);
                      }} 
                      className={`p-1 rounded hover:bg-muted transition-colors ${
                        selectedTypes.size < allTypes.length ? "text-primary bg-primary/10" : "text-muted-foreground"
                      }`}
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path>
                      </svg>
                    </button>
                  </div>
                  {typeFilterOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setTypeFilterOpen(false)} />
                      <div className="absolute left-4 top-11 z-50 min-w-[200px] rounded-lg border bg-popover text-popover-foreground p-3 shadow-xl flex flex-col gap-2 subtle-shadow">
                        <div className="font-bold text-xs border-b pb-1 text-foreground flex justify-between">
                          <span>구분 다중 필터</span>
                          <button onClick={() => setTypeFilterOpen(false)} className="text-[10px] text-muted-foreground hover:underline">닫기</button>
                        </div>
                        <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer py-1 hover:bg-muted/50 rounded px-1 text-foreground">
                          <input 
                            type="checkbox" 
                            checked={selectedTypes.size === allTypes.length} 
                            onChange={toggleAllTypes} 
                            className="rounded accent-primary" 
                          />
                          <span>모두 선택</span>
                        </label>
                        <div className="flex flex-col gap-1 max-h-[200px] overflow-y-auto">
                          {allTypes.map(t => (
                            <label key={t} className="flex items-center gap-2 text-xs cursor-pointer py-0.5 hover:bg-muted/50 rounded px-1 text-muted-foreground hover:text-foreground">
                              <input 
                                type="checkbox" 
                                checked={selectedTypes.has(t)} 
                                onChange={() => toggleType(t)} 
                                className="rounded accent-primary" 
                              />
                              <span className="truncate">{t}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </th>

                <th className="px-4 py-4">주택명</th>
                <th className="px-4 py-4">시행사/건설사</th>
                <th className="px-4 py-4">모집공고일</th>
                <th className="px-4 py-4">청약기간</th>
                <th className="px-4 py-4">당첨자발표</th>
                <th className="px-4 py-4 text-center w-[100px]">관리</th>

                {/* Status Filter Header */}
                <th className="px-4 py-4 text-center relative w-[130px]">
                  <div className="flex items-center justify-center gap-1.5">
                    <span>상태</span>
                    <button 
                      onClick={() => {
                        setStatusFilterOpen(!statusFilterOpen);
                        setRegionFilterOpen(false);
                        setTypeFilterOpen(false);
                      }} 
                      className={`p-1 rounded hover:bg-muted transition-colors ${
                        selectedStatuses.size < allStatuses.length ? "text-primary bg-primary/10" : "text-muted-foreground"
                      }`}
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path>
                      </svg>
                    </button>
                  </div>
                  {statusFilterOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setStatusFilterOpen(false)} />
                      <div className="absolute right-4 top-11 z-50 min-w-[160px] rounded-lg border bg-popover text-popover-foreground p-3 shadow-xl flex flex-col gap-2 subtle-shadow">
                        <div className="font-bold text-xs border-b pb-1 text-foreground flex justify-between">
                          <span>상태 다중 필터</span>
                          <button onClick={() => setStatusFilterOpen(false)} className="text-[10px] text-muted-foreground hover:underline">닫기</button>
                        </div>
                        <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer py-1 hover:bg-muted/50 rounded px-1 text-foreground">
                          <input 
                            type="checkbox" 
                            checked={selectedStatuses.size === allStatuses.length} 
                            onChange={toggleAllStatuses} 
                            className="rounded accent-primary" 
                          />
                          <span>모두 선택</span>
                        </label>
                        <div className="flex flex-col gap-1 max-h-[160px] overflow-y-auto">
                          {allStatuses.map(s => (
                            <label key={s} className="flex items-center justify-start gap-2 text-xs cursor-pointer py-0.5 hover:bg-muted/50 rounded px-1 text-muted-foreground hover:text-foreground">
                              <input 
                                type="checkbox" 
                                checked={selectedStatuses.has(s)} 
                                onChange={() => toggleStatus(s)} 
                                className="rounded accent-primary" 
                              />
                              <span className="truncate">{s}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredProjects.map((ann) => {
                const { status: currentStatus, displayStatus: currentDisplayStatus } = getDynamicStatus(
                  ann.applyStartDate,
                  ann.applyEndDate,
                  kstToday
                );
                const reg = getRegionLabel(ann);

                return (
                  <tr key={ann.id} className="hover:bg-accent/5 transition-colors group">
                    <td className="px-4 py-4 text-center">
                      <BookmarkCheckbox id={ann.id} initialChecked={ann.isBookmarked || false} />
                    </td>
                    <td className="px-4 py-4 text-muted-foreground font-medium">
                      {reg}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium px-2 py-0.5 bg-primary/5 text-primary rounded-full">
                          {ann.supplyType}
                        </span>
                        {(() => {
                          const badge = getSourceBadge(ann.externalSourceKey);
                          return badge ? (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${badge.className}`}>
                              {badge.label}
                            </span>
                          ) : null;
                        })()}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <Link 
                        href={`/projects/${ann.project?.slug}`}
                        className="font-bold text-blue-600 hover:underline group-hover:text-blue-700 block whitespace-normal min-w-[250px] max-w-[450px] break-words"
                        title={ann.project?.name}
                      >
                        <div className="flex items-start gap-2">
                          <span>{ann.project?.name}</span>
                          {ann.createdAt && new Date(ann.createdAt).getTime() >= lastSyncStartedAt && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-blue-500 text-white animate-pulse shadow-sm leading-none shrink-0 mt-0.5">
                              NEW
                            </span>
                          )}
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-4 text-muted-foreground">
                      <div className="max-w-[120px] truncate" title={ann.project?.developerName || ann.project?.builderName || undefined}>
                        {ann.project?.developerName || ann.project?.builderName || "-"}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-xs font-medium">{ann.announceDate || "-"}</td>
                    <td className="px-4 py-4 font-medium text-xs">
                      {ann.applyStartDate && ann.applyEndDate ? (
                        <span className="text-muted-foreground">
                          <span className="text-foreground">{ann.applyStartDate}</span>
                          <span className="mx-1">~</span>
                          <span className="text-foreground">{ann.applyEndDate}</span>
                        </span>
                      ) : "-"}
                    </td>
                    <td className="px-4 py-4 text-xs">{ann.winnerAnnounceDate || "-"}</td>
                    <td className="px-4 py-4 text-center">
                      {showHiddenOnly ? (
                        <button
                          onClick={() => restoreAnnouncement(ann.id)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-500/5 hover:bg-blue-500/10 border border-blue-500/15 transition-all subtle-shadow"
                          title="숨김 목록에서 복원"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                          <span>복원</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => hideAnnouncement(ann.id)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold text-muted-foreground hover:text-destructive bg-muted/40 hover:bg-destructive/5 border border-muted/50 hover:border-destructive/15 transition-all opacity-70 group-hover:opacity-100"
                          title="목록에서 숨기기"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                          </svg>
                          <span>숨기기</span>
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <StatusBadge status={currentStatus} label={currentDisplayStatus} />
                    </td>
                  </tr>
                );
              })}
              {filteredProjects.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-6 py-24 text-center">
                    <div className="mb-4 flex justify-center">
                      <div className="rounded-full bg-accent p-6">
                        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      </div>
                    </div>
                    <h3 className="text-lg font-bold">필터 결과가 없습니다</h3>
                    <p className="text-muted-foreground">선택한 필터 조합을 조정해 주세요.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile View: Card List */}
        <div className="block md:hidden space-y-4">
          {filteredProjects.map((ann) => {
            const { status: currentStatus, displayStatus: currentDisplayStatus } = getDynamicStatus(
              ann.applyStartDate,
              ann.applyEndDate,
              kstToday
            );
            const badge = getSourceBadge(ann.externalSourceKey);
            const reg = getRegionLabel(ann);

            return (
              <div 
                key={ann.id} 
                className="bg-card rounded-xl border p-5 subtle-shadow flex flex-col gap-4 relative hover:border-primary/50 transition-colors"
              >
                {/* Header: Region, Status & Bookmark */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold px-2 py-0.5 bg-accent text-accent-foreground rounded-md">
                      {reg.replace("특별자치시", "").replace("광역시", "").replace("특별자치도", "").substring(0, 2)}
                    </span>
                    <StatusBadge status={currentStatus} label={currentDisplayStatus} />
                  </div>
                  <div className="flex items-center gap-3">
                    {showHiddenOnly ? (
                      <button
                        onClick={() => restoreAnnouncement(ann.id)}
                        className="text-blue-500 hover:text-blue-700 p-1 bg-blue-500/5 hover:bg-blue-500/10 rounded border border-blue-500/15"
                        title="숨김 해제"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      </button>
                    ) : (
                      <button
                        onClick={() => hideAnnouncement(ann.id)}
                        className="text-muted-foreground hover:text-destructive p-1 bg-muted/30 hover:bg-destructive/5 rounded border border-muted/50 hover:border-destructive/15"
                        title="숨기기"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      </button>
                    )}
                    <BookmarkCheckbox id={ann.id} initialChecked={ann.isBookmarked || false} />
                  </div>
                </div>

                {/* Title & Builder */}
                <div>
                  <Link 
                    href={`/projects/${ann.project?.slug}`}
                    className="font-extrabold text-base text-foreground hover:text-primary transition-colors flex items-center gap-1.5 flex-wrap"
                  >
                    <span>{ann.project?.name}</span>
                    {ann.createdAt && new Date(ann.createdAt).getTime() >= lastSyncStartedAt && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-extrabold bg-blue-500 text-white animate-pulse shadow-sm leading-none">
                        NEW
                      </span>
                    )}
                  </Link>
                  {(ann.project?.developerName || ann.project?.builderName) ? (
                    <span className="text-xs text-muted-foreground mt-1 block">
                      {ann.project?.developerName || ann.project?.builderName}
                    </span>
                  ) : null}
                </div>

                {/* Badges */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium px-2.5 py-0.5 bg-primary/5 text-primary rounded-full border border-primary/10">
                    {ann.supplyType}
                  </span>
                  {badge && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${badge.className}`}>
                      {badge.label}
                    </span>
                  )}
                </div>

                {/* Dates */}
                <div className="grid grid-cols-2 gap-2 text-xs pt-3 border-t border-dashed">
                  <div className="flex flex-col gap-1">
                    <span className="text-muted-foreground text-[10px]">청약 기간</span>
                    <span className="font-semibold text-foreground">
                      {ann.applyStartDate && ann.applyEndDate 
                        ? `${ann.applyStartDate.substring(5)} ~ ${ann.applyEndDate.substring(5)}`
                        : "-"
                      }
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-muted-foreground text-[10px]">당첨자 발표</span>
                    <span className="font-semibold text-foreground">
                      {ann.winnerAnnounceDate ? ann.winnerAnnounceDate.substring(5) : "-"}
                    </span>
                  </div>
                </div>

                {/* Footer Button */}
                <Link 
                  href={`/projects/${ann.project?.slug}`}
                  className="mt-2 text-xs font-semibold text-primary hover:bg-primary/10 flex items-center justify-center py-2.5 bg-primary/5 rounded-lg border border-primary/10 text-center transition-colors"
                >
                  상세 정보 및 공고문 보기
                </Link>
              </div>
            );
          })}
          {filteredProjects.length === 0 && (
            <div className="py-16 text-center border-2 border-dashed rounded-xl">
              <p className="text-muted-foreground text-sm">필터 결과가 없습니다.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
