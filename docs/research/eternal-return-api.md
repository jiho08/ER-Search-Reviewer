# Eternal Return Open API 조사

문서 조사일: 2026-09-14. 구현·실제 응답 갱신일: 2026-09-16. 구현 기준은 [공식 한국어 Open API 명세, 2026-07-24](https://developer.eternalreturn.io/static/media/OpenAPI_KR_20260724.html)이다. 문서 조사를 바탕으로 구현했으며 이후 실제 발급 키와 공개 사이트에서 닉네임·최근 경기·시즌·랭크·누적 성적 조회를 검증했다. 문서와 달랐던 닉네임 응답의 `userId` 필드와 경기 없는 플레이어의 404는 아래에 별도로 기록한다.

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

공식 문서에는 `GET /v1/games/{gameId}`, `GET /v2/user/stats/uid/{uid}/{seasonId}/{matchingMode}`, `GET /v1/rank/uid/{uid}/{seasonId}/{matchingTeamMode}`, `GET /v2/data/Season`, `GET /v2/data/Character`가 있다. 현재·과거 시즌 선택과 시즌별 스쿼드 랭크·누적 성적 조회까지 연결했다. 팀원 전체 상세 조회는 아직 구현하지 않았다. 이미지·지표·티어 판정 근거와 한계는 [대시보드 확장 조사](player-dashboard.md)를 참고한다.

## 실제 응답으로 확인한 구현 선택

- 최초 문서 조사에서는 페이지네이션을 확인하지 못했으나 2026-09-14 실제 응답의 `next`와 `?next=`로 다음 경기 조회를 확인했다. 서버 커서를 그대로 사용해 선택 시즌의 제공 범위를 끝까지 수집하며 경기 ID 중복을 제거한다. 대시보드의 100경기 제한은 제거했고 리뷰에만 최근 최대 100경기 제한을 적용한다.
- [공식 시작 안내](https://developer.eternalreturn.io/getting-started)에서 개인키 초당 1회, 프로덕션 키 초당 50회를 확인했다. 개인키 기준 요청 간격 1.1초와 60초 캐시를 적용한다. 로컬은 인스턴스 단위이며 공개 사이트는 하나의 Durable Object에서 호출 간격·캐시·전적 페이지를 공유한다. 같은 키를 쓰는 별도 배포와 로컬 서버 사이에는 공유되지 않는다.
- `startDtm`의 명확한 시간대가 없는 경우 시각을 추측하지 않고 미제공 처리한다. 시간대가 명시된 시각만 한국 시간으로 표시한다.
- 실제 Season 응답의 `seasonID`, `seasonName`, `seasonStart`, `seasonEnd`, `isCurrent`를 확인했다. 유일한 현재 시즌 표시를 사용하며 없을 때 번호를 추측하지 않는다. 2026-09-16 조회에서 시즌 12의 API ID는 41, 시즌 11은 39였다.
- 공식 이미지 API는 확인하지 못했다. [공식 팬키트](https://playeternalreturn.com/fankit)는 별도로 존재하지만 가져오지 않았다. 현재 화면은 공개 DAK.GG 카탈로그와 CDN의 실험체·아이템·특성·전술 스킬·티어 이미지를 사용하며 실패한 이미지만 코드·대체 텍스트로 표시한다.

## 상세 경기가 없는 플레이어와 과거 시즌

2026-09-16 실제 응답에서 `병관이아트수제자`의 닉네임 조회는 HTTP 200과 유효한 UID를 반환했지만 경기 목록의 본문 `code`는 404였다. 따라서 경기 목록의 404만으로 닉네임이 존재하지 않는다고 판단할 수 없다. 수정된 로컬 구현은 경기 목록 경로의 HTTP 404·본문 404를 빈 상세 기록으로 처리하고 시즌·랭크·누적 성적을 계속 조회한다. 다음 페이지의 404는 조회 종료로 처리한다. 닉네임 자체의 404, 인증·호출 제한·다른 서버 오류는 기존 오류로 유지한다.

누적 API의 정상 `userStats: []`는 해당 모드·시즌의 명시적 무전적으로 해석해 경기 수·승수만 0으로 표시한다. 필드 누락이나 요청 실패는 미제공으로 남긴다. 이 플레이어는 시즌 7~12 누적 API도 빈 배열을 반환했으므로 과거 기록이 있다고 추정하지 않는다. 수정된 로컬 사이트에서 현재 시즌 12와 과거 시즌 11 모두 HTTP 200, 상세 0경기·시즌 선택지 41개를 확인했다.

반대로 물방개의 과거 시즌 11 누적 API는 252경기·39승·7,665 RP를 제공했다. 과거 시즌 누적 성적은 상세 경기의 최근 90일·현재 닉네임 제한과 별도이며, 누적 성적이 있다고 그 경기 상세를 복원할 수 있는 것은 아니다. 수정 전 공개 사이트 검증에서는 물방개 시즌 12의 7,186 RP, 공식 누적 171경기와 33페이지의 랭크 171경기 일치를 확인했다. 상세 404 처리 수정의 검증은 로컬 기준이며 최신 공개 반영 검증은 [README](../../README.md#검증)를 따른다.

## OpenAI 연결

[공식 Function calling 가이드](https://developers.openai.com/api/docs/guides/function-calling) 및 [GPT-4.1 mini 문서](https://developers.openai.com/api/docs/models/gpt-4.1-mini)를 확인했다. `POST /v1/responses`에 function 도구를 등록하고, `function_call`의 `call_id`에 대응하는 `function_call_output`을 다음 입력에 추가한다. 결과는 JSON Schema로 제한한다.

OpenAI API 방식의 기본 모델은 환경 변수로 교체 가능한 `gpt-4.1-mini`이다. 실제 전적 모드에서 이 공급자를 선택하고 키를 설정해야 호출한다. 공개 서버는 추가로 양수 `AI_DAILY_LIMIT`을 요구하며 현재는 `rules`를 사용한다. 일반 예시 분석은 규칙 기반이고 로컬의 명시적 Codex 예시 테스트만 실제 Codex를 호출할 수 있다. OpenAI 방식은 최대 4회 응답 요청, 6회 도구 실행, 응답당 최대 1,800 토큰으로 제한한다. `store:false`를 지정하고 닉네임·UID·API 키를 분석 입력에 포함하지 않는다. 비용·접근 권한은 사용자의 API 계정에 따라 달라지며 유료 OpenAI API 실키 검증은 하지 않았다. 2026-09-16 공개 검증에서도 유료 AI·Codex 모델을 호출하지 않았다.
