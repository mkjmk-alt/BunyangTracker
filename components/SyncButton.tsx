"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export function SyncButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [startText, setStartText] = useState<string | null>(null);
  const [endText, setEndText] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    // Load last sync times from localStorage on client-side mount
    setStartText(localStorage.getItem("lastSyncStart"));
    setEndText(localStorage.getItem("lastSyncEnd"));
  }, []);

  const handleSync = async () => {
    console.log("Sync button clicked");
    setIsLoading(true);
    
    const startTimeStr = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
    setStartText(startTimeStr);
    setEndText(null);
    localStorage.setItem("lastSyncStart", startTimeStr);
    localStorage.removeItem("lastSyncEnd");

    try {
      console.log("Fetching /api/cron/sync...");
      const response = await fetch("/api/cron/sync", {
        method: "GET",
      });

      const endTimeStr = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
      setEndText(endTimeStr);
      localStorage.setItem("lastSyncEnd", endTimeStr);

      if (response.ok) {
        alert("수집이 완료되었습니다!");
        router.refresh();
      } else {
        const error = await response.text();
        alert(`수집 실패: ${error}`);
      }
    } catch (error) {
      console.error(error);
      alert("네트워크 오류가 발생했습니다.");
      
      const endTimeStr = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
      const failText = `${endTimeStr} (실패)`;
      setEndText(failText);
      localStorage.setItem("lastSyncEnd", failText);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        onClick={handleSync}
        disabled={isLoading}
        className={`px-4 py-2 rounded-lg font-semibold transition-all ${
          isLoading 
            ? "bg-muted text-muted-foreground cursor-not-allowed" 
            : "bg-primary text-primary-foreground hover:opacity-90 active:scale-95 shadow-sm"
        }`}
      >
        {isLoading ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            수집 중...
          </span>
        ) : (
          "즉시 수집 시작"
        )}
      </button>
      {(startText || isLoading) && (
        <div className="text-[11px] text-muted-foreground bg-accent/20 px-2.5 py-1.5 rounded-md border border-accent/50 flex flex-col gap-0.5 text-right">
          <div>시작: {startText || "준비 중..."}</div>
          <div>완료: {isLoading ? "수집 중..." : (endText || "-")}</div>
        </div>
      )}
    </div>
  );
}
