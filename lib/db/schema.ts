import {
  pgTable,
  uuid,
  varchar,
  boolean,
  jsonb,
  timestamp,
  integer,
  date,
  numeric,
  text,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// 1. source_providers
export const sourceProviders = pgTable("source_providers", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  displayName: varchar("display_name", { length: 255 }),
  isActive: boolean("is_active").default(true),
  config: jsonb("config"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// 2. source_sync_runs
export const sourceSyncRuns = pgTable("source_sync_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  providerId: uuid("provider_id")
    .notNull()
    .references(() => sourceProviders.id),
  status: varchar("status", { length: 50 }).notNull(), // pending | running | success | partial_failure | failed
  startedAt: timestamp("started_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
  totalFetched: integer("total_fetched").default(0),
  totalNormalized: integer("total_normalized").default(0),
  totalUpserted: integer("total_upserted").default(0),
  totalChanged: integer("total_changed").default(0),
  totalErrors: integer("total_errors").default(0),
  errorSummary: text("error_summary"),
  metadata: jsonb("metadata"),
});

// 3. raw_source_payloads
export const rawSourcePayloads = pgTable("raw_source_payloads", {
  id: uuid("id").defaultRandom().primaryKey(),
  syncRunId: uuid("sync_run_id")
    .notNull()
    .references(() => sourceSyncRuns.id),
  providerId: uuid("provider_id")
    .notNull()
    .references(() => sourceProviders.id),
  externalKey: varchar("external_key", { length: 255 }).notNull(),
  payload: jsonb("payload").notNull(),
  fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
  isProcessed: boolean("is_processed").default(false),
});

// 4. regions
export const regions = pgTable("regions", {
  id: uuid("id").defaultRandom().primaryKey(),
  sido: varchar("sido", { length: 100 }).notNull(),
  sigungu: varchar("sigungu", { length: 100 }),
  code: varchar("code", { length: 50 }).notNull().unique(),
  sidoCode: varchar("sido_code", { length: 50 }),
  sigunguCode: varchar("sigungu_code", { length: 50 }),
});

// 5. housing_projects
export const housingProjects = pgTable("housing_projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  housingMgmtNo: varchar("housing_mgmt_no", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  regionId: uuid("region_id").references(() => regions.id),
  address: text("address"),
  builderName: varchar("builder_name", { length: 255 }),
  developerName: varchar("developer_name", { length: 255 }),
  totalHouseholds: integer("total_households"),
  sourceProviderId: uuid("source_provider_id").references(() => sourceProviders.id),
  externalSourceKey: varchar("external_source_key", { length: 255 }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// 6. announcements
export const announcements = pgTable("announcements", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => housingProjects.id),
  announceNo: varchar("announce_no", { length: 255 }).notNull().unique(),
  supplyType: varchar("supply_type", { length: 50 }).notNull(), // APT | OFFICETEL | PRIVATE_RENTAL | MUSOONWI | ...
  status: varchar("status", { length: 50 }).notNull(), // UPCOMING | OPEN | CLOSED | CANCELLED | CORRECTED
  displayStatus: varchar("display_status", { length: 50 }),
  announceDate: date("announce_date"),
  applyStartDate: date("apply_start_date"),
  applyEndDate: date("apply_end_date"),
  winnerAnnounceDate: date("winner_announce_date"),
  contractStartDate: date("contract_start_date"),
  contractEndDate: date("contract_end_date"),
  moveInDate: date("move_in_date"),
  totalSupplyHouseholds: integer("total_supply_households"),
  generalSupplyHouseholds: integer("general_supply_households"),
  specialSupplyHouseholds: integer("special_supply_households"),
  sourceProviderId: uuid("source_provider_id").references(() => sourceProviders.id),
  externalSourceKey: varchar("external_source_key", { length: 255 }),
  rawPayloadId: uuid("raw_payload_id").references(() => rawSourcePayloads.id),
  pblancUrl: text("pblanc_url"),
  homepageAdres: text("homepage_adres"),
  atchmnflSeqNo: varchar("atchmnfl_seq_no", { length: 100 }),
  atchmnflSn: varchar("atchmnfl_sn", { length: 100 }),
  isBookmarked: boolean("is_bookmarked").default(false),
  fingerprint: varchar("fingerprint", { length: 255 }),
  latestSnapshotId: uuid("latest_snapshot_id"), // Will be updated after snapshot creation
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// 7. announcement_snapshots
export const announcementSnapshots = pgTable("announcement_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  announcementId: uuid("announcement_id")
    .notNull()
    .references(() => announcements.id),
  syncRunId: uuid("sync_run_id")
    .notNull()
    .references(() => sourceSyncRuns.id),
  snapshotData: jsonb("snapshot_data").notNull(),
  fingerprint: varchar("fingerprint", { length: 255 }).notNull(),
  snapshottedAt: timestamp("snapshotted_at").defaultNow().notNull(),
});

// 8. announcement_units
export const announcementUnits = pgTable("announcement_units", {
  id: uuid("id").defaultRandom().primaryKey(),
  announcementId: uuid("announcement_id")
    .notNull()
    .references(() => announcements.id),
  unitType: varchar("unit_type", { length: 100 }).notNull(), // 84A, 59B 등
  supplyArea: numeric("supply_area"),
  exclusiveArea: numeric("exclusive_area"),
  generalSupply: integer("general_supply"),
  specialSupply: integer("special_supply"),
  priceMin: integer("price_min"),
  priceMax: integer("price_max"),
  floorMin: integer("floor_min"),
  floorMax: integer("floor_max"),
});

// 9. change_events
export const changeEvents = pgTable("change_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventType: varchar("event_type", { length: 100 }).notNull(), // NEW_ANNOUNCEMENT | SCHEDULE_CHANGED | ...
  entityType: varchar("entity_type", { length: 50 }).notNull(), // announcement | project
  entityId: uuid("entity_id").notNull(),
  syncRunId: uuid("sync_run_id").references(() => sourceSyncRuns.id),
  previousData: jsonb("previous_data"),
  currentData: jsonb("current_data"),
  diffSummary: text("diff_summary"),
  severity: varchar("severity", { length: 50 }).notNull(), // info | important | critical
  detectedAt: timestamp("detected_at").defaultNow().notNull(),
  notifiedAt: timestamp("notified_at"),
});

// 10. user_follows
export const userFollows = pgTable("user_follows", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => housingProjects.id),
  notifyScheduleChange: boolean("notify_schedule_change").default(true),
  notifyMusoonwi: boolean("notify_musoonwi").default(true),
  notifyNewAnnouncement: boolean("notify_new_announcement").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// 11. notification_deliveries
export const notificationDeliveries = pgTable("notification_deliveries", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  changeEventId: uuid("change_event_id")
    .notNull()
    .references(() => changeEvents.id),
  channel: varchar("channel", { length: 50 }).notNull(), // in_app | email | telegram
  status: varchar("status", { length: 50 }).notNull(), // pending | sent | failed
  sentAt: timestamp("sent_at"),
  errorMessage: text("error_message"),
});

// Relations
export const sourceProvidersRelations = relations(sourceProviders, ({ many }) => ({
  syncRuns: many(sourceSyncRuns),
  projects: many(housingProjects),
  announcements: many(announcements),
}));

export const housingProjectsRelations = relations(housingProjects, ({ one, many }) => ({
  region: one(regions, {
    fields: [housingProjects.regionId],
    references: [regions.id],
  }),
  announcements: many(announcements),
  follows: many(userFollows),
}));

export const announcementsRelations = relations(announcements, ({ one, many }) => ({
  project: one(housingProjects, {
    fields: [announcements.projectId],
    references: [housingProjects.id],
  }),
  units: many(announcementUnits),
  snapshots: many(announcementSnapshots),
}));

export const announcementUnitsRelations = relations(announcementUnits, ({ one }) => ({
  announcement: one(announcements, {
    fields: [announcementUnits.announcementId],
    references: [announcements.id],
  }),
}));
