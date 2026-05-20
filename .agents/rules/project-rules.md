---
name: project-rules
description: 분양 트래킹 서비스 전체에 항상 적용되는 프로젝트 규칙
---

# 프로젝트 규칙

## 기술 스택 (변경 불가)
- Next.js App Router + TypeScript (strict mode)
- Supabase Postgres + Drizzle ORM
- Tailwind CSS
- Zod (모든 외부 입력 검증)
- date-fns (모든 날짜 처리, UTC 저장, KST 표시)
- Vitest (테스트)

## 절대 원칙
1. 공식 데이터 우선 — 청약홈 OpenAPI > 파일데이터 > LH/SH/GH > 민간 포털
2. 원본 보존 — 모든 외부 응답은 raw_source_payloads 테이블에 그대로 저장
3. 정규화 분리 — 원본 테이블과 서비스 테이블 반드시 분리
4. 멱등성 보장 — 같은 기간 재수집 시 중복 이벤트 발생 금지
5. 변경 감지 우선 — 신규 공고 수집보다 변경(일정변경, 정정, 전환) 탐지가 더 중요
6. any 금지 — TypeScript any 사용 불가, unknown 또는 명시 타입 사용
7. 매직스트링 금지 — enum 또는 const map 사용
8. 설명만 하지 말 것 — 실제 동작 가능한 코드와 파일을 직접 생성

## 코딩 규칙
- 함수는 단일 책임, 길이 50줄 이하 권장
- 외부 API 응답은 Zod로 반드시 검증
- 날짜 저장은 항상 UTC, 표시는 KST 변환
- 에러는 사용자용 메시지와 내부 로그 분리
- 로그에는 반드시 run_id, provider, entity_id 포함
- localStorage/sessionStorage 사용 금지 (iframe 샌드박스 환경)

## 소스 계층 구조
- 1순위: 청약홈 OpenAPI (data.go.kr - 한국부동산원_청약홈 분양정보 조회 서비스)
- 2순위: 청약홈 파일 데이터 (APT 분양정보, APT 주택형별 분양정보)
- 3순위: LH청약플러스, SH, GH (공공 공급 — 별도 어댑터로 분리)
- 4순위: 부동산114, 분양24 (메타데이터 보강만 허용, 정답 소스 불가)

## 폴더 구조 준수
- lib/sources/       — 외부 소스 어댑터
- lib/normalize/     — 정규화 로직
- lib/diff/          — 변경 감지 로직
- lib/notifications/ — 알림 시스템
- lib/db/            — DB 스키마, 쿼리, 클라이언트
- lib/validators/    — Zod 스키마
- app/api/           — Route Handlers
- app/(pages)/       — 프런트엔드 페이지
