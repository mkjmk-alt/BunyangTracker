export const dynamic = "force-dynamic";

import { listSyncRuns } from "@/lib/sheets/repository";
import { SyncButton } from "@/components/SyncButton";
import { SyncHistoryTable } from "@/components/SyncHistoryTable";

async function getSyncRuns() {
  const runs = (await listSyncRuns())
    .sort((left, right) => right.startedAt.getTime() - left.startedAt.getTime())
    .slice(0, 100);

  return runs.map((run) => ({
    ...run,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
  }));
}

export default async function AdminSyncPage() {
  const syncRuns = await getSyncRuns();

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

        {/* Sync History Table with Excel-like Filters & Responsive Card List */}
        <SyncHistoryTable initialRuns={syncRuns} />
      </div>
    </main>
  );
}
