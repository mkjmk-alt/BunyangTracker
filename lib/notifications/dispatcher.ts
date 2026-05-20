import { db } from "../db";
import { notificationDeliveries, userFollows, changeEvents } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { sendTelegramNotification } from "./channels/telegram";

export async function dispatchNotifications(changeEventId: string) {
  const event = await db.query.changeEvents.findFirst({
    where: eq(changeEvents.id, changeEventId),
  });

  if (!event) return;

  // 1. 해당 단지를 팔로우하고 있는 사용자 조회
  const followers = await db.query.userFollows.findMany({
    where: eq(userFollows.projectId, event.entityId),
  });

  for (const follower of followers) {
    // 2. 중복 발송 방지 체크
    const existing = await db.query.notificationDeliveries.findFirst({
      where: and(
        eq(notificationDeliveries.userId, follower.userId),
        eq(notificationDeliveries.changeEventId, changeEventId)
      ),
    });

    if (existing) continue;

    // 3. 알림 발송 (Telegram 예시)
    const result = await sendTelegramNotification({
      userId: follower.userId,
      changeEventId: changeEventId,
      title: "분양 정보 변경 알림",
      message: event.diffSummary || "단지 정보가 변경되었습니다.",
    });

    // 4. 발송 결과 기록
    await db.insert(notificationDeliveries).values({
      userId: follower.userId,
      changeEventId: changeEventId,
      channel: result.channel,
      status: result.success ? "sent" : "failed",
      sentAt: result.success ? new Date() : null,
      errorMessage: result.error,
    });
  }
}
