# Eternal Return Open API 조사

확인일: 2026-09-14. 구현 기준은 [공식 한국어 Open API 명세, 2026-07-24](https://developer.eternalreturn.io/static/media/OpenAPI_KR_20260724.html)이다. 문서 조사를 바탕으로 구현했으며 이후 실제 발급 키로 닉네임·최근 경기·현재 시즌·랭크·누적 성적 조회를 검증했다. 문서와 달랐던 닉네임 응답의 `userId` 필드는 아래에 별도로 기록한다.

## 현재 구현에 적용한 사실

- base URL: `https://open-api.bser.io`. 서버 요청 헤더에 `x-api-key`를 사용한다.
- `GET /v1/user/nickname?query={nickname}`의 공식 예시는 `user.uid`(문자열)이지만, 2026-09-14 실제 응답은 `user.userId`(문자열)와 `user.nickname`이었다. 두 이름을 호환 처리하고 동일한 `/uid/` 경로에 사용한다. 이전 `userNum` 기반 구현을 사용하지 않는다.
- `GET /v1/user/games/uid/{uid}`의 경기 배열은 `userGames`이다. UID는 닉네임 변경으로 바뀔 수 있으며 조회 범위는 최근 90일과 현재 닉네임 사용 기간이다.
- 경기의 실험체 코드는 `characterNum`이다. 시즌 실험체 통계의 `characterCode`와 혼동하지 않는다.
- K/D/A는 `playerKill`, `playerDeaths`, `playerAssistant`이다. 피해량은 `damageToPlayer`와 `damageFromPlayer`, 순위는 `gameRank`이다.
- 플레이 시간으로 `playTime`(초)을 사용한다. `duration`은 서버 프레임 값이며 초로 취급하지 않는다.
- `mmrBefore`와 `mmrAfter`는 일부 이용자에게만 제공된다. 제공된 종료 RP와 `mmrGain`을 표시하며 누락된 값은 추정하지 않는다. 절대 RP가 없으면 증감 그래프를 사용한다.
- `GET /v1/l10n/Korean`의 `data.l10Path`는 현지화 파일을 가리킨다. `Character/Name/{code}┃{name}` 형식의 실험체 이름을 읽는다. 실패하면 실험체 코드를 표시한다.

모든 항목의 근거: [공식 명세 §2.1, §2.4, §3.5 및 데이터 모델](https://developer.eternalreturn.io/static/media/OpenAPI_KR_20260724.html).

## 확장에 사용할 수 있는 경로

공식 문서에는 `GET /v1/games/{gameId}`, `GET /v2/user/stats/uid/{uid}/{seasonId}/{matchingMode}`, `GET /v1/rank/uid/{uid}/{seasonId}/{matchingTeamMode}`, `GET /v2/data/Season`, `GET /v2/data/Character`가 있다. 현재 시즌 조회와 현재 시즌 스쿼드 랭크·누적 성적 조회까지 연결했다. 팀원 전체 상세 조회는 아직 구현하지 않았다. 이미지·지표·티어 판정 근거와 한계는 [대시보드 확장 조사](player-dashboard.md)를 참고한다.

## 확인되지 않은 사항과 구현 선택

- 최신 명세에서 커서·페이지 크기·페이지 추가 조회 규칙을 확인하지 못했다. `next`를 추측해서 구현하지 않는다. 서버가 반환한 배열을 정렬·중복 제거 후 최대 100개 표시한다. 화면의 더 보기는 이미 확보한 경기만 펼친다.
- [공식 시작 안내](https://developer.eternalreturn.io/getting-started)에서 개인키 초당 1회, 프로덕션 키 초당 50회를 확인했다. 개인키 기준 요청 간격 1.1초와 60초 캐시를 적용한다. 여러 서버 인스턴스에 걸쳐 공유되지 않는다.
- `startDtm`의 명확한 시간대가 없는 경우 시각을 추측하지 않고 미제공 처리한다. 시간대가 명시된 시각만 한국 시간으로 표시한다.
- Season 테이블의 현재 시즌 표시 필드는 실제 응답 확인이 필요하다. 현재 시즌 번호나 티어를 하드코딩하지 않는다.
- 공식 이미지 API는 확인하지 못했다. [공식 팬키트](https://playeternalreturn.com/fankit)는 별도로 존재하지만 이번 버전에는 팬키트를 가져오지 않았다. 화면의 글자 배지는 이미지 대용 UI다.

## OpenAI 연결

[공식 Function calling 가이드](https://developers.openai.com/api/docs/guides/function-calling) 및 [GPT-4.1 mini 문서](https://developers.openai.com/api/docs/models/gpt-4.1-mini)를 확인했다. `POST /v1/responses`에 function 도구를 등록하고, `function_call`의 `call_id`에 대응하는 `function_call_output`을 다음 입력에 추가한다. 결과는 JSON Schema로 제한한다.

현재 기본 모델은 환경 변수로 교체 가능한 `gpt-4.1-mini`이다. 실제 전적 모드이며 키가 있을 때만 호출한다. 예시는 항상 무료 규칙 분석을 사용한다. 최대 4회 응답 요청, 6회 도구 실행, 응답당 최대 1,800 토큰으로 제한한다. `store:false`를 지정하고 닉네임·UID·API 키를 분석 입력에 포함하지 않는다. 비용·접근 권한은 사용자의 API 계정에 따라 달라지며 실키 검증은 남아 있다.
