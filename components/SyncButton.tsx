"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SyncButton() {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSync = async () => {
    console.log("Sync button clicked");
    setIsLoading(true);
    try {
      console.log("Fetching /api/cron/sync...");
      const response = await fetch("/api/cron/sync", {
        method: "GET",
      });

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
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleSync}
      disabled={isLoading}
      className={`px-4 py-2 rounded-lg font-semibold transition-all ${
        isLoading 
          ? "bg-muted text-muted-foreground cursor-not-allowed" 
          : "bg-primary text-primary-foreground hover:opacity-90 active:scale-95"
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
  );
}
