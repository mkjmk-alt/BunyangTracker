export const dynamic = "force-dynamic";

import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { announcements, housingProjects, sourceProviders, sourceSyncRuns } from "@/lib/db/schema";

type MetadataObject = {
  sourceKeys?: unknown;
  sourceProviders?: unknown;
};

type DiagnosticAnnouncement = {
  id: string;
  announceNo: string;
  supplyType: string;
  status: string;
  announceDate: string | Date | null;
  applyStartDate: string | Date | null;
  applyEndDate: string | Date | null;
  winnerAnnounceDate: string | Date | null;
  pblancUrl: string | null;
  externalSourceKey: string | null;
  metadata: unknown;
  updatedAt: Date;
  projectName: string;
  projectSlug: string;
  address: string | null;
};

type SyncRunSummary = {
  providerName: string;
  providerDisplayName: string | null;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  totalFetched: number | null;
  totalUpserted: number | null;
  totalErrors: number | null;
};

type ProviderQuality = {
  provider: string;
  count: number;
  missingApply: number;
  missingWinner: number;
  missingUrl: number;
  missingAnnounce: number;
  latestRun: SyncRunSummary | null;
};

type DuplicateGroup = {
  key: string;
  rows: DiagnosticAnnouncement[];
  providers: string[];
};

const providerLabels: Record<string, string> = {
  applyhome_api: "청약홈 API",
  applyhome_web: "청약홈 크롤링",
  lh_api: "LH API",
  lh_web: "LH 크롤링",
  sh_web: "SH 크롤링",
  gh_web: "GH 크롤링",
  ih_web: "iH 크롤링",
  bmc_web: "BMC 크롤링",
  myhome_api: "마이홈 API",
  unknown: "출처 없음",
};

function isMetadataObject(value: unknown): value is MetadataObject {
  return typeof value === "object" && value !== null;
}

function getProviderFromKey(key: string | null | undefined) {
  return key?.split(":")[0] || null;
}

function getProviders(row: Pick<DiagnosticAnnouncement, "externalSourceKey" | "metadata">) {
  const providers = new Set<string>();
  const directProvider = getProviderFromKey(row.externalSourceKey);
  if (directProvider) providers.add(directProvider);

  if (isMetadataObject(row.metadata)) {
    if (Array.isArray(row.metadata.sourceKeys)) {
      row.metadata.sourceKeys.forEach((key) => {
        if (typeof key !== "string") return;
        const provider = getProviderFromKey(key);
        if (provider) providers.add(provider);
      });
    }

    if (Array.isArray(row.metadata.sourceProviders)) {
      row.metadata.sourceProviders.forEach((provider) => {
        if (typeof provider === "string") providers.add(provider);
      });
    }
  }

  return Array.from(providers).sort();
}

function getSourceMix(providers: string[]) {
  const hasApi = providers.some((provider) => provider.endsWith("_api"));
  const hasWeb = providers.some((provider) => provider.endsWith("_web"));
  return { hasApi, hasWeb };
}

function providerLabel(provider: string) {
  return providerLabels[provider] || provider;
}

function providerBadgeClass(provider: string) {
  if (provider.endsWith("_api")) {
    return "border-sky-500/30 bg-sky-500/10 text-sky-300";
  }
  if (provider === "sh_web") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  }
  if (provider === "unknown") {
    return "border-muted bg-muted/40 text-muted-foreground";
  }
  return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
}

function formatDateTime(value: Date | null | undefined) {
  if (!value) return "-";
  return value.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeTitle(title: string) {
  return title
    .replace(/\[[^\]]*?\]/g, "")
    .replace(/\([^\)]*?\)/g, "")
    .replace(/\d{4}[.\-/년]\s*\d{1,2}[.\-/월]\s*\d{1,2}\s*(일|\.)?/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .toLowerCase()
    .trim();
}

function buildDuplicateGroups(rows: DiagnosticAnnouncement[]) {
  const groups = new Map<string, DiagnosticAnnouncement[]>();

  rows.forEach((row) => {
    const key = normalizeTitle(row.projectName);
    if (key.length < 10) return;
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  });

  return Array.from(groups.entries())
    .filter(([, group]) => new Set(group.map((row) => row.announceNo)).size > 1)
    .map(([key, group]) => ({
      key,
      rows: group,
      providers: Array.from(new Set(group.flatMap(getProviders))).sort(),
    }))
    .sort((a, b) => b.rows.length - a.rows.length)
    .slice(0, 12);
}

async function getDiagnostics() {
  const [announcementRows, syncRows] = await Promise.all([
    db
      .select({
        id: announcements.id,
        announceNo: announcements.announceNo,
        supplyType: announcements.supplyType,
        status: announcements.status,
        announceDate: announcements.announceDate,
        applyStartDate: announcements.applyStartDate,
        applyEndDate: announcements.applyEndDate,
        winnerAnnounceDate: announcements.winnerAnnounceDate,
        pblancUrl: announcements.pblancUrl,
        externalSourceKey: announcements.externalSourceKey,
        metadata: announcements.metadata,
        updatedAt: announcements.updatedAt,
        projectName: housingProjects.name,
        projectSlug: housingProjects.slug,
        address: housingProjects.address,
      })
      .from(announcements)
      .innerJoin(housingProjects, eq(announcements.projectId, housingProjects.id))
      .orderBy(desc(announcements.updatedAt)),
    db
      .select({
        providerName: sourceProviders.name,
        providerDisplayName: sourceProviders.displayName,
        status: sourceSyncRuns.status,
        startedAt: sourceSyncRuns.startedAt,
        finishedAt: sourceSyncRuns.finishedAt,
        totalFetched: sourceSyncRuns.totalFetched,
        totalUpserted: sourceSyncRuns.totalUpserted,
        totalErrors: sourceSyncRuns.totalErrors,
      })
      .from(sourceSyncRuns)
      .innerJoin(sourceProviders, eq(sourceSyncRuns.providerId, sourceProviders.id))
      .orderBy(desc(sourceSyncRuns.startedAt))
      .limit(300),
  ]);

  const rows = announcementRows as DiagnosticAnnouncement[];
  const latestRunByProvider = new Map<string, SyncRunSummary>();

  (syncRows as SyncRunSummary[]).forEach((run) => {
    if (!latestRunByProvider.has(run.providerName)) {
      latestRunByProvider.set(run.providerName, run);
    }
  });

  const providerQuality = new Map<string, ProviderQuality>();
  const ensureProvider = (provider: string) => {
    const current = providerQuality.get(provider);
    if (current) return current;

    const next: ProviderQuality = {
      provider,
      count: 0,
      missingApply: 0,
      missingWinner: 0,
      missingUrl: 0,
      missingAnnounce: 0,
      latestRun: latestRunByProvider.get(provider) || null,
    };
    providerQuality.set(provider, next);
    return next;
  };

  latestRunByProvider.forEach((_, provider) => ensureProvider(provider));

  rows.forEach((row) => {
    const providers = getProviders(row);
    const targetProviders = providers.length > 0 ? providers : ["unknown"];

    targetProviders.forEach((provider) => {
      const quality = ensureProvider(provider);
      quality.count += 1;
      if (!row.announceDate) quality.missingAnnounce += 1;
      if (!row.applyStartDate || !row.applyEndDate) quality.missingApply += 1;
      if (!row.winnerAnnounceDate) quality.missingWinner += 1;
      if (!row.pblancUrl) quality.missingUrl += 1;
    });
  });

  const sourceClassifiedRows = rows.map((row) => {
    const providers = getProviders(row);
    return {
      row,
      providers,
      ...getSourceMix(providers),
    };
  });

  const missingScheduleRows = rows
    .filter((row) => !row.applyStartDate || !row.applyEndDate || !row.winnerAnnounceDate || !row.pblancUrl)
    .slice(0, 14);

  const apiOnlyRows = sourceClassifiedRows
    .filter((item) => item.hasApi && !item.hasWeb)
    .map((item) => item.row)
    .slice(0, 8);

  const webOnlyRows = sourceClassifiedRows
    .filter((item) => item.hasWeb && !item.hasApi)
    .map((item) => item.row)
    .slice(0, 8);

  const bothSourceCount = sourceClassifiedRows.filter((item) => item.hasApi && item.hasWeb).length;
  const apiOnlyCount = sourceClassifiedRows.filter((item) => item.hasApi && !item.hasWeb).length;
  const webOnlyCount = sourceClassifiedRows.filter((item) => item.hasWeb && !item.hasApi).length;
  const duplicateGroups = buildDuplicateGroups(rows);

  return {
    rows,
    providerRows: Array.from(providerQuality.values()).sort((a, b) => b.count - a.count),
    missingScheduleRows,
    apiOnlyRows,
    webOnlyRows,
    duplicateGroups,
    totals: {
      announcements: rows.length,
      missingApply: rows.filter((row) => !row.applyStartDate || !row.applyEndDate).length,
      missingWinner: rows.filter((row) => !row.winnerAnnounceDate).length,
      missingUrl: rows.filter((row) => !row.pblancUrl).length,
      bothSourceCount,
      apiOnlyCount,
      webOnlyCount,
      duplicateGroupCount: duplicateGroups.length,
    },
  };
}

function MiniMetric({ label, value, tone }: { label: string; value: number | string; tone?: "ok" | "warn" | "info" }) {
  const toneClass =
    tone === "ok"
      ? "text-emerald-300"
      : tone === "warn"
        ? "text-amber-300"
        : "text-sky-300";

  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <div className={`text-2xl font-bold ${toneClass}`}>{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function SourceBadges({ providers }: { providers: string[] }) {
  const visibleProviders = providers.length > 0 ? providers : ["unknown"];

  return (
    <div className="flex flex-wrap gap-1.5">
      {visibleProviders.map((provider) => (
        <span key={provider} className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${providerBadgeClass(provider)}`}>
          {providerLabel(provider)}
        </span>
      ))}
    </div>
  );
}

function AnnouncementLink({ row }: { row: DiagnosticAnnouncement }) {
  return (
    <Link href={`/projects/${row.projectSlug}`} className="font-medium text-primary hover:underline">
      {row.projectName}
    </Link>
  );
}

function CompactAnnouncementList({ rows }: { rows: DiagnosticAnnouncement[] }) {
  if (rows.length === 0) {
    return <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">표시할 공고가 없습니다.</div>;
  }

  return (
    <div className="divide-y rounded-lg border">
      {rows.map((row) => (
        <div key={row.id} className="grid gap-3 px-4 py-3 md:grid-cols-[1fr_180px_140px]">
          <div className="min-w-0">
            <div className="truncate text-sm">
              <AnnouncementLink row={row} />
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{row.supplyType} · {row.address || "지역 없음"}</div>
          </div>
          <div className="text-xs text-muted-foreground">
            청약 {formatDate(row.applyStartDate)} ~ {formatDate(row.applyEndDate)}
          </div>
          <SourceBadges providers={getProviders(row)} />
        </div>
      ))}
    </div>
  );
}

export default async function CollectionDiagnosticsPage() {
  const diagnostics = await getDiagnostics();

  return (
    <main className="container mx-auto px-4 py-8 md:px-6">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">수집 진단</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              API와 크롤링 수집 결과의 누락 필드, 출처 조합, 중복 의심 공고를 점검합니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/sync" className="rounded-md border px-3 py-2 text-sm font-semibold hover:bg-accent">
              수집 관리
            </Link>
            <Link href="/projects" className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              분양 목록
            </Link>
          </div>
        </div>

        <section className="grid gap-3 md:grid-cols-4">
          <MiniMetric label="전체 공고" value={diagnostics.totals.announcements} tone="info" />
          <MiniMetric label="청약기간 누락" value={diagnostics.totals.missingApply} tone="warn" />
          <MiniMetric label="당첨자 발표 누락" value={diagnostics.totals.missingWinner} tone="warn" />
          <MiniMetric label="API+크롤링 병합" value={diagnostics.totals.bothSourceCount} tone="ok" />
        </section>

        <section className="rounded-lg border bg-card">
          <div className="border-b px-5 py-4">
            <h2 className="text-lg font-bold">소스별 수집 품질</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">소스</th>
                  <th className="px-5 py-3 text-right">공고 수</th>
                  <th className="px-5 py-3 text-right">공고일 누락</th>
                  <th className="px-5 py-3 text-right">청약기간 누락</th>
                  <th className="px-5 py-3 text-right">발표일 누락</th>
                  <th className="px-5 py-3 text-right">URL 누락</th>
                  <th className="px-5 py-3">최근 수집</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {diagnostics.providerRows.map((row) => (
                  <tr key={row.provider} className="hover:bg-accent/5">
                    <td className="px-5 py-3">
                      <SourceBadges providers={[row.provider]} />
                    </td>
                    <td className="px-5 py-3 text-right font-semibold">{row.count}</td>
                    <td className="px-5 py-3 text-right text-amber-300">{row.missingAnnounce}</td>
                    <td className="px-5 py-3 text-right text-amber-300">{row.missingApply}</td>
                    <td className="px-5 py-3 text-right text-amber-300">{row.missingWinner}</td>
                    <td className="px-5 py-3 text-right text-amber-300">{row.missingUrl}</td>
                    <td className="px-5 py-3 text-xs text-muted-foreground">
                      {row.latestRun ? (
                        <span>
                          {row.latestRun.status} · {formatDateTime(row.latestRun.startedAt)} · 수집 {row.latestRun.totalFetched || 0} / 오류 {row.latestRun.totalErrors || 0}
                        </span>
                      ) : (
                        <span>-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <div className="rounded-lg border bg-card">
            <div className="border-b px-5 py-4">
              <h2 className="text-lg font-bold">누락 필드 검수 대상</h2>
              <p className="mt-1 text-xs text-muted-foreground">청약기간, 발표일, 원문 URL 중 하나라도 비어 있는 최신 공고입니다.</p>
            </div>
            <div className="p-5">
              <CompactAnnouncementList rows={diagnostics.missingScheduleRows} />
            </div>
          </div>

          <div className="rounded-lg border bg-card">
            <div className="border-b px-5 py-4">
              <h2 className="text-lg font-bold">출처 조합 현황</h2>
              <p className="mt-1 text-xs text-muted-foreground">API 단독, 크롤링 단독, 병합된 공고 수를 구분합니다.</p>
            </div>
            <div className="grid gap-3 p-5 md:grid-cols-3">
              <MiniMetric label="API 단독" value={diagnostics.totals.apiOnlyCount} />
              <MiniMetric label="크롤링 단독" value={diagnostics.totals.webOnlyCount} />
              <MiniMetric label="병합" value={diagnostics.totals.bothSourceCount} tone="ok" />
            </div>
            <div className="grid gap-5 border-t p-5 lg:grid-cols-2">
              <div>
                <h3 className="mb-3 text-sm font-bold">API에만 있는 공고</h3>
                <CompactAnnouncementList rows={diagnostics.apiOnlyRows} />
              </div>
              <div>
                <h3 className="mb-3 text-sm font-bold">크롤링에만 있는 공고</h3>
                <CompactAnnouncementList rows={diagnostics.webOnlyRows} />
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-lg border bg-card">
          <div className="flex flex-col gap-1 border-b px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-bold">중복 의심 공고</h2>
              <p className="mt-1 text-xs text-muted-foreground">제목 정규화 결과가 같은데 서로 다른 공고번호로 저장된 그룹입니다.</p>
            </div>
            <span className="text-xs font-semibold text-amber-300">{diagnostics.totals.duplicateGroupCount}개 그룹</span>
          </div>
          <div className="divide-y">
            {diagnostics.duplicateGroups.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">중복 의심 그룹이 없습니다.</div>
            ) : (
              diagnostics.duplicateGroups.map((group: DuplicateGroup) => (
                <div key={group.key} className="grid gap-4 px-5 py-4 lg:grid-cols-[220px_1fr]">
                  <div>
                    <div className="text-sm font-semibold">{group.rows.length}건</div>
                    <div className="mt-2">
                      <SourceBadges providers={group.providers} />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    {group.rows.slice(0, 4).map((row) => (
                      <div key={row.id} className="grid gap-2 rounded-md border bg-muted/20 px-3 py-2 md:grid-cols-[1fr_140px_120px]">
                        <div className="truncate text-sm">
                          <AnnouncementLink row={row} />
                        </div>
                        <div className="text-xs text-muted-foreground">{row.announceNo}</div>
                        <div className="text-xs text-muted-foreground">{formatDate(row.announceDate)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
