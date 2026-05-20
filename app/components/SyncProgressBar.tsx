"use client";

import { useEffect, useState } from "react";

export function SyncProgressBar() {
  const [status, setStatus] = useState<{ total: number; completed: number; percentage: number; isFinished: boolean } | null>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/sync/status");
        const data = await res.json();
        setStatus(data);
      } catch (e) {
        console.error("Failed to fetch sync status", e);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 3000); // Poll every 3 seconds
    return () => clearInterval(interval);
  }, []);

  if (!status || status.isFinished) return null;

  return (
    <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 w-full md:w-[350px] animate-in fade-in slide-in-from-top duration-500">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-blue-700 flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
          </span>
          PDF 다운로드 링크 최적화 중...
        </span>
        <span className="text-xs font-mono font-bold text-blue-600">{status.percentage}%</span>
      </div>
      <div className="w-full bg-blue-200 rounded-full h-1.5 overflow-hidden">
        <div 
          className="bg-blue-600 h-full transition-all duration-1000 ease-out"
          style={{ width: `${status.percentage}%` }}
        />
      </div>
      <div className="mt-1.5 text-[10px] text-blue-500 text-right">
        {status.completed} / {status.total} 공고 완료
      </div>
    </div>
  );
}
