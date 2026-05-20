import { NormalizedAnnouncement } from "../validators";

export type DiffResult = {
  hasChanged: boolean;
  changes: {
    field: string;
    oldValue: any;
    newValue: any;
  }[];
  eventType: "NEW_ANNOUNCEMENT" | "SCHEDULE_CHANGED" | "STATUS_CHANGED" | "UNIT_CHANGED" | "CANCELLED";
  severity: "info" | "important" | "critical";
};

export function compareAnnouncements(
  oldData: NormalizedAnnouncement | null,
  newData: NormalizedAnnouncement
): DiffResult {
  if (!oldData) {
    return {
      hasChanged: true,
      changes: [],
      eventType: "NEW_ANNOUNCEMENT",
      severity: "info",
    };
  }

  const changes: DiffResult["changes"] = [];
  const scheduleFields = [
    "announceDate",
    "applyStartDate",
    "applyEndDate",
    "winnerAnnounceDate",
    "contractStartDate",
    "contractEndDate",
  ];

  let scheduleChanged = false;
  let statusChanged = false;

  for (const field of Object.keys(newData) as (keyof NormalizedAnnouncement)[]) {
    if (field === "units" || field === "slug" || field === "externalSourceKey") continue;
    
    if (oldData[field] !== newData[field]) {
      changes.push({
        field,
        oldValue: oldData[field],
        newValue: newData[field],
      });
      
      if (scheduleFields.includes(field)) scheduleChanged = true;
      if (field === "status") statusChanged = true;
    }
  }

  let eventType: DiffResult["eventType"] = "STATUS_CHANGED";
  let severity: DiffResult["severity"] = "info";

  if (scheduleChanged) {
    eventType = "SCHEDULE_CHANGED";
    severity = "important";
  }

  if (newData.status === "CANCELLED") {
    eventType = "CANCELLED";
    severity = "critical";
  }

  return {
    hasChanged: changes.length > 0,
    changes,
    eventType,
    severity,
  };
}

export function generateDiffSummary(diff: DiffResult): string {
  if (diff.eventType === "NEW_ANNOUNCEMENT") return "새로운 분양 공고가 등록되었습니다.";
  if (diff.eventType === "CANCELLED") return "분양 공고가 취소되었습니다.";

  const summaries = diff.changes.map((c) => {
    const fieldMap: Record<string, string> = {
      announceDate: "모집공고일",
      applyStartDate: "청약접수 시작일",
      applyEndDate: "청약접수 종료일",
      winnerAnnounceDate: "당첨자 발표일",
      status: "상태",
    };
    const fieldName = fieldMap[c.field] || c.field;
    return `${fieldName}이(가) ${c.oldValue || "없음"}에서 ${c.newValue}로 변경됨`;
  });

  return summaries.join(", ");
}
