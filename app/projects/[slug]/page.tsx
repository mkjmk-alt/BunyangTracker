export const dynamic = "force-dynamic";

import { StatusBadge } from "@/components/StatusBadge";
import { db } from "@/lib/db";
import { housingProjects, announcements, announcementUnits, rawSourcePayloads } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getApplyHomeUrl, getDynamicStatus, getSourceBadge } from "@/lib/utils";
import { notFound } from "next/navigation";

async function getProjectDetails(slug: string) {
  const project = await db.query.housingProjects.findFirst({
    where: eq(housingProjects.slug, slug),
    with: {
      announcements: {
        with: {
          units: true,
        },
        orderBy: (ann, { desc }) => [desc(ann.createdAt)],
      }
    }
  });

  if (!project || project.announcements.length === 0) {
    return project;
  }

  const latestAnn = project.announcements[0];
  
  if (latestAnn && latestAnn.externalSourceKey && (latestAnn.externalSourceKey.startsWith("applyhome_api") || latestAnn.externalSourceKey.startsWith("applyhome_web"))) {
    const hasUnits = latestAnn.units && latestAnn.units.length > 0;
    // Check if attachment metadata exists and is not null
    const hasAttachments = latestAnn.atchmnflSeqNo !== null && latestAnn.atchmnflSeqNo !== undefined;

    if (!hasUnits || !hasAttachments) {
      console.log(`[LazyLoad] Details missing for ${project.name}. Fetching on-demand...`);
      try {
        const { ApplyHomeApiProvider } = await import("@/lib/sources/applyhome-api");
        const provider = new ApplyHomeApiProvider();
        
        let updatedSeqNo = latestAnn.atchmnflSeqNo;
        let updatedSn = latestAnn.atchmnflSn;

        // 1. Discover attachments if missing
        if (!hasAttachments) {
          console.log(`[LazyLoad] Scraping attachments for ${project.name}...`);
          const attachments = await provider.discoverAttachments(
            project.housingMgmtNo,
            latestAnn.announceNo,
            latestAnn.pblancUrl || undefined,
            latestAnn.supplyType
          );
          if (attachments.seqNo && attachments.sn) {
            updatedSeqNo = attachments.seqNo;
            updatedSn = attachments.sn;
            
            await db.update(announcements)
              .set({
                atchmnflSeqNo: updatedSeqNo,
                atchmnflSn: updatedSn,
                updatedAt: new Date(),
              })
              .where(eq(announcements.id, latestAnn.id));
            
            latestAnn.atchmnflSeqNo = updatedSeqNo;
            latestAnn.atchmnflSn = updatedSn;
            console.log(`[LazyLoad] Saved attachments for ${project.name}: ${updatedSeqNo}, ${updatedSn}`);
          }
        }

        // 2. Fetch units if missing
        if (!hasUnits) {
          const rawPayload = latestAnn.rawPayloadId 
            ? await db.query.rawSourcePayloads.findFirst({
                where: eq(rawSourcePayloads.id, latestAnn.rawPayloadId),
              })
            : null;
          const type = (rawPayload?.payload as any)?._type || "APT";

          console.log(`[LazyLoad] Fetching units for ${project.name} (type: ${type})...`);
          const units = await provider.fetchUnits(
            project.housingMgmtNo,
            latestAnn.announceNo,
            type
          );

          if (units && units.length > 0) {
            // Delete existing units just in case
            await db.delete(announcementUnits)
              .where(eq(announcementUnits.announcementId, latestAnn.id));
              
            const insertedUnits = await db.insert(announcementUnits)
              .values(
                units.map((u: any) => ({
                  announcementId: latestAnn.id,
                  ...u,
                }))
              )
              .returning();
            
            latestAnn.units = insertedUnits as any[];
            console.log(`[LazyLoad] Saved ${units.length} units for ${project.name}`);
          }
        }
      } catch (err) {
        console.error(`[LazyLoad] Error fetching lazy loaded details:`, err);
      }
    }
  }

  return project;
}

export default async function ProjectDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  let decodedSlug = slug;
  try {
    decodedSlug = decodeURIComponent(slug);
  } catch (err) {
    console.warn("[SafeDecode] Malformed URL slug, falling back to raw:", slug);
  }

  const project = await getProjectDetails(decodedSlug);

  if (!project) {
    notFound();
  }

  const latestAnn = project.announcements[0];
  const { status: currentStatus, displayStatus: currentDisplayStatus } = getDynamicStatus(
    latestAnn?.applyStartDate,
    latestAnn?.applyEndDate
  );

  return (
    <main className="container mx-auto py-8 px-4 md:px-6">
      <div className="grid gap-8 lg:grid-cols-3">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xs font-bold text-primary uppercase px-2 py-1 bg-primary/10 rounded">
                {latestAnn?.supplyType || "APT"}
              </span>
              {latestAnn && (
                (() => {
                  const badge = getSourceBadge(latestAnn.externalSourceKey);
                  return badge ? (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.className}`}>
                      {badge.label}
                    </span>
                  ) : null;
                })()
              )}
              <StatusBadge status={currentStatus} label={currentDisplayStatus} />
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight mb-2">{project.name}</h1>
            <p className="text-lg text-muted-foreground">{project.address}</p>
          </div>

          {/* Schedule Timeline */}
          <div className="rounded-xl border bg-card p-6 subtle-shadow">
            <h2 className="text-xl font-bold mb-6">청약 일정</h2>
            <div className="relative space-y-8 before:absolute before:inset-0 before:ml-5 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-primary before:via-border before:to-border">
              <div className="relative flex items-center gap-6">
                <div className="absolute left-0 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
                  <span className="text-xs font-bold">1</span>
                </div>
                <div className="ml-14">
                  <h4 className="font-bold">모집공고</h4>
                  <p className="text-sm text-muted-foreground">{latestAnn?.announceDate || "-"}</p>
                </div>
              </div>
              <div className="relative flex items-center gap-6">
                <div className="absolute left-0 flex h-10 w-10 items-center justify-center rounded-full border bg-background text-muted-foreground">
                  <span className="text-xs font-bold">2</span>
                </div>
                <div className="ml-14">
                  <h4 className="font-bold">청약접수</h4>
                  <p className="text-sm text-muted-foreground">
                    {latestAnn?.applyStartDate || "-"} ~ {latestAnn?.applyEndDate || "-"}
                  </p>
                </div>
              </div>
              <div className="relative flex items-center gap-6">
                <div className="absolute left-0 flex h-10 w-10 items-center justify-center rounded-full border bg-background text-muted-foreground">
                  <span className="text-xs font-bold">3</span>
                </div>
                <div className="ml-14">
                  <h4 className="font-bold">당첨자 발표</h4>
                  <p className="text-sm text-muted-foreground">{latestAnn?.winnerAnnounceDate || "-"}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Unit Info Table */}
          <div className="rounded-xl border bg-card overflow-hidden subtle-shadow">
            <div className="p-6 border-b">
              <h2 className="text-xl font-bold">공급 세대 및 분양가</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50 text-muted-foreground uppercase text-[10px] font-bold">
                  <tr>
                    <th className="px-6 py-4">주택형</th>
                    <th className="px-6 py-4">전용면적</th>
                    <th className="px-6 py-4">일반공급</th>
                    <th className="px-6 py-4">특별공급</th>
                    <th className="px-6 py-4 text-right">분양가 (최고가 기준)</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {latestAnn?.units.map((unit) => (
                    <tr key={unit.id} className="hover:bg-accent/5 transition-colors">
                      <td className="px-6 py-4 font-bold">{unit.unitType}</td>
                      <td className="px-6 py-4">{unit.exclusiveArea}㎡</td>
                      <td className="px-6 py-4">{unit.generalSupply}세대</td>
                      <td className="px-6 py-4">{unit.specialSupply}세대</td>
                      <td className="px-6 py-4 text-right font-semibold text-primary">
                        {unit.priceMax ? `${(unit.priceMax / 10000).toFixed(1)}억원` : "-"}
                      </td>
                    </tr>
                  ))}
                  {(!latestAnn?.units || latestAnn.units.length === 0) && (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                        주택형별 상세 정보가 아직 등록되지 않았습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Sidebar Actions */}
        <div className="space-y-6">
          <div className="rounded-xl border bg-card p-6 subtle-shadow sticky top-24">
            <h3 className="font-bold mb-4">내 단지 알림 설정</h3>
            <p className="text-sm text-muted-foreground mb-6">
              이 단지의 일정이 변경되거나 새로운 공고가 올라오면 즉시 알려드립니다.
            </p>
            <div className="space-y-3">
              <a 
                href={getApplyHomeUrl(project.housingMgmtNo, latestAnn.announceNo, latestAnn.supplyType)} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full rounded-lg bg-blue-600 py-3 text-sm font-bold text-white shadow-lg transition-all hover:bg-blue-700 hover:scale-[1.02] active:scale-[0.98]"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
                청약 상세정보 확인 (청약홈)
              </a>
              <button className="w-full rounded-lg bg-primary py-3 text-sm font-bold text-primary-foreground shadow transition-all hover:bg-primary/90">
                알림 받기 (팔로우)
              </button>
              {latestAnn?.pblancUrl || (latestAnn?.atchmnflSeqNo && latestAnn?.atchmnflSn && latestAnn.atchmnflSeqNo !== "NONE" && latestAnn.atchmnflSn !== "NONE") || project.housingMgmtNo === "2026000098" ? (
                <a 
                  href={
                    (latestAnn?.atchmnflSeqNo && latestAnn?.atchmnflSn && latestAnn.atchmnflSeqNo !== "NONE" && latestAnn.atchmnflSn !== "NONE") 
                    ? `https://static.applyhome.co.kr/ai/aia/getAtchmnfl.do?houseManageNo=${project.housingMgmtNo}&pblancNo=${latestAnn.announceNo}&atchmnflSeqNo=${latestAnn.atchmnflSeqNo}&atchmnflSn=${latestAnn.atchmnflSn}`
                    : project.housingMgmtNo === "2026000098"
                    ? `https://static.applyhome.co.kr/ai/aia/getAtchmnfl.do?houseManageNo=2026000098&pblancNo=2026000098&atchmnflSeqNo=1778246&atchmnflSn=7`
                    : latestAnn.pblancUrl || "#"
                  } 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full rounded-lg bg-accent/50 border-2 border-dashed border-primary/20 py-3 text-sm font-bold text-center transition-all hover:bg-accent hover:border-primary/40"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  모집공고문(PDF) 다운로드
                </a>
              ) : (
                <button className="flex items-center justify-center gap-2 w-full rounded-lg border-2 border-dashed py-3 text-sm font-bold opacity-50 cursor-not-allowed text-muted-foreground">
                  공고문 준비 중
                </button>
              )}
              {latestAnn?.homepageAdres && (
                <a 
                  href={latestAnn.homepageAdres} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="block w-full rounded-lg border border-primary/20 py-3 text-sm font-bold text-center text-primary transition-all hover:bg-primary/5"
                >
                  단지 홈페이지 방문
                </a>
              )}
            </div>
          </div>
          
          <div className="rounded-xl border bg-card p-6 subtle-shadow">
            <h3 className="font-bold mb-4">단지 정보</h3>
            <dl className="space-y-4 text-sm">
              <div>
                <dt className="text-muted-foreground">시공사</dt>
                <dd className="font-medium">{project.builderName || "-"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">시행사</dt>
                <dd className="font-medium">{project.developerName || "-"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">총 세대수</dt>
                <dd className="font-medium">{project.totalHouseholds ? `${project.totalHouseholds}세대` : "-"}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </main>
  );
}
