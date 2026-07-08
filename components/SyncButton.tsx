"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type SyncMode = "api" | "web" | "all";

interface SyncProviderResult {
  name: string;
  label: string;
  fetched: number;
  status: string;
  error?: string | null;
}

interface SyncSettings {
  apiProviders: string[];
  applyhomeTypes: string[];
  lhCategories: string[];
  myhomeKeywords: string[];
}

interface Option {
  value: string;
  label: string;
}

const SETTINGS_KEY = "bunyangSyncSettings";
const DEFAULT_PER_PAGE = "30";
const DEFAULT_MAX_PAGES = "1";
const SYNC_TIMEOUT_MS = 240000;

const apiProviderOptions: Option[] = [
  { value: "applyhome_api", label: "청약홈 API" },
  { value: "lh_api", label: "LH API" },
  { value: "myhome_api", label: "마이홈 API" },
];

const applyhomeTypeOptions: Option[] = [
  { value: "APT", label: "아파트" },
  { value: "OFCTL_URBTY", label: "오피스텔/도시형" },
  { value: "REMAINDER", label: "무순위/잔여세대" },
  { value: "PUBLIC_RENT", label: "공공지원 민간임대" },
  { value: "OPTIONAL", label: "임의공급" },
];

const lhCategoryOptions: Option[] = [
  { value: "01", label: "토지" },
  { value: "05", label: "분양주택" },
  { value: "06", label: "임대주택" },
  { value: "13", label: "주거복지" },
  { value: "22", label: "상가" },
  { value: "39", label: "공공분양(신혼희망)" },
  { value: "54", label: "이익공유형 분양주택" },
];

const myhomeKeywordOptions: Option[] = [
  { value: "10년임대", label: "10년임대" },
  { value: "50년임대", label: "50년임대" },
  { value: "6년임대", label: "6년임대" },
  { value: "국민임대", label: "국민임대" },
  { value: "행복주택", label: "행복주택" },
  { value: "영구임대", label: "영구임대" },
  { value: "매입임대", label: "매입임대" },
  { value: "전세임대", label: "전세임대" },
  { value: "통합공공임대", label: "통합공공임대" },
];

const defaultSettings: SyncSettings = {
  apiProviders: apiProviderOptions.map((option) => option.value),
  applyhomeTypes: applyhomeTypeOptions.map((option) => option.value),
  lhCategories: lhCategoryOptions.map((option) => option.value),
  myhomeKeywords: [],
};

const syncModes: Record<SyncMode, { label: string; runningLabel: string; className: string }> = {
  api: {
    label: "API 수집",
    runningLabel: "API 수집 중...",
    className: "bg-sky-600 text-white hover:bg-sky-500",
  },
  web: {
    label: "크롤링 수집",
    runningLabel: "크롤링 중...",
    className: "bg-emerald-600 text-white hover:bg-emerald-500",
  },
  all: {
    label: "전체 수집",
    runningLabel: "전체 수집 중...",
    className: "bg-primary text-primary-foreground hover:opacity-90",
  },
};

function loadSettings(): SyncSettings {
  if (typeof window === "undefined") return defaultSettings;

  try {
    const stored = window.localStorage.getItem(SETTINGS_KEY);
    if (!stored) return defaultSettings;

    const parsed = JSON.parse(stored) as Partial<SyncSettings>;
    return {
      apiProviders: parsed.apiProviders?.length ? parsed.apiProviders : defaultSettings.apiProviders,
      applyhomeTypes: parsed.applyhomeTypes?.length ? parsed.applyhomeTypes : defaultSettings.applyhomeTypes,
      lhCategories: parsed.lhCategories?.length ? parsed.lhCategories : defaultSettings.lhCategories,
      myhomeKeywords: parsed.myhomeKeywords?.length ? parsed.myhomeKeywords : defaultSettings.myhomeKeywords,
    };
  } catch {
    return defaultSettings;
  }
}

function buildSyncQuery(mode: SyncMode, settings: SyncSettings) {
  const serialize = (values: string[]) => (values.length > 0 ? values.join(",") : "__none");
  const params = new URLSearchParams({
    mode,
    perPage: DEFAULT_PER_PAGE,
    maxPages: DEFAULT_MAX_PAGES,
  });

  params.set("fast", "true");

  if (mode === "web") return params.toString();

  params.set("apiProviders", serialize(settings.apiProviders));
  params.set("applyhomeTypes", serialize(settings.applyhomeTypes));
  params.set("lhCategories", serialize(settings.lhCategories));
  if (settings.myhomeKeywords.length > 0) {
    params.set("myhomeKeywords", settings.myhomeKeywords.join(","));
  }

  return params.toString();
}

export function SyncButton() {
  const [runningMode, setRunningMode] = useState<SyncMode | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<SyncSettings>(loadSettings);
  const [startText, setStartText] = useState<string | null>(null);
  const [endText, setEndText] = useState<string | null>(null);
  const router = useRouter();

  const isSyncing = runningMode !== null;

  const formatKst = () => new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

  const persistSettings = (next: SyncSettings) => {
    setSettings(next);
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  };

  const toggleSetting = (key: keyof SyncSettings, value: string) => {
    const values = settings[key];
    const nextValues = values.includes(value)
      ? values.filter((item) => item !== value)
      : [...values, value];

    persistSettings({
      ...settings,
      [key]: nextValues,
    });
  };

  const resetSettings = () => persistSettings(defaultSettings);

  const handleRestoreBookmarks = async () => {
    setIsRestoring(true);
    try {
      const response = await fetch("/api/admin/sync-browser-bookmarks", { method: "POST" });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          alert(
            `브라우저 별표 복구 완료\n복구된 즐겨찾기 수: ${result.restoredCount}개\n스캔된 브라우저 프로필:\n${result.scannedProfiles
              .map((p: string) => `  - ${p}`)
              .join("\n")}`
          );
          router.refresh();
        } else {
          alert(`별표 복구 실패: ${result.error}`);
        }
      } else {
        alert(`별표 복구 오류: ${await response.text()}`);
      }
    } catch (error) {
      console.error(error);
      alert("네트워크 오류가 발생했습니다.");
    } finally {
      setIsRestoring(false);
    }
  };

  const handleSync = async (mode: SyncMode) => {
    const config = syncModes[mode];
    setRunningMode(mode);

    const startTimeStr = formatKst();
    setStartText(startTimeStr);
    setEndText(null);
    localStorage.setItem("lastSyncStart", startTimeStr);
    localStorage.removeItem("lastSyncEnd");

    let timeoutId: number | undefined;

    try {
      const query = buildSyncQuery(mode, settings);
      const controller = new AbortController();
      timeoutId = window.setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);
      const response = await fetch(`/api/cron/sync?${query}`, { method: "GET", signal: controller.signal });
      window.clearTimeout(timeoutId);
      timeoutId = undefined;
      const endTimeStr = formatKst();
      setEndText(endTimeStr);
      localStorage.setItem("lastSyncEnd", endTimeStr);

      if (!response.ok) {
        let errorMsg = "";
        try {
          const errJson = await response.json();
          errorMsg = errJson.error || JSON.stringify(errJson);
        } catch {
          errorMsg = await response.text();
        }
        alert(`${config.label} 실패: ${errorMsg}`);
        return;
      }

      const result = await response.json();
      const detailsMessage = Array.isArray(result.providers)
        ? (result.providers as SyncProviderResult[])
            .map((p) => {
              const statusText = p.status === "success" ? "성공" : "실패";
              const sourceType = p.name.includes("api") ? "공식 API" : "크롤링";
              const errorMsg = p.error ? ` (에러: ${p.error})` : "";
              return `- [${sourceType}] ${p.label}: ${statusText}, ${p.fetched}개 수집${errorMsg}`;
            })
            .join("\n")
        : "";

      alert(
        [
          `${config.label} 완료`,
          `소요 시간: ${(result.elapsedMs / 1000).toFixed(1)}초`,
          `총 수집 건수: ${result.totalFetched}개`,
          `신규/변경 주택 수: ${result.totalProjects}개`,
          `신규/변경 공고 수: ${result.totalAnnouncements}개`,
          "",
          "[소스별 상세 내역]",
          detailsMessage,
        ]
          .filter(Boolean)
          .join("\n")
      );
      router.refresh();
    } catch (error) {
      console.error(error);
      const message =
        error instanceof DOMException && error.name === "AbortError"
          ? "수집 요청이 4분을 넘겨 중단되었습니다. 선택한 API/카테고리를 줄여 다시 시도해 주세요."
          : "네트워크 오류가 발생했습니다.";
      alert(message);

      const failText = `${formatKst()} (실패)`;
      setEndText(failText);
      localStorage.setItem("lastSyncEnd", failText);
    } finally {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
      setRunningMode(null);
    }
  };

  const renderOptions = (key: keyof SyncSettings, options: Option[]) => (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map((option) => (
        <label
          key={option.value}
          className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
        >
          <input
            type="checkbox"
            checked={settings[key].includes(option.value)}
            onChange={() => toggleSetting(key, option.value)}
            className="accent-primary"
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        <button
          onClick={() => setSettingsOpen((open) => !open)}
          disabled={isSyncing || isRestoring}
          className="rounded-lg border border-input bg-background px-4 py-2 font-semibold text-foreground shadow-sm transition-all hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
        >
          수집 설정
        </button>
        <button
          onClick={handleRestoreBookmarks}
          disabled={isSyncing || isRestoring}
          className={`rounded-lg border px-4 py-2 font-semibold transition-all ${
            isSyncing || isRestoring
              ? "bg-muted text-muted-foreground border-transparent cursor-not-allowed"
              : "bg-background text-foreground border-input hover:bg-accent hover:text-accent-foreground active:scale-95 shadow-sm"
          }`}
        >
          {isRestoring ? "별표 복구 중..." : "브라우저 별표 복구"}
        </button>

        {(Object.keys(syncModes) as SyncMode[]).map((mode) => {
          const config = syncModes[mode];
          const isRunning = runningMode === mode;
          return (
            <button
              key={mode}
              onClick={() => handleSync(mode)}
              disabled={isSyncing || isRestoring}
              className={`rounded-lg px-4 py-2 font-semibold shadow-sm transition-all ${
                isSyncing || isRestoring
                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                  : `${config.className} active:scale-95`
              }`}
            >
              {isRunning ? config.runningLabel : config.label}
            </button>
          );
        })}
      </div>

      {settingsOpen && (
        <div className="w-full max-w-2xl rounded-lg border bg-card p-4 text-left shadow-lg">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold">API 수집 설정</h2>
            <button onClick={resetSettings} className="text-xs font-semibold text-primary hover:underline">
              기본값 복원
            </button>
          </div>

          <div className="space-y-4">
            <section>
              <h3 className="mb-2 text-xs font-bold text-muted-foreground">실행할 공식 API</h3>
              {renderOptions("apiProviders", apiProviderOptions)}
            </section>

            <section>
              <h3 className="mb-2 text-xs font-bold text-muted-foreground">청약홈 API 유형</h3>
              {renderOptions("applyhomeTypes", applyhomeTypeOptions)}
            </section>

            <section>
              <h3 className="mb-2 text-xs font-bold text-muted-foreground">LH API 요청 대분류</h3>
              {renderOptions("lhCategories", lhCategoryOptions)}
            </section>

            <section>
              <h3 className="mb-1 text-xs font-bold text-muted-foreground">마이홈 공급유형</h3>
              <p className="mb-2 text-xs text-muted-foreground">
                마이홈 목록 API는 공급유형 요청 파라미터가 동작하지 않아 전체 요청 후 공급유형 응답값으로 필터링합니다.
              </p>
              {renderOptions("myhomeKeywords", myhomeKeywordOptions)}
            </section>
          </div>
        </div>
      )}

      {(startText || isSyncing) && (
        <div className="text-[11px] text-muted-foreground bg-accent/20 px-2.5 py-1.5 rounded-md border border-accent/50 flex flex-col gap-0.5 text-right">
          <div>시작: {startText || "준비 중..."}</div>
          <div>완료: {isSyncing ? syncModes[runningMode].runningLabel : endText || "-"}</div>
        </div>
      )}
    </div>
  );
}
