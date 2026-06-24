export const dynamic = "force-dynamic";

import { db } from "@/lib/db";
import { sourceSyncRuns } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { SyncButton } from "@/components/SyncButton";

async function getSyncRuns() {
  return await db.query.sourceSyncRuns.findMany({
    orderBy: [desc(sourceSyncRuns.startedAt)],
    limit: 20,
  });
}

export default async function AdminSyncPage() {
  const syncRuns = await getSyncRuns();

  const formatDateTime = (date: Date | null) => {
    if (!date) return "-";
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

  return (
    <main className="container mx-auto py-8 px-4 md:px-6">
      <div className="flex flex-col gap-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">수집 관리</h1>
            <p className="text-muted-foreground">데이터 소스별 동기화 상태를 모니터링하고 관리합니다.</p>
          </div>
          <SyncButton />
        </div>

        {/* Desktop View: Table */}
        <div className="hidden md:block rounded-xl border bg-card overflow-hidden subtle-shadow">
          <table className="w-full text-left text-sm whitespace-nowrap table-auto">
            <thead className="bg-muted/50 text-muted-foreground uppercase text-[10px] font-bold">
              <tr>
                <th className="px-6 py-4">시작 시각</th>
                <th className="px-6 py-4">종료 시각</th>
                <th className="px-6 py-4">상태</th>
                <th className="px-6 py-4 text-right">수집/Upsert/변경</th>
                <th className="px-6 py-4 text-right">소요시간</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {syncRuns.map((run) => (
                <tr key={run.id} className="hover:bg-accent/5">
                  <td className="px-6 py-4 font-medium">
                    {formatDateTime(run.startedAt)}
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {formatDateTime(run.finishedAt)}
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
                  <td className="px-6 py-4 text-right text-muted-foreground font-medium">
                    {run.finishedAt 
                      ? `${Math.round((run.finishedAt.getTime() - run.startedAt.getTime()) / 1000)}초`
                      : "-"
                    }
                  </td>
                </tr>
              ))}
              {syncRuns.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                    실행 이력이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile View: Card List */}
        <div className="block md:hidden space-y-4">
          {syncRuns.map((run) => (
            <div 
              key={run.id} 
              className="bg-card rounded-xl border p-5 subtle-shadow flex flex-col gap-3 relative hover:border-primary/50 transition-colors"
            >
              {/* Header: Status & Duration */}
              <div className="flex items-center justify-between">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                  run.status === "success" 
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border border-green-200/50" 
                    : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border border-red-200/50"
                }`}>
                  {run.status.toUpperCase()}
                </span>
                <span className="text-xs text-muted-foreground font-medium">
                  소요: {run.finishedAt ? `${Math.round((run.finishedAt.getTime() - run.startedAt.getTime()) / 1000)}초` : "-"}
                </span>
              </div>

              {/* Start & End Times */}
              <div className="text-xs space-y-1 py-2 border-y border-dashed border-muted">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">시작 시각</span>
                  <span className="font-medium text-foreground">{formatDateTime(run.startedAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">종료 시각</span>
                  <span className="font-medium text-foreground">{formatDateTime(run.finishedAt)}</span>
                </div>
              </div>

              {/* Run Metrics */}
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground text-[10px]">수집 결과</span>
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
          {syncRuns.length === 0 && (
            <div className="py-12 text-center border-2 border-dashed rounded-xl">
              <p className="text-muted-foreground text-sm">실행 이력이 없습니다.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
