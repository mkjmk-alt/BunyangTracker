import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: any;
  label?: string | null;
  className?: string;
}

const statusMap = {
  UPCOMING: { label: "공고예정", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  OPEN: { label: "접수중", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  CLOSED: { label: "접수마감", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400" },
  CANCELLED: { label: "취소됨", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  CORRECTED: { label: "정정공고", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
};

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  let config = statusMap[status as keyof typeof statusMap] || statusMap.CLOSED;
  
  if (label) {
    if (label.includes("접수중")) {
      config = { label, color: statusMap.OPEN.color };
    } else if (label.includes("공고중") || label.includes("예정")) {
      config = { label, color: statusMap.UPCOMING.color };
    } else if (label.includes("정정")) {
      config = { label, color: statusMap.CORRECTED.color };
    } else if (label.includes("마감") || label.includes("종료")) {
      config = { label, color: statusMap.CLOSED.color };
    } else {
      config = { label, color: config.color };
    }
  }

  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold", config.color, className)}>
      {config.label}
    </span>
  );
}
