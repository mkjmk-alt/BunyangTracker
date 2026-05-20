---
name: phase2-frontend
description: Phase 2 — Next.js 프런트엔드 전체 구축 (목록, 상세, 캘린더, 변경이력)
---

# Phase 2: 프런트엔드 구축

Phase 1 데이터 레이어가 완성된 상태에서 진행한다.
UI는 화려함보다 정보 탐색 효율을 최우선으로 한다.
다음 페이지와 컴포넌트를 실제로 생성하라.

## 디자인 원칙
- Tailwind CSS 사용
- 라이트/다크 모드 모두 지원
- 모바일 우선 반응형
- 정보 밀도 높은 대시보드 스타일 (Linear, Vercel 참고)
- 상태 배지, 날짜 가독성, 필터 UX 우선

## 페이지 1: 홈 대시보드 (app/page.tsx)
- 오늘/이번 주 신규 공고 수 KPI 카드
- 일정 변경 건수 KPI 카드
- 무순위/잔여세대 신규 건수 KPI 카드
- 최근 변경 이벤트 피드 (diff_summary 표시)
- 이번 주 청약 일정 요약 (접수 시작/종료/발표일 기준)

## 페이지 2: 분양 목록 (app/projects/page.tsx)
- 필터 사이드바 또는 상단 필터바
  - 지역 (시도 → 시군구 연동)
  - 공급유형 (APT, 오피스텔, 민간임대, 무순위)
  - 상태 (UPCOMING, OPEN, CLOSED)
  - 날짜 범위 (모집공고일 기준)
  - 검색어
- 공고 카드 목록
  - 단지명, 지역, 공급유형 배지, 상태 배지
  - 접수 시작일 / 발표일 표시
  - 무순위 여부 강조
- 페이지네이션

## 페이지 3: 분양 상세 (app/projects/[slug]/page.tsx)
- 단지 기본 정보 (이름, 지역, 시공사, 총 세대수)
- 공고 요약 (공급유형, 상태, 공고번호)
- 일정 타임라인
  - 모집공고일 → 청약접수 → 당첨발표 → 계약 → 입주 순
  - 현재 단계 강조
- 주택형별 정보 테이블
  - 주택형, 전용면적, 공급면적, 일반공급 세대수, 특별공급 세대수, 분양가
- 변경 이력 섹션
  - 최신 change_events 리스트
  - diff_summary + detected_at 표시
- 관심 등록 버튼 (팔로우)
- 원문 공고 링크 (청약홈)

## 페이지 4: 청약 캘린더 (app/calendar/page.tsx)
- 월 단위 캘린더 뷰
- 날짜별 일정 이벤트 (접수 시작, 접수 종료, 발표일, 계약일)
- 각 이벤트 클릭 시 단지 상세 이동
- 월 이동 버튼

## 페이지 5: 변경 이력 (app/changes/page.tsx)
- 최신순 변경 이벤트 피드
- 이벤트 유형 필터 (일정변경, 신규공고, 무순위오픈, 취소)
- severity 필터 (info, important, critical)
- diff_summary 한국어 표시
- 단지명 클릭 → 상세 이동

## 컴포넌트 (components/)
- AnnouncementCard.tsx — 공고 카드
- StatusBadge.tsx — 상태 배지 (UPCOMING/OPEN/CLOSED/CANCELLED)
- SupplyTypeBadge.tsx — 공급유형 배지
- ScheduleTimeline.tsx — 일정 타임라인
- UnitTable.tsx — 주택형 테이블
- ChangeEventItem.tsx — 변경 이벤트 아이템
- FilterSidebar.tsx — 필터 사이드바
- RegionSelector.tsx — 지역 선택 (시도→시군구)
- CalendarView.tsx — 캘린더 뷰
- FollowButton.tsx — 팔로우 버튼
- KpiCard.tsx — KPI 카드
- EmptyState.tsx — 빈 상태 (애니메이션 포함)
- SkeletonCard.tsx — 로딩 스켈레톤

## 상태 처리
- Loading: Skeleton 컴포넌트
- Empty: EmptyState 컴포넌트 (아이콘 + 안내 문구 + CTA)
- Error: 에러 메시지 + 재시도 버튼
