# F1·결정 6건 설계 — 가입이 필요한 행동 확정 · 2026-11-27 PHT

- 지시: Owner 「권장안대로 설계」 (2026-11-27). 권장안은 감사 `registration-process-contract-audit-2026-11-27.md` §2 에 대한 작업자 권장이다.
- 상태: **설계만. 코드·DB 변경 없음.**
- 근거:
  - 운영 main `a30ef5c` 코드
  - 운영 DB `ckdosyydvgzqwpbwuhon` 읽기 전용 조회 (2026-11-27 17:30 PHT)
- 실기기·운영 사이트: 열지 않음 (실행 0회)

## 0. 작업자 정정 — 권장안 일부 철회 (먼저 보고)

| 앞선 권장 | 정정 | 근거 |
|---|---|---|
| F1 「1:1 방을 만드는 다른 경로 `POST /api/community-messenger/rooms` 도 새 1:1 방 = 가입 필요로 함께 맞춘다」 | **철회 — 이 경로는 바꾸지 않는다.** 통화를 걸 때 대화방이 없으면 이 경로로 방을 만든다. 바꾸면 Owner 결정 「통화는 전화 인증만」(C2 §4 C·§7)과 통화 변경 규정에 걸린다 | `call-v3-api.ts:101` · `call-session-navigation-seed.ts:490` · `rooms/route.ts:116-124` 주석 · C2 §4 C `:131` |
| — | 이 경로로 만든 빈 1:1 방이 남아도, 메시지·전달·스티커·음성 보내기는 모두 「가입 필요」라서 가입하지 않은 회원은 내용을 보낼 수 없다 | `member-action-registry.ts:98,101,102,108` = `new` |

계약 C2 원문 `docs/audit/registration-action-cta-ssot-design-2026-11-21.md` 은 **저장소에 커밋되지 않은 채 로컬 파일로만 있었다**(코드 주석이 이 문서를 가리킴). 이번 PR 에 원문 그대로 넣고, 끝에 이번 결정 기록을 덧붙인다.

## 1. 결정 내용 (Owner 「권장안대로」)

| # | 경로 | 지금 규칙 | 바꿀 규칙 | 계약 근거 |
|---|---|---|---|---|
| F1 | `POST /api/community-messenger/direct/start` (1:1 대화 시작) | `manage` (`registry:66`) | **`split`** — 이미 있는 방 다시 열기 = 가입 없이 · **새 방 만들기 = 가입 필요** | C2 §4 A `:90` 「메신저 대화 시작」 |
| 1 | `POST /api/moim/host-transfers/[transferId]` (모임장 넘기기 응답) | `manage` (`:226`) | **`split`** — `accept:true`(수락) = 가입 필요 · `accept:false`(거절) = 가입 없이 | C2 §4 규칙 `:82` 「모임 수락」 / `:83` 「거절」 |
| 2 | `POST /api/moim/[moimId]/host-inactive-request` (활동 없는 모임장 변경 요청) | `manage` (`:211`) | **`new`** — 가입 필요 | `:82` 「신청」 |
| 3 | `POST /api/community-messenger/friends/[friendUserId]/favorite` | `manage` | **그대로** (나만 보는 친구 목록 정리) | `:83` 관리 |
| 4 | `POST /api/me/store-phone-verification/send` (입점 전 인증번호) | `manage` (`:171`) | **`split`** — `purpose:"store_apply"` 이면서 `storeId` 없음(새 입점 신청) = 가입 필요 · 내 매장 번호 변경(`store_phone_change`)·보완 제출(`store_apply`+`storeId`) = 가입 없이 | C2 §4 A `:98` 「새 입점 신청」 |
| 4′ | `POST /api/me/store-phone-verification/verify` | `manage` (`:172`) | **그대로** — 문자는 `send` 에서만 나간다. `send` 가 막히면 확인할 인증번호가 없다 | — |
| 5 | 매장 운영 중 쿠폰·상품권 신청·배달 광고 신청·비즈캐시 충전 | 매장 주인만 확인 | **그대로** | C1 「기존 매장 운영 = 예외」 · C2 S18 `:60` |
| 6 | `POST /api/community-messenger/bridge/product-chat` | `manage` (`:51`) | **그대로** (거래 채팅을 시작할 때 이미 가입 확인) | — |

## 2. 운영 데이터 영향 (읽기 전용, 17:30 PHT)

| 항목 | 값 |
|---|---|
| 회원 / 가입 완료(전화 인증 + 대표 주소) | 85 / 56 (관리자 면제는 따로 세지 않은 근사값) |
| 모임장 넘기기·변경 요청 기록 (`moim_host_transfers`) | **0행** — 대기 중인 수락 없음 |
| 입점용 인증번호 기록 (`store_phone_verifications` purpose `store_apply`) | **0행** |
| 11-21 이후 가입 미완료 회원이 만든 메신저 방 | 0 (감사 §1 F1) |

이미 진행 중인 것이 없어서 바꿔도 막히는 기존 요청은 0건이다.

## 3. 바꾸는 것

### 3-1. 규칙 표 `lib/auth/member-action-registry.ts`
- `direct/start` → `split`
- `host-transfers/[transferId]` → `split`
- `host-inactive-request` → `new`
- `store-phone-verification/send` → `split`
- 머리 주석에 「F1·결정 2026-11-27」 근거를 적는다.
- 효과:
  - `new` 는 중앙 쓰기 관문이 가입을 확인하고, 화면 요청 장치가 미리 막고 안내한다.
  - `split` 은 중앙 관문을 통과시키고, 라우트가 새 행동 분기에서만 `requireRegistrationForAction` 을 부른다(C2 §5-1 그대로).

### 3-2. 서버 — split 라우트의 새 행동 분기
- **F1 `direct/start`:**
  - `ensureGeneralFriendDirectRoom`(`service.ts:11078`)은 기존 방을 찾고(`:11111-11115`), 없으면 새로 넣는다(`:11122`).
  - 함수에 선택 인자 `beforeCreate?: () => Promise<{ step: "phone" | "address" } | null>` 를 더한다. **새 방을 넣기 직전에만** 부르고, 거절이면 `{ ok:false, error:"signup_incomplete", step }` 를 돌려준다.
  - `startCommunityMessengerDirectChat` 은 이 인자를 그대로 넘긴다.
  - `direct/start` 라우트만 이 인자를 넘긴다(가입 확인). 거절이면 `registrationIncompleteResponse(step)`(403 `signup_incomplete`+`step`)로 답한다.
  - **`POST /rooms`(통화 경로)는 인자를 넘기지 않아 동작이 바뀌지 않는다.**
  - 가입 확인은 `requireRegistrationForAction` 과 같은 판정을 쓴다(쓰기 검사 스냅샷 → 관리자 면제 → 전화 + 대표 주소, 조회 실패 503). 응답 모양을 공유하려고 판정만 돌려주는 `resolveRegistrationGapForAction(userId)` 를 `require-registration-for-action.server.ts` 에 꺼내 두고, 기존 `requireRegistrationForAction` 도 이 함수를 쓴다.
- **1 모임장 넘기기 응답:** 라우트에서 `body.accept === true` 일 때만 `requireRegistrationForAction`. 거절은 그대로 둔다.
- **4 입점 인증번호 발송:** `purpose === "store_apply" && !requestedStoreId` 일 때만, **발송 한도·문자 전에** `requireRegistrationForAction`.

### 3-3. 화면 — 이중 안내 없이
서버 403 `signup_incomplete`+`step` 은 요청 장치(`registration-guidance-fetch-gate.client.ts:114-122`)가 「가입 이어하기」 창을 열고 문구를 바꾼다. `/calls` 를 뺀 모든 `/api` 쓰기가 대상이다. 각 화면은 **자기 오류 표시만 하지 않으면 된다**(F2 와 같은 방식).

| 화면 | 지금 실패 처리 | 바꿀 것 |
|---|---|---|
| 메신저 홈 1:1 시작 (`CommunityMessengerHome.tsx:1411-1424`) | `tryRedirectMessengerHomeAuthBlocked` → `redirectForBlockedAction` 이 안내 문구를 보면 `true` | **변경 없음** (이미 처리됨) |
| 연락처 시트 메시지 (`MessengerContactsMemberSheet.tsx:96-99`) | 「작업 실패」 스낵바 | `code === "signup_incomplete"` 이면 스낵바 없이 끝냄 |
| 전달하기 친구 대상 (`MessengerForwardSheet.tsx:141-142`) | 「다시 시도」 상태 | `signup_incomplete` 이면 `not_allowed` 상태 (전달 자체도 가입 필요) |
| 모임 상세 모임장 위임 배너 (`MoimDetailScreen.tsx:63-66`) | `moim_registration_required` 토스트 | `code === "signup_incomplete"` 이면 토스트 없이 끝냄 |
| 모임 관리 모임장 변경 요청 (`MoimManageHostRequest.tsx:46-51`) | 오류 토스트 | 같음 |
| 입점 신청 인증 시트 (`StorePhoneVerifySheet.tsx:88-90`) | 시트 안 오류 문구 | `code === "signup_incomplete"` 이면 문구 없이 시트 닫음 |

- 새 문구·키 없음.
- 통화 화면·통화 API·푸시 변경 없음. `direct/start` 는 통화가 쓰지 않는다(호출처 3곳 모두 메신저 화면).

### 3-4. 계약 문서
- C2 원문을 그대로 커밋하고, 끝에 「§9 결정 기록 (Owner 2026-11-27 「권장안대로 설계」)」로 §1 표와 §0 철회를 덧붙인다.
- 감사 문서 §2 에 결정 결과를 적는다.

## 4. 시험 (같은 PR)

- `member-action-registry-contract.test.ts`: 4개 경로 kind
- `member-consent-mutation-gate.test.ts`: `host-inactive-request` 미가입 403(step) · split 3개는 중앙 통과
- 라우트 시험:
  - `direct/start`: 기존 방 → 미가입도 200 · 새 방 → 미가입 403(step)·방 안 만들어짐 · 가입 완료 → 200 `created:true`
  - 모임장 응답: 수락 미가입 403 · 거절 미가입 200
  - 입점 발송: 새 신청 미가입 403·문자 함수 미호출 · 번호 변경·보완은 통과
- 서비스 시험: `ensureGeneralFriendDirectRoom` 에 `beforeCreate` 가 없으면 지금과 같다(통화 경로 회귀 없음) · 기존 방이면 `beforeCreate` 를 부르지 않는다
- 화면 시험: 6개 화면이 `signup_incomplete` 에 자기 오류를 띄우지 않음
- 로컬: `ci:static` · `typecheck:build` · 전체 vitest

## 5. 반영·운영 확인

- 분류: **웹만**(`lib/`·`app/api`·`components/`·`docs/`). DB·네이티브 변경 없음.
- PR 1개를 만들고 자동 병합을 등록한다.
- **통화 변경 규정 해당 여부:**
  - `service.ts` 는 통화 함수가 아닌 1:1 방 함수만 고친다.
  - 통화 경로(`POST /rooms`)는 새 인자를 넘기지 않아 동작이 같다. 서비스 시험으로 증명한다.
  - 통화 코드·통화 API·푸시는 바꾸지 않는다.
- 운영 확인 (가입 완료 계정, 문자·데이터 쓰기 없는 방법만):
  1. `/api/app/web-version` = 병합 SHA
  2. Samsung 계정(가입 완료)으로 기존 상대에게 `direct/start` → 200 `created:false`
  3. 모임장 응답·입점 발송은 가입 완료 계정으로 잘못된 id·잘못된 번호를 보낸다 → 가입 관문을 지나 400·404 가 나오는지 본다(문자·데이터 변화 없음)
  4. Vercel 런타임 오류 0
- 미가입 거절은 F4 와 같은 이유(운영에 쓸 미가입 계정 없음)로 단위·라우트 시험으로 확정한다(Owner 11-27 「단위 시험으로 충분」과 같은 기준).

## 6. 범위 밖 (보고만)
- `POST /rooms` 로 만든 빈 1:1 방(통화 경로)은 그대로 둔다(§0).
- 결정 3·5·6 은 코드 변경 없이 계약 기록만 남긴다.

## 7. 구현 기록 (Owner 「승인, 구현 진행」 2026-11-27)

- 규칙 표 4개 · `resolveRegistrationGapForAction`/`registrationGapResponse` 분리 · `ensureGeneralFriendDirectRoom`/`startCommunityMessengerDirectChat` 에 `beforeCreate` · 라우트 3개 · 화면 5곳 · C2 원문 커밋 + §9 결정 기록 · 감사 §2 결정 기록
- 시험: `registration-decisions-f1.test.ts`(9) · `member-action-registry-contract.test.ts` 갱신
- 로컬 검증(최종 트리): `ci:static` · `check:i18n-quality` · `typecheck:build` · 전체 vitest(12,645 + 13,184 통과) 모두 PASS
