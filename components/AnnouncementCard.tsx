import { StatusBadge } from "./StatusBadge";
import { format } from "date-fns";
import { getDynamicStatus, getSourceBadge } from "@/lib/utils";
import Link from "next/link";

interface AnnouncementCardProps {
  project: {
    id: string;
    name: string;
    slug: string;
    address: string | null;
  };
  announcement: {
    supplyType: string;
    status: any;
    displayStatus?: string | null;
    announceDate: string | null;
    applyStartDate: string | null;
    applyEndDate: string | null;
    externalSourceKey?: string | null;
  };
}

export function AnnouncementCard({ project, announcement }: AnnouncementCardProps) {
  const { status, displayStatus } = getDynamicStatus(
    announcement.applyStartDate,
    announcement.applyEndDate
  );

  return (
    <Link 
      href={`/projects/${project.slug}`}
      className="block group rounded-xl border p-5 transition-all hover:border-primary/50 hover:bg-accent/5 subtle-shadow"
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs font-semibold text-primary uppercase tracking-wider">{announcement.supplyType}</span>
            {(() => {
              const badge = getSourceBadge(announcement.externalSourceKey);
              return badge ? (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded leading-none ${badge.className}`}>
                  {badge.label}
                </span>
              ) : null;
            })()}
            <StatusBadge status={status} label={displayStatus} />
          </div>
          <h4 className="text-lg font-bold group-hover:text-primary transition-colors">{project.name}</h4>
        </div>
      </div>
      
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground line-clamp-1">{project.address || "주소 정보 없음"}</p>
        
        <div className="grid grid-cols-2 gap-4 pt-2 border-t text-xs">
          <div>
            <span className="text-muted-foreground block">모집공고일</span>
            <span className="font-medium">{announcement.announceDate || "-"}</span>
          </div>
          <div>
            <span className="text-muted-foreground block">청약접수일</span>
            <span className="font-medium">
              {announcement.applyStartDate ? `${announcement.applyStartDate} ~` : "-"}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
