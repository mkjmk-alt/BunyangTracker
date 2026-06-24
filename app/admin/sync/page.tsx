export const dynamic = "force-dynamic";

import { db } from "@/lib/db";
import { sourceSyncRuns, sourceProviders } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { SyncButton } from "@/components/SyncButton";
import { SyncHistoryTable } from "@/components/SyncHistoryTable";

async function getSyncRuns() {
  const runs = await db
    .select({
      id: sourceSyncRuns.id,
      status: sourceSyncRuns.status,
      startedAt: sourceSyncRuns.startedAt,
      finishedAt: sourceSyncRuns.finishedAt,
      totalFetched: sourceSyncRuns.totalFetched,
      totalUpserted: sourceSyncRuns.totalUpserted,
      totalChanged: sourceSyncRuns.totalChanged,
      providerName: sourceProviders.name,
      providerDisplayName: sourceProviders.displayName,
    })
    .from(sourceSyncRuns)
    .innerJoin(sourceProviders, eq(sourceSyncRuns.providerId, sourceProviders.id))
    .orderBy(desc(sourceSyncRuns.startedAt))
    .limit(100);

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
