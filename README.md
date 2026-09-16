# LUMIA · 이터널 리턴 전적 분석실

`ER-Search-Reviewer` · 2026 Eternal Return 검색 / 평가

문서 갱신일: 2026-09-16. 검증 날짜와 범위는 아래 [검증](#검증)에 정리합니다.

닉네임으로 이터널 리턴 전적을 조회하고, 선택한 경기의 지표를 분석해 개인 리뷰를 제공하는 웹 프로젝트입니다.

현재 버전은 **개인 PC에서 사용하는 로컬 사이트**입니다. ER API 키 없이 예시 20경기와 기본 리뷰를 실행할 수 있습니다. 로그인된 Codex 계정으로 예시 전적을 분석하는 흐름도 실제 검증했습니다. 현재 ER 키로 실제 닉네임 검색·최근 경기·현재 시즌 랭크 조회까지 확인했습니다.

## 전적 대시보드

캐릭터·장비·특성·전술 스킬 이미지, 시즌별 RP·순위, 날짜별 점수 그래프, 12개 상세 지표, 실험체별 성적을 표시합니다. 시즌을 선택하면 API에서 제공하는 해당 시즌 경기를 끝까지 순서대로 불러오며 일시 중지·이어서 불러오기를 지원합니다. 공식 누적 성적과 실제 확보한 경기 수를 구분해 표시합니다. 기존 모드·실험체 필터와 Codex 리뷰도 사용할 수 있습니다.

이미지 목록은 공개 DAK.GG 카탈로그의 스냅샷이며 `npm run sync:assets`로 갱신할 수 있습니다. 공식 API의 경기 종료 RP가 없는 경우 증감 그래프로 표시하고, 데미갓·이터니티 판정에 필요한 정보가 없으면 미스릴 이상으로 표시합니다. 자세한 데이터 기준은 [대시보드 조사 기록](docs/research/player-dashboard.md)에 있습니다.

- 점수 그래프는 **시즌 전체**가 기본이며 최근 7일·30일·90일도 선택할 수 있습니다. 한국 시간의 경기 시작일별 마지막 경기 종료 RP 또는 일별 RP 증감 합계를 표시합니다. RP 선은 기록이 없는 날짜 사이에도 이어지며, 누락된 날짜의 점수 자체를 만들어 채우지는 않습니다.
- 경기 목록·상세 지표·실험체별 성적·리뷰에는 모드·실험체 필터를 적용합니다. 상단 랭크는 선택 시즌의 공식 누적 성적이며, 점수 그래프는 해당 시즌에서 확보한 랭크 스쿼드 경기 전체를 기준으로 합니다.
- 실험체별 성적은 승률, RP 증감, 경기 수, 평균 TK / K, 평균 딜량, 평균 시야 점수, 평균 동물 딜량으로 구성합니다. RP 증감은 점수가 제공된 랭크 경기의 합계입니다.
- 경기 색상은 1등 라임색을 유지하고, 그 외에는 탈출 성공 초록색 → 탈출 실패 빨간색 → 2~3등 파란색 순서로 적용합니다. 나머지 경기의 기존 색상은 유지하며, 순위 흐름 섹션은 제거했습니다.

## 실행

Node.js **22.13 이상**이 필요합니다. 현재 검증 환경은 Windows, Node.js 22.17.0입니다.

```bash
npm run install:ci
npm run dev
```

브라우저에서 **http://localhost:5173/** 을 여세요. 처음에는 `루미아연구원`이라는 가상 플레이어의 기록이 표시됩니다.

현재 작업 폴더에는 의존성 설치를 완료했습니다. 다시 실행할 때는 `npm run dev`만 사용하면 됩니다.

Windows PowerShell에서 `npm.ps1` 실행 정책 오류가 나면 `npm.cmd run dev`를 사용하세요. 현재 폴더의 `&` 문자 때문에 npm 설치 명령이 깨지는 문제는 `scripts/install-ci.mjs`가 Windows에서 PowerShell 설치 쉘을 선택하도록 해결했습니다. 다시 설치할 때는 `npm ci` 대신 위의 `npm run install:ci`를 권장합니다.

## Codex 계정으로 AI 리뷰

현재 작업 폴더는 `AI_PROVIDER=codex`로 설정되어 있습니다. **OpenAI API 키는 필요하지 않습니다.** 이 PC에 설치된 Codex의 ChatGPT 로그인을 사용하며, 리뷰에는 해당 계정의 Codex 사용 한도가 적용됩니다.

새 PC에서 시작할 때는 다음 순서로 설정하세요.

```bash
codex login
npm run setup:codex
npm run dev
```

현재 작업 폴더는 Codex 연결 설정을 완료했습니다. `npm run dev`로 사이트와 Codex 연결 서버가 함께 켜지며, 로그인 상태는 화면의 연결 안내로 확인할 수 있습니다. 개발 서버와 `npm start`는 같은 Codex 연결 포트를 사용하므로 한 번에 하나만 실행하세요.

- 실제 전적을 조회한 뒤 **Codex 리뷰 만들기**를 누르면 선택한 경기 범위를 분석합니다.
- Codex 연결이 준비되면 예시 화면에서 **예시 전적으로 Codex 테스트**를 눌러 가상 기록으로 확인할 수 있습니다. ER 키 발급 여부와 관계없이 사용할 수 있으며, 이 버튼도 Codex 사용 한도를 사용합니다.
- 일반 예시 분석 API는 기본 분석을 사용합니다. 명시적인 `codexTest:true` 요청만 예시 데이터를 실제 Codex로 보냅니다. 자동 테스트는 모의 API 응답·Codex 프로세스로 동작하며 실제 모델을 호출하지 않습니다.
- 로그인·연결·사용 한도 오류가 나면 기본 분석으로 전환하고 실패 사실을 표시합니다. 유료 OpenAI API로 자동 전환하지 않습니다.
- 로그인 후에는 사이트를 새로고침하세요. 로그인이 풀렸다면 `codex login`을 실행하세요.

`setup:codex`는 기존 ER 키를 보존하고 `.env`에 로컬 브리지 주소와 무작위 연결 토큰을 추가합니다. 이 토큰은 사이트 서버와 로컬 연결 서버 사이의 인증용이며, **ChatGPT 로그인 토큰이나 OpenAI API 키가 아닙니다.** Codex 로그인 정보는 Codex가 직접 관리합니다.

자세한 구조와 제약은 [Codex 연결 안내](docs/codex-setup.md)를 참고하세요.

## 실제 전적 API 연결

`.env.example`을 참고해 **프로젝트 루트 `.env`**에 값을 입력하세요. 기존 Codex 연결 설정은 유지하세요.

```dotenv
ER_API_KEY=발급받은_이터널리턴_API키
```

- `ER_API_KEY`: [이터널 리턴 공식 개발자 포털](https://developer.eternalreturn.io/)에서 발급받습니다. 실제 닉네임 전적 조회에 필요합니다.
- 발급·접근 안내는 [공식 시작 안내](https://developer.eternalreturn.io/getting-started)를 참고하세요.
- 현재 구현은 공식 API 요청 사이에 1.1초 간격을 둡니다.

환경 변수를 변경한 뒤 개발 서버를 다시 시작하세요. 키는 브라우저 입력창에 넣지 않습니다. `.env`는 Git에서 제외되고 키는 서버에서만 사용됩니다.

2026-09-14에 현재 ER 키로 실제 닉네임·최근 경기·시즌·랭크 조회 성공을 확인했습니다. 이후 `물방개` 시즌 12의 랭크 170경기를 33페이지로 확보해 공식 누적 170경기와 일치함을 확인했습니다. 초기 `403`은 당시의 오류 기록이며, 현재 연결 실패를 뜻하지 않습니다. 정상 닉네임을 찾지 못하던 문제도 실제 응답의 `userId` 필드를 지원하도록 수정했습니다.

| 설정              | 동작                                    |
| ----------------- | --------------------------------------- |
| ER 키 없음        | 가상 20경기·기본 분석·명시적 Codex 테스트 |
| ER 키 + Codex 로그인 | 실제 전적 조회·Codex 도구 호출 리뷰     |
| `AI_PROVIDER=rules` | 실제 수치 기반 기본 분석               |
| AI 오류·응답 실패 | 오류 사실을 명시하고 기본 분석으로 전환 |

기존 OpenAI API 방식도 선택할 수 있습니다. 이 경우에만 `AI_PROVIDER=openai`, `OPENAI_API_KEY`, `OPENAI_MODEL`을 설정합니다. 기본 API 모델은 `gpt-4.1-mini`이며 API 요금은 Codex 구독과 별도입니다.

## Cloudflare 공개 배포 준비

공개용 Worker 설정과 공유 저장·요청 제한을 구현했습니다. **실제 Cloudflare 업로드와 공개 주소 발급은 아직 하지 않았습니다.** 계정 연결, 기존 GitHub 저장소 연결, Secret 등록과 실제 배포 절차는 [Cloudflare 배포 안내](docs/cloudflare-deployment.md)에 정리했습니다.

```bash
npm run build:public     # dist-public에 공개용 빌드
npm run check:deploy     # 업로드 없이 Wrangler dry-run
npm run preview:public   # http://127.0.0.1:8788에서 예시 데이터로 확인
```

공개용 실행은 루트 `.env`와 로컬 Codex 브리지를 읽지 않습니다. 기존 `npm run dev`의 Codex 연결은 유지합니다. 공개 버전은 `AI_PROVIDER=rules`가 기본이며, OpenAI 리뷰를 켜려면 명시적인 `openai` 설정, Cloudflare의 `OPENAI_API_KEY` Secret, 양수인 `AI_DAILY_LIMIT`이 모두 필요합니다. 공개 서버의 `codex` 설정은 거부합니다.

- 전적·페이지·조회 커서를 Durable Object의 SQLite에 저장하여 Worker가 바뀌거나 재시작되어도 이어서 조회합니다. 마지막 조회부터 30분, 최대 200개 세션을 유지하는 임시 저장소입니다.
- 같은 닉네임·시즌 검색은 60초 동안 공유하고, 공식 ER API 호출 시작 간격 1.1초를 사이트 전체에서 관리합니다.
- 검색은 IP별 분당 6회, 다음 경기 페이지는 60회, 리뷰는 3회입니다. 사이트 전체 제한과 리뷰 동시 2개 제한도 적용합니다.
- 유료 AI 리뷰는 UTC 하루 전체 건수와 IP별 최대 10회 제한을 적용합니다. 실패·중단된 시도도 집계하며 금액 기준 결제 상한을 보장하는 기능은 아닙니다.
- 같은 ER 키로 별도 로컬 서버나 다른 배포를 동시에 조회하면 실행 환경 사이의 호출 간격은 공유되지 않습니다.

로컬 공개용 검사에는 빈 키의 `cloudflare/public.env.example`을 사용합니다. 실제 키는 이 파일에 넣지 않고 Cloudflare Secret에 등록합니다. 회원 로그인과 시즌 기록의 영구 아카이브는 구현하지 않았습니다.

## 기능

- 현재 닉네임 → 문자열 UID → 최근 경기 조회
- 평균 순위, 승률, 평균 처치·어시스트·피해량 계산
- 모드·실험체 필터를 경기 목록·통계·리뷰에 함께 적용
- 경기 상세의 K/D/A, 피해량, 플레이 시간, 야생동물 처치, 제공된 RP 변화
- 시즌 선택·전적 순차 수집·일시 중지·이어서 불러오기
- 날짜별 RP·증감 그래프(시즌 전체·7/30/90일), 경기 결과 색상, 실험체별 7개 성적 지표
- 종합·교전·생존·실험체 주제별 리뷰 및 실행 도구 내역
- 캐시, 강제 새로고침, 누락 수치·빈 결과·인증·호출 제한 안내
- 데스크톱·모바일 레이아웃, 키보드 조작, 선택 상태 및 로딩 표시
- 지원 브라우저에서 `search_player_records` WebMCP 도구로 동일 검색 흐름 실행

예시 데이터는 항상 `DEMO`로 표시됩니다. 실서비스 검색 오류를 가상 검색 결과로 바꾸지 않습니다.

## 에이전트 구조

```text
브라우저
  ├─ GET /api/player → 닉네임 검증 → ER API → 정규화·캐시 → 전적
  ├─ GET /api/player/history → 조회 세션·커서 확인 → 다음 경기 묶음
  └─ POST /api/review → 요청 검증 → 서버 전적 확보 → 필터
                                               ↓
             기본 분석: 주제별 도구 선택 → 지표 계산 → 근거·다음 행동
             AI 분석: 등록 도구 → 모델의 function_call → 도구 실행
                              → function_call_output → 구조화 리뷰
             Codex 분석: 인증된 로컬 브리지 → Codex App Server
                       → item/tool/call → 동일 분석 도구 → 구조화 리뷰
```

| 등록 도구            | 역할                                    |
| -------------------- | --------------------------------------- |
| `get_recent_matches` | 조회 범위와 최근 경기 확인              |
| `analyze_combat`     | 처치·사망·어시스트·피해량·분당 피해량   |
| `analyze_survival`   | 승률·평균 순위·시간·최근/이전 구간 변화 |
| `analyze_characters` | 실험체별 표본 수와 기록 비교            |

`lib/server/review-tools.ts`의 `TOOL_REGISTRY`는 분석 도구를 정의하고, `selectTools()`는 사용자가 선택한 리뷰 주제에 따라 허용 도구를 결정합니다. Codex 방식은 이 도구들을 `dynamicTools`로 등록하고 모델이 등록된 분석 도구를 모두 호출하도록 지시하며, 실제 호출 여부도 검사합니다. OpenAI API 방식은 등록된 도구 안에서 모델의 함수 호출을 처리합니다. 기본 분석은 서버가 같은 도구를 직접 실행합니다. 등록되지 않은 이름이나 비어 있지 않은 도구 인자는 거부하며, AI 결과는 스키마를 검증한 후 표시합니다.

브라우저에서 통계 값을 보내도 리뷰 입력으로 허용하지 않습니다. 서버가 원본 전적을 다시 확보해 분석합니다. 모델 입력에서 닉네임·UID는 제외합니다. Codex는 임시 작업에서 최대 6회 분석 도구 호출과 전체 180초 제한을 적용합니다. OpenAI API 방식은 `store:false`, 최대 응답 요청 4회·도구 호출 6회·회당 출력 1,800토큰을 적용합니다.

## 주요 파일

```text
app/page.tsx                 화면과 검색·필터·리뷰 상태
app/globals.css              반응형 다크 테마
app/api/config/route.ts      키 설정 여부·AI 공급자·Codex 연결 상태
app/api/player/route.ts      전적 조회 HTTP API
app/api/player/history/route.ts  시즌 전적 이어 불러오기 HTTP API
app/api/review/route.ts      리뷰 HTTP API, 입력·원본 검사와 제한
lib/server/api-handlers.ts   로컬·공개 공통 HTTP 검증·리뷰 공급자 선택
lib/server/state-store.ts    메모리·SQLite 저장소와 원자적 페이지 저장
lib/server/request-gate.ts   ER API 호출 간격과 대기열 제한
lib/server/public-limits.ts  공유 요청 제한·리뷰 슬롯·AI 일일 건수
workers/app.ts              공개 Worker 진입점·신뢰 가능한 IP 전달
workers/public-coordinator.ts  공유 전적·API 제한 Durable Object
cloudflare/wrangler.jsonc   공개 Worker·SQLite 바인딩·기본 분석 설정
vite.public.config.ts       개인 환경과 분리된 공개용 빌드
scripts/public-worker.mjs   공개 빌드·로컬 미리보기·dry-run·배포 명령
components/dashboard-parts.tsx  경기 상세·리뷰 표시
components/player-overview.tsx  시즌 랭크·날짜별 그래프·실험체별 성적
components/game-image.tsx    게임 이미지·누락 시 대체 표시
lib/types.ts                전적 및 리뷰 공통 타입
lib/analysis.ts             순수 통계·필터 계산
lib/player-metrics.ts       상세 지표·날짜별 RP 집계
lib/season-history.ts       시즌 경계·경기 병합·중복 제거
lib/rank-tier.ts            현재 시즌 RP 기반 티어 계산
lib/game-assets.ts          게임 이미지·이름 카탈로그 조회
lib/generated/game-assets.json  게임 이미지 카탈로그 스냅샷
lib/demo.ts                 명시적으로 가상인 예시 데이터
lib/server/er-api.ts         공식 API·현지화·캐시·시즌 조회 상태
lib/server/player-service.ts 예시/실제 데이터 선택
lib/server/review-tools.ts   도구 등록·선택·기본 리뷰
lib/server/reviewer.ts       리뷰 범위·공급자 선택·OpenAI 도구 호출·실패 대체
lib/server/codex-client.ts   Worker → 로컬 Codex 연결
scripts/codex/               로컬 HTTP 브리지·Codex App Server 프로토콜
tests/analysis.test.mjs      통계·연결·도구 호출 테스트
tests/codex.test.mjs         인증·도구 실행·실패·로컬 접근 제어 테스트
tests/player-dashboard.test.mjs  상세 지표·RP·결과 색상·시즌 랭크 테스트
tests/season-history.test.mjs  시즌 조회·재개·중복 제거·리뷰 범위 테스트
tests/public-server.test.mjs  SQLite 복원·원자성·공유 제한·공개 HTTP 테스트
scripts/smoke.mjs            실행 중인 HTTP API 확인
docs/                       개발 기록·API 조사·연결 안내 문서
```

React 19, TypeScript, Next.js 호환 App Router(Vinext), Radix UI, Tailwind CSS, Zod, Recharts를 사용합니다. 공개용은 Cloudflare Workers와 Durable Object의 SQLite 저장소를 사용합니다. 사이트 회원 로그인·실제 외부 배포·설치형 프로그램은 현재 버전에 포함하지 않았습니다. Codex 계정 로그인은 로컬 리뷰 연결에 사용합니다.

## 검증

```bash
npm run typecheck
npm test
npm run lint
npm run build
# 개발 서버가 localhost:5173 에서 실행 중일 때
node scripts/smoke.mjs
```

단위 테스트는 외부 API 대신 모의 응답을 사용합니다. 0과 미제공 값을 구분하는지, 필터 범위가 일치하는지, 올바른 UID 경로를 호출하는지, 도구 선택과 call_id 연결·AI 실패 대체가 동작하는지 검증합니다. 실제 계정 키의 유효성이나 상류 서비스의 현재 상태를 검증하는 테스트는 아닙니다.

| 검증 범위 | 최근 확인일 | 결과 |
| --- | --- | --- |
| 자동 테스트·타입 검사 | 2026-09-16 | 41개 테스트와 타입 검사 통과. SQLite 재연결·페이지 복원·공유 호출 제한·공개 입력 검증 포함. 실제 ER·AI API 호출 없음 |
| lint | 2026-09-16 | 오류·경고 없이 통과 |
| 공개용 빌드·배포 dry-run·로컬 HTTP | 2026-09-16 | 공개용 HTML·예시 20경기·기본 리뷰·입력 검증·헤더 위조 시 호출 제한·연속 오류 응답 검사 통과. 기존 로컬 서버 HTTP 회귀 검사도 통과. 실제 업로드 없음 |
| lint·빌드·로컬 HTTP 검사 | 2026-09-14 | 시즌 조회 구현 후 통과. RP 선 연결 수정 후 타입 검사·빌드도 통과 |
| 실제 ER API 조회 | 2026-09-14 | 닉네임·시즌 랭크 조회, 물방개 시즌 12 랭크 170경기 확보 확인 |
| 실제 Codex 연결 | 2026-09-14 | 예시 전적을 사이트 API로 분석해 `engine=codex`와 도구 실행 확인 |

실제 전적 조회와 Codex 예시 리뷰는 각각 검증했습니다.

실제 Codex 계정 연결 검증은 별도로 `npm run test:codex-live`를 실행합니다. 실행 중인 사이트에서 예시 일반 경기 3개를 분석하며 **Codex 사용 한도를 사용합니다**. 이 검증은 2026-09-14에 통과했습니다.

`npm run build`는 배포용 결과를 `dist`에 생성합니다. `npm start`로 빌드된 Worker 서버를 로컬에서 실행할 수 있습니다(기본 http://127.0.0.1:8787). `node scripts/smoke.mjs http://127.0.0.1:8787`로 이 서버도 검증할 수 있습니다. 실제 외부 배포·도메인 연결은 별도 단계입니다. 개발 중 미리보기에는 `npm run dev`를 사용하세요.

## 데이터 한계

- 최근 90일 및 현재 닉네임 사용 기간 안에서 공식 API가 반환한 경기만 다룹니다.
- 실제 응답의 `next`와 `?next=` 요청으로 이전 경기를 조회하는 동작을 검증했습니다. 시즌별 기록에는 기존 100경기 제한이 없으며, 개인키 호출 간격을 지키면서 끝까지 수집합니다. 경기 더 보기는 확보한 기록을 펼칩니다.
- 상세 기록은 API의 90일·닉네임 변경 제한을 받습니다. API에서 제공하는 기록을 모두 가져와도 시즌 전체와 다를 수 있으며 과거 기록을 임의로 복원하지 않습니다. 장기 기록 보존용 데이터베이스는 아직 없습니다.
- 로컬 조회 기록은 메모리에서 마지막 조회부터 30분·최대 20개 세션을 유지하고 재시작 시 사라집니다. 공개용은 SQLite에서 30분·최대 200개 세션을 유지하여 재시작 후에도 복원합니다. 오류·일시 중지 후에는 마지막 위치부터 이어서 가져올 수 있으며, 만료·삭제된 조회는 새로고침이 필요합니다.
- 리뷰는 선택한 시즌·모드·실험체에서 최근 최대 100경기를 분석하며, 화면과 결과에 해당 범위를 표시합니다.
- 공식 시즌 누적 경기 수·승률·평균 TK는 표시합니다. 상세 경기의 전체 확보는 보장하지 않으며, 동티어 평균과의 비교는 제공하지 않습니다. 리뷰의 순위 구간 비교에는 양 구간에 각각 유효한 순위가 최소 3개 필요합니다.
- 전적 수치로 동선·시야·포지셔닝·패배 원인을 확정할 수 없습니다. 리뷰의 행동 제안은 사용자가 직접 확인할 가설입니다.
- 실험체·장비·특성·전술 스킬·티어 이미지는 공개 DAK.GG 카탈로그와 CDN을 통해 표시합니다. 이미지 누락·연결 실패는 대체 표시를 사용하며, 이름 현지화 실패 시 실험체 코드를 표시합니다. 과거 패치별 이미지·이름을 복원하지는 않습니다.
- 로컬 요청 제한은 인스턴스 기준이며 공개용은 Durable Object에서 공유합니다. 공개용 제한과 AI 일일 건수도 재시작 후 유지됩니다. 실제 Cloudflare 배포·ER 연결·동시 이용 성능은 아직 검증하지 않았습니다. 개인키의 호출량과 무료 Workers CPU 한도 때문에 많은 사용자에게 즉시 응답하는 서비스는 보장하지 않습니다.

## 개발 문서

- [API 조사 및 출처](docs/research/eternal-return-api.md)
- [개발 과정](docs/development.md)
- [대시보드 데이터 기준](docs/research/player-dashboard.md)
- [Codex 연결 안내](docs/codex-setup.md)
- [Cloudflare 배포 안내](docs/cloudflare-deployment.md)

## GitHub 저장소

소스 저장소: [jiho08/ER-Search-Reviewer](https://github.com/jiho08/ER-Search-Reviewer)

2026-09-15에 코드·문서 144개 파일을 `main`에 업로드하고 원격 커밋을 확인했습니다. 현재 작업 폴더의 `origin`도 이 저장소에 연결했습니다. 기존 GitHub README의 프로젝트명과 소개를 이 문서에 반영했으며, 기존 저장소 이력과 로컬 개발 이력을 함께 보존했습니다.

이후 수정할 때는 README도 갱신한 뒤 변경 사항을 확인하고 커밋·업로드합니다. `.env`, 실행 캐시, `node_modules`, 빌드 결과는 Git에서 제외하며 실제 키가 없는 `.env.example`과 `cloudflare/public.env.example`을 공유합니다. GitHub 코드 업로드는 웹사이트의 외부 배포와 별개입니다.

## 문서 유지보수

수정 작업마다 기능·화면·실행법·설정·제약·검증 결과 중 달라진 내용을 이 README에 함께 반영합니다. 개발 경위는 `docs/development.md`에 기록하며, 연결된 안내 문서와 현재 상태가 어긋나지 않도록 확인합니다. 실행하지 않은 검사는 통과로 기록하지 않고, 과거 검증은 날짜와 범위를 유지합니다. 이후 작업 지침은 [AGENTS.md](AGENTS.md)에 정리했습니다.

이터널 리턴은 Nimble Neuron의 게임입니다. 이 프로젝트는 비공식 개인 학습 프로젝트입니다.
