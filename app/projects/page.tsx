export const dynamic = "force-dynamic";

import { listAnnouncements, listSyncRuns } from "@/lib/sheets/repository";
import { FilterSection } from "../../components/FilterSection";
import { SyncProgressBar } from "../components/SyncProgressBar";
import { ProjectListTable } from "../../components/ProjectListTable";
import { getKstDateString } from "@/lib/utils";

const TYPE_GROUPS = {
  SALE: ["APT", "무순위", "임의공급", "불법행위 재공급", "공공분양", "공공분양주택", "분양주택", "도시형/오피스텔/생활숙박시설/민간임대"],
  RENT: ["행복주택", "국민임대", "영구임대", "공공임대", "공공지원민간임대", "민간임대", "SH임대주택", "GH임대주택", "IH임대주택", "BMC임대주택"]
};

async function getAnnouncements(
  filters: { category?: string; q?: string; sort?: string }
) {
  const query = filters.q?.trim().toLocaleLowerCase("ko-KR");
  const thirtyDaysAgoDate = new Date(Date.now() + 9 * 60 * 60 * 1000 - 30 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = thirtyDaysAgoDate.toISOString().split("T")[0];

  const filtered = (await listAnnouncements()).filter((announcement) => {
    const type = announcement.supplyType;
    const isOfficetel = type.includes("도시형") || type.includes("오피스텔");
    if (filters.category === "SALE" && !TYPE_GROUPS.SALE.includes(type) && !isOfficetel) return false;
    if (
      filters.category === "RENT" &&
      (!(TYPE_GROUPS.RENT.includes(type) || type.includes("임대")) || isOfficetel)
    ) return false;
    if (query) return announcement.project.name.toLocaleLowerCase("ko-KR").includes(query);
    return !announcement.applyEndDate || announcement.applyEndDate >= thirtyDaysAgo;
  });

  return filtered.sort((left, right) => {
    const leftValue = filters.sort?.startsWith("start") ? left.applyStartDate : left.announceDate;
    const rightValue = filters.sort?.startsWith("start") ? right.applyStartDate : right.announceDate;
    const result = (leftValue || "").localeCompare(rightValue || "");
    return filters.sort === "startAsc" ? result : -result;
  });
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
    listSyncRuns().then((runs) =>
      runs
        .filter((run) => run.status === "success")
        .sort((left, right) => right.startedAt.getTime() - left.startedAt.getTime())[0] || null
    )
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
    <main className="w-full max-w-[1450px] mx-auto py-8 px-2 md:px-4">
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
