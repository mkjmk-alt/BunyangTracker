---
name: phase3-notifications
description: Phase 3 — 알림 시스템, 사용자 팔로우, 관리자 수집 도구 구축
---

# Phase 3: 알림 + 관리자 도구

## 알림 시스템 (lib/notifications/)

### types.ts
- NotificationChannel: in_app | email | telegram
- NotificationPayload: change_event + 사용자 친화적 메시지
- NotificationResult: success | failed + error

### dispatcher.ts
- change_event → 구독 조건 매칭 → 채널별 발송
- 중복 발송 방지: user_id + change_event_id + channel 조합 unique 체크
- notification_deliveries 테이블 기록

### channels/in-app.ts
- DB에 알림 저장 (in-app 피드)

### channels/email.ts
- stub 구현 (실제 발송 함수 인터페이스만)
- 나중에 Resend 또는 Nodemailer로 교체 가능하게 설계

### channels/telegram.ts
- Telegram Bot API webhook 기반 발송
- BOT_TOKEN 환경 변수 사용

## 알림 API
GET /api/notifications
- 로그인 사용자의 in-app 알림 목록
- 읽음/미읽음 필터

POST /api/notifications/[id]/read
- 알림 읽음 처리

## 사용자 팔로우 API
POST /api/follows
- { project_id, notify_schedule_change, notify_musoonwi, notify_new_announcement }

DELETE /api/follows/[id]

GET /api/follows
- 내 팔로우 목록

## 관리자 페이지 (app/admin/)

### app/admin/sync/page.tsx
- 최근 sync_run 목록 테이블
  - provider, status, started_at, finished_at
  - total_fetched, total_upserted, total_changed, total_errors
- 수동 실행 버튼 (provider 선택 가능)
- 백필 실행 폼 (days 입력)
- 실패 sync_run 클릭 → error_summary 상세 보기

### 크론 설정
- vercel.json에 cron 설정 추가
- /api/cron/sync 엔드포인트 (매일 6시, 12시, 18시 실행)
- CRON_SECRET 환경 변수로 보호

## README.md 최종 작성
다음을 포함한 한국어 README:
- 프로젝트 개요
- 기술 스택
- 환경 변수 설명
- 로컬 실행 방법 (npm install → DB 마이그레이션 → 개발 서버)
- 수집 실행 방법
- 크론 설정 방법
- 주요 데이터 모델 설명
- 변경 감지 방식 설명
- 소스 우선순위 설명
- 한계와 향후 개선점
