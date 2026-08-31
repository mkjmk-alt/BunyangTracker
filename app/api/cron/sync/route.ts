import { NextResponse } from "next/server";
import { hasResolvedAttachmentLookup } from "@/lib/attachments";
import {
  appendChangeEvents,
  appendSnapshots,
  deleteAnnouncements,
  listAnnouncementRecords,
  upsertAnnouncements,
  upsertSyncRuns,
} from "@/lib/sheets/repository";
import type { AnnouncementRecord, ChangeEventRecord, SnapshotRecord, SyncRunRecord } from "@/lib/sheets/types";
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
import { compareAnnouncements, generateDiffSummary } from "@/lib/diff/announcement-diff";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

function parseListParam(searchParams: URLSearchParams, key: string): string[] {
  return (searchParams.get(key) || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function getSourceProviderFromKey(key: string | null | undefined) {
  return key?.split(":")[0] || null;
}

function getSourceMetadata(...values: any[]) {
  const sourceKeys = new Set<string>();

  for (const value of values) {
    if (!value) continue;
    if (typeof value.externalSourceKey === "string") sourceKeys.add(value.externalSourceKey);
    const metadata = value.metadata || value.sourceMetadata;
    if (Array.isArray(metadata?.sourceKeys)) {
      metadata.sourceKeys.forEach((key: unknown) => {
        if (typeof key === "string") sourceKeys.add(key);
      });
    }
  }

  const keys = Array.from(sourceKeys).sort();
  const providers = Array.from(
    new Set(keys.map(getSourceProviderFromKey).filter((provider): provider is string => Boolean(provider)))
  ).sort();

  return {
    sourceKeys: keys,
    sourceProviders: providers,
    hasApiSource: providers.some((provider) => provider.endsWith("_api")),
    hasWebSource: providers.some((provider) => provider.endsWith("_web")),
  };
}

export async function GET(request: Request) {
  const startTime = Date.now();
  const { searchParams } = new URL(request.url);
  const perPage = parseInt(searchParams.get("perPage") || "30");
  const maxPages = parseInt(searchParams.get("maxPages") || "1");
  const modeParam = searchParams.get("mode") || "all";
  const mode = ["api", "web", "all"].includes(modeParam) ? modeParam : "all";
  const fast = searchParams.has("fast") ? searchParams.get("fast") === "true" : mode === "api";
  const apiProviders = parseListParam(searchParams, "apiProviders");
  const applyhomeTypes = parseListParam(searchParams, "applyhomeTypes");
  const lhCategories = parseListParam(searchParams, "lhCategories");
  const myhomeKeywords = parseListParam(searchParams, "myhomeKeywords");

  try {
    // ─── 1. Register providers (sequential) ───────────────────────
    const allProviderConfigs = [
      // 1. API Providers (API를 가장 먼저 취합)
      { instance: new ApplyHomeApiProvider(), label: "청약홈 (민영/공공분양)", mode: "api" },
      { instance: new LHApiProvider(), label: "LH 청약플러스 (공공주택/행복주택)", mode: "api" },
      { instance: new MyHomeApiProvider(), label: "마이홈포털 (전국 임대/분양 통합)", mode: "api" },
      
      // 2. Web Scrapers (그 다음 순차 취합)
      { instance: new ApplyHomeWebProvider(), label: "청약홈 실시간 웹 (민영/공공분양/기타)", mode: "web" },
      { instance: new LHWebProvider(), label: "LH 청약플러스 실시간 웹 (임대/분양)", mode: "web" },
      { instance: new SHWebProvider(), label: "SH 서울주택도시공사 실시간 웹 (분양/임대)", mode: "web" },
      { instance: new GHWebProvider(), label: "GH 경기주택도시공사 실시간 웹 (청약공고)", mode: "web" },
      { instance: new IHWebProvider(), label: "iH 인천도시공사 실시간 웹 (분양/임대)", mode: "web" },
      { instance: new BMCWebProvider(), label: "BMC 부산도시공사 실시간 웹 (분양/임대)", mode: "web" },
    ];
    const providerConfigs = allProviderConfigs.filter((provider) => {
      if (mode !== "all" && provider.mode !== mode) return false;
      if (provider.mode === "api" && apiProviders.length > 0) {
        return apiProviders.includes(provider.instance.providerId);
      }
      return true;
    });

    const providerSyncRunIds: Record<string, string> = {};
    const syncRunMap = new Map<string, SyncRunRecord>();
    for (const { instance, label } of providerConfigs) {
      const runId = randomUUID();
      syncRunMap.set(instance.providerId, {
        id: runId,
        providerId: instance.providerId,
        providerName: instance.providerId,
        providerDisplayName: label,
        status: "running",
        startedAt: new Date(),
        finishedAt: null,
        totalFetched: 0,
        totalNormalized: 0,
        totalUpserted: 0,
        totalChanged: 0,
        totalErrors: 0,
        errorSummary: null,
        metadata: null,
      });
      providerSyncRunIds[instance.providerId] = runId;
    }
    await upsertSyncRuns(Array.from(syncRunMap.values()));

    // ─── 3. Fetch index from ALL providers SEQUENTIALLY (APIs first) ───
    const fetchResults = [];
    for (const { instance, label } of providerConfigs) {
      try {
        console.log(`[FastSync] Starting fetch for ${instance.providerId} (${label})...`);
        const items = await instance.fetchIndex({
          perPage,
          maxPages,
          applyhomeTypes,
          lhCategories,
          myhomeKeywords,
        });
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

    // ─── 5. Deduplicate projects in memory ────────────────────────
    const existingRecords = await listAnnouncementRecords();
    const existingProjectByMgmtNo = new Map(
      existingRecords.map((record) => [record.housingMgmtNo, record])
    );
    const seenProjects = new Map<string, any>();
    for (const { normalized } of allNormalized) {
      if (!seenProjects.has(normalized.housingMgmtNo)) {
        seenProjects.set(normalized.housingMgmtNo, normalized);
      }
    }

    const projectIdMap = new Map<string, string>();
    for (const [mgmtNo, n] of seenProjects) {
      projectIdMap.set(mgmtNo, existingProjectByMgmtNo.get(mgmtNo)?.projectId || randomUUID());
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
        housingMgmtNo: normalized.housingMgmtNo,
        projectName: normalized.name,
        projectSlug: normalized.slug,
        regionId: null,
        address: normalized.address || null,
        builderName: normalized.builderName || null,
        developerName: normalized.developerName || null,
        totalHouseholds: normalized.totalHouseholds ?? null,
        projectSourceProviderId: providerId,
        projectExternalSourceKey: normalized.externalSourceKey || null,
        projectMetadata: null,
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
        totalSupplyHouseholds: normalized.totalSupplyHouseholds ?? null,
        generalSupplyHouseholds: normalized.generalSupplyHouseholds ?? null,
        specialSupplyHouseholds: normalized.specialSupplyHouseholds ?? null,
        sourceProviderId: providerId,
        rawPayloadId: null,
        isBookmarked: false,
        latestSnapshotData: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        externalSourceKey: normalized.externalSourceKey,
        fingerprint,
        name: normalized.name,
        atchmnflSeqNo: null as string | null,
        atchmnflSn: null as string | null,
        normalized,
        metadata: getSourceMetadata({ externalSourceKey: normalized.externalSourceKey }),
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
      dest.metadata = getSourceMetadata(dest, src);
      
      if (isSrcPriority && !isDestPriority) {
        dest.externalSourceKey = src.externalSourceKey;
        dest.pblancUrl = src.pblancUrl || dest.pblancUrl;
      }

      return dest;
    }

    // Load all existing announcements from the DB to find matches across runs
    const existingDbAnns = existingRecords.map((record) => ({ ...record, name: record.projectName }));

    // Cross-run deduplication: map candidate announceNo to matching DB announceNo if highly similar
    for (const cand of candidateAnns) {
      for (const dbAnn of existingDbAnns) {
        if (isSameAnnouncement(dbAnn, cand)) {
          cand.metadata = getSourceMetadata(dbAnn, cand);
          const priorityKeys = ["lh_web", "sh_web", "gh_web", "ih_web", "bmc_web"];
          const isDbPriority = priorityKeys.some(key => dbAnn.externalSourceKey?.startsWith(key));
          const isCandPriority = priorityKeys.some(key => cand.externalSourceKey?.startsWith(key));
          if (isDbPriority && !isCandPriority) {
            cand.externalSourceKey = dbAnn.externalSourceKey;
            cand.pblancUrl = dbAnn.pblancUrl || cand.pblancUrl;
          }
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
        const existingMap = new Map(existingRecords.map(a => [a.announceNo, a]));
        
        const provider = new ApplyHomeApiProvider();
        
        // Filter target items that need attachment discovery
        const discoveryTargets = annValues.filter(ann => {
          if (ann.externalSourceKey.startsWith("applyhome_api") || ann.externalSourceKey.startsWith("applyhome_web")) {
            const existing = existingMap.get(ann.announceNo);
            if (!existing || !hasResolvedAttachmentLookup(existing.atchmnflSeqNo, existing.atchmnflSn)) {
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
                  ann.atchmnflSeqNo = attachments.seqNo;
                  ann.atchmnflSn = attachments.sn;
                } catch (err: any) {
                  console.error(`[FastSync] Attachment discovery failed for ${ann.announceNo}:`, err.message);
                  ann.atchmnflSeqNo = null;
                  ann.atchmnflSn = null;
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
    const currentAnnounceNoSet = new Set(currentAnnounceNos);
    const dbAnns = existingRecords.filter((announcement) => currentAnnounceNoSet.has(announcement.announceNo));
    const dbAnnMap = new Map(dbAnns.map(a => [a.announceNo, a]));

    const finalAnnValues = annValues.map(ann => {
      const dbAnn = dbAnnMap.get(ann.announceNo);
      return {
        ...ann,
        id: dbAnn ? dbAnn.id : randomUUID(),
        projectId: dbAnn ? dbAnn.projectId : ann.projectId,
        projectSlug: dbAnn ? dbAnn.projectSlug : ann.projectSlug,
        latestSnapshotId: dbAnn ? dbAnn.latestSnapshotId : null,
        latestSnapshotData: dbAnn ? dbAnn.latestSnapshotData : null,
        rawPayloadId: dbAnn ? dbAnn.rawPayloadId : ann.rawPayloadId,
        isBookmarked: dbAnn ? dbAnn.isBookmarked : ann.isBookmarked,
        atchmnflSeqNo: dbAnn?.atchmnflSeqNo || ann.atchmnflSeqNo,
        atchmnflSn: dbAnn?.atchmnflSn || ann.atchmnflSn,
        createdAt: dbAnn ? dbAnn.createdAt : ann.createdAt,
        updatedAt: new Date(),
        metadata: getSourceMetadata(ann, dbAnn),
      };
    });

    const eventsToInsert: ChangeEventRecord[] = [];
    const snapshotsToInsert: SnapshotRecord[] = [];

    for (const ann of finalAnnValues) {
      const dbAnn = dbAnnMap.get(ann.announceNo);

      if (!dbAnn) {
        const diff = compareAnnouncements(null, ann.normalized);
        if (diff.hasChanged) {
          eventsToInsert.push({
            id: randomUUID(),
            eventType: diff.eventType,
            entityType: "announcement",
            entityId: ann.id,
            syncRunId: ann.syncRunId,
            previousData: null,
            currentData: ann.normalized,
            diffSummary: generateDiffSummary(diff),
            severity: diff.severity,
            detectedAt: new Date(),
            notifiedAt: null,
          });
        }

        const snapshotId = randomUUID();
        snapshotsToInsert.push({
          id: snapshotId,
          announcementId: ann.id,
          syncRunId: ann.syncRunId,
          snapshotData: ann.normalized,
          fingerprint: ann.fingerprint,
          snapshottedAt: new Date(),
        });
        ann.latestSnapshotId = snapshotId;
        ann.latestSnapshotData = ann.normalized;
      } else if (dbAnn.fingerprint !== ann.fingerprint) {
        const oldData = dbAnn.latestSnapshotData || {
          ...ann.normalized,
          status: dbAnn.status,
          applyStartDate: dbAnn.applyStartDate,
          applyEndDate: dbAnn.applyEndDate,
          announceDate: dbAnn.announceDate,
          winnerAnnounceDate: dbAnn.winnerAnnounceDate,
          contractStartDate: dbAnn.contractStartDate,
          contractEndDate: dbAnn.contractEndDate,
        };
        const diff = compareAnnouncements(oldData, ann.normalized);
        if (diff.hasChanged) {
          eventsToInsert.push({
            id: randomUUID(),
            eventType: diff.eventType,
            entityType: "announcement",
            entityId: ann.id,
            syncRunId: ann.syncRunId,
            previousData: oldData,
            currentData: ann.normalized,
            diffSummary: generateDiffSummary(diff),
            severity: diff.severity,
            detectedAt: new Date(),
            notifiedAt: null,
          });
        }

        const snapshotId = randomUUID();
        snapshotsToInsert.push({
          id: snapshotId,
          announcementId: ann.id,
          syncRunId: ann.syncRunId,
          snapshotData: ann.normalized,
          fingerprint: ann.fingerprint,
          snapshottedAt: new Date(),
        });
        ann.latestSnapshotId = snapshotId;
        ann.latestSnapshotData = ann.normalized;
      }
    }

    const helperFields = new Set(["normalized", "providerId", "syncRunId", "name"]);
    const announcementRecords = finalAnnValues.map((value) =>
      Object.fromEntries(Object.entries(value).filter(([key]) => !helperFields.has(key))) as AnnouncementRecord
    );
    await upsertAnnouncements(announcementRecords);
    if (snapshotsToInsert.length > 0) await appendSnapshots(snapshotsToInsert);
    if (eventsToInsert.length > 0) await appendChangeEvents(eventsToInsert);
    const upsertedCount = announcementRecords.length;

    // ─── 6c. Web-to-API Upgrade Fallback ────────────────────────────
    // ponytail: Auto-upgrade previous web-scraped announcements to official API data when it becomes available
    if (!fast) {
      try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split("T")[0];

      const webAnns = announcementRecords.filter(
        (announcement) =>
          announcement.externalSourceKey?.startsWith("applyhome_web:") &&
          Boolean(announcement.announceDate && announcement.announceDate >= thirtyDaysAgoStr)
      );
      const upgradedRecords: AnnouncementRecord[] = [];
      const upgradeSnapshots: SnapshotRecord[] = [];
      const upgradeEvents: ChangeEventRecord[] = [];

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
            const upgradeSyncRunId = providerSyncRunIds.applyhome_api || randomUUID();
            upgradedRecords.push({
              ...webAnn,
              projectName: apiNorm.name,
              projectSlug: apiNorm.slug,
              address: apiNorm.address,
              builderName: apiNorm.builderName,
              developerName: apiNorm.developerName,
              totalHouseholds: apiNorm.totalHouseholds,
              projectExternalSourceKey: apiNorm.externalSourceKey,
              externalSourceKey: apiNorm.externalSourceKey,
              sourceProviderId: "applyhome_api",
              fingerprint: apiFingerprint,
              latestSnapshotId: snapshotId,
              latestSnapshotData: apiNorm,
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
              pblancUrl: apiNorm.pblancUrl ?? null,
              homepageAdres: apiNorm.homepageAdres ?? null,
              metadata: getSourceMetadata(webAnn, { externalSourceKey: apiNorm.externalSourceKey }),
              updatedAt: new Date(),
            });
            upgradeSnapshots.push({
              id: snapshotId,
              announcementId: webAnn.id,
              syncRunId: upgradeSyncRunId,
              snapshotData: apiNorm,
              fingerprint: apiFingerprint,
              snapshottedAt: new Date(),
            });

            if (diff.hasChanged) {
              upgradeEvents.push({
                id: randomUUID(),
                eventType: "SCHEDULE_CHANGED",
                entityType: "announcement",
                entityId: webAnn.id,
                syncRunId: providerSyncRunIds.applyhome_api || null,
                previousData: webAnn,
                currentData: apiNorm,
                diffSummary: `Source upgraded to Official API. ${generateDiffSummary(diff)}`,
                severity: "info",
                detectedAt: new Date(),
                notifiedAt: null,
              });
            }

            console.log(`[FastSync] Successfully upgraded ${webAnn.announceNo} to official API.`);
          } catch (e: any) {
            console.log(`[FastSync] Announcement ${webAnn.announceNo} not ready for upgrade: ${e.message}`);
          }
        }
        if (upgradedRecords.length > 0) await upsertAnnouncements(upgradedRecords);
        if (upgradeSnapshots.length > 0) await appendSnapshots(upgradeSnapshots);
        if (upgradeEvents.length > 0) await appendChangeEvents(upgradeEvents);
      }
      } catch (e: any) {
        console.error(`[FastSync] Web-to-API upgrade process failed:`, e.message);
      }
    } else {
      console.log(`[FastSync] Fast mode active: Skipping Web-to-API upgrade process.`);
    }

    // ─── 7. Complete sync runs individually ────────────────────────
    const elapsed = Date.now() - startTime;
    for (const { provider, status, error } of fetchResults) {
      const pFetched = fetchResults.find(f => f.provider.providerId === provider.providerId)?.items.length || 0;
      const pNormalized = allNormalized.filter(n => n.providerId === provider.providerId).length;
      const pUpserted = finalAnnValues.filter(ann => ann.externalSourceKey?.startsWith(provider.providerId)).length;
      const run = syncRunMap.get(provider.providerId);
      if (run) {
        syncRunMap.set(provider.providerId, {
          ...run,
          status: status === "success" ? "success" : "failed",
          finishedAt: new Date(),
          totalFetched: pFetched,
          totalNormalized: pNormalized,
          totalUpserted: pUpserted,
          totalChanged: eventsToInsert.filter((event) => event.syncRunId === run.id).length,
          totalErrors: status === "success" ? 0 : 1,
          errorSummary: error,
        });
      }
    }
    await upsertSyncRuns(Array.from(syncRunMap.values()));

    // ─── 8. Expired announcements automated cleanup (3 months / 90 days ago) ───
    try {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const ninetyDaysAgoStr = ninetyDaysAgo.toISOString().split('T')[0];

      const cleanupCandidates = new Map(existingRecords.map((announcement) => [announcement.id, announcement]));
      announcementRecords.forEach((announcement) => cleanupCandidates.set(announcement.id, announcement));
      const oldAnns = Array.from(cleanupCandidates.values()).filter(
        (announcement) => announcement.applyEndDate && announcement.applyEndDate < ninetyDaysAgoStr
      );

      if (oldAnns.length > 0) {
        const oldIds = oldAnns.map(a => a.id);
        console.log(`[FastSync] Cleaning up ${oldIds.length} expired announcements older than ${ninetyDaysAgoStr}...`);
        
        await deleteAnnouncements(oldIds);
        
        console.log(`[FastSync] Finished cleaning up expired announcements.`);
      }
    } catch (cleanupErr: any) {
      console.error(`[FastSync] Failed during expired announcements cleanup:`, cleanupErr.message);
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
      mode,
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
