export type NotificationChannel = "in_app" | "email" | "telegram";

export interface NotificationPayload {
  userId: string;
  changeEventId: string;
  title: string;
  message: string;
  metadata?: any;
}

export interface NotificationResult {
  success: boolean;
  channel: NotificationChannel;
  error?: string;
}
