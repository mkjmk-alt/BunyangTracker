import { NotificationPayload, NotificationResult } from "../types";

export async function sendTelegramNotification(payload: NotificationPayload): Promise<NotificationResult> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = payload.userId; // 이 예제에서는 userId가 telegram chatId라고 가정

  if (!botToken) {
    return { success: false, channel: "telegram", error: "BOT_TOKEN not configured" };
  }

  try {
    const text = `*${payload.title}*\n\n${payload.message}`;
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: "Markdown",
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return { success: false, channel: "telegram", error: errorData.description };
    }

    return { success: true, channel: "telegram" };
  } catch (error: any) {
    return { success: false, channel: "telegram", error: error.message };
  }
}
