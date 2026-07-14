# Google Sheets 데이터베이스 설정

이 앱은 공고 조회와 수집 결과 저장에 Google Sheets API를 사용합니다. Supabase/PostgreSQL은 최초 데이터 이전 작업에서만 필요합니다.

## 서비스 계정

1. Google Cloud Console에서 `Google Sheets API`를 사용 설정합니다.
2. 서비스 계정을 만들고 JSON 키를 내려받습니다.
3. 빈 Google 스프레드시트를 만든 뒤 서비스 계정의 `client_email` 주소를 편집자로 공유합니다.
4. 시트 URL의 `/d/`와 `/edit` 사이 값을 스프레드시트 ID로 사용합니다.

`.env.local` 설정:

```dotenv
GOOGLE_SHEETS_SPREADSHEET_ID=스프레드시트_ID
GOOGLE_SERVICE_ACCOUNT_EMAIL=서비스계정_email
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
DATABASE_URL=기존_Supabase_PostgreSQL_연결주소
```

서비스 계정 JSON 전체를 Base64로 변환해 `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` 하나로 넣어도 됩니다. 이 경우 email과 private key 변수는 생략할 수 있습니다.

## 초기화와 이전

```bash
npm run sheets:setup
npm run sheets:migrate
```

기본 마이그레이션은 홈페이지 운영에 필요한 데이터와 각 공고의 최신 스냅샷을 옮깁니다. 모든 과거 스냅샷과 원본 API 응답까지 보존하려면 다음 명령을 사용합니다.

```bash
npm run sheets:migrate -- --include-history
```

전체 원본 이전은 Supabase Egress와 Google Sheets 용량을 많이 사용할 수 있으므로 조회용 운영에는 기본 마이그레이션을 권장합니다.

생성되는 탭은 `공고목록`, `수집이력`, `변경이력`, `세대정보`, `스냅샷`, `원본응답`, `알림설정`, `알림발송`입니다. `공고목록`은 단지와 공고 정보를 한 행으로 합쳐 직접 검수하기 쉽게 구성됩니다.

## Vercel

Vercel의 `Settings > Environment Variables`에 아래 값을 등록하고 다시 배포합니다.

```text
GOOGLE_SHEETS_SPREADSHEET_ID
GOOGLE_SERVICE_ACCOUNT_EMAIL
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
```

또는 `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64`를 사용합니다. 마이그레이션 완료 후 Vercel의 `DATABASE_URL`은 제거해도 됩니다. 서비스 계정 키는 저장소에 커밋하지 않고, 시트도 공개하지 않습니다.
