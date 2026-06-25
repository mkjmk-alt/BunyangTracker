export const dynamic = "force-dynamic";

import { db } from "@/lib/db";
import { changeEvents, announcements, housingProjects } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import Link from "next/link";

async function getChangeEvents() {
  return await db
    .select({
      id: changeEvents.id,
      eventType: changeEvents.eventType,
      entityType: changeEvents.entityType,
      entityId: changeEvents.entityId,
      previousData: changeEvents.previousData,
      currentData: changeEvents.currentData,
      diffSummary: changeEvents.diffSummary,
      severity: changeEvents.severity,
      detectedAt: changeEvents.detectedAt,
      announcementNo: announcements.announceNo,
      supplyType: announcements.supplyType,
      pblancUrl: announcements.pblancUrl,
      projectName: housingProjects.name,
      projectSlug: housingProjects.slug,
    })
    .from(changeEvents)
    .leftJoin(announcements, eq(changeEvents.entityId, announcements.id))
    .leftJoin(housingProjects, eq(announcements.projectId, housingProjects.id))
    .orderBy(desc(changeEvents.detectedAt))
    .limit(100);
}

export default async function ChangesPage() {
  const events = await getChangeEvents();

  const formatDateTime = (date: Date) => {
    return date.toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const EVENT_TYPE_MAP: Record<string, string> = {
    NEW_ANNOUNCEMENT: "신규 공고 등록",
    SCHEDULE_CHANGED: "청약 일정 변경",
    STATUS_CHANGED: "접수 상태 변경",
    PRICE_CHANGED: "공급 금액 변경",
  };

  const SEVERITY_MAP: Record<string, { label: string; className: string }> = {
    info: { label: "정보", className: "bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 border border-blue-200/50" },
    important: { label: "중요", className: "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-200/50" },
    critical: { label: "위험", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border border-red-200/50" },
  };

  return (
    <main className="container mx-auto py-8 px-4 md:px-6">
      <div className="flex flex-col gap-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">변경 이력</h1>
          <p className="text-muted-foreground">실시간 수집을 통해 감지된 청약 공고의 주요 변경사항 및 신규 등록 내역입니다.</p>
        </div>

        {events.length === 0 ? (
          <div className="rounded-xl border bg-card p-12 text-center subtle-shadow">
            <div className="mb-4 flex justify-center">
              <div className="rounded-full bg-accent p-6">
                <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>
              </div>
            </div>
            <h3 className="text-lg font-bold">변경 이력 데이터 없음</h3>
            <p className="text-muted-foreground">수집된 공고의 정보가 갱신되거나 신규 공고가 등록되면 여기에 이력이 표시됩니다.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {events.map((event) => {
              const severity = SEVERITY_MAP[event.severity] || { label: event.severity, className: "bg-muted text-muted-foreground" };
              const eventTypeLabel = EVENT_TYPE_MAP[event.eventType] || event.eventType;

              return (
                <div 
                  key={event.id}
                  className="bg-card rounded-xl border p-5 subtle-shadow flex flex-col sm:flex-row justify-between items-start gap-4 hover:border-primary/40 transition-colors"
                >
                  <div className="flex-1 space-y-2.5">
                    {/* Event Meta Line */}
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${severity.className}`}>
                        {severity.label}
                      </span>
                      <span className="font-semibold text-foreground px-2 py-0.5 bg-secondary rounded-md">
                        {eventTypeLabel}
                      </span>
                      <span className="text-muted-foreground font-medium">
                        {formatDateTime(event.detectedAt)}
                      </span>
                    </div>

                    {/* Project & Announcement Title */}
                    <div>
                      {event.projectName ? (
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link 
                            href={`/projects/${event.projectSlug}`}
                            className="font-extrabold text-base text-blue-600 hover:underline"
                          >
                            {event.projectName}
                          </Link>
                          {event.supplyType && (
                            <span className="text-xs px-2 py-0.5 bg-primary/5 text-primary rounded-full font-medium">
                              {event.supplyType}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="font-extrabold text-base text-foreground">
                          알 수 없는 청약 대상 (공고번호: {event.announcementNo || "-"})
                        </span>
                      )}
                    </div>

                    {/* Change Diff Summary */}
                    {event.diffSummary && (
                      <p className="text-sm text-foreground bg-accent/30 p-3 rounded-lg border border-accent leading-relaxed whitespace-pre-line font-medium">
                        {event.diffSummary}
                      </p>
                    )}
                  </div>

                  {/* Actions / Right Side Link */}
                  {event.pblancUrl && (
                    <a 
                      href={event.pblancUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="self-stretch sm:self-center shrink-0 text-center text-xs font-semibold px-4 py-2.5 bg-primary/5 hover:bg-primary/10 border border-primary/10 rounded-lg text-primary transition-all"
                    >
                      모집공고문 보기 ↗
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
