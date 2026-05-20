import { db } from "@/lib/db";
import { sourceSyncRuns, sourceProviders } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { StatusBadge } from "@/components/StatusBadge";
import { SyncButton } from "@/components/SyncButton";

async function getSyncRuns() {
  return await db.query.sourceSyncRuns.findMany({
    orderBy: [desc(sourceSyncRuns.startedAt)],
    limit: 20,
  });
}

export default async function AdminSyncPage() {
  const syncRuns = await getSyncRuns();

  return (
    <main className="container mx-auto py-8 px-4 md:px-6">
      <div className="flex flex-col gap-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">수집 관리</h1>
            <p className="text-muted-foreground">데이터 소스별 동기화 상태를 모니터링하고 관리합니다.</p>
          </div>
          <SyncButton />
        </div>

        <div className="rounded-xl border bg-card overflow-hidden subtle-shadow">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground uppercase text-[10px] font-bold">
              <tr>
                <th className="px-6 py-4">시작 시각</th>
                <th className="px-6 py-4">상태</th>
                <th className="px-6 py-4 text-right">수집/Upsert/변경</th>
                <th className="px-6 py-4 text-right">소요시간</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {syncRuns.map((run) => (
                <tr key={run.id} className="hover:bg-accent/5">
                  <td className="px-6 py-4 font-medium">
                    {run.startedAt.toLocaleString("ko-KR")}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      run.status === "success" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700"
                    }`}>
                      {run.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2 text-xs">
                      <span title="Fetched" className="text-blue-500">{run.totalFetched}</span>
                      <span className="text-muted-foreground">/</span>
                      <span title="Upserted" className="text-green-500">{run.totalUpserted}</span>
                      <span className="text-muted-foreground">/</span>
                      <span title="Changed" className="text-orange-500">{run.totalChanged}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right text-muted-foreground">
                    {run.finishedAt 
                      ? `${Math.round((run.finishedAt.getTime() - run.startedAt.getTime()) / 1000)}s`
                      : "-"
                    }
                  </td>
                </tr>
              ))}
              {syncRuns.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground">
                    실행 이력이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
