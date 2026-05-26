export const dynamic = "force-dynamic";

import { KpiCard } from "@/components/KpiCard";
import { AnnouncementCard } from "@/components/AnnouncementCard";
import { db } from "@/lib/db";
import { announcements, housingProjects, changeEvents } from "@/lib/db/schema";
import { desc, eq, sql, and, or, lte, gte, isNull } from "drizzle-orm";
import { getKstDateString } from "@/lib/utils";
import Link from "next/link";

async function getStats(kstToday: string) {
  const [newAnnCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(announcements)
    .where(
      and(
        or(
          isNull(announcements.applyStartDate),
          lte(announcements.applyStartDate, kstToday)
        ),
        or(
          isNull(announcements.applyEndDate),
          gte(announcements.applyEndDate, kstToday)
        )
      )
    );
  const [changeCount] = await db.select({ count: sql<number>`count(*)` }).from(changeEvents);
  
  return {
    activeAnnouncements: newAnnCount?.count || 0,
    recentChanges: changeCount?.count || 0,
    upcomingEvents: 0,
  };
}

async function getRecentAnnouncements() {
  return await db.query.announcements.findMany({
    with: {
      project: true,
    },
    orderBy: [desc(announcements.createdAt)],
    limit: 6,
  });
}

export default async function DashboardPage() {
  const kstToday = getKstDateString();
  const stats = await getStats(kstToday);
  const recentAnns = await getRecentAnnouncements();

  return (
    <main className="container mx-auto py-8 px-4 md:px-6">
      <div className="flex flex-col gap-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">대시보드</h1>
          <p className="text-muted-foreground">실시간 분양 정보와 변경 사항을 확인하세요.</p>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-3">
          <KpiCard 
            title="접수 중인 공고" 
            value={stats.activeAnnouncements} 
            description="현재 청약 신청이 가능한 단지"
            icon={<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>}
          />
          <KpiCard 
            title="최근 변경 사항" 
            value={stats.recentChanges} 
            description="지난 7일간 감지된 일정/상태 변경"
            trend={{ value: 12, isUp: true }}
            icon={<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>}
          />
          <KpiCard 
            title="이번 주 주요 일정" 
            value={stats.upcomingEvents} 
            description="발표 및 계약 시작 예정"
            icon={<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>}
          />
        </div>

        {/* Content Section */}
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Recent Announcements */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold tracking-tight">최근 등록된 공고</h2>
              <Link href="/projects" className="text-sm font-medium text-primary hover:underline">전체 보기</Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {recentAnns.map((ann) => (
                <AnnouncementCard 
                  key={ann.id} 
                  project={ann.project as any} 
                  announcement={ann as any} 
                />
              ))}
              {recentAnns.length === 0 && (
                <div className="col-span-full py-12 text-center border-2 border-dashed rounded-xl">
                  <p className="text-muted-foreground">최근 등록된 공고가 없습니다.</p>
                </div>
              )}
            </div>
          </div>

          {/* Side Feed: Recent Changes */}
          <div className="space-y-4">
            <h2 className="text-xl font-bold tracking-tight">실시간 변경 피드</h2>
            <div className="rounded-xl border bg-card text-card-foreground subtle-shadow overflow-hidden">
              <div className="divide-y divide-border">
                {/* Dummy Change Item for Preview */}
                <div className="p-4 hover:bg-accent/5 transition-colors">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase">일정 변경</span>
                  </div>
                  <p className="text-sm font-medium">래미안 원베일리</p>
                  <p className="text-xs text-muted-foreground line-clamp-2">당첨자 발표일이 5월 11일에서 5월 14일로 변경됨</p>
                  <span className="text-[10px] text-muted-foreground/50 mt-2 block">10분 전</span>
                </div>
                <div className="p-4 hover:bg-accent/5 transition-colors">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2 h-2 rounded-full bg-green-500"></span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase">신규 등록</span>
                  </div>
                  <p className="text-sm font-medium">힐스테이트 판교역</p>
                  <p className="text-xs text-muted-foreground line-clamp-2">경기도 성남시 판교에 신규 아파트 분양 공고가 등록되었습니다.</p>
                  <span className="text-[10px] text-muted-foreground/50 mt-2 block">2시간 전</span>
                </div>
              </div>
              <div className="p-4 bg-accent/5 border-t text-center">
                <Link href="/changes" className="text-xs font-semibold text-primary hover:underline">모든 변경 이력 확인</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
