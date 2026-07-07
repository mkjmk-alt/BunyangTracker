"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type SyncMode = "api" | "web" | "all";

interface SyncProviderResult {
  name: string;
  label: string;
  fetched: number;
  status: string;
  error?: string | null;
}

const syncModes: Record<SyncMode, { label: string; runningLabel: string; query: string; className: string }> = {
  api: {
    label: "API 수집",
    runningLabel: "API 수집 중...",
    query: "mode=api&perPage=160",
    className: "bg-sky-600 text-white hover:bg-sky-500",
  },
  web: {
    label: "크롤링 수집",
    runningLabel: "크롤링 중...",
    query: "mode=web&perPage=160&fast=true",
    className: "bg-emerald-600 text-white hover:bg-emerald-500",
  },
  all: {
    label: "전체 수집",
    runningLabel: "전체 수집 중...",
    query: "mode=all&perPage=160",
    className: "bg-primary text-primary-foreground hover:opacity-90",
  },
};

export function SyncButton() {
  const [runningMode, setRunningMode] = useState<SyncMode | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [startText, setStartText] = useState<string | null>(null);
  const [endText, setEndText] = useState<string | null>(null);
  const router = useRouter();

  const isSyncing = runningMode !== null;

  const formatKst = () => new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

  const handleRestoreBookmarks = async () => {
    setIsRestoring(true);
    try {
      const response = await fetch("/api/admin/sync-browser-bookmarks", { method: "POST" });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          alert(
            `브라우저 별표 복구 완료\n복구된 즐겨찾기 수: ${result.restoredCount}개\n스캔된 브라우저 프로필:\n${result.scannedProfiles
              .map((p: string) => `  - ${p}`)
              .join("\n")}`
          );
          router.refresh();
        } else {
          alert(`별표 복구 실패: ${result.error}`);
        }
      } else {
        alert(`별표 복구 오류: ${await response.text()}`);
      }
    } catch (error) {
      console.error(error);
      alert("네트워크 오류가 발생했습니다.");
    } finally {
      setIsRestoring(false);
    }
  };

  const handleSync = async (mode: SyncMode) => {
    const config = syncModes[mode];
    setRunningMode(mode);

    const startTimeStr = formatKst();
    setStartText(startTimeStr);
    setEndText(null);
    localStorage.setItem("lastSyncStart", startTimeStr);
    localStorage.removeItem("lastSyncEnd");

    try {
      const response = await fetch(`/api/cron/sync?${config.query}`, { method: "GET" });
      const endTimeStr = formatKst();
      setEndText(endTimeStr);
      localStorage.setItem("lastSyncEnd", endTimeStr);

      if (!response.ok) {
        let errorMsg = "";
        try {
          const errJson = await response.json();
          errorMsg = errJson.error || JSON.stringify(errJson);
        } catch {
          errorMsg = await response.text();
        }
        alert(`${config.label} 실패: ${errorMsg}`);
        return;
      }

      const result = await response.json();
      const detailsMessage = Array.isArray(result.providers)
        ? (result.providers as SyncProviderResult[])
            .map((p) => {
              const statusText = p.status === "success" ? "성공" : "실패";
              const sourceType = p.name.includes("api") ? "공식 API" : "크롤링";
              const errorMsg = p.error ? ` (에러: ${p.error})` : "";
              return `- [${sourceType}] ${p.label}: ${statusText}, ${p.fetched}개 수집${errorMsg}`;
            })
            .join("\n")
        : "";

      alert(
        [
          `${config.label} 완료`,
          `소요 시간: ${(result.elapsedMs / 1000).toFixed(1)}초`,
          `총 수집 건수: ${result.totalFetched}개`,
          `신규/변경 주택 수: ${result.totalProjects}개`,
          `신규/변경 공고 수: ${result.totalAnnouncements}개`,
          "",
          "[소스별 상세 내역]",
          detailsMessage,
        ]
          .filter(Boolean)
          .join("\n")
      );
      router.refresh();
    } catch (error) {
      console.error(error);
      alert("네트워크 오류가 발생했습니다.");

      const failText = `${formatKst()} (실패)`;
      setEndText(failText);
      localStorage.setItem("lastSyncEnd", failText);
    } finally {
      setRunningMode(null);
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        <button
          onClick={handleRestoreBookmarks}
          disabled={isSyncing || isRestoring}
          className={`rounded-lg border px-4 py-2 font-semibold transition-all ${
            isSyncing || isRestoring
              ? "bg-muted text-muted-foreground border-transparent cursor-not-allowed"
              : "bg-background text-foreground border-input hover:bg-accent hover:text-accent-foreground active:scale-95 shadow-sm"
          }`}
        >
          {isRestoring ? "별표 복구 중..." : "브라우저 별표 복구"}
        </button>

        {(Object.keys(syncModes) as SyncMode[]).map((mode) => {
          const config = syncModes[mode];
          const isRunning = runningMode === mode;
          return (
            <button
              key={mode}
              onClick={() => handleSync(mode)}
              disabled={isSyncing || isRestoring}
              className={`rounded-lg px-4 py-2 font-semibold shadow-sm transition-all ${
                isSyncing || isRestoring
                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                  : `${config.className} active:scale-95`
              }`}
            >
              {isRunning ? config.runningLabel : config.label}
            </button>
          );
        })}
      </div>

      {(startText || isSyncing) && (
        <div className="text-[11px] text-muted-foreground bg-accent/20 px-2.5 py-1.5 rounded-md border border-accent/50 flex flex-col gap-0.5 text-right">
          <div>시작: {startText || "준비 중..."}</div>
          <div>완료: {isSyncing ? syncModes[runningMode].runningLabel : endText || "-"}</div>
        </div>
      )}
    </div>
  );
}
