# 언어 SSOT 6번 — 통화 기록 문구 영어화 계획 (2026-11-08 · Owner 「통화 계획 작성」) · **계획만 — 통화 변경 규정 §3: Owner 승인 후 구현**

> AGENTS.md 「통화 변경 규정」 적용 대상. 이 문서는 ① 증거로 확인한 원인 ② 바꾸는 파일·함수 ③ 영향 경로 ④ 구 바이너리 호환 ⑤ 회귀 위험 ⑥ 되돌리기 ⑦ 실기기 검증 항목을 적는다.
> 이번 변경은 **화면에 보이는 통화 기록 글자만** 바꾼다. 통화 연결·발신·수신·푸시·CallKit·네이티브·DB 저장 형식·통화 상태 판정은 **바꾸지 않는다.**
> 기준: main `7807cc21c`, 운영 DB `ckdosyydvgzqwpbwuhon` 읽기 전용 조회 23:00~23:20 PHT.

## 1. 결함과 증거

| # | 결함 | 증거(확인 조건) | 판정 |
|---|---|---|---|
| C1 | 영어 화면 메신저 목록에 통화 기록이 한국어 — 「음성 통화 · 취소」·「부재중 영상 통화」·「영상 통화 · 49s」 | 운영 22:43 PHT, 로그인(메인관리자)·언어 English·데스크톱 브라우저 창, `/community-messenger` 화면 글자 | **FAIL** |
| C2 | 영어 화면 대화방 안 통화 줄의 결과 글자가 한국어(「취소」·「부재중」·「거절」) — 종류 글자(Voice call)만 영어 | 코드: `CommunityMessengerRoomPhase2MessageTimeline.tsx:2141` → `getCallStubTimelineStatusLine` → `call-event-presentation.ts` 한국어 고정 | FAIL(코드 근거) · 화면 NOT_PROVEN |
| C3 | 대화방에 저장되는 통화 문장이 **한국어 + 영어 섞임** — 「영상 통화 · 3m 51s」 | 운영 DB `community_messenger_messages` call_stub 최근 5건(2026-11-07 19:42 ~ 11-08 06:08 UTC) 모두 `… · 4s`·`3m 51s` 형태. 원인: 서버가 시간 글자를 `translateCmUi`(브라우저 화면 언어 전역값, **서버에서는 기본값 en**)로 만든다 | **FAIL** (새로 생기는 데이터) |
| C4 | 새로 생기는 통화 기록 자체는 언어 없는 코드로도 저장되고 있음 — 방 `last_message` = `cmcall1|voice|cancelled|cancelled_by_caller|…`, 메시지 `metadata` = callKind·callStatus·callResolvedEvent·initiator·duration | 운영 DB 최근 8건(11-08 13:25~14:38 UTC) 모두 metadata 완전 | 고칠 근거 — **저장 형식은 그대로 두고 화면에서 언어로 그릴 수 있음** |

원인(코드):
- `lib/community-messenger/call-event-presentation.ts` 가 종류·결과·목록 문구를 **한국어 문자열로 고정**해 만든다(한국어 문자열 42개). 언어를 받지 않는다.
- 목록 미리보기를 만드는 공용 함수(`resolveRoomLastMessageForViewer`, 호출 파일 10개 — 서버 목록·부트스트랩·행 모델·관리자 목록)가 코드 → 한국어 문장으로 바꾼다. 화면은 받은 문장을 그대로 쓴다.
- 시간 글자 `formatCmHomeCallDurationLabel` 은 화면 언어 전역값을 읽는데, 서버에서는 그 값이 언제나 기본값(en)이라 C3 이 생긴다.

## 2. 바꾸는 것 (웹만, 통화 단독 커밋)

| 단계 | 파일·함수 | 바뀌는 동작 | 바뀌지 않는 것 |
|---|---|---|---|
| A | `call-event-presentation.ts` `buildCallEventPresentation`·`formatCallEventForViewer` 에 `lang` 인자 추가. 문구는 카탈로그 키로(새 키 약 14개, **한국어 값은 지금 글자와 1글자도 다르지 않게**) | 영어 화면에서 「Voice call · Cancelled」·「Missed video call」 등 | `resolveCallEventCanonical`(통화 결과 판정) 무변경. `isMissed`·`isTerminal` 무변경 |
| B | 시간 글자 `formatCmHomeCallDurationLabel(seconds, lang)` — 언어를 인자로 받음 | C3 해소: 서버 저장 문장의 시간도 한국어(「3분 51초」) | 화면(클라이언트) 호출은 지금처럼 화면 언어 |
| C | `formatCallEventSharedListLabel`(DB 저장 문장) — **한국어로 고정 명시**(`lang: "ko"`). 저장 형식·토큰 형식 무변경 | 저장 문장 = 지금과 같은 한국어(시간만 한국어로 정정) | `cmcall1|…` 토큰 형식·metadata 키 무변경 → 구 바이너리·Realtime·관리자 검색 영향 없음 |
| D | 목록: `formatCallStubRoomTipForViewer`·`resolveRoomLastMessageForViewer` 에 `lang` 인자. 서버에서 부르는 곳은 **요청 언어**(`resolveServerAppLanguage`: 계정 → 화면 쿠키 → 요청 헤더), 화면(`cm-home-list-copy`)은 화면 언어 | 목록 통화 기록이 보는 사람 언어 | 보는 사람(viewer) 판정·토큰 해석 무변경. 토큰이 아닌 옛 행(한국어 글자만 저장)은 그대로 표시(지난 데이터는 채우지 않음 — Owner 2026-11-08) |
| E | 대화방 줄: `getCallStubTimelineStatusLine`·`getCallStubTimelineSecondLine`·`getCallMessageText` 에 `lang`. 호출부(타임라인·`call-chat-local-append`)가 화면 언어를 넘김 | C2 해소 | 통화 줄 다시 걸기 버튼·숨김 키·중복 제거 키(`callStubSessionKeys` 등) 무변경 |

- 한국어 화면 글자 변화 0 을 **테스트로 고정**: 결과 12종 × 음성·영상 × 시간 0/45초/3분51초 × 발신·수신 조합 전부에서 ko 결과가 지금 함수 결과와 같아야 한다. 단, C3(서버 저장 문장 시간 글자)만 의도적으로 「3m 51s」→「3분 51초」.
- 문자열로 통화 상태를 판정하는 코드 확인 결과: `cm-home-list-copy.ts` `LEGACY_CALL_TOKEN = /통화|call/i` — 영어 「Voice call …」도 `call` 을 포함하므로 동작 같음. `call-in-app-notice-store.ts:70` 의 「거절」 판정은 서버 오류 문장 대상이라 이번 문구와 무관.

## 3. 영향받는 경로 (통화 규정 §3 항목별)

| 경로 | 영향 | 근거 |
|---|---|---|
| 발신 시작·세션 생성·VoIP/FCM 발송 | 없음 | 위 함수들을 쓰지 않음(통화 세션 API·`lib/push/**` 무변경) |
| iOS CallKit / Android 수신 화면 | 없음 | 네이티브 무변경, 네이티브 문구는 S8-3 리소스 |
| 취소·거절·종료·부재중 판정 | 없음 | `resolveCallEventCanonical`·`mapResolvedEventToCallStatus` 무변경 |
| 상태 폴링·CallKit 종료 신호 | 없음 | 무관 |
| 통화 기록(대화방 call_stub 저장) | 저장 문장의 **시간 글자만** 한국어로 정정(C3). 토큰·metadata 무변경 | 단계 B·C |
| 통화 목록 화면(`call-history/*`) | 없음 | `call-log-display-type.ts` 는 판정 함수만 사용, 글자는 기존 키 |
| 메신저 목록·도메인 목록(거래·주문)·관리자 목록 | 통화 기록 미리보기 글자 언어 | 단계 D. 관리자 목록은 관리자 화면 언어 |
| 부재중 푸시 문구 | 없음(통화 푸시는 S8-6 에서 제외 유지) | `buildCommunityMessengerCallStubLabel` 은 서버 저장 1곳만 사용 |
| 팝업·앱 안 통화 알림 | 없음 | `call-in-app-notice-store` 무변경 |

## 4. 구 바이너리 호환

- 설치 현황(운영 `user_devices`, 최근 14일): Android 1.2.5 (38)·(37)·(32)·(24)·(20) 외, iOS 1.2 (21)~(30).
- 바뀌는 것은 **웹 번들(서버·화면 JS)만** — 네이티브 바이너리는 웹 화면을 그대로 띄우므로 모든 설치 버전에 같은 웹 결과. 토큰·metadata 형식이 같아 구 웹 번들이 새 서버 응답을 받아도(또는 반대) 깨지지 않는다(구 번들은 한국어로 표시할 뿐).

## 5. 회귀 위험과 막는 방법

| 위험 | 막는 방법 |
|---|---|
| 한국어 화면 글자가 바뀜 | 단계 A 표 전수 비교 테스트(현재 함수 결과 스냅숏과 같아야 함) |
| 서버 경로에 언어가 안 넘어가 영어 사용자도 한국어 | 호출 파일 10개를 목록화해 모두 `lang` 필수 인자로(타입 검사가 누락을 막음) |
| 목록 미리보기 단일 비행·캐시 키가 언어를 안 가짐 → 다른 언어 사용자에게 섞임 | 서버 목록 캐시 키에 언어 포함 여부를 구현 전 확인하고, 없으면 같은 커밋에서 키에 언어 추가 |
| 통화 줄 숨김·중복 제거가 문장 비교에 의존 | 확인 결과 키는 세션 id·이벤트 기반(문장 비교 아님) — 테스트로 재확인 |

## 6. 되돌리기

- 통화 단독 커밋 1개 → `git revert` 후 main 반영(웹만, 재빌드 불필요). DB·네이티브 변경 없음.

## 7. 검증

- 코드: 통화 검사 14종(전후 같은 결과), `lib/community-messenger`·통화 컴포넌트 vitest, 한국어 글자 전수 비교 테스트, typecheck(빌드·테스트), `check:i18n-quality`(`user-hangul-literal` 이 `call-event-presentation.ts` 42→0 으로 줄어야 함).
- 운영(웹): 영어 화면 목록·대화방 통화 줄 영어, 한국어 화면 글자 그대로, 새 통화 1건 저장 문장 「영상 통화 · N분 N초」(운영 DB).
- 실기기(통화 규정 §5 최소 행렬, Production SHA 매 테스트 기록): Android↔iPhone 음성·영상 발신·수신, 거절, 벨 중 취소, 취소 후 지연 푸시(재울림 없음), 통화 중(busy), 무응답 타임아웃, 정상 종료 후 즉시 재발신 — 각 항목에서 **통화 동작 동일 + 기록 글자(ko/en) 확인**. 문구만 바뀌지만 통화 화면 코드라 행렬 필수.

## 8. Owner 결정 필요

1. 이 계획 승인 여부(단계 A~E 한 번에, 통화 단독 커밋).
2. 영어 문구(작업자 안): Voice call / Video call · Calling… / Incoming… / Cancelled / Missed voice call / Missed video call / Declined / Busy / On another call / Call failed / Interrupted / Call ended / `{mins}m {secs}s`.
