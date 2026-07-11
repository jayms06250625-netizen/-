# 배포 안내 (Vercel)

이 프로젝트는 정적 페이지 + 서버리스 함수(`/api/saju`)로 구성되어 있어서
GitHub Pages가 아니라 **Vercel**에 배포해야 합니다. (GitHub Pages는 정적 파일만 서빙하고,
API 키를 안전하게 숨겨서 실행하는 서버 코드는 실행할 수 없어요.)

## 폴더 구조
```
/
├── index.html          # 허브 페이지
├── orbit/index.html    # Orbit 홈페이지
├── lotto/index.html    # 로또 추첨기 + 사주 AI 챗봇
├── supabase.sql        # Supabase 테이블 생성 SQL
└── api/
    └── saju.js         # OpenAI(gpt-5.4-mini) 호출 + Supabase 저장용 서버리스 함수
```

## 1. Supabase 테이블 만들기
1. https://supabase.com 에서 프로젝트 생성 (또는 기존 프로젝트 사용)
2. 프로젝트 → **SQL Editor** → New query 에서 `supabase.sql` 내용을 그대로 실행
3. 완성되면 `saju_draws` 테이블이 생기고, RLS는 켜져 있지만 공개 정책은 없음 (= 브라우저에서는 절대 접근 불가, 서버의 service role key로만 쓰기 가능)

## 2. GitHub에 push
이 폴더 전체(구조 그대로)를 저장소 루트에 올려주세요.

## 3. Vercel에서 프로젝트 연결
1. https://vercel.com 에서 새 프로젝트 생성 → 방금 push한 GitHub 저장소 선택
2. Framework Preset은 "Other"로 두면 됩니다 (별도 빌드 설정 불필요)

## 4. 환경 변수 설정 (중요)
Vercel 프로젝트 → **Settings → Environment Variables** 에서 추가:

| Key | Value |
|---|---|
| `OPENAI_API_KEY` | OpenAI에서 발급받은 API 키 |
| `SUPABASE_URL` | Supabase 프로젝트 Settings → API 에 있는 Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 프로젝트 Settings → API 에 있는 `service_role` 키 (⚠️ `anon` 키 아님) |

Production / Preview / Development 환경 모두에 체크해두면 편해요.
저장 후에는 **Redeploy**를 한 번 해줘야 새 환경 변수가 반영됩니다.

⚠️ `service_role` 키는 RLS를 완전히 우회하는 강력한 키입니다. 절대 프론트엔드 코드(`.html`, 브라우저에서 실행되는 JS)에는 넣지 마세요. 이 프로젝트에서는 `api/saju.js`(서버에서만 실행)에서만 사용합니다.

## 5. 배포 확인
배포가 끝나면:
- `https://<프로젝트>.vercel.app/` → 허브 페이지
- `https://<프로젝트>.vercel.app/lotto/` → 로또 추첨기 (사주 챗봇 포함)
- `https://<프로젝트>.vercel.app/api/saju` → 서버리스 함수 (POST 전용, 직접 접속하면 405)

## 참고
- API 키는 절대 브라우저(프론트엔드) 코드에 넣지 않았습니다. `api/saju.js`는 서버에서만 실행되며,
  브라우저는 `/api/saju`에 생년월일/시간만 보내고 결과(JSON)만 받아옵니다.
- 사용 모델: `gpt-5.4-mini` (OpenAI Responses API, structured output으로 JSON 형식 강제)
