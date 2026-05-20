---
name: bunyang-domain
description: 대한민국 민간 분양 / 청약 도메인 지식. 분양정보 수집, 청약 일정, 공고 정규화, 변경 감지 관련 작업 시 로드.
---

# 분양 도메인 지식

## 핵심 개념

### 공급 유형
- APT: 일반 아파트 분양 (가장 많은 물량)
- 오피스텔/도시형생활주택: 주거용 소형 상품
- 민간임대: 임대 목적 민간 공급
- 공공지원민간임대: 정부 지원 민간임대
- 무순위/잔여세대: 기존 분양 후 미계약 재공급 (알림 수요 매우 높음)
- 임의공급: 조합원 외 일반 공급

### 청약 주요 일정 필드
- announce_date: 모집공고일
- apply_start_date: 청약접수 시작일
- apply_end_date: 청약접수 종료일
- winner_announce_date: 당첨자 발표일
- contract_start_date: 계약 시작일
- contract_end_date: 계약 종료일
- move_in_date: 입주 예정일

### 핵심 식별자
- housing_mgmt_no: 주택관리번호 (공공데이터 기준 단지 식별자)
- announce_no: 공고번호 (공고 단위 식별자)
- external_source_key: provider + 외부 원천키 조합

## DB 설계 원칙

### 필수 테이블 목록
1. source_providers — 수집 소스 정의
2. source_sync_runs — 수집 실행 이력
3. raw_source_payloads — 원본 응답 저장
4. housing_projects — 단지 정보 (정규화)
5. announcements — 공고 정보 (정규화)
6. announcement_snapshots — 공고 스냅샷 (변경 감지용)
7. announcement_schedules — 일정 정보 분리
8. announcement_units — 주택형별 정보
9. change_events — 변경 이벤트
10. regions — 지역 표준화
11. user_follows — 관심 단지
12. notification_deliveries — 알림 발송 이력

### 변경 감지 설계
- 매 수집 시 핵심 필드로 fingerprint(sha256) 생성
- 이전 스냅샷과 비교
- 변경 시 change_events 테이블에 이벤트 적재
- event_type: NEW_ANNOUNCEMENT | SCHEDULE_CHANGED | UNIT_CHANGED | STATUS_CHANGED | MUSOONWI_OPENED | CANCELLED

### change_events 필드
- event_type: 이벤트 유형
- entity_type: announcement | project
- entity_id: 대상 ID
- previous_data: JSONB 이전 상태
- current_data: JSONB 현재 상태
- diff_summary: 한국어 사람 친화적 요약 (예: "당첨자 발표일이 5월 11일에서 5월 14일로 변경됨")
- severity: info | important | critical
- detected_at: 감지 시각
- notified_at: 알림 발송 시각 (nullable)

## 소스 어댑터 인터페이스

```typescript
interface SourceProvider<T> {
  providerId: string;
  fetchIndex(options: FetchOptions): Promise<T[]>;
  fetchDetail(id: string): Promise<T>;
  normalize(raw: T): NormalizedAnnouncement;
  getStableExternalId(raw: T): string;
  supportsBackfill(): boolean;
  getRateLimitPolicy(): RateLimitPolicy;
}
```

## 수집 파이프라인 단계
1. sync_run 생성
2. 원천 fetch (페이지네이션 처리)
3. raw_source_payloads 저장
4. normalize
5. housing_projects upsert
6. announcements upsert
7. announcement_snapshots 생성
8. fingerprint 비교 → diff 계산
9. change_events 적재
10. notification queue 적재
11. sync_run 완료 기록

## 알림 트리거 조건
- 신규 공고 생성 → 지역/유형 구독자 알림
- 일정 변경 → 관심 단지 팔로워 알림
- 무순위/잔여세대 오픈 → 전체 무순위 구독자 알림
- 공고 정정/취소 → 관심 단지 팔로워 알림
