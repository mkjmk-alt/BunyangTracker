export const dynamic = "force-dynamic";

import { and, eq, desc, inArray, or, ilike, not, gt, lt, lte, gte, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { announcements, housingProjects, sourceSyncRuns } from "@/lib/db/schema";
import { FilterSection } from "../../components/FilterSection";
import { StatusBadge } from "../../components/StatusBadge";
import { SyncProgressBar } from "../components/SyncProgressBar";
import { BookmarkCheckbox } from "../../components/BookmarkCheckbox";
import { getKstDateString, getDynamicStatus } from "@/lib/utils";
import Link from "next/link";

const TYPE_GROUPS = {
  SALE: ["APT", "무순위", "임의공급", "불법행위 재공급", "공공분양", "공공분양주택", "분양주택", "도시형/오피스텔/생활숙박시설/민간임대"],
  RENT: ["행복주택", "국민임대", "영구임대", "공공임대", "공공지원민간임대", "민간임대"]
};

async function getAnnouncements(
  filters: { status?: string; type?: string; category?: string; q?: string; startDate?: string },
  kstToday: string
) {
  const whereConditions = [];
  
  if (filters.startDate) {
    whereConditions.push(gte(announcements.applyStartDate, filters.startDate));
  }
  
  if (filters.status && filters.status !== "ALL") {
    if (filters.status === "UPCOMING") {
      whereConditions.push(gt(announcements.applyStartDate, kstToday));
    } else if (filters.status === "CLOSED") {
      whereConditions.push(lt(announcements.applyEndDate, kstToday));
    } else if (filters.status === "ACTIVE") {
      whereConditions.push(
        or(
          isNull(announcements.applyEndDate),
          gte(announcements.applyEndDate, kstToday)
        )
      );
    } else if (filters.status === "OPEN") {
      whereConditions.push(
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
    }
  }
  
  if (filters.category === "SALE") {
    whereConditions.push(
      or(
        inArray(announcements.supplyType, TYPE_GROUPS.SALE),
        ilike(announcements.supplyType, "%도시형%"),
        ilike(announcements.supplyType, "%오피스텔%")
      )
    );
  } else if (filters.category === "RENT") {
    whereConditions.push(
      and(
        or(
          inArray(announcements.supplyType, TYPE_GROUPS.RENT),
          ilike(announcements.supplyType, "%임대%")
        ),
        // 도시형/오피스텔은 임대가 포함되어 있어도 분양으로 우선 분류
        not(ilike(announcements.supplyType, "%도시형%")),
        not(ilike(announcements.supplyType, "%오피스텔%"))
      )
    );
  } else if (filters.type && filters.type !== "ALL") {
    whereConditions.push(eq(announcements.supplyType, filters.type));
  }

  if (filters.q) {
    whereConditions.push(ilike(housingProjects.name, `%${filters.q}%`));
  }

  const results = await db
    .select({
      announcement: announcements,
      project: housingProjects,
    })
    .from(announcements)
    .innerJoin(housingProjects, eq(announcements.projectId, housingProjects.id))
    .where(and(...whereConditions))
    .orderBy(desc(announcements.announceDate));

  return results.map(r => ({
    ...r.announcement,
    project: r.project
  }));
}

export default async function ProjectsPage({ 
  searchParams 
}: { 
  searchParams: Promise<{ status?: string; type?: string; category?: string; region?: string; q?: string; startDate?: string }> 
}) {
  const { status = "ALL", type = "ALL", category = "SALE", region = "ALL", q = "", startDate = "" } = await searchParams;
  const kstToday = getKstDateString();
  const allAnns = await getAnnouncements({ status, type, category, q, startDate }, kstToday);

  // Get the most recent successful sync run to determine "NEW" items from the last sync
  const lastSyncRun = await db.query.sourceSyncRuns.findFirst({
    where: eq(sourceSyncRuns.status, "success"),
    orderBy: [desc(sourceSyncRuns.startedAt)],
  });
  const lastSyncStartedAt = lastSyncRun ? lastSyncRun.startedAt.getTime() : 0;

  const filteredAnns = region === "ALL" 
    ? allAnns 
    : allAnns.filter(ann => {
        const addrMatch = ann.project?.address?.includes(region);
        const nameMatch = ann.project?.name?.includes(region) || 
                         (region === "경기도" && (
                           ann.project?.name?.includes("남양주") || 
                           ann.project?.name?.includes("고양") || 
                           ann.project?.name?.includes("용인") || 
                           ann.project?.name?.includes("성남") || 
                           ann.project?.name?.includes("화성") || 
                           ann.project?.name?.includes("평택") || 
                           ann.project?.name?.includes("수원") || 
                           ann.project?.name?.includes("안산") || 
                           ann.project?.name?.includes("부천")
                         ));
        return addrMatch || nameMatch;
      });

  return (
    <main className="container mx-auto py-8 px-4 md:px-6">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">분양 목록</h1>
            <p className="text-muted-foreground">진행 중인 모든 청약 정보를 한눈에 확인하세요.</p>
          </div>
          
          <div className="flex flex-col items-end gap-2">
            <SyncProgressBar />
            <FilterSection 
              currentStatus={status} 
              currentType={type} 
              currentCategory={category} 
              currentRegion={region}
              currentStartDate={startDate}
            />
          </div>
        </div>

        <div className="w-full pb-4 max-w-full overflow-hidden">
          <div className="rounded-xl border bg-card subtle-shadow overflow-x-auto scrollbar-thin scrollbar-thumb-primary/10 hover:scrollbar-thumb-primary/20">
            <table className="w-full text-left text-sm whitespace-nowrap min-w-[1100px] table-auto">
              <thead className="bg-muted/50 text-muted-foreground uppercase text-[10px] font-bold sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-4 w-10 text-center"></th>
                  <th className="px-4 py-4">지역</th>
                  <th className="px-4 py-4">구분</th>
                  <th className="px-4 py-4">주택명</th>
                  <th className="px-4 py-4">시행사/건설사</th>
                  <th className="px-4 py-4">모집공고일</th>
                  <th className="px-4 py-4">청약기간</th>
                  <th className="px-4 py-4">당첨자발표</th>
                  <th className="px-4 py-4 text-center">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredAnns.map((ann: any) => {
                  const { status: currentStatus, displayStatus: currentDisplayStatus } = getDynamicStatus(
                    ann.applyStartDate,
                    ann.applyEndDate,
                    kstToday
                  );

                  return (
                    <tr key={ann.id} className="hover:bg-accent/5 transition-colors group">
                      <td className="px-4 py-4 text-center">
                        <BookmarkCheckbox id={ann.id} initialChecked={ann.isBookmarked || false} />
                      </td>
                      <td className="px-4 py-4 text-muted-foreground">
                        {ann.project?.address?.split(" ")[0] || 
                         (ann.project?.name?.includes("남양주") || 
                          ann.project?.name?.includes("고양") || 
                          ann.project?.name?.includes("용인") || 
                          ann.project?.name?.includes("성남") || 
                          ann.project?.name?.includes("화성") || 
                          ann.project?.name?.includes("평택") || 
                          ann.project?.name?.includes("수원") || 
                          ann.project?.name?.includes("안산") || 
                          ann.project?.name?.includes("부천") ? "경기도" : 
                          ann.project?.name?.includes("서울") ? "서울특별시" :
                          ann.project?.name?.includes("인천") ? "인천광역시" :
                          ann.project?.name?.includes("부산") ? "부산광역시" :
                          ann.project?.name?.includes("대구") ? "대구광역시" :
                          ann.project?.name?.includes("광주") ? "광주광역시" :
                          ann.project?.name?.includes("대전") ? "대전광역시" :
                          ann.project?.name?.includes("울산") ? "울산광역시" :
                          ann.project?.name?.includes("세종") ? "세종특별자치시" :
                          ann.project?.name?.includes("경기") ? "경기도" :
                          ann.project?.name?.includes("강원") ? "강원특별자치도" :
                          ann.project?.name?.includes("충북") ? "충청북도" :
                          ann.project?.name?.includes("충남") ? "충청남도" :
                          ann.project?.name?.includes("전북") ? "전북특별자치도" :
                          ann.project?.name?.includes("전남") ? "전라남도" :
                          ann.project?.name?.includes("경북") ? "경상북도" :
                          ann.project?.name?.includes("경남") ? "경상남도" :
                          ann.project?.name?.includes("제주") ? "제주특별자치도" : "-")}
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-xs font-medium px-2 py-0.5 bg-primary/5 text-primary rounded-full">
                          {ann.supplyType}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <Link 
                          href={`/projects/${ann.project?.slug}`}
                          className="font-bold text-blue-600 hover:underline group-hover:text-blue-700 block max-w-[280px]"
                          title={ann.project?.name}
                        >
                          <div className="flex items-center gap-2">
                            <span className="truncate max-w-[200px]">{ann.project?.name}</span>
                            {ann.createdAt.getTime() >= lastSyncStartedAt && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-blue-500 text-white animate-pulse shadow-sm leading-none">
                                NEW
                              </span>
                            )}
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-4 text-muted-foreground">
                        <div className="max-w-[120px] truncate" title={ann.project?.developerName || ann.project?.builderName}>
                          {ann.project?.developerName || ann.project?.builderName || "-"}
                        </div>
                      </td>
                      <td className="px-4 py-4">{ann.announceDate || "-"}</td>
                      <td className="px-4 py-4 font-medium">
                        {ann.applyStartDate && ann.applyEndDate ? (
                          <span className="text-muted-foreground">
                            <span className="text-foreground">{ann.applyStartDate}</span>
                            <span className="mx-1">~</span>
                            <span className="text-foreground">{ann.applyEndDate}</span>
                          </span>
                        ) : "-"}
                      </td>
                      <td className="px-4 py-4">{ann.winnerAnnounceDate || "-"}</td>
                      <td className="px-4 py-4 text-center">
                        <StatusBadge status={currentStatus} label={currentDisplayStatus} />
                      </td>
                    </tr>
                  );
                })}
                {filteredAnns.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-6 py-24 text-center">
                      <div className="mb-4 flex justify-center">
                        <div className="rounded-full bg-accent p-6">
                          <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        </div>
                      </div>
                      <h3 className="text-lg font-bold">검색 결과가 없습니다</h3>
                      <p className="text-muted-foreground">필터를 조정하거나 나중에 다시 시도해 주세요.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
