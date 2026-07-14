import { randomUUID } from "node:crypto";
import {
  appendNotificationDeliveries,
  listAnnouncementRecords,
  listChangeEvents,
  listNotificationDeliveries,
  listUserFollows,
} from "../sheets/repository";
import { sendTelegramNotification } from "./channels/telegram";

export async function dispatchNotifications(changeEventId: string) {
  const event = (await listChangeEvents()).find((row) => row.id === changeEventId);

  if (!event) return;

  const announcement = (await listAnnouncementRecords()).find((row) => row.id === event.entityId);
  const projectId = announcement?.projectId || event.entityId;
  const followers = (await listUserFollows()).filter((follow) => follow.projectId === projectId);
  const existingDeliveries = await listNotificationDeliveries();

  for (const follower of followers) {
    const existing = existingDeliveries.find(
      (delivery) => delivery.userId === follower.userId && delivery.changeEventId === changeEventId
    );

    if (existing) continue;

    // 3. 알림 발송 (Telegram 예시)
    const result = await sendTelegramNotification({
      userId: follower.userId,
      changeEventId: changeEventId,
      title: "분양 정보 변경 알림",
      message: event.diffSummary || "단지 정보가 변경되었습니다.",
    });

    await appendNotificationDeliveries([{
      id: randomUUID(),
      userId: follower.userId,
      changeEventId: changeEventId,
      channel: result.channel,
      status: result.success ? "sent" : "failed",
      sentAt: result.success ? new Date() : null,
      errorMessage: result.error ?? null,
    }]);
  }
}
