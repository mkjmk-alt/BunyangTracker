import { NormalizedAnnouncement } from "../validators";

export interface FetchOptions {
  page?: number;
  perPage?: number;
  backfillDays?: number;
}

export interface RateLimitPolicy {
  requestsPerSecond: number;
  delayMs: number;
}

export interface SourceProvider<T> {
  providerId: string;
  fetchIndex(options: FetchOptions): Promise<T[]>;
  fetchDetail(id: string): Promise<T>;
  normalize(raw: T): NormalizedAnnouncement;
  getStableExternalId(raw: T): string;
  supportsBackfill(): boolean;
  getRateLimitPolicy(): RateLimitPolicy;
}
