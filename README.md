# Bunyang Tracker (민간 분양 트래킹 서비스)

실시간으로 민간 분양 정보를 수집하고, 청약 일정이나 공고 내용의 변경 사항을 감지하여 사용자에게 알림을 제공하는 서비스입니다.

## 🚀 주요 기능
- **공식 데이터 연동**: 청약홈 OpenAPI를 통해 최신 분양 정보를 자동으로 수집합니다.
* **변경 감지 엔진**: 모집공고일, 청약접수일, 당첨자 발표일 등 주요 필드의 변경을 실시간으로 감지합니다.
- **실시간 알림**: 관심 단지를 팔로우한 사용자에게 Telegram 등을 통해 일정 변경 알림을 즉시 발송합니다.
- **정보 밀집형 대시보드**: 대시보드에서 최근 공고와 변경 피드를 한눈에 확인할 수 있습니다.

## 🛠 기술 스택
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript (Strict Mode)
- **Database**: Supabase (PostgreSQL)
- **ORM**: Drizzle ORM
- **Styling**: Tailwind CSS
- **Validation**: Zod
- **Date Utilities**: date-fns

## 📁 프로젝트 구조
- `lib/sources/`: 외부 API 어댑터 (청약홈 등)
- `lib/normalize/`: 데이터 표준화 및 정규화
- `lib/diff/`: 변경 감지 및 요약 생성 엔진
- `lib/pipeline/`: 수집 및 데이터 처리 파이프라인
- `lib/notifications/`: 다중 채널 알림 발송 시스템
- `app/api/`: 데이터 제공 및 크론 엔드포인트

## ⚙️ 설정 방법

### 1. 환경 변수 설정
`.env.example` 파일을 복사하여 `.env.local`을 생성하고 다음 정보를 입력합니다.
- `DATABASE_URL`: Supabase PostgreSQL 연결 문자열
- `PUBLIC_DATA_API_KEY`: 공공데이터포털 청약홈 API 키
- `TELEGRAM_BOT_TOKEN`: 알림용 텔레그램 봇 토큰

### 2. 데이터베이스 설정
```bash
npm install
npx drizzle-kit generate
npx drizzle-kit push
```

### 3. 로컬 실행
```bash
npm run dev
```

### 4. 수집 실행
관리자 페이지(`/admin/sync`)에서 수동으로 실행하거나, `/api/cron/sync` 엔드포인트를 호출하여 수집을 시작할 수 있습니다.

## 🛡 라이선스
MIT License
