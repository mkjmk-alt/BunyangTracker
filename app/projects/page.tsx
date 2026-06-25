export const dynamic = "force-dynamic";

import { and, eq, desc, asc, inArray, or, ilike, not, gte, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { announcements, housingProjects, sourceSyncRuns } from "@/lib/db/schema";
import { FilterSection } from "../../components/FilterSection";
import { SyncProgressBar } from "../components/SyncProgressBar";
import { ProjectListTable } from "../../components/ProjectListTable";
import { getKstDateString } from "@/lib/utils";

const TYPE_GROUPS = {
  SALE: ["APT", "무순위", "임의공급", "불법행위 재공급", "공공분양", "공공분양주택", "분양주택", "도시형/오피스텔/생활숙박시설/민간임대"],
  RENT: ["행복주택", "국민임대", "영구임대", "공공임대", "공공지원민간임대", "민간임대"]
};

async function getAnnouncements(
  filters: { category?: string; q?: string; sort?: string }
) {
  const whereConditions = [];
  
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
  }

  if (filters.q) {
    whereConditions.push(ilike(housingProjects.name, `%${filters.q}%`));
  } else {
    // If no search query is specified, default to active, upcoming, or recently closed (last 30 days) announcements
    // ponytail: reduce default payload size for faster network transfer and rendering. Bypass filter if searching.
    const thirtyDaysAgoDate = new Date(Date.now() + 9 * 60 * 60 * 1000 - 30 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = thirtyDaysAgoDate.toISOString().split("T")[0];

    whereConditions.push(
      or(
        isNull(announcements.applyEndDate),
        gte(announcements.applyEndDate, thirtyDaysAgo)
      )
    );
  }

  let orderByClause = desc(announcements.announceDate);
  if (filters.sort === "startAsc") {
    orderByClause = asc(announcements.applyStartDate);
  } else if (filters.sort === "startDesc") {
    orderByClause = desc(announcements.applyStartDate);
  }

  const results = await db
    .select({
      announcement: announcements,
      project: housingProjects,
    })
    .from(announcements)
    .innerJoin(housingProjects, eq(announcements.projectId, housingProjects.id))
    .where(and(...whereConditions))
    .orderBy(orderByClause);

  return results.map(r => ({
    ...r.announcement,
    project: r.project
  }));
}

export default async function ProjectsPage({ 
  searchParams 
}: { 
  searchParams: Promise<{ category?: string; q?: string; sort?: string }> 
}) {
  const { category = "SALE", q = "", sort = "announceDesc" } = await searchParams;
  const kstToday = getKstDateString();

  // Get announcements and the most recent successful sync run concurrently
  // ponytail: parallel query execution to save RTT latency
  const [allAnns, lastSyncRun] = await Promise.all([
    getAnnouncements({ category, q, sort }),
    db.query.sourceSyncRuns.findFirst({
      where: eq(sourceSyncRuns.status, "success"),
      orderBy: [desc(sourceSyncRuns.startedAt)],
    })
  ]);

  const lastSyncStartedAt = lastSyncRun ? lastSyncRun.startedAt.getTime() : 0;

  // Serialize Date fields to strings before passing to client components
  const serializedProjects = allAnns.map((ann) => ({
    ...ann,
    createdAt: ann.createdAt.toISOString(),
    updatedAt: ann.updatedAt.toISOString(),
    project: ann.project ? {
      ...ann.project,
      createdAt: ann.project.createdAt.toISOString(),
      updatedAt: ann.project.updatedAt.toISOString(),
    } : null
  }));

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
              currentCategory={category} 
              currentSort={sort}
            />
          </div>
        </div>

        {/* Project List Table with Excel-like dropdown filters & Mobile Cards */}
        <ProjectListTable 
          initialProjects={serializedProjects} 
          kstToday={kstToday} 
          lastSyncStartedAt={lastSyncStartedAt} 
        />
      </div>
    </main>
  );
}
