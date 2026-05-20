---
name: phase1-data-layer
description: Phase 1 — DB 스키마, 수집 파이프라인, API 레이어 전체 구축
---

# Phase 1: 데이터 레이어 구축

아래 순서대로 실제 동작 가능한 코드 파일을 생성하라.
설명만 하지 말고 파일을 직접 만들어라.

## Step 1: 프로젝트 초기화
- Next.js App Router + TypeScript strict 프로젝트 생성
- 의존성 설치: drizzle-orm, drizzle-kit, @supabase/supabase-js, zod, date-fns, dotenv
- .env.example 생성
- tsconfig.json strict 설정

## Step 2: DB 스키마 생성 (lib/db/schema.ts)
아래 테이블을 Drizzle ORM으로 정의하라.

**source_providers**
- id uuid pk
- name varchar unique (예: applyhome_api, applyhome_apt_file, lh)
- display_name varchar
- is_active boolean default true
- config jsonb (rate limit, base url 등)
- created_at, updated_at

**source_sync_runs**
- id uuid pk
- provider_id uuid fk → source_providers
- status: pending | running | success | partial_failure | failed
- started_at, finished_at
- total_fetched int, total_normalized int, total_upserted int, total_changed int, total_errors int
- error_summary text
- metadata jsonb

**raw_source_payloads**
- id uuid pk
- sync_run_id uuid fk
- provider_id uuid fk
- external_key varchar (원천 고유키)
- payload jsonb (원본 응답 그대로)
- fetched_at timestamp
- is_processed boolean default false

**regions**
- id uuid pk
- sido varchar (시도)
- sigungu varchar (시군구)
- code varchar unique (지역코드)
- sido_code varchar
- sigungu_code varchar

**housing_projects**
- id uuid pk
- housing_mgmt_no varchar unique (주택관리번호)
- name varchar (단지명)
- slug varchar unique
- region_id uuid fk → regions
- address text
- builder_name varchar (시공사)
- developer_name varchar (시행사)
- total_households int
- source_provider_id uuid fk
- external_source_key varchar
- metadata jsonb
- created_at, updated_at

**announcements**
- id uuid pk
- project_id uuid fk → housing_projects
- announce_no varchar unique (공고번호)
- supply_type varchar (APT | OFFICETEL | PRIVATE_RENTAL | MUSOONWI | ...)
- status varchar (UPCOMING | OPEN | CLOSED | CANCELLED | CORRECTED)
- announce_date date
- apply_start_date date
- apply_end_date date
- winner_announce_date date
- contract_start_date date
- contract_end_date date
- move_in_date date
- total_supply_households int
- general_supply_households int
- special_supply_households int
- source_provider_id uuid fk
- external_source_key varchar
- raw_payload_id uuid fk → raw_source_payloads
- fingerprint varchar (sha256 of key fields)
- latest_snapshot_id uuid (circular ref, nullable)
- created_at, updated_at

**announcement_snapshots**
- id uuid pk
- announcement_id uuid fk
- sync_run_id uuid fk
- snapshot_data jsonb (정규화된 공고 전체 상태)
- fingerprint varchar
- snapshotted_at timestamp

**announcement_units**
- id uuid pk
- announcement_id uuid fk
- unit_type varchar (주택형, 예: 84A, 59B)
- supply_area numeric (공급면적)
- exclusive_area numeric (전용면적)
- general_supply int
- special_supply int
- price_min int
- price_max int
- floor_min int
- floor_max int

**change_events**
- id uuid pk
- event_type varchar (NEW_ANNOUNCEMENT | SCHEDULE_CHANGED | UNIT_CHANGED | STATUS_CHANGED | MUSOONWI_OPENED | CANCELLED)
- entity_type varchar (announcement | project)
- entity_id uuid
- sync_run_id uuid fk
- previous_data jsonb
- current_data jsonb
- diff_summary text (한국어 사람 친화적 요약)
- severity varchar (info | important | critical)
- detected_at timestamp
- notified_at timestamp nullable

**user_follows**
- id uuid pk
- user_id varchar (auth 연동 전 임시 식별자)
- project_id uuid fk → housing_projects
- notify_schedule_change boolean default true
- notify_musoonwi boolean default true
- notify_new_announcement boolean default true
- created_at

**notification_deliveries**
- id uuid pk
- user_id varchar
- change_event_id uuid fk
- channel varchar (in_app | email | telegram)
- status varchar (pending | sent | failed)
- sent_at timestamp
- error_message text

## Step 3: 마이그레이션 생성
- drizzle-kit generate 실행
- drizzle-kit push 가능하게 설정

## Step 4: 타입 및 Zod 스키마 (lib/validators/)
- 청약홈 API 응답 Zod 스키마
- 정규화된 NormalizedAnnouncement 타입
- API 쿼리 파라미터 Zod 스키마
- change_event payload 타입

## Step 5: 소스 어댑터 구현 (lib/sources/)
**provider.ts**: SourceProvider 인터페이스 정의

**applyhome-api.ts**: 청약홈 OpenAPI 어댑터
- 공공데이터포털 API 키 기반 호출
- APT 분양정보 조회 엔드포인트
- 페이지네이션 처리
- rate limit 준수 (요청 간 딜레이)
- Zod 응답 검증
- normalize() → NormalizedAnnouncement 변환

**applyhome-apt-file.ts**: APT 분양정보 파일 데이터 어댑터
- CSV/파일 다운로드 처리
- 필드 매핑

**applyhome-apt-unit-file.ts**: APT 주택형별 분양정보 파일 어댑터
- 주택형 데이터 처리

## Step 6: 정규화 로직 (lib/normalize/)
**announcement.ts**: 공고 정규화
- 날짜 필드 파싱 (UTC 변환)
- 공급유형 코드 표준화
- 지역명 표준화
- stable external_key 생성 (provider + announce_no 또는 housing_mgmt_no 복합)
- slug 생성

**region.ts**: 지역 정규화
- 시도/시군구 코드 매핑

## Step 7: diff 엔진 (lib/diff/)
**announcement-diff.ts**: 공고 변경 감지
- fingerprint 계산 (sha256)
- 이전 스냅샷과 비교
- 변경 유형 판별

**schedule-diff.ts**: 일정 변경 감지
- 날짜 필드별 비교
- 변경된 일정 필드 목록 반환

**unit-diff.ts**: 주택형 변경 감지
- 세대수, 금액 변경 감지

**change-summary.ts**: 한국어 요약 생성
- "당첨자 발표일이 2026-05-11에서 2026-05-14로 변경됨" 형식
- severity 자동 결정 (일정변경→important, 취소→critical, 신규→info)

## Step 8: 수집 파이프라인 (lib/pipeline/)
**runner.ts**: 수집 실행기
- sync_run 생성/관리
- provider별 실행
- 오류 격리 (한 provider 실패가 전체 중단 안 되게)
- 재시도 로직

**ingester.ts**: 단일 항목 처리
- fetch → raw 저장 → normalize → upsert → snapshot → diff → change_event

## Step 9: API Route Handlers (app/api/)
GET /api/projects
- 필터: region, supply_type, status, q, page, page_size, sort
- 응답: projects[], total, page, page_size

GET /api/projects/[slug]
- 단지 상세 + 최신 공고 + 주택형 목록

GET /api/announcements
- 필터: region, supply_type, status, is_musoonwi, date_from, date_to
- 응답: announcements[], total

GET /api/calendar
- 응답: 특정 월의 일정 이벤트 목록 (날짜별 그룹핑)

GET /api/changes
- 최근 변경 이벤트 목록
- 필터: event_type, severity, entity_id

POST /api/sync/run
- 수집 즉시 실행 (관리자용, API key 인증)
- body: { provider?: string, backfill_days?: number }

GET /api/health
- DB 연결, 마지막 sync_run 상태 반환
