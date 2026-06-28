import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sourceSyncRuns, sourceProviders, housingProjects, announcements, announcementSnapshots, changeEvents } from "@/lib/db/schema";
import { ApplyHomeApiProvider } from "@/lib/sources/applyhome-api";
import { ApplyHomeWebProvider } from "@/lib/sources/applyhome-web";
import { LHApiProvider } from "@/lib/sources/lh-api";
import { SHWebProvider } from "@/lib/sources/sh-web";
import { GHWebProvider } from "@/lib/sources/gh-web";
import { LHWebProvider } from "@/lib/sources/lh-web";
import { MyHomeApiProvider } from "@/lib/sources/myhome-api";
import { generateFingerprint } from "@/lib/normalize/announcement";
import { eq, sql, inArray, and, gte, like } from "drizzle-orm";
import { compareAnnouncements, generateDiffSummary } from "@/lib/diff/announcement-diff";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const startTime = Date.now();
  const { searchParams } = new URL(request.url);
  const perPage = parseInt(searchParams.get("perPage") || "80");
  const fast = searchParams.get("fast") === "true";

  try {
    // ─── 1. Register providers (parallel) ─────────────────────────
    const providerConfigs = [
      { instance: new ApplyHomeApiProvider(), label: "청약홈 (민영/공공분양)" },
      { instance: new ApplyHomeWebProvider(), label: "청약홈 실시간 웹 (민영/공공분양/기타)" },
      { instance: new LHApiProvider(), label: "LH 청약플러스 (공공주택/행복주택)" },
      { instance: new LHWebProvider(), label: "LH 청약플러스 실시간 웹 (임대/분양)" },
      { instance: new SHWebProvider(), label: "SH 서울주택도시공사 실시간 웹 (분양/임대)" },
      { instance: new GHWebProvider(), label: "GH 경기주택도시공사 실시간 웹 (청약공고)" },
      { instance: new MyHomeApiProvider(), label: "마이홈포털 (전국 임대/분양 통합)" },
    ];

    const providerIds: Record<string, string> = {};
    const providerSyncRunIds: Record<string, string> = {};
    await Promise.all(
      providerConfigs.map(async ({ instance, label }) => {
        const existing = await db.query.sourceProviders.findFirst({
          where: eq(sourceProviders.name, instance.providerId),
        });
        let pId = "";
        if (existing) {
          pId = existing.id;
        } else {
          const [created] = await db
            .insert(sourceProviders)
            .values({ name: instance.providerId, displayName: label, isActive: true })
            .returning();
          pId = created.id;
        }
        providerIds[instance.providerId] = pId;

        const runId = randomUUID();
        await db.insert(sourceSyncRuns).values({
          id: runId,
          providerId: pId,
          status: "running",
          startedAt: new Date(),
        });
        providerSyncRunIds[instance.providerId] = runId;
      })
    );

    // ─── 3. Fetch index from ALL providers IN PARALLEL ────────────
    const fetchResults = await Promise.all(
      providerConfigs.map(async ({ instance, label }) => {
        try {
          const items = await instance.fetchIndex({ perPage });
          console.log(`[FastSync] ${instance.providerId}: ${items.length} items`);
          return { provider: instance, label, items, status: "success", error: null };
        } catch (e: any) {
          console.error(`[FastSync] Fetch error ${instance.providerId}:`, e.message);
          return { provider: instance, label, items: [] as any[], status: "failed", error: e.message as string };
        }
      })
    );

    // ─── 4. Normalize all items ───────────────────────────────────
    const allNormalized: { normalized: any; fingerprint: string; providerId: string; syncRunId: string }[] = [];
    let totalFetched = 0;

    for (const { provider, items } of fetchResults) {
      totalFetched += items.length;
      const sRunId = providerSyncRunIds[provider.providerId];
      for (const item of items) {
        try {
          const normalized = provider.normalize(item);
          const fingerprint = generateFingerprint(normalized);
          allNormalized.push({ 
            normalized, 
            fingerprint, 
            providerId: provider.providerId, 
            syncRunId: sRunId 
          });
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
    for (const { normalized, fingerprint, providerId, syncRunId } of allNormalized) {
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
        normalized,
        providerId,
        syncRunId,
      });
    }

    const annValues = Array.from(annMap.values());

    // ─── 6a. Auto-discover attachments for new/incomplete ApplyHome announcements ───
    // ponytail: run attachment discovery in parallel chunks to dramatically reduce total execution time, or skip if fast mode is active
    if (!fast) {
      try {
        const existingAnns = await db.select({
          announceNo: announcements.announceNo,
          atchmnflSeqNo: announcements.atchmnflSeqNo,
          atchmnflSn: announcements.atchmnflSn,
        }).from(announcements);
        const existingMap = new Map(existingAnns.map(a => [a.announceNo, a]));
        
        const provider = new ApplyHomeApiProvider();
        
        // Filter target items that need attachment discovery
        const discoveryTargets = annValues.filter(ann => {
          if (ann.externalSourceKey.startsWith("applyhome_api") || ann.externalSourceKey.startsWith("applyhome_web")) {
            const existing = existingMap.get(ann.announceNo);
            if (!existing || !existing.atchmnflSeqNo) {
              return true;
            } else {
              ann.atchmnflSeqNo = existing.atchmnflSeqNo;
              ann.atchmnflSn = existing.atchmnflSn;
            }
          }
          return false;
        });

        if (discoveryTargets.length > 0) {
          console.log(`[FastSync] Auto-discovering attachments for ${discoveryTargets.length} announcements...`);
          
          const concurrencyLimit = 5;
          for (let i = 0; i < discoveryTargets.length; i += concurrencyLimit) {
            const chunk = discoveryTargets.slice(i, i + concurrencyLimit);
            await Promise.all(
              chunk.map(async (ann) => {
                try {
                  const attachments = await provider.discoverAttachments(
                    ann.housingMgmtNo,
                    ann.announceNo,
                    ann.pblancUrl || undefined,
                    ann.supplyType
                  );
                  ann.atchmnflSeqNo = attachments.seqNo || "NONE";
                  ann.atchmnflSn = attachments.sn || "NONE";
                } catch (err: any) {
                  console.error(`[FastSync] Attachment discovery failed for ${ann.announceNo}:`, err.message);
                  ann.atchmnflSeqNo = "NONE";
                  ann.atchmnflSn = "NONE";
                }
              })
            );
          }
          console.log(`[FastSync] Finished auto-discovering attachments.`);
        }
      } catch (e: any) {
        console.error(`[FastSync] Error in pre-discovery mapping:`, e.message);
      }
    } else {
      console.log(`[FastSync] Fast mode active: Skipping attachment auto-discovery.`);
    }

    // ─── 6b. Compare announcements & detect changes ─────────────────
    const currentAnnounceNos = annValues.map(a => a.announceNo);
    const dbAnns = currentAnnounceNos.length > 0 
      ? await db
          .select()
          .from(announcements)
          .where(inArray(announcements.announceNo, currentAnnounceNos))
      : [];
    const dbAnnMap = new Map(dbAnns.map(a => [a.announceNo, a]));

    const finalAnnValues = annValues.map(ann => {
      const dbAnn = dbAnnMap.get(ann.announceNo);
      return {
        ...ann,
        id: dbAnn ? dbAnn.id : randomUUID(),
        latestSnapshotId: dbAnn ? dbAnn.latestSnapshotId : null,
      };
    });

    const eventsToInsert: any[] = [];
    const snapshotsToInsert: any[] = [];
    const snapshotIdsToFetch: string[] = [];
    const changedPairs: { ann: any; dbAnn: any }[] = [];

    for (const ann of finalAnnValues) {
      const dbAnn = dbAnnMap.get(ann.announceNo);

      if (!dbAnn) {
        // 신규 공고 등록
        const diff = compareAnnouncements(null, ann.normalized);
        if (diff.hasChanged) {
          eventsToInsert.push({
            eventType: diff.eventType,
            entityType: "announcement",
            entityId: ann.id,
            syncRunId: ann.syncRunId,
            previousData: null,
            currentData: ann.normalized,
            diffSummary: generateDiffSummary(diff),
            severity: diff.severity,
          });
        }

        const snapshotId = randomUUID();
        snapshotsToInsert.push({
          id: snapshotId,
          announcementId: ann.id,
          syncRunId: ann.syncRunId,
          snapshotData: ann.normalized,
          fingerprint: ann.fingerprint,
        });
        ann.latestSnapshotId = snapshotId;
      } else if (dbAnn.fingerprint !== ann.fingerprint) {
        // 기존 공고 변경
        if (dbAnn.latestSnapshotId) {
          snapshotIdsToFetch.push(dbAnn.latestSnapshotId);
          changedPairs.push({ ann, dbAnn });
        } else {
          // 최신 스냅샷 ID가 없는 경우 폴백 비교
          const fallbackOldData = {
            ...ann.normalized,
            status: dbAnn.status,
            applyStartDate: dbAnn.applyStartDate,
            applyEndDate: dbAnn.applyEndDate,
            announceDate: dbAnn.announceDate,
            winnerAnnounceDate: dbAnn.winnerAnnounceDate,
            contractStartDate: dbAnn.contractStartDate,
            contractEndDate: dbAnn.contractEndDate,
          };
          const diff = compareAnnouncements(fallbackOldData, ann.normalized);
          if (diff.hasChanged) {
            eventsToInsert.push({
              eventType: diff.eventType,
              entityType: "announcement",
              entityId: ann.id,
              syncRunId: ann.syncRunId,
              previousData: fallbackOldData,
              currentData: ann.normalized,
              diffSummary: generateDiffSummary(diff),
              severity: diff.severity,
          });
          }

          const snapshotId = randomUUID();
          snapshotsToInsert.push({
            id: snapshotId,
            announcementId: ann.id,
            syncRunId: ann.syncRunId,
            snapshotData: ann.normalized,
            fingerprint: ann.fingerprint,
          });
          ann.latestSnapshotId = snapshotId;
        }
      }
    }

    if (snapshotIdsToFetch.length > 0) {
      const dbSnapshots = await db
        .select()
        .from(announcementSnapshots)
        .where(inArray(announcementSnapshots.id, snapshotIdsToFetch));
      const dbSnapshotMap = new Map(dbSnapshots.map(s => [s.id, s]));

      for (const { ann, dbAnn } of changedPairs) {
        const snapshot = dbSnapshotMap.get(dbAnn.latestSnapshotId!);
        const oldData = snapshot ? (snapshot.snapshotData as any) : null;

        const diff = compareAnnouncements(oldData, ann.normalized);
        if (diff.hasChanged) {
          eventsToInsert.push({
            eventType: diff.eventType,
            entityType: "announcement",
            entityId: ann.id,
            syncRunId: ann.syncRunId,
            previousData: oldData,
            currentData: ann.normalized,
            diffSummary: generateDiffSummary(diff),
            severity: diff.severity,
          });
        }

        const snapshotId = randomUUID();
        snapshotsToInsert.push({
          id: snapshotId,
          announcementId: ann.id,
          syncRunId: ann.syncRunId,
          snapshotData: ann.normalized,
          fingerprint: ann.fingerprint,
        });
        ann.latestSnapshotId = snapshotId;
      }
    }

    let upsertedCount = 0;
    const CHUNK = 30;

    // 1. Batch upsert announcements first to avoid Foreign Key constraints on snapshots
    for (let i = 0; i < finalAnnValues.length; i += CHUNK) {
      const rawChunk = finalAnnValues.slice(i, i + CHUNK);
      // Strip non-column fields: housingMgmtNo, normalized
      const chunk = rawChunk.map(({ housingMgmtNo, normalized, ...rest }) => rest);
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
              latestSnapshotId: sql`excluded.latest_snapshot_id`,
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
                  latestSnapshotId: ann.latestSnapshotId,
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

    // 2. Perform bulk inserts for snapshots & changeEvents now that parent announcements exist
    if (snapshotsToInsert.length > 0) {
      for (let i = 0; i < snapshotsToInsert.length; i += CHUNK) {
        await db.insert(announcementSnapshots).values(snapshotsToInsert.slice(i, i + CHUNK));
      }
    }
    if (eventsToInsert.length > 0) {
      for (let i = 0; i < eventsToInsert.length; i += CHUNK) {
        await db.insert(changeEvents).values(eventsToInsert.slice(i, i + CHUNK));
      }
    }

    // ─── 6c. Web-to-API Upgrade Fallback ────────────────────────────
    // ponytail: Auto-upgrade previous web-scraped announcements to official API data when it becomes available
    if (!fast) {
      try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split("T")[0];

      const webAnns = await db
        .select()
        .from(announcements)
        .where(
          and(
            like(announcements.externalSourceKey, "applyhome_web:%"),
            gte(announcements.announceDate, thirtyDaysAgoStr)
          )
        );

      if (webAnns.length > 0) {
        console.log(`[FastSync] Found ${webAnns.length} web-sourced announcements to check for API upgrade...`);
        const apiProvider = new ApplyHomeApiProvider();

        for (const webAnn of webAnns) {
          try {
            console.log(`[FastSync] Checking upgrade for ${webAnn.announceNo}...`);
            const rawApiDetail = await apiProvider.fetchDetail(webAnn.announceNo);
            const apiNorm = apiProvider.normalize(rawApiDetail);
            const apiFingerprint = generateFingerprint(apiNorm);

            const diff = compareAnnouncements(
              {
                ...apiNorm,
                status: webAnn.status as any,
                applyStartDate: webAnn.applyStartDate,
                applyEndDate: webAnn.applyEndDate,
                announceDate: webAnn.announceDate,
                winnerAnnounceDate: webAnn.winnerAnnounceDate,
              },
              apiNorm
            );

            const snapshotId = randomUUID();
            await db.transaction(async (tx) => {
              await tx
                .update(announcements)
                .set({
                  externalSourceKey: apiNorm.externalSourceKey,
                  fingerprint: apiFingerprint,
                  latestSnapshotId: snapshotId,
                  supplyType: apiNorm.supplyType,
                  status: apiNorm.status,
                  displayStatus: apiNorm.displayStatus || null,
                  announceDate: apiNorm.announceDate,
                  applyStartDate: apiNorm.applyStartDate,
                  applyEndDate: apiNorm.applyEndDate,
                  winnerAnnounceDate: apiNorm.winnerAnnounceDate,
                  contractStartDate: apiNorm.contractStartDate,
                  contractEndDate: apiNorm.contractEndDate,
                  moveInDate: apiNorm.moveInDate,
                  pblancUrl: apiNorm.pblancUrl,
                  homepageAdres: apiNorm.homepageAdres,
                  updatedAt: new Date(),
                })
                .where(eq(announcements.id, webAnn.id));

              await tx
                .update(housingProjects)
                .set({
                  name: apiNorm.name,
                  address: apiNorm.address,
                  builderName: apiNorm.builderName,
                  developerName: apiNorm.developerName,
                  totalHouseholds: apiNorm.totalHouseholds,
                  externalSourceKey: apiNorm.externalSourceKey,
                  updatedAt: new Date(),
                })
                .where(eq(housingProjects.id, webAnn.projectId));

              await tx.insert(announcementSnapshots).values({
                id: snapshotId,
                announcementId: webAnn.id,
                syncRunId: providerSyncRunIds.applyhome_api || randomUUID(),
                snapshotData: apiNorm,
                fingerprint: apiFingerprint,
              });

              if (diff.hasChanged) {
                await tx.insert(changeEvents).values({
                  eventType: "SCHEDULE_CHANGED",
                  entityType: "announcement",
                  entityId: webAnn.id,
                  syncRunId: providerSyncRunIds.applyhome_api || null,
                  previousData: webAnn,
                  currentData: apiNorm,
                  diffSummary: `Source upgraded to Official API. ${generateDiffSummary(diff)}`,
                  severity: "info",
                });
              }
            });

            console.log(`[FastSync] Successfully upgraded ${webAnn.announceNo} to official API.`);
          } catch (e: any) {
            console.log(`[FastSync] Announcement ${webAnn.announceNo} not ready for upgrade: ${e.message}`);
          }
        }
      }
      } catch (e: any) {
        console.error(`[FastSync] Web-to-API upgrade process failed:`, e.message);
      }
    } else {
      console.log(`[FastSync] Fast mode active: Skipping Web-to-API upgrade process.`);
    }

    // ─── 7. Complete sync runs individually ────────────────────────
    const elapsed = Date.now() - startTime;
    for (const { provider, label, status } of fetchResults) {
      const runId = providerSyncRunIds[provider.providerId];
      const pFetched = fetchResults.find(f => f.provider.providerId === provider.providerId)?.items.length || 0;
      const pNormalized = allNormalized.filter(n => n.providerId === provider.providerId).length;
      const pUpserted = finalAnnValues.filter(ann => ann.externalSourceKey?.startsWith(provider.providerId)).length;

      await db
        .update(sourceSyncRuns)
        .set({
          status: status === "success" ? "success" : "failed",
          finishedAt: new Date(),
          totalFetched: pFetched,
          totalNormalized: pNormalized,
          totalUpserted: pUpserted,
        })
        .where(eq(sourceSyncRuns.id, runId));
    }

    console.log(`[FastSync] Done in ${elapsed}ms`);

    const providerDetails = fetchResults.map(r => ({
      name: r.provider.providerId,
      label: r.label,
      fetched: r.items.length,
      status: r.status,
      error: r.error
    }));

    return NextResponse.json({
      success: true,
      totalFetched,
      totalProjects: projectIdMap.size,
      totalAnnouncements: upsertedCount,
      elapsedMs: elapsed,
      providers: providerDetails
    });
  } catch (error: any) {
    console.error(`[FastSync] Critical:`, error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
