"use client";

import { useState, useEffect } from "react";

export interface SerializedSyncRun {
  id: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  totalFetched: number | null;
  totalUpserted: number | null;
  totalChanged: number | null;
  providerName: string;
  providerDisplayName: string | null;
}

interface Props {
  initialRuns: SerializedSyncRun[];
}

export function SyncHistoryTable({ initialRuns }: Props) {
  // Filters state
  const [selectedProviders, setSelectedProviders] = useState<Set<string>>(new Set());
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set());
  
  // Dropdown open states (Excel style)
  const [providerFilterOpen, setProviderFilterOpen] = useState(false);
  const [statusFilterOpen, setStatusFilterOpen] = useState(false);

  // Retrieve unique providers and statuses present in data
  const allProviders = Array.from(new Set(initialRuns.map(r => r.providerName)));
  const allStatuses = Array.from(new Set(initialRuns.map(r => r.status)));

  // On mount, select all
  useEffect(() => {
    setSelectedProviders(new Set(allProviders));
    setSelectedStatuses(new Set(allStatuses));
  }, [initialRuns]);

  const getProviderLabel = (name: string) => {
    const map: Record<string, string> = {
      applyhome_api: "청약홈 API (공식)",
      applyhome_web: "청약홈 웹 (실시간)",
      lh_api: "LH 청약플러스",
      lh_web: "LH 청약플러스 (웹)",
      sh_web: "SH 서울주택공사",
      gh_web: "GH 경기주택공사",
      ih_web: "iH 인천도시공사",
      bmc_web: "BMC 부산도시공사",
      myhome_api: "마이홈포털",
    };
    return map[name] || name;
  };

  const getProviderBadgeClass = (name: string) => {
    const map: Record<string, string> = {
      applyhome_api: "bg-sky-100 text-sky-700 dark:bg-sky-950/30 dark:text-sky-400 border-sky-200/50",
      applyhome_web: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border-emerald-200/50",
      lh_api: "bg-purple-100 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400 border-purple-200/50",
      lh_web: "bg-teal-100 text-teal-700 dark:bg-teal-950/30 dark:text-teal-400 border-teal-200/50",
      sh_web: "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border-amber-200/50",
      gh_web: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-400 border-indigo-200/50",
      ih_web: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-400 border-cyan-200/50",
      bmc_web: "bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 border-blue-200/50",
      myhome_api: "bg-rose-100 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400 border-rose-200/50",
    };
    return `inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${
      map[name] || "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-700"
    }`;
  };

  const formatDateTimeStr = (str: string | null) => {
    if (!str) return "-";
    const date = new Date(str);
    return date.toLocaleString("ko-KR", { 
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric"
    });
  };

  const getDuration = (start: string, end: string | null) => {
    if (!end) return "-";
    const diff = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000);
    return `${diff}초`;
  };

  // Toggle handlers
  const toggleProvider = (provider: string) => {
    const next = new Set(selectedProviders);
    if (next.has(provider)) {
      next.delete(provider);
    } else {
      next.add(provider);
    }
    setSelectedProviders(next);
  };

  const toggleAllProviders = () => {
    if (selectedProviders.size === allProviders.length) {
      setSelectedProviders(new Set());
    } else {
      setSelectedProviders(new Set(allProviders));
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

  // Filtered runs
  const filteredRuns = initialRuns.filter(r => 
    selectedProviders.has(r.providerName) && selectedStatuses.has(r.status)
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Active Filter summary bar for quick reset */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-muted/40 rounded-xl border text-xs">
        <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
          <span>필터 적용됨:</span>
          <span className="font-semibold text-foreground">수집처 {selectedProviders.size}/{allProviders.length}</span>
          <span>•</span>
          <span className="font-semibold text-foreground">상태 {selectedStatuses.size}/{allStatuses.length}</span>
          <span>•</span>
          <span>검색결과 <strong className="text-primary font-bold">{filteredRuns.length}</strong>개</span>
        </div>
        <button 
          onClick={() => {
            setSelectedProviders(new Set(allProviders));
            setSelectedStatuses(new Set(allStatuses));
          }}
          className="text-primary hover:underline font-semibold"
        >
          필터 초기화 (모두 선택)
        </button>
      </div>

      {/* Desktop View: Table */}
      <div className="hidden md:block w-full overflow-x-auto pb-4">
        <div className="rounded-xl border bg-card overflow-visible subtle-shadow">
          <table className="w-full text-left text-sm whitespace-nowrap table-auto">
          <thead className="bg-muted/50 text-muted-foreground uppercase text-[10px] font-bold">
            <tr>
              {/* Provider Filter Column Header */}
              <th className="px-6 py-4 w-[250px] relative">
                <div className="flex items-center gap-1.5">
                  <span>수집처</span>
                  <button 
                    onClick={() => {
                      setProviderFilterOpen(!providerFilterOpen);
                      setStatusFilterOpen(false);
                    }} 
                    className={`p-1 rounded hover:bg-muted transition-colors ${
                      selectedProviders.size < allProviders.length ? "text-primary bg-primary/10" : "text-muted-foreground"
                    }`}
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path>
                    </svg>
                  </button>
                </div>
                {providerFilterOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setProviderFilterOpen(false)} />
                    <div className="absolute left-6 top-11 z-50 min-w-[260px] rounded-lg border bg-popover text-popover-foreground p-3 shadow-xl flex flex-col gap-2 subtle-shadow">
                      <div className="font-bold text-xs border-b pb-1 text-foreground flex justify-between">
                        <span>수집처 다중 필터</span>
                        <button onClick={() => setProviderFilterOpen(false)} className="text-[10px] text-muted-foreground hover:underline">닫기</button>
                      </div>
                      <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer py-1 hover:bg-muted/50 rounded px-1 text-foreground">
                        <input 
                          type="checkbox" 
                          checked={selectedProviders.size === allProviders.length} 
                          onChange={toggleAllProviders} 
                          className="rounded accent-primary" 
                        />
                        <span>모두 선택</span>
                      </label>
                      <div className="flex flex-col gap-1 max-h-[160px] overflow-y-auto">
                        {allProviders.map(prov => (
                          <label key={prov} className="flex items-center gap-2 text-xs cursor-pointer py-0.5 hover:bg-muted/50 rounded px-1 text-muted-foreground hover:text-foreground">
                            <input 
                              type="checkbox" 
                              checked={selectedProviders.has(prov)} 
                              onChange={() => toggleProvider(prov)} 
                              className="rounded accent-primary" 
                            />
                            <span className="truncate">{getProviderLabel(prov)}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </th>

              <th className="px-6 py-4">시작 시각</th>
              <th className="px-6 py-4">종료 시각</th>
              
              {/* Status Filter Column Header */}
              <th className="px-6 py-4 relative">
                <div className="flex items-center gap-1.5">
                  <span>상태</span>
                  <button 
                    onClick={() => {
                      setStatusFilterOpen(!statusFilterOpen);
                      setProviderFilterOpen(false);
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
                    <div className="absolute left-6 top-11 z-50 min-w-[160px] rounded-lg border bg-popover text-popover-foreground p-3 shadow-xl flex flex-col gap-2 subtle-shadow">
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
                      <div className="flex flex-col gap-1">
                        {allStatuses.map(status => (
                          <label key={status} className="flex items-center gap-2 text-xs cursor-pointer py-0.5 hover:bg-muted/50 rounded px-1 text-muted-foreground hover:text-foreground">
                            <input 
                              type="checkbox" 
                              checked={selectedStatuses.has(status)} 
                              onChange={() => toggleStatus(status)} 
                              className="rounded accent-primary" 
                            />
                            <span className="uppercase">{status}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </th>

              <th className="px-6 py-4 text-right">수집/Upsert/변경</th>
              <th className="px-6 py-4 text-right">소요시간</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredRuns.map((run) => (
              <tr key={run.id} className="hover:bg-accent/5">
                <td className="px-6 py-4">
                  <span className={getProviderBadgeClass(run.providerName)}>
                    {getProviderLabel(run.providerName)}
                  </span>
                </td>
                <td className="px-6 py-4 text-muted-foreground text-xs font-medium">
                  {formatDateTimeStr(run.startedAt)}
                </td>
                <td className="px-6 py-4 text-muted-foreground text-xs">
                  {formatDateTimeStr(run.finishedAt)}
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    run.status === "success" 
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border border-green-200/50" 
                      : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border border-red-200/50"
                  }`}>
                    {run.status.toUpperCase()}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2 text-xs">
                    <span title="Fetched" className="text-blue-500 font-semibold">{run.totalFetched}</span>
                    <span className="text-muted-foreground">/</span>
                    <span title="Upserted" className="text-green-500 font-semibold">{run.totalUpserted}</span>
                    <span className="text-muted-foreground">/</span>
                    <span title="Changed" className="text-orange-500 font-semibold">{run.totalChanged}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-right text-muted-foreground font-medium text-xs">
                  {getDuration(run.startedAt, run.finishedAt)}
                </td>
              </tr>
            ))}
            {filteredRuns.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-16 text-center text-muted-foreground">
                  조건에 일치하는 실행 이력이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      </div>

      {/* Mobile View: Card List */}
      <div className="block md:hidden space-y-4">
        {filteredRuns.map((run) => (
          <div 
            key={run.id} 
            className="bg-card rounded-xl border p-5 subtle-shadow flex flex-col gap-3 relative hover:border-primary/50 transition-colors"
          >
            {/* Header: Provider & Status */}
            <div className="flex items-center justify-between">
              <span className={getProviderBadgeClass(run.providerName)}>
                {getProviderLabel(run.providerName)}
              </span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                run.status === "success" 
                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border border-green-200/50" 
                  : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border border-red-200/50"
              }`}>
                {run.status.toUpperCase()}
              </span>
            </div>

            {/* Start & End Times */}
            <div className="text-xs space-y-1 py-2 border-y border-dashed border-muted">
              <div className="flex justify-between">
                <span className="text-muted-foreground text-[11px]">시작 시각</span>
                <span className="font-medium text-foreground">{formatDateTimeStr(run.startedAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground text-[11px]">종료 시각</span>
                <span className="font-medium text-foreground">{formatDateTimeStr(run.finishedAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground text-[11px]">소요 시간</span>
                <span className="font-medium text-foreground">{getDuration(run.startedAt, run.finishedAt)}</span>
              </div>
            </div>

            {/* Run Metrics */}
            <div className="flex justify-between items-center text-xs">
              <span className="text-muted-foreground text-[10px]">수집 결과 (가져옴 / 등록 / 변경)</span>
              <div className="flex gap-2">
                <span title="Fetched" className="text-blue-500 font-semibold">{run.totalFetched}</span>
                <span className="text-muted-foreground">/</span>
                <span title="Upserted" className="text-green-500 font-semibold">{run.totalUpserted}</span>
                <span className="text-muted-foreground">/</span>
                <span title="Changed" className="text-orange-500 font-semibold">{run.totalChanged}</span>
              </div>
            </div>
          </div>
        ))}
        {filteredRuns.length === 0 && (
          <div className="py-16 text-center border-2 border-dashed rounded-xl">
            <p className="text-muted-foreground text-sm">조건에 일치하는 실행 이력이 없습니다.</p>
          </div>
        )}
      </div>
    </div>
  );
}
