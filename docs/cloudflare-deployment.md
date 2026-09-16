# Cloudflare 공개 배포 안내

## 현재 준비 상태

2026-09-16에 공개용 Worker 설정과 공유 전적 저장·호출 제한을 구현했다. 로컬 공개용 실행과 배포 파일 검증까지 진행했으며, Cloudflare 계정 연결·실제 업로드·도메인 연결은 아직 하지 않았다. 기존 로컬 실행과 Codex 설정은 유지한다.

공개용은 `workers/app.ts`에서 화면 요청을 Vinext에 전달하고 `/api/` 요청을 하나의 `LumiaState` Durable Object에 전달한다. 사이트에서 사용하는 ER API 키 하나의 호출 간격을 조정해야 하므로 API 상태를 한곳에서 관리한다. 화면·정적 파일 요청까지 이 객체에 모으지는 않는다. 회원 가입 없이 사용할 소규모 공개 버전을 위한 구성이다.

## 로컬에서 공개용 확인

Node.js 22.13 이상과 설치된 의존성이 필요하다. 프로젝트 루트에서 실행한다.

```bash
npm run build:public
npm run check:deploy
npm run preview:public
```

- 빌드 결과: `dist-public/client`, `dist-public/server`.
- `check:deploy`: Wrangler `deploy --dry-run`으로 파일·바인딩을 검사한다. 업로드하지 않는다.
- 미리보기: <http://127.0.0.1:8788>. `Ctrl+C`로 종료한다.
- 재빌드할 때는 미리보기를 먼저 종료한다. 빌드가 파일을 교체하는 도중 Wrangler가 감시 중인 모듈을 읽으면 미리보기가 중단될 수 있다.
- `cloudflare/public.env.example`의 빈 키와 기본 분석 설정으로 실행한다. 이 파일에 실제 키를 넣지 않는다.
- 루트 `.env`와 로컬 Codex 브리지를 사용하지 않는다. 예시 20경기와 규칙 기반 리뷰를 확인할 수 있다.
- 로컬 공개용 저장소는 `.wrangler/public-state`에 보관한다. 미리보기를 다시 실행해도 사용량 제한이 남아 있을 수 있다.
- 실제 ER·AI 연결은 Cloudflare Secret을 등록한 뒤 별도로 검증한다. 예시 검사 통과가 실제 키·클라우드 성능 검증을 뜻하지 않는다.

다른 터미널에서 다음 검사를 실행할 수 있다. 공개용 요청 제한 안에서 동작하도록 짧은 시간에 반복 실행하지 않는다.

```bash
node scripts/smoke.mjs http://127.0.0.1:8788
```

`npm run dev`, `npm run build`, `npm start`는 기존 로컬 경로다. `npm start`를 실행해도 인터넷에 공개되지는 않는다. 공개용 빌드는 별도 Vite 설정을 사용하므로 기존 `dist`와 개인 Codex 연결을 덮어쓰지 않는다.

## 계정 연결 후 배포 순서

1. [Cloudflare](https://dash.cloudflare.com/) 계정을 만든다.
2. `cloudflare/wrangler.jsonc`의 `name`을 사용할 Worker 이름으로 확인한다. GitHub 연결 시 대시보드 이름도 이 값과 같아야 한다.
3. 공개 배포 준비 코드를 GitHub 저장소에 반영한다.
4. Cloudflare의 **Workers & Pages → Create application → Import a repository**에서 기존 저장소를 연결한다. 빌드 명령은 `npm run build:public`, 배포 명령은 `npm run deploy:public`, 프로젝트 루트는 저장소 루트로 설정한다. Node.js 22.13 이상을 사용한다.
5. 생성된 Worker의 **Settings → Variables and Secrets**에서 `ER_API_KEY`를 **Secret**으로 등록한다. 로컬 `.env`를 GitHub에 올리지 않는다.
6. `workers.dev` 주소에서 실제 닉네임 검색, 시즌 이어 불러오기, RP 그래프와 리뷰를 확인한다. 처음에는 소수 사용자로 동시 요청·응답 시간·사용량을 점검한다.

CLI로 배포할 경우 로그인 후 빌드와 배포를 실행한다. 아래 배포 명령은 실제 외부 공개를 수행하므로 로컬 검증 단계에서는 실행하지 않는다.

```bash
npx wrangler login
npm run build:public
npm run deploy:public
```

Durable Object 바인딩과 SQLite 클래스의 첫 생성은 `cloudflare/wrangler.jsonc`의 `durable_objects`·`migrations`가 선언한다. 별도 D1 데이터베이스 ID를 발급받아 넣을 필요는 없다. 한번 배포한 클래스 이름·마이그레이션 태그·객체 이름 `er-site-v1`을 임의로 바꾸면 기존 상태를 이어 쓰지 못할 수 있다.

`compatibility_date`는 설치된 Wrangler 4.92.0 / workerd가 지원하는 `2026-05-22`로 고정했다. 라이브러리 업데이트 없이 날짜만 올리면 로컬 런타임이 시작되지 않을 수 있다.

## 공개 리뷰 설정

기본값은 `AI_PROVIDER=rules`, `AI_DAILY_LIMIT=0`이다. 전적의 수치와 등록 분석 도구로 기본 리뷰를 제공하며 모델 호출 비용은 발생하지 않는다. Cloudflare 실행·저장 비용은 별개다.

OpenAI 리뷰를 활성화할 때는 다음 세 조건을 모두 설정한다.

| 설정 | 위치와 역할 |
| --- | --- |
| `AI_PROVIDER=openai` | `cloudflare/wrangler.jsonc`의 `vars`, 명시적인 AI 활성화 |
| `AI_DAILY_LIMIT` | `vars`의 양의 정수. 사이트 전체의 UTC 하루 AI 리뷰 시도 횟수. 최대 1,000 |
| `OPENAI_API_KEY` | Cloudflare Worker의 Secret |
| `OPENAI_MODEL` | `vars`의 모델 ID. 기존 기본값 `gpt-4.1-mini` |

일반 설정은 파일에서 수정하고 다시 빌드·배포한다. 대시보드에서만 바꾼 `vars`는 다음 코드 배포 때 파일의 값으로 돌아갈 수 있다. 예를 들어 `AI_DAILY_LIMIT="10"`이면 하루 최대 10건을 예약하며, 실패·중단된 시도도 환급하지 않는다. 각 리뷰 내부에서는 최대 4회의 OpenAI 응답 요청과 회당 출력 1,800토큰 제한을 적용한다. 이 한도는 **리뷰 건수 제한이며 금액 기준 결제 상한이 아니다.** 모델·입출력 토큰에 따라 비용이 달라지고 ChatGPT 구독과 별도로 청구된다.

공개 서버에서 `AI_PROVIDER=codex`는 거부한다. 개인 Codex 로그인 정보·브리지 토큰을 Cloudflare에 복사하지 않는다. 로컬 `npm run dev`에서는 기존 Codex 리뷰를 계속 사용할 수 있다.

## 공유 저장과 요청 제한

| 항목 | 공개 서버 동작 |
| --- | --- |
| 전적 조회 세션 | SQLite에 페이지별 저장. 마지막 조회부터 30분, 최대 200개 세션 |
| 재시작·다른 Worker | 같은 Durable Object와 SQLite에서 전적·커서를 복원 |
| 같은 닉네임 동시 검색 | 하나의 진행 중 검색을 공유 |
| 새로고침 | 같은 닉네임·시즌은 60초 캐시 안에서 재사용 |
| 공식 ER API 호출 | 사이트 전체에서 시작 간격 1.1초, 대기열 최대 10개 |
| 검색 | IP별 분당 6회, 사이트 전체 분당 20회 |
| 다음 경기 페이지 | IP별 분당 60회, 전체 분당 180회 |
| 리뷰 | IP별 분당 3회, 전체 분당 12회, 동시 2개 |
| 유료 AI 리뷰 | 전체 `AI_DAILY_LIMIT`, IP별 하루 최대 10회와 전체 한도 중 작은 값 |
| 중단된 리뷰 | 점유 슬롯은 최대 5분 후 만료 |
| 오래된 상태 | 요청 처리 및 30분 주기 알람으로 정리, 정리할 임시 데이터가 없으면 알람 종료 |

분당 제한은 고정 시간 창이며 일일 한도는 UTC 자정(한국 시간 오전 9시)에 갱신한다. 제한을 넘으면 `429`와 `Retry-After`를 반환한다. 무료 기본 분석과 예시 리뷰는 유료 AI 일일 한도를 쓰지 않지만 일반 요청 제한은 적용한다.

IP는 Cloudflare의 `CF-Connecting-IP`에서만 가져온다. 브라우저가 보내는 내부 식별자 헤더를 덮어쓰고, 저장할 때는 서버의 무작위 비밀값으로 날짜별 HMAC을 만든다. 원본 IP와 API 키를 전적 데이터베이스에 저장하지 않는다. IP 기준 제한은 회원 인증이 아니며 같은 공유기를 쓰는 사용자는 한도를 공유할 수 있다.

공개 서비스와 로컬 서버에서 **같은 ER 키로 동시에 실제 조회하면 두 실행 환경 사이의 호출 간격은 공유되지 않는다.** 공개 운영 중에는 로컬 실제 조회를 중지하거나 별도 운영 방식을 정해야 한다. 같은 키로 별도 Worker/미리보기 배포를 여러 개 운영하는 경우도 같다.

30분 저장은 조회 재개를 위한 임시 보관이다. 90일 이전 경기의 영구 아카이브나 시즌 전체 기록 복원을 제공하지 않는다. 최대 세션 수를 넘으면 진행 중 페이지 요청을 제외한 오래된 세션을 제거하며, 제거·만료된 전적은 다시 검색해야 한다.

## 비용과 남은 확인

무료 Workers에는 요청 수·CPU 처리 시간 제한이 있다. 이 앱이 무료 범위에서 충분히 작동하는지는 실제 계정의 배포·부하 테스트로 확인해야 한다. AI를 꺼도 서버 실행·저장 비용은 발생할 수 있다. 공개 URL에서 실제 ER 연결과 여러 사용자 동작을 확인한 뒤 배포 완료로 기록한다.

2026-09-16 검증: 모의 ER·AI를 사용하는 자동 테스트 41개, 타입 검사, 공개용 빌드, 배포 dry-run, 로컬 공개 서버의 HTML·예시 전적·기본 리뷰·입력 검증을 확인했다. 실제 Cloudflare 업로드와 실제 ER·AI 호출은 하지 않았다. 상세 최신 검사 결과는 [README](../README.md#검증)를 따른다.

## 공식 참고 자료

- [Vinext/Workers 배포](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)
- [GitHub 자동 빌드 연결](https://developers.cloudflare.com/workers/ci-cd/builds/)
- [Worker Secret 등록](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Durable Objects와 상태 공유](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/)
- [SQLite 저장소와 동기 트랜잭션](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)
- [Workers 요금](https://developers.cloudflare.com/workers/platform/pricing/)
