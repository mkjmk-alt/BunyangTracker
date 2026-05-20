import { db } from "@/lib/db";
import { announcements, housingProjects } from "@/lib/db/schema";
import { and, gte, lte, eq } from "drizzle-orm";
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameMonth, 
  addMonths, 
  subMonths,
  startOfWeek,
  endOfWeek,
  isToday
} from "date-fns";
import { ko } from "date-fns/locale";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { CalendarFilter } from "../../components/CalendarFilter";
import { StatusBadge } from "../../components/StatusBadge";

const TYPE_GROUPS = {
  SALE: ["APT", "무순위", "임의공급", "불법행위 재공급", "공공분양", "공공분양주택", "분양주택", "도시형/오피스텔/생활숙박시설/민간임대"],
  RENT: ["행복주택", "국민임대", "영구임대", "공공임대", "공공지원민간임대", "민간임대"]
};

async function getSchedules(startDate: string, endDate: string) {
  const results = await db
    .select({
      announcement: announcements,
      project: housingProjects,
    })
    .from(announcements)
    .innerJoin(housingProjects, eq(announcements.projectId, housingProjects.id))
    .where(
      and(
        gte(announcements.applyEndDate, startDate),
        lte(announcements.applyStartDate, endDate)
      )
    );

  return results.map(r => ({
    ...r.announcement,
    project: r.project
  }));
}

export default async function CalendarPage({ 
  searchParams 
}: { 
  searchParams: Promise<{ month?: string; year?: string; region?: string; category?: string; selectedDate?: string }> 
}) {
  const sp = await searchParams;
  const now = new Date();
  const currentMonth = sp.month ? parseInt(sp.month) - 1 : now.getMonth();
  const currentYear = sp.year ? parseInt(sp.year) : now.getFullYear();
  const currentRegion = sp.region || "ALL";
  const currentCategory = sp.category || "ALL";
  const selectedDate = sp.selectedDate || format(now, "yyyy-MM-dd");
  
  const targetDate = new Date(currentYear, currentMonth, 1);
  const monthStart = startOfMonth(targetDate);
  const monthEnd = endOfMonth(targetDate);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  
  const allSchedules = await getSchedules(
    format(calendarStart, "yyyy-MM-dd"),
    format(calendarEnd, "yyyy-MM-dd")
  );

  const filteredByRegion = currentRegion === "ALL" 
    ? allSchedules 
    : allSchedules.filter(s => {
        const addrMatch = s.project?.address?.includes(currentRegion);
        const nameMatch = s.project?.name?.includes(currentRegion) || 
                         (currentRegion === "경기도" && (
                           s.project?.name?.includes("남양주") || 
                           s.project?.name?.includes("고양") || 
                           s.project?.name?.includes("용인") || 
                           s.project?.name?.includes("성남") || 
                           s.project?.name?.includes("화성") || 
                           s.project?.name?.includes("평택") || 
                           s.project?.name?.includes("수원") || 
                           s.project?.name?.includes("안산") || 
                           s.project?.name?.includes("부천")
                         ));
        return addrMatch || nameMatch;
      });

  const schedules = currentCategory === "ALL"
    ? filteredByRegion
    : filteredByRegion.filter(s => {
        const isOfficetelGroup = s.supplyType.includes("도시형") || s.supplyType.includes("오피스텔");
        if (currentCategory === "SALE") {
          return TYPE_GROUPS.SALE.includes(s.supplyType) || isOfficetelGroup;
        } else {
          return (TYPE_GROUPS.RENT.includes(s.supplyType) || s.supplyType.includes("임대")) && !isOfficetelGroup;
        }
      });

  const selectedSchedules = schedules.filter(s => {
    const start = s.applyStartDate || "";
    const end = s.applyEndDate || "";
    return selectedDate >= start && selectedDate <= end;
  });

  const prevMonth = subMonths(targetDate, 1);
  const nextMonth = addMonths(targetDate, 1);

  const getDayLink = (dayStr: string) => {
    const params = new URLSearchParams();
    if (sp.month) params.set("month", sp.month);
    if (sp.year) params.set("year", sp.year);
    if (sp.region) params.set("region", sp.region);
    if (sp.category) params.set("category", sp.category);
    params.set("selectedDate", dayStr);
    return `/calendar?${params.toString()}`;
  };

  return (
    <main className="container mx-auto py-8 px-4 md:px-6">
      <div className="flex flex-col gap-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">청약 캘린더</h1>
            <p className="text-muted-foreground">월별 주요 청약 일정을 확인하세요.</p>
          </div>
          
          <div className="flex items-center gap-4">
            <CalendarFilter currentRegion={currentRegion} currentCategory={currentCategory} />
            <div className="flex items-center gap-4 bg-accent/50 p-1 rounded-xl border shadow-sm">
              <Link 
                href={`/calendar?year=${prevMonth.getFullYear()}&month=${prevMonth.getMonth() + 1}${currentRegion !== "ALL" ? `&region=${currentRegion}` : ""}${currentCategory !== "ALL" ? `&category=${currentCategory}` : ""}`}
                className="p-2 hover:bg-background rounded-lg transition-all"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
              </Link>
              <div className="px-4 font-bold text-lg min-w-[140px] text-center">
                {format(targetDate, "yyyy년 M월", { locale: ko })}
              </div>
              <Link 
                href={`/calendar?year=${nextMonth.getFullYear()}&month=${nextMonth.getMonth() + 1}${currentRegion !== "ALL" ? `&region=${currentRegion}` : ""}${currentCategory !== "ALL" ? `&category=${currentCategory}` : ""}`}
                className="p-2 hover:bg-background rounded-lg transition-all"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
              </Link>
            </div>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Calendar Section */}
          <div className="flex-1">
            <div className="rounded-2xl border bg-card subtle-shadow overflow-hidden">
              <div className="grid grid-cols-7 border-b bg-muted/30">
                {["일", "월", "화", "수", "목", "금", "토"].map((day, i) => (
                  <div key={day} className={cn("py-3 text-center text-xs font-bold uppercase tracking-wider", i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-muted-foreground")}>{day}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 grid-rows-5 min-h-[600px]">
                {days.map((day) => {
                  const dayStr = format(day, "yyyy-MM-dd");
                  const daySchedules = schedules.filter(s => {
                    const start = s.applyStartDate || "";
                    const end = s.applyEndDate || "";
                    return dayStr >= start && dayStr <= end;
                  });
                  const isCurrentMonth = isSameMonth(day, targetDate);
                  const isSelected = selectedDate === dayStr;

                  return (
                    <Link 
                      key={dayStr}
                      href={getDayLink(dayStr)}
                      className={cn(
                        "border-r border-b p-2 flex flex-col gap-1 transition-all relative group overflow-hidden cursor-pointer",
                        !isCurrentMonth ? "bg-muted/10 opacity-40" : "hover:bg-accent/10",
                        isSelected && isCurrentMonth && "ring-2 ring-primary ring-inset bg-primary/5"
                      )}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className={cn(
                          "text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full transition-colors",
                          isToday(day) ? "bg-primary text-primary-foreground shadow-md" : 
                          day.getDay() === 0 ? "text-red-500" : 
                          day.getDay() === 6 ? "text-blue-500" : "text-foreground"
                        )}>
                          {format(day, "d")}
                        </span>
                        {daySchedules.length > 0 && isCurrentMonth && (
                          <span className="text-[10px] font-bold text-muted-foreground/60 px-1.5 py-0.5 rounded-md bg-accent">
                            {daySchedules.length}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-col gap-1 overflow-hidden pointer-events-none">
                        {daySchedules.slice(0, 3).map((s) => (
                          <div
                            key={`${dayStr}-${s.id}`}
                            className={cn(
                              "text-[9px] px-1.5 py-0.5 rounded border truncate font-medium",
                              s.supplyType.includes("APT") 
                                ? "bg-blue-500/10 text-blue-500 border-blue-500/20" 
                                : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                            )}
                          >
                            {s.project?.name}
                          </div>
                        ))}
                        {daySchedules.length > 3 && (
                          <div className="text-[8px] text-muted-foreground pl-1 font-bold">+ {daySchedules.length - 3}</div>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Legend */}
            <div className="mt-6 flex flex-wrap gap-6 p-4 rounded-xl border bg-accent/20">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-blue-500/20 border border-blue-500/30"></div>
                <span className="text-xs font-medium text-muted-foreground">분양(SALE)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-emerald-500/20 border border-emerald-500/30"></div>
                <span className="text-xs font-medium text-muted-foreground">임대(RENT)</span>
              </div>
            </div>
          </div>

          {/* Detail Sidebar */}
          <div className="w-full lg:w-[400px] flex flex-col gap-4">
            <div className="bg-card rounded-2xl border subtle-shadow overflow-hidden flex flex-col h-full min-h-[600px]">
              <div className="p-6 border-b bg-muted/20">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-lg font-bold">{format(new Date(selectedDate), "M월 d일 (EEEE)", { locale: ko })}</h2>
                  <span className="px-2 py-1 bg-primary/10 text-primary rounded text-xs font-bold">
                    총 {selectedSchedules.length}건
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">이 날 진행 중인 청약 일정입니다.</p>
              </div>

              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 scrollbar-thin scrollbar-thumb-accent">
                {selectedSchedules.length > 0 ? (
                  selectedSchedules.map((s) => (
                    <Link
                      key={s.id}
                      href={`/projects/${s.project?.slug}`}
                      className="p-4 rounded-xl border bg-background hover:border-primary/50 transition-all hover:shadow-md group flex flex-col gap-2"
                    >
                      <div className="flex items-start justify-between">
                        <span className="text-[10px] font-bold text-primary px-2 py-0.5 bg-primary/5 rounded-full border border-primary/10">
                          {s.supplyType}
                        </span>
                        <StatusBadge status={s.status} label={s.displayStatus} />
                      </div>
                      <h3 className="font-bold text-sm group-hover:text-primary transition-colors leading-snug">
                        {s.project?.name}
                      </h3>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                        {s.project?.address?.split(" ").slice(0, 2).join(" ")}
                      </div>
                      <div className="mt-1 pt-2 border-t border-dashed flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground">접수기간</span>
                        <span className="text-[11px] font-medium">{s.applyStartDate} ~ {s.applyEndDate}</span>
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
                    <div className="mb-4 rounded-full bg-accent/50 p-4">
                      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>
                    </div>
                    <p className="font-bold text-sm text-foreground">일정이 없습니다</p>
                    <p className="text-xs">다른 날짜를 선택해 보세요.</p>
                  </div>
                )}
              </div>
              
              <div className="p-4 border-t bg-muted/10">
                <Link 
                  href="/projects" 
                  className="w-full flex items-center justify-center gap-2 py-3 bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-xl text-sm font-bold transition-all"
                >
                  전체 목록 보기
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
