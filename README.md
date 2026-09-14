# LUMIA · 이터널 리턴 전적 분석실

닉네임으로 이터널 리턴 전적을 조회하고, 선택한 경기의 지표를 분석해 개인 리뷰를 제공하는 웹 프로젝트입니다. 수행평가의 **AI 에이전트 서버·도구 등록·도구 선택** 요구사항을 포함합니다.

현재 버전은 **로컬 개발용 첫 구현**입니다. API 키 없이 예시 20경기와 기본 리뷰를 실행할 수 있습니다. 실제 전적 조회와 AI 연결 코드는 구현되어 있지만 발급 키를 이용한 실서비스 검증은 아직 필요합니다.

## 실행

Node.js **22.13 이상**이 필요합니다. 현재 검증 환경은 Windows, Node.js 22.17.0입니다.

```bash
npm run install:ci
npm run dev
```

브라우저에서 **http://localhost:5173/** 을 여세요. 처음에는 `루미아연구원`이라는 가상 플레이어의 기록이 표시됩니다.

현재 작업 폴더에는 의존성 설치를 완료했습니다. 다시 실행할 때는 `npm run dev`만 사용하면 됩니다.

Windows PowerShell에서 `npm.ps1` 실행 정책 오류가 나면 `npm.cmd run dev`를 사용하세요. 현재 폴더의 `&` 문자 때문에 npm 설치 명령이 깨지는 문제는 `scripts/install-ci.mjs`가 Windows에서 PowerShell 설치 쉘을 선택하도록 해결했습니다. 다시 설치할 때는 `npm ci` 대신 위의 `npm run install:ci`를 권장합니다.

## 실제 전적과 AI 연결

`.env.example`을 참고해 **프로젝트 루트 `.env`**에 값을 입력하세요. 현재 `.env`에는 빈 설정 항목이 준비되어 있습니다.

```dotenv
ER_API_KEY=발급받은_이터널리턴_API키
OPENAI_API_KEY=발급받은_OpenAI_API키
OPENAI_MODEL=gpt-4.1-mini
```

- `ER_API_KEY`: [이터널 리턴 공식 개발자 포털](https://developer.eternalreturn.io/)에서 발급받습니다. 실제 닉네임 전적 조회에 필요합니다.
- `OPENAI_API_KEY`: 선택 사항입니다. 실제 전적에 대해 AI가 분석 도구를 선택하고 리뷰를 작성합니다. 별도 API 사용 비용이 발생할 수 있습니다.
- `OPENAI_MODEL`: 사용 가능한 Responses API·function calling·구조화 출력 지원 모델로 변경할 수 있습니다.

환경 변수를 변경한 뒤 개발 서버를 다시 시작하세요. 키는 브라우저 입력창에 넣지 않습니다. `.env`는 Git에서 제외되고 키는 서버에서만 사용됩니다. 예시 모드는 키가 있어도 유료 AI를 호출하지 않습니다.

| 설정              | 동작                                    |
| ----------------- | --------------------------------------- |
| 키 없음           | 가상 20경기·필터·상세·기본 분석         |
| ER 키만 설정      | 실제 전적 조회·실제 수치 기반 기본 분석 |
| ER 키 + OpenAI 키 | 실제 전적 + AI 도구 호출 리뷰           |
| AI 오류·응답 실패 | 오류 사실을 명시하고 기본 분석으로 전환 |

## 기능

- 현재 닉네임 → 문자열 UID → 최근 경기 조회
- 평균 순위, 승률, 평균 처치·어시스트·피해량 계산
- 모드·실험체 필터를 경기 목록·통계·리뷰에 함께 적용
- 경기 상세의 K/D/A, 피해량, 플레이 시간, 야생동물 처치, 제공된 RP 변화
- 실험체별 통계와 최근 최대 20경기의 순위 흐름
- 종합·교전·생존·실험체 주제별 리뷰 및 실행 도구 내역
- 캐시, 강제 새로고침, 누락 수치·빈 결과·인증·호출 제한 안내
- 데스크톱·모바일 레이아웃, 키보드 조작, 선택 상태 및 로딩 표시
- 지원 브라우저에서 `search_player_records` WebMCP 도구로 동일 검색 흐름 실행

예시 데이터는 항상 `DEMO`로 표시됩니다. 실서비스 검색 오류를 가상 검색 결과로 바꾸지 않습니다.

## 에이전트 구조

```text
브라우저
  ├─ GET /api/player → 닉네임 검증 → ER API → 정규화·캐시 → 전적
  └─ POST /api/review → 요청 검증 → 서버 전적 확보 → 필터
                                               ↓
             기본 분석: 주제별 도구 선택 → 지표 계산 → 근거·다음 행동
             AI 분석: 등록 도구 → 모델의 function_call → 도구 실행
                              → function_call_output → 구조화 리뷰
```

| 등록 도구            | 역할                                    |
| -------------------- | --------------------------------------- |
| `get_recent_matches` | 조회 범위와 최근 경기 확인              |
| `analyze_combat`     | 처치·사망·어시스트·피해량·분당 피해량   |
| `analyze_survival`   | 승률·평균 순위·시간·최근/이전 구간 변화 |
| `analyze_characters` | 실험체별 표본 수와 기록 비교            |

`lib/server/review-tools.ts`의 `TOOL_REGISTRY`와 `selectTools()`가 등록 및 주제별 선택을 담당합니다. AI는 선택된 도구 중 필요한 도구를 직접 호출합니다. 등록되지 않은 이름이나 비어 있지 않은 도구 인자는 거부합니다. AI 결과도 스키마를 검증한 후 표시합니다.

브라우저에서 통계 값을 보내도 리뷰 입력으로 허용하지 않습니다. 서버가 원본 전적을 다시 확보해 분석합니다. 모델 입력에서 닉네임·UID는 제외합니다. 응답에 `store:false`를 사용하고 최대 응답 요청 4회·도구 호출 6회·회당 출력 1,800토큰으로 제한합니다.

## 주요 파일

```text
app/page.tsx                 화면과 검색·필터·리뷰 상태
app/globals.css              반응형 다크 테마
app/api/config/route.ts      키 설정 여부만 반환
app/api/player/route.ts      전적 조회 HTTP API
app/api/review/route.ts      리뷰 HTTP API, 입력·원본 검사와 제한
components/dashboard-parts.tsx  경기 상세·리뷰 표시
lib/types.ts                전적 및 리뷰 공통 타입
lib/analysis.ts             순수 통계·필터 계산
lib/demo.ts                 명시적으로 가상인 예시 데이터
lib/server/er-api.ts         공식 API 어댑터·현지화·캐시
lib/server/player-service.ts 예시/실제 데이터 선택
lib/server/review-tools.ts   도구 등록·선택·기본 리뷰
lib/server/reviewer.ts       OpenAI 함수 호출 루프·실패 대체
tests/analysis.test.mjs      통계·연결·도구 호출 테스트
scripts/smoke.mjs            실행 중인 HTTP API 확인
docs/                       개발 기록·API 조사·과제 준비 문서
```

React 19, TypeScript, Next.js 호환 App Router(Vinext), Radix UI, Tailwind CSS, Zod를 사용합니다. 기본 구조의 Cloudflare Worker 빌드를 유지했습니다. 데이터베이스·로그인·외부 배포는 현재 버전에 포함하지 않았습니다.

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

`npm run build`는 배포용 결과를 `dist`에 생성합니다. `npm start`로 빌드된 Worker 서버를 로컬에서 실행할 수 있습니다(기본 http://127.0.0.1:8787). `node scripts/smoke.mjs http://127.0.0.1:8787`로 이 서버도 검증할 수 있습니다. 실제 외부 배포·도메인 연결은 별도 단계입니다. 개발 중 미리보기에는 `npm run dev`를 사용하세요.

## 데이터 한계

- 최근 90일 및 현재 닉네임 사용 기간 안에서 공식 API가 반환한 경기만 다룹니다.
- 최신 문서에 페이지 추가 조회 규칙이 명시되지 않아 추측한 커서를 사용하지 않습니다. 반환된 기록을 정렬한 뒤 최대 100개 표시하고, 더 보기는 이미 확보한 기록을 펼칩니다.
- 전체 시즌 성적이나 동티어 평균을 수집하지 않습니다. 순위 구간 비교에는 양 구간에 각각 유효한 순위가 최소 3개 필요합니다.
- 전적 수치로 동선·시야·포지셔닝·패배 원인을 확정할 수 없습니다. 리뷰의 행동 제안은 사용자가 직접 확인할 가설입니다.
- 실험체 공식 이미지는 아직 연결하지 않았습니다. 현지화 실패 시 실험체 코드를 표시합니다.
- 요청 제한과 캐시는 서버 인스턴스 메모리 기준입니다. 외부 공개 전에는 인증·공유 호출 제한·일일 비용 한도·이용약관 및 API 사용 조건을 추가 점검해야 합니다.

## 수행평가 자료

- [API 조사 및 출처](docs/research/eternal-return-api.md)
- [개발 과정](docs/development.md)
- [평가 기준과 제출 준비](docs/assignment.md)
- [직접 작성할 실사용 후기 양식](docs/usage-review-template.md)

실제 본인 전적 테스트, 실사용 후기, 블로그/SNS 게시, GitHub 업로드는 아직 완료된 것으로 처리하지 않았습니다.

이터널 리턴은 Nimble Neuron의 게임입니다. 이 프로젝트는 비공식 개인 학습 프로젝트입니다.
