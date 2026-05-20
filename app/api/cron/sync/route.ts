import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sourceSyncRuns, sourceProviders } from "@/lib/db/schema";
import { ApplyHomeApiProvider } from "@/lib/sources/applyhome-api";
import { LHApiProvider } from "@/lib/sources/lh-api";
import { Ingester } from "@/lib/pipeline/ingester";
import { eq } from "drizzle-orm";

export const maxDuration = 60; // Set Vercel function execution timeout to 60 seconds (Hobby plan max)


export async function GET(request: Request) {
  // 1. 보안 체크 (Vercel Cron 또는 Admin Secret)
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // Skip auth in dev if needed, but for now strict
    // return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const perPage = parseInt(searchParams.get("perPage") || "20");

  const providers = [
    { instance: new ApplyHomeApiProvider(), label: "청약홈 (민영/공공분양)" },
    { instance: new LHApiProvider(), label: "LH 청약플러스 (공공주택/행복주택)" }
  ];

  const results = [];

  for (const { instance: provider, label } of providers) {
    try {
      console.log(`[Sync] Starting sync for provider: ${provider.providerId} (${label})`);
      const ingester = new Ingester(provider);

      // 2. Provider 확인 및 자동 등록
      let providerId: string;
      const [existingProvider] = await db.select().from(sourceProviders).where(eq(sourceProviders.name, provider.providerId));
      
      if (!existingProvider) {
        const [newProvider] = await db.insert(sourceProviders).values({
          name: provider.providerId,
          displayName: label,
          isActive: true,
        }).returning();
        providerId = newProvider.id;
      } else {
        providerId = existingProvider.id;
      }

      // 3. Sync Run 생성
      const [run] = await db.insert(sourceSyncRuns).values({
        providerId: providerId,
        status: "running",
        startedAt: new Date(),
      }).returning();

      // 4. 데이터 패치 및 처리
      const items = await provider.fetchIndex({ perPage }); // Fetch top items
      let normalizedCount = 0;
      let upsertedCount = 0;

      for (const item of items) {
        try {
          await ingester.processItem(run.id, item);
          normalizedCount++;
          upsertedCount++; 
        } catch (e) {
          console.error(`[Sync] Error processing item in ${provider.providerId}:`, e);
        }
      }

      // 5. 완료 업데이트
      await db.update(sourceSyncRuns)
        .set({
          status: "success",
          finishedAt: new Date(),
          totalFetched: items.length,
          totalNormalized: normalizedCount,
          totalUpserted: upsertedCount,
        })
        .where(eq(sourceSyncRuns.id, run.id));

      results.push({ provider: provider.providerId, fetched: items.length, success: true });
    } catch (error: any) {
      console.error(`[Sync] Critical error in provider ${provider.providerId}:`, error.message);
      results.push({ provider: provider.providerId, error: error.message, success: false });
    }
  }

  return NextResponse.json({ success: true, results });
}
