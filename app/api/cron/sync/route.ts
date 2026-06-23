import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sourceSyncRuns, sourceProviders, housingProjects, announcements } from "@/lib/db/schema";
import { ApplyHomeApiProvider } from "@/lib/sources/applyhome-api";
import { ApplyHomeWebProvider } from "@/lib/sources/applyhome-web";
import { LHApiProvider } from "@/lib/sources/lh-api";
import { generateFingerprint } from "@/lib/normalize/announcement";
import { eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const startTime = Date.now();
  const { searchParams } = new URL(request.url);
  const perPage = parseInt(searchParams.get("perPage") || "80");

  try {
    // ─── 1. Register providers (parallel) ─────────────────────────
    const providerConfigs = [
      { instance: new ApplyHomeApiProvider(), label: "청약홈 (민영/공공분양)" },
      { instance: new ApplyHomeWebProvider(), label: "청약홈 실시간 웹 (민영/공공분양/기타)" },
      { instance: new LHApiProvider(), label: "LH 청약플러스 (공공주택/행복주택)" },
    ];

    const providerIds: Record<string, string> = {};
    await Promise.all(
      providerConfigs.map(async ({ instance, label }) => {
        const existing = await db.query.sourceProviders.findFirst({
          where: eq(sourceProviders.name, instance.providerId),
        });
        if (existing) {
          providerIds[instance.providerId] = existing.id;
        } else {
          const [created] = await db
            .insert(sourceProviders)
            .values({ name: instance.providerId, displayName: label, isActive: true })
            .returning();
          providerIds[instance.providerId] = created.id;
        }
      })
    );

    // ─── 2. Create sync run ───────────────────────────────────────
    const [syncRun] = await db
      .insert(sourceSyncRuns)
      .values({
        providerId: providerIds[providerConfigs[0].instance.providerId],
        status: "running",
        startedAt: new Date(),
      })
      .returning();

    // ─── 3. Fetch index from ALL providers IN PARALLEL ────────────
    const fetchResults = await Promise.all(
      providerConfigs.map(async ({ instance }) => {
        try {
          const items = await instance.fetchIndex({ perPage });
          console.log(`[FastSync] ${instance.providerId}: ${items.length} items`);
          return { provider: instance, items };
        } catch (e: any) {
          console.error(`[FastSync] Fetch error ${instance.providerId}:`, e.message);
          return { provider: instance, items: [] as any[] };
        }
      })
    );

    // ─── 4. Normalize all items ───────────────────────────────────
    const allNormalized: { normalized: any; fingerprint: string }[] = [];
    let totalFetched = 0;

    for (const { provider, items } of fetchResults) {
      totalFetched += items.length;
      for (const item of items) {
        try {
          const normalized = provider.normalize(item);
          const fingerprint = generateFingerprint(normalized);
          allNormalized.push({ normalized, fingerprint });
        } catch (e: any) {
          console.error(`[FastSync] Normalize error:`, e.message);
        }
      }
    }

    console.log(`[FastSync] Fetched: ${totalFetched}, Normalized: ${allNormalized.length}`);

    // ─── 5. Deduplicate & upsert projects (individual, small count) ─
    const seenProjects = new Map<string, any>();
    for (const { normalized } of allNormalized) {
      if (!seenProjects.has(normalized.housingMgmtNo)) {
        seenProjects.set(normalized.housingMgmtNo, normalized);
      }
    }

    const projectIdMap = new Map<string, string>();
    for (const [mgmtNo, n] of seenProjects) {
      try {
        const [p] = await db
          .insert(housingProjects)
          .values({
            housingMgmtNo: n.housingMgmtNo,
            name: n.name,
            slug: n.slug,
            address: n.address,
            builderName: n.builderName,
            developerName: n.developerName,
            totalHouseholds: n.totalHouseholds,
            externalSourceKey: n.externalSourceKey,
          })
          .onConflictDoUpdate({
            target: housingProjects.housingMgmtNo,
            set: { name: n.name, address: n.address, updatedAt: new Date() },
          })
          .returning();
        projectIdMap.set(mgmtNo, p.id);
      } catch (e: any) {
        // Slug conflict or other – try to find existing
        const existing = await db.query.housingProjects.findFirst({
          where: eq(housingProjects.housingMgmtNo, mgmtNo),
        });
        if (existing) projectIdMap.set(mgmtNo, existing.id);
      }
    }

    console.log(`[FastSync] Projects upserted: ${projectIdMap.size}`);

    // ─── 6. Deduplicate & batch-upsert announcements ──────────────
    const annMap = new Map<string, any>();
    for (const { normalized, fingerprint } of allNormalized) {
      const projectId = projectIdMap.get(normalized.housingMgmtNo);
      if (!projectId || annMap.has(normalized.announceNo)) continue;

      annMap.set(normalized.announceNo, {
        projectId,
        announceNo: normalized.announceNo,
        supplyType: normalized.supplyType,
        status: normalized.status,
        displayStatus: normalized.displayStatus || null,
        announceDate: normalized.announceDate,
        applyStartDate: normalized.applyStartDate,
        applyEndDate: normalized.applyEndDate,
        winnerAnnounceDate: normalized.winnerAnnounceDate,
        contractStartDate: normalized.contractStartDate,
        contractEndDate: normalized.contractEndDate,
        moveInDate: normalized.moveInDate,
        pblancUrl: normalized.pblancUrl,
        homepageAdres: normalized.homepageAdres,
        externalSourceKey: normalized.externalSourceKey,
        fingerprint,
        housingMgmtNo: normalized.housingMgmtNo,
        atchmnflSeqNo: null as string | null,
        atchmnflSn: null as string | null,
      });
    }

    const annValues = Array.from(annMap.values());

    // ─── 6a. Auto-discover attachments for new/incomplete ApplyHome announcements ───
    try {
      const existingAnns = await db.select({
        announceNo: announcements.announceNo,
        atchmnflSeqNo: announcements.atchmnflSeqNo,
        atchmnflSn: announcements.atchmnflSn,
      }).from(announcements);
      const existingMap = new Map(existingAnns.map(a => [a.announceNo, a]));
      
      const provider = new ApplyHomeApiProvider();
      
      for (const ann of annValues) {
        if (ann.externalSourceKey.startsWith("applyhome_api")) {
          const existing = existingMap.get(ann.announceNo);
          if (!existing || !existing.atchmnflSeqNo) {
            console.log(`[FastSync] Auto-discovering attachments for announcement ${ann.announceNo}...`);
            try {
              const attachments = await provider.discoverAttachments(
                ann.housingMgmtNo,
                ann.announceNo,
                ann.pblancUrl || undefined,
                ann.supplyType
              );
              ann.atchmnflSeqNo = attachments.seqNo || "NONE";
              ann.atchmnflSn = attachments.sn || "NONE";
              console.log(`[FastSync] Discovered attachments for ${ann.announceNo}: seqNo=${ann.atchmnflSeqNo}, sn=${ann.atchmnflSn}`);
            } catch (err: any) {
              console.error(`[FastSync] Attachment discovery failed for ${ann.announceNo}:`, err.message);
              ann.atchmnflSeqNo = "NONE";
              ann.atchmnflSn = "NONE";
            }
          } else {
            ann.atchmnflSeqNo = existing.atchmnflSeqNo;
            ann.atchmnflSn = existing.atchmnflSn;
          }
        }
      }
    } catch (e: any) {
      console.error(`[FastSync] Error in pre-discovery mapping:`, e.message);
    }

    let upsertedCount = 0;

    // Batch upsert in chunks of 30 (avoid PG param limits)
    const CHUNK = 30;
    for (let i = 0; i < annValues.length; i += CHUNK) {
      const rawChunk = annValues.slice(i, i + CHUNK);
      // Strip housingMgmtNo which is a non-column field
      const chunk = rawChunk.map(({ housingMgmtNo, ...rest }) => rest);
      try {
        await db
          .insert(announcements)
          .values(chunk)
          .onConflictDoUpdate({
            target: announcements.announceNo,
            set: {
              status: sql`excluded.status`,
              displayStatus: sql`excluded.display_status`,
              applyStartDate: sql`excluded.apply_start_date`,
              applyEndDate: sql`excluded.apply_end_date`,
              pblancUrl: sql`excluded.pblanc_url`,
              homepageAdres: sql`excluded.homepage_adres`,
              externalSourceKey: sql`excluded.external_source_key`,
              fingerprint: sql`excluded.fingerprint`,
              // Preserve existing attachment metadata
              atchmnflSeqNo: sql`COALESCE(announcements.atchmnfl_seq_no, excluded.atchmnfl_seq_no)`,
              atchmnflSn: sql`COALESCE(announcements.atchmnfl_sn, excluded.atchmnfl_sn)`,
              updatedAt: sql`now()`,
            },
          });
        upsertedCount += chunk.length;
      } catch (e: any) {
        console.error(`[FastSync] Batch ann error:`, e.message);
        // Fallback: individual upserts
        for (const ann of chunk) {
          try {
            await db
              .insert(announcements)
              .values(ann)
              .onConflictDoUpdate({
                target: announcements.announceNo,
                set: {
                  status: ann.status,
                  displayStatus: ann.displayStatus,
                  applyStartDate: ann.applyStartDate,
                  applyEndDate: ann.applyEndDate,
                  pblancUrl: ann.pblancUrl,
                  homepageAdres: ann.homepageAdres,
                  fingerprint: ann.fingerprint,
                  updatedAt: new Date(),
                },
              });
            upsertedCount++;
          } catch (e2: any) {
            console.error(`[FastSync] Ann ${ann.announceNo}:`, e2.message);
          }
        }
      }
    }

    // ─── 7. Complete sync run ─────────────────────────────────────
    const elapsed = Date.now() - startTime;
    await db
      .update(sourceSyncRuns)
      .set({
        status: "success",
        finishedAt: new Date(),
        totalFetched,
        totalNormalized: allNormalized.length,
        totalUpserted: upsertedCount,
      })
      .where(eq(sourceSyncRuns.id, syncRun.id));

    console.log(`[FastSync] Done in ${elapsed}ms`);

    return NextResponse.json({
      success: true,
      totalFetched,
      totalProjects: projectIdMap.size,
      totalAnnouncements: upsertedCount,
      elapsedMs: elapsed,
    });
  } catch (error: any) {
    console.error(`[FastSync] Critical:`, error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
