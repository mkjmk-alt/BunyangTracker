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
import { IHWebProvider } from "@/lib/sources/ih-web";
import { BMCWebProvider } from "@/lib/sources/bmc-web";
import { generateFingerprint } from "@/lib/normalize/announcement";
import { eq, sql, inArray, and, gte, like } from "drizzle-orm";
import { compareAnnouncements, generateDiffSummary } from "@/lib/diff/announcement-diff";
import { isHousingRecruitment } from "@/lib/utils";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const startTime = Date.now();
  const { searchParams } = new URL(request.url);
  const perPage = parseInt(searchParams.get("perPage") || "160");
  const fast = searchParams.get("fast") === "true";

  try {
    // ─── 1. Register providers (sequential) ───────────────────────
    const providerConfigs = [
      // 1. API Providers (API를 가장 먼저 취합)
      { instance: new ApplyHomeApiProvider(), label: "청약홈 (민영/공공분양)" },
      { instance: new LHApiProvider(), label: "LH 청약플러스 (공공주택/행복주택)" },
      { instance: new MyHomeApiProvider(), label: "마이홈포털 (전국 임대/분양 통합)" },
      
      // 2. Web Scrapers (그 다음 순차 취합)
      { instance: new ApplyHomeWebProvider(), label: "청약홈 실시간 웹 (민영/공공분양/기타)" },
      { instance: new LHWebProvider(), label: "LH 청약플러스 실시간 웹 (임대/분양)" },
      { instance: new SHWebProvider(), label: "SH 서울주택도시공사 실시간 웹 (분양/임대)" },
      { instance: new GHWebProvider(), label: "GH 경기주택도시공사 실시간 웹 (청약공고)" },
      { instance: new IHWebProvider(), label: "iH 인천도시공사 실시간 웹 (분양/임대)" },
      { instance: new BMCWebProvider(), label: "BMC 부산도시공사 실시간 웹 (분양/임대)" },
    ];

    const providerIds: Record<string, string> = {};
    const providerSyncRunIds: Record<string, string> = {};
    for (const { instance, label } of providerConfigs) {
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
    }

    // ─── 3. Fetch index from ALL providers SEQUENTIALLY (APIs first) ───
    const fetchResults = [];
    for (const { instance, label } of providerConfigs) {
      try {
        console.log(`[FastSync] Starting fetch for ${instance.providerId} (${label})...`);
        const items = await instance.fetchIndex({ perPage });
        console.log(`[FastSync] Finished fetch for ${instance.providerId}: ${items.length} items`);
        fetchResults.push({ provider: instance, label, items, status: "success", error: null });
      } catch (e: any) {
        console.error(`[FastSync] Fetch error ${instance.providerId}:`, e.message);
        fetchResults.push({ provider: instance, label, items: [] as any[], status: "failed", error: e.message as string });
      }
    }

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
    // ─── 6. Deduplicate & batch-upsert announcements ──────────────
    // ponytail: Perform intelligent deduplication by matching highly similar names and clean announcement schedules
    const candidateAnns: any[] = [];
    for (const { normalized, fingerprint, providerId, syncRunId } of allNormalized) {
      const projectId = projectIdMap.get(normalized.housingMgmtNo);
      if (!projectId) continue;

      candidateAnns.push({
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
        name: normalized.name,
        address: normalized.address || "",
        atchmnflSeqNo: null as string | null,
        atchmnflSn: null as string | null,
        normalized,
        providerId,
        syncRunId,
      });
    }

    // Matching Helper Functions
    function cleanNameForMatching(name: string): string {
      return name
        .replace(/\[[^\]]*?\]/g, "") // remove bracket prefixes like [서울지역본부]
        .replace(/\([^\)]*?\)/g, "") // remove suffix info like (2026.06.26)
        .replace(/[^가-힣a-zA-Z0-9]/g, "") // alphanumeric + Korean characters only
        .replace(/26년/g, "2026년")
        .trim();
    }

    function isSameAnnouncement(a: any, b: any): boolean {
      // 1. Same announceNo is an absolute match
      if (a.announceNo === b.announceNo) return true;

      // 2. Region check (First 2 chars of address must be the same if present)
      const regA = (a.address || "").substring(0, 2);
      const regB = (b.address || "").substring(0, 2);
      if (regA && regB && regA !== regB) return false;

      // 3. Date check (Dates must be within 2 days)
      if (a.announceDate && b.announceDate) {
        const diffMs = Math.abs(new Date(a.announceDate).getTime() - new Date(b.announceDate).getTime());
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        if (diffDays > 2) return false;
      }

      // 4. Normalized name match
      const cleanA = cleanNameForMatching(a.name);
      const cleanB = cleanNameForMatching(b.name);
      if (cleanA === cleanB) return true;

      // 5. High-similarity substring match (length difference <= 6)
      if (cleanA.includes(cleanB) || cleanB.includes(cleanA)) {
        if (Math.abs(cleanA.length - cleanB.length) <= 6) {
          return true;
        }
      }

      return false;
    }

    // Merge two matched announcements (giving priority to Web details/urls but API dates)
    function mergeAnnouncements(dest: any, src: any): any {
      // Choose best text details (Web scraping often has better URLs)
      if (!dest.pblancUrl && src.pblancUrl) dest.pblancUrl = src.pblancUrl;
      if (!dest.homepageAdres && src.homepageAdres) dest.homepageAdres = src.homepageAdres;
      
      // Dates (API often has cleaner date ranges)
      if (!dest.announceDate && src.announceDate) dest.announceDate = src.announceDate;
      if (!dest.applyStartDate && src.applyStartDate) dest.applyStartDate = src.applyStartDate;
      if (!dest.applyEndDate && src.applyEndDate) dest.applyEndDate = src.applyEndDate;
      if (!dest.winnerAnnounceDate && src.winnerAnnounceDate) dest.winnerAnnounceDate = src.winnerAnnounceDate;
      if (!dest.contractStartDate && src.contractStartDate) dest.contractStartDate = src.contractStartDate;
      if (!dest.contractEndDate && src.contractEndDate) dest.contractEndDate = src.contractEndDate;

      // Source Key prioritize web detail mapping
      const priorityKeys = ["lh_web", "sh_web", "gh_web", "ih_web", "bmc_web"];
      const isSrcPriority = priorityKeys.some(key => src.externalSourceKey.startsWith(key));
      const isDestPriority = priorityKeys.some(key => dest.externalSourceKey.startsWith(key));
      
      if (isSrcPriority && !isDestPriority) {
        dest.externalSourceKey = src.externalSourceKey;
        dest.pblancUrl = src.pblancUrl || dest.pblancUrl;
      }

      return dest;
    }

    // Load all existing announcements from the DB to find matches across runs
    let existingDbAnns: any[] = [];
    try {
      existingDbAnns = await db
        .select({
          id: announcements.id,
          announceNo: announcements.announceNo,
          announceDate: announcements.announceDate,
          applyStartDate: announcements.applyStartDate,
          applyEndDate: announcements.applyEndDate,
          pblancUrl: announcements.pblancUrl,
          homepageAdres: announcements.homepageAdres,
          externalSourceKey: announcements.externalSourceKey,
          name: housingProjects.name,
          address: housingProjects.address,
        })
        .from(announcements)
        .innerJoin(housingProjects, eq(announcements.projectId, housingProjects.id));
    } catch (e: any) {
      console.error(`[FastSync] Failed to load existing DB announcements for cross-deduplication:`, e.message);
    }

    // Cross-run deduplication: map candidate announceNo to matching DB announceNo if highly similar
    for (const cand of candidateAnns) {
      for (const dbAnn of existingDbAnns) {
        if (isSameAnnouncement(dbAnn, cand)) {
          if (cand.announceNo !== dbAnn.announceNo) {
            console.log(`[FastSync] Mapping candidate ${cand.announceNo} to existing DB ${dbAnn.announceNo} (${dbAnn.name}) due to high similarity.`);
            cand.announceNo = dbAnn.announceNo;
          }
          break;
        }
      }
    }

    const mergedAnns: any[] = [];
    for (const cand of candidateAnns) {
      let matched = false;
      for (const existing of mergedAnns) {
        if (isSameAnnouncement(existing, cand)) {
          mergeAnnouncements(existing, cand);
          matched = true;
          break;
        }
      }
      if (!matched) {
        mergedAnns.push(cand);
      }
    }

    const annValues = mergedAnns;

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
              pblancUrl: sql`CASE
                WHEN excluded.external_source_key LIKE 'myhome_api:%' AND announcements.pblanc_url IS NOT NULL THEN announcements.pblanc_url
                ELSE excluded.pblanc_url
              END`,
              homepageAdres: sql`excluded.homepage_adres`,
              externalSourceKey: sql`CASE
                WHEN excluded.external_source_key LIKE 'myhome_api:%' AND announcements.external_source_key NOT LIKE 'myhome_api:%' THEN announcements.external_source_key
                ELSE excluded.external_source_key
              END`,
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
                  pblancUrl: sql`CASE
                    WHEN ${ann.externalSourceKey} LIKE 'myhome_api:%' AND announcements.pblanc_url IS NOT NULL THEN announcements.pblanc_url
                    ELSE ${ann.pblancUrl}
                  END`,
                  homepageAdres: ann.homepageAdres,
                  externalSourceKey: sql`CASE
                    WHEN ${ann.externalSourceKey} LIKE 'myhome_api:%' AND announcements.external_source_key NOT LIKE 'myhome_api:%' THEN announcements.external_source_key
                    ELSE ${ann.externalSourceKey}
                  END`,
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
