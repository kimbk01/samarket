# 영어 화면 통화 기록 한국어 표시 — 원인·설계 (2026-11-13 · 설계만 — 통화 변경 규정 §3: Owner 승인 후 구현)

> 선행: `docs/audit/i18n-call-record-copy-plan-2026-11-08.md` (커밋 `ff049470b` 로 구현 — 목록·대화방 통화 줄을 보는 사람 언어로).
> 이번 결함은 그 작업 뒤에 **남은 2곳**이다. 기준: `origin/main` `29c9fbe58`, 운영 DB `ckdosyydvgzqwpbwuhon` 읽기 전용 조회, 실기 2026-11-13 05:01~05:22 PHT.
> 바꾸는 것은 **화면에 보이는 통화 기록 글자만**이다. 통화 연결·발신·수신·푸시·CallKit·네이티브·DB 저장 형식·통화 결과 판정은 바꾸지 않는다.

## 1. 결함과 증거

| # | 결함 | 확인 조건 · 증거 | 판정 |
|---|---|---|---|
| F1 | 영어 화면 **채팅 목록**의 통화 기록 미리보기가 한국어 — 「영상 통화 · 12s」 「음성 통화 · 통화 종료」 「영상 통화 · 부재중」 | iPhone 17 Pro 시뮬 · 앱 1.2(21) · 로그인(@asas22) · English · 05:01 PHT · 채팅 목록 캡처. 해당 행 날짜 = 7/8·7/21·8/8 | **FAIL** |
| F2 | 영어 화면 **대화방 통화 말풍선** 둘째 줄이 한국어 「발신」 「수신」 (첫 줄 「Voice call · Declined」 은 영어) | 같은 조건 · 05:22 PHT · 「Tele Gram」 방 캡처. 옛 기록·새 기록 구분 없이 모든 통화 말풍선 | **FAIL** |
| — | 통화 탭(Calls) | 같은 조건 · 캡처: 「Video · 12s」 「Missed video」 「Video · Canceled」 — 옛 기록까지 영어 | PASS |
| — | 대화방 통화 말풍선 첫 줄 | 같은 캡처: 「Voice call · Missed」 「Voice call · Call ended」 | PASS |

## 2. 원인 (코드·운영 DB)

### F1 — 토큰 도입(2026-10-15) 전에 저장된 방 미리보기는 한국어 문장 그대로 표시

- 방 미리보기(`community_messenger_rooms.last_message`)는 2026-10-15(`60fbbf10f`)부터 언어 없는 토큰 `cmcall1|kind|status|event|initiator|recipient|duration|label` 로 저장된다. 화면이 보는 사람 언어로 다시 그린다(`lib/community-messenger/call-stub-room-tip.ts` `formatCallStubRoomTipForViewer`).
- 토큰이 아닌 옛 행은 `resolveRoomLastMessageForViewer`·`formatCallStubRoomTipForViewer` 가 **원문 그대로** 돌려준다(`call-stub-room-tip.ts:86-88`·`:154`). 화면 `cm-home-list-copy.ts:143-149` 도 그대로 표시한다.
- 운영 DB (읽기 전용):

  | 구분 | 방 수 | 기간 (UTC) |
  |---|---|---|
  | 한국어 문장 (옛 행) | 102 | 2026-04-04 ~ 2026-10-14 |
  | 토큰 | 37 | 2026-10-16 ~ 2026-11-12 |

  옛 행 문장은 **14가지 형태뿐**이다: `영상/음성 통화 · 취소됨` 49, `· 통화 종료` 19, `· Nm Ns` 8, `· Ns` 7, `· 거절됨` 5, `· 부재중` 6, `부재중 음성 통화` 3, `· 발신 중` 2, `· cancelled` 1, `· 연결 끊김` 1, `· N초` 1.
- **새로 생기는 기록은 영향 없음**: 10-16 이후는 모두 토큰이다. 영어 변환은 시험 `call-record-copy-language.test.ts` 에 있다(예: `Missed video call`). 다만 시뮬 계정에는 토큰 방이 없어서 새 기록의 영어 화면 표시는 **화면으로 확인하지 못했다(NOT_PROVEN)**.

### F2 — 말풍선 둘째 줄이 코드 속 한국어

- `components/community-messenger/room/phase2/MessengerTimelineBubbleInners.tsx:251` `{isMine ? "발신" : "수신"}` — 2026-07-28(`14097d50d`)부터 있다. 11-08 작업은 첫 줄(종류·결과)만 키로 바꿨고, 이 줄은 남았다.
- 영어 값이 있는 키가 이미 있다: `cm_call_direction_outgoing`「Outgoing」/`cm_call_direction_incoming`「Incoming」 (`lib/i18n/catalog/community-messenger-ui.ts:75-76`·`:1238-1239`, 통화 탭 `call-history-presenter.ts:29` 이 같은 키 사용).

## 3. 설계

| # | 파일·함수 | 바뀌는 동작 | 바뀌지 않는 것 |
|---|---|---|---|
| D1 (F2) | `MessengerTimelineBubbleInners.tsx` 통화 말풍선: `"발신"/"수신"` → `t("cm_call_direction_outgoing")`/`t("cm_call_direction_incoming")` (같은 파일이 이미 `useI18n` 사용) | 영어 화면 「Outgoing」/「Incoming」 | 한국어 글자(「발신」/「수신」)·발신/수신 판정(`isMine`)·색·`data-cm-call-direction` 무변경 |
| D2 (F1) | `call-stub-room-tip.ts` 에 옛 문장 정확 일치 표 `parseLegacyCallStubLabel(text)` → `{callKind, canonical, durationSeconds}` (위 14형태를 **전체 일치**로만 판정 — 부분 문자열 판정 금지 규칙 준수). `formatCallStubRoomTipForViewer` 가 토큰이 아닐 때: **ko 면 원문 그대로**, 다른 언어면 표에 맞을 때 `buildCallEventPresentation({ viewerRole 없음 })` 의 `listPreview`, 맞지 않으면 원문 | 영어 화면 옛 미리보기 → 「Video call · Canceled」·「Missed voice call」·「Video call · 12s」 등 | **DB 무변경**(옛 행을 고쳐 쓰지 않음). 한국어 화면 글자 0 변화. 토큰 형식·viewer 판정 무변경. 호출처 10곳(서버 목록·부트스트랩·행 모델·관리자)이 같은 함수라 진입점 전부 같이 바뀜 |
| D2 구현 메모 | 표의 한국어 글자는 코드에 쓰지 않고 **카탈로그 한국어 값**에서 만든다(`check:i18n-quality` 코드 속 한국어 금지). 지금 카탈로그에 없는 옛 결과 글자 2개만 키 추가: `cm_call_legacy_result_cancelled`「취소됨」/「Cancelled」, `cm_call_legacy_result_declined`「거절됨」/「Declined」. 옛 영어 섞임 형태(`cancelled`·`3m 51s`·`12s`)는 영문 정규식 | 카탈로그 값이 바뀌면 옛 문장을 못 알아보므로 시험 ①이 14형태를 한국어 원문으로 고정 | — |
| D3 | 시험: ① 14형태 × ko(원문 동일)·en(영어) 표 ② 표에 없는 문장은 원문 ③ 말풍선 둘째 줄 ko/en ④ 기존 `call-record-copy-language`(ko 4,032 조합 고정) 유지 | — | — |

- 옛 행은 누가 발신자인지 저장돼 있지 않다. 그래서 D2 는 보는 사람과 무관한 문구를 쓴다. 지금 한국어 화면도 발신자·수신자 모두에게 같은 문장(예: 「취소됨」)을 보이므로 의미가 같다.

### 영향 경로 (통화 변경 규정 §3)

| 경로 | 영향 | 근거 |
|---|---|---|
| 발신 시작·세션 생성·VoIP/FCM 발송·CallKit·Android 수신 화면 | 없음 | 표시 함수만 변경. `lib/push/**`·통화 세션 API·네이티브 무변경 |
| 취소·거절·종료·부재중 판정·통화 기록 저장 | 없음 | `resolveCallEventCanonical`·`formatCallEventSharedListLabel`(저장 문장)·토큰 인코더 무변경 |
| 설치된 구 바이너리 | 웹 변경이라 앱 재시작으로 적용 | 네이티브 무변경 |
| 회귀 위험 | 한국어 화면 글자 변화 → 시험 ①④로 0 고정 | — |
| 되돌리기 | 되돌림 PR (데이터 변경 없음) | — |

### 반영·검증

- **통화 단독 PR 1개** (통화 변경 규정 4번 — 11-08 작업과 같은 분류).
- 로컬: `typecheck:build` · 관련 vitest · eslint · `check:i18n-quality`(파일별 한국어 개수 감소) · `verify:call-surface-cta-ssot`.
- 실기 (Production SHA 기록, 영어 계정 + 한국어 계정):
  - 기록 글자: 옛 미리보기 방 영어 · 말풍선 「Outgoing/Incoming」 · 한국어 화면 무변화.
  - **새 통화 1건 이상**을 만들어 영어 목록 미리보기를 확인한다(F1 의 NOT_PROVEN 해소).
  - 통화 규정 §5 최소 행렬 — 11-08 계획과 같이 「통화 동작 동일 + 기록 글자 ko/en」.

## 4. Owner 결정 필요 — 기존 승인 설계와 충돌 (D2)

- 11-08 승인 계획 2-D: *「토큰이 아닌 옛 행(한국어 글자만 저장)은 그대로 표시(지난 데이터는 채우지 않음 — Owner 2026-11-08)」*.
- D2 는 **데이터를 채우거나 고치지 않고 화면에서만 바꾸지만**, 「옛 행은 그대로 표시」와는 다르다. 그래서 임의로 정하지 않는다.
- D2 를 하지 않으면 F1 은 10-14 이전 통화가 마지막 메시지인 방(현재 102개)에만 남는다. 그 방에 새 메시지가 오면 사라진다.
- D1(F2)은 새 기록에도 생기는 결함이라 충돌이 없다.

## 5. 범위 밖 — 감사 중 발견, 보고만

| 항목 | 위치 | 비고 |
|---|---|---|
| 대화방 날짜 구분선이 영어 화면에서도 「2026년 7월 21일」 | `CommunityMessengerRoomPhase2MessageTimeline.tsx:554` `Intl.DateTimeFormat("ko-KR")` 고정 | 캡처 05:22 PHT |
| 1:1 방 머리글 부제 「친구와 1:1로 대화하는 메신저 방」 영어 화면에도 한국어 | `load-community-messenger-room-silent-delta.ts:242-244` 서버 코드 속 한국어 (키 `cm_svc_room_desc_direct` 있음) | 캡처 05:22 PHT |
| 부재중 전화 알림 제목·본문이 한국어로 저장(「부재중 전화」·「… · 부재중 영상 통화」) | `call-missed-notification-authority.ts:156-178` | 11-08 계획에서 「통화 푸시는 S8-6 에서 제외 유지」로 제외됨. 영어 화면 알림함은 확인 안 함(NOT_PROVEN) |
| metadata 없는 통화 기록 27건(2026-07-31~08-03) — 말풍선 결과가 저장 결과와 다르게 보일 수 있음 | `community_messenger_messages` call_stub | 언어와 무관. 옛 데이터 |
| 쓰이지 않는 한국어 함수 `formatCommunityMessengerCallStubStatus` | `call-stub-message-label.ts:9-16` | 호출처 0 |
