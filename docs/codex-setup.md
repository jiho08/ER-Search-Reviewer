# Codex 계정 연결

확인일: 2026-09-14. 검증한 Codex CLI는 `0.154.0-alpha.6.2`이다.

2026-09-16에 [Cloudflare 공개용 설정](cloudflare-deployment.md)을 추가했다. 아래 절차는 개인 PC의 로컬 리뷰용이며 계속 사용할 수 있다. 공개용 빌드·미리보기는 이 `.env`와 브리지를 사용하지 않고 기본 분석으로 시작한다. 공개 서버에서 `AI_PROVIDER=codex`는 거부하며 로그인 정보와 브리지 토큰을 배포하지 않는다.

## 실행 흐름

1. `npm run setup:codex`는 `.env`에 `AI_PROVIDER=codex`, `CODEX_BRIDGE_URL`, 무작위 `CODEX_BRIDGE_TOKEN`을 설정한다. ER 키와 OpenAI API 설정은 보존한다.
2. `npm run dev`는 사이트(5173)와 인증된 로컬 브리지(127.0.0.1:4318)를 함께 실행한다.
3. 사이트 서버가 선택된 전적을 다시 확보한 뒤 브리지에 전달한다. 브리지는 고정된 경기 스키마만 허용한다. 임의 프롬프트나 명령을 받지 않는다.
4. 브리지는 설치된 `codex app-server`를 표준 입출력으로 실행한다. `account/read`에서 ChatGPT 로그인을 확인하고 API 키 인증이면 거부한다.
5. 임시 작업에 주제별 분석 도구를 등록한다. `item/tool/call` 요청마다 같은 서버 분석 함수를 실행한다. 필수 도구 실행과 최종 JSON 형식을 검증한 뒤 결과만 반환한다.

Codex의 기본 모델을 사용한다. 다른 모델이 필요하면 `.env`의 `CODEX_MODEL`에 계정에서 사용 가능한 모델을 설정한다. 추론 강도는 `low`로 요청한다.

## 로컬 실행 범위

- 브리지는 127.0.0.1에만 바인딩하고 연결 토큰을 검사한다. Origin이 있는 직접 브라우저 요청과 잘못된 Host를 거부한다. 토큰은 브라우저나 모델에 전달하지 않는다.
- 사이트의 Codex 리뷰 API도 localhost 요청으로 제한한다. 이 구현은 개인 PC용이며, 여러 사용자가 접속하는 공개 서비스용 Codex 실행 서버가 아니다.
- 빈 전용 작업 폴더, 읽기 전용 샌드박스, 승인 불가 정책을 사용한다. 명령 실행·파일 편집·브라우저·앱·플러그인·MCP·하위 에이전트 기능을 비활성화하고 등록한 분석 도구만 처리한다.
- Codex의 도구 실행 환경은 필요하다. `environments:[]`로 전부 비활성화하면 분석 도구도 실행되지 않는 것을 실제 확인했다. 셸이나 외부 도구를 개별적으로 비활성화하는 방식을 사용한다.
- 작업은 ephemeral로 생성하며 종료·오류·시간 초과 시 연결 프로세스를 정리한다. 이는 로컬 작업 기록 방식이며 서비스 자체의 데이터 보관 정책을 바꾸지는 않는다.
- 리뷰는 한 번에 하나, 분당 최대 6회, 최대 6개 도구 호출, 전체 180초로 제한한다. HTTP 연결이 끊기면 진행 중인 Codex 작업도 취소한다.
- Worker 빌드에서 로컬 실행 파일을 직접 실행할 수 없으므로 Node.js 브리지가 함께 필요하다. 외부 호스팅만으로 현재 PC의 Codex 로그인에 연결되지는 않는다.

## 상태와 오류

`GET /api/config`는 `aiProvider`, `codexStatus`, `aiConfigured`만 반환하며 이메일·로그인 토큰을 반환하지 않는다.

- `ready`: 현재 Codex가 ChatGPT 계정으로 로그인되어 있다.
- `login-required`: `codex login` 후 사이트를 새로고침한다.
- `unavailable`: 개발 서버 실행 상태와 Codex 설치를 확인한다. 실행 파일이 PATH에 없으면 `CODEX_BIN`에 실행 파일 경로를 설정한다.

로그인 성공과 사용 한도 잔여 여부는 별개다. 사용 한도 초과·통신 실패·잘못된 JSON·도구 누락은 기본 분석으로 전환되며, 원인이 화면에 표시된다. OpenAI API로 자동 전환하지 않는다.

## 검증

`npm test`는 모의 프로세스로 인증 방식, 도구 요청/응답, 최종 메시지, 허용되지 않은 도구, 중복 도구, 잘못된 인자, 시간 초과, 호출 한도, 접근 제어를 검증한다. 모델을 호출하지 않는다.

`npm run test:codex-live`는 실제 로그인된 Codex 계정으로 예시 일반 경기 3개를 분석한다. 2026-09-14에 사이트 API를 통해 `engine=codex`, `get_recent_matches` 및 `analyze_survival` 실행을 확인했다. 예시 표기는 유지된다. 실제 ER 키의 닉네임·시즌 랭크·경기 조회도 같은 날 별도로 검증했다. 본인 실제 전적 검색부터 Codex 리뷰까지 이어지는 제출용 최종 시연·캡처는 남아 있다. 2026-09-15에는 실제 모델 호출 없이 34개 자동 테스트와 타입 검사를 다시 통과했다.

## 공식 근거

- [Codex 인증](https://learn.chatgpt.com/docs/auth): ChatGPT 로그인과 API 키 인증은 서로 다른 사용/청구 방식이다.
- [Codex App Server](https://learn.chatgpt.com/docs/app-server): 초기화, 계정 확인, 작업·턴 생성, 동적 도구, 구조화 출력 프로토콜을 제공한다.
- [Codex 설정](https://learn.chatgpt.com/docs/config-file/config-reference): 기능과 실행 권한을 설정한다.

프로토콜은 설치된 실행 파일의 생성 스키마와 대조했다. 이 버전의 `thread/start.sandbox`는 `read-only`, 동적 도구에는 `type:function`이 필요하다. Codex 업데이트로 프로토콜이 달라지면 연결 테스트를 다시 실행해야 한다.
