import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function run() {
  const { listSyncRuns } = await import("../lib/sheets/repository");
  const runs = (await listSyncRuns())
    .sort((left, right) => right.startedAt.getTime() - left.startedAt.getTime())
    .slice(0, 10);
  console.log("Recent sync runs:");
  console.table(runs.map((run) => ({
    provider: run.providerName,
    status: run.status,
    startedAt: run.startedAt.toISOString(),
    totalFetched: run.totalFetched,
    totalUpserted: run.totalUpserted,
    totalErrors: run.totalErrors,
    errorSummary: run.errorSummary,
  })));
}

run().catch(console.error);
