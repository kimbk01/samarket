# 회원 가입 프로세스 — 계약 대조 감사 (2026-11-27 PHT · 보고만)

- 지시 (Owner 2026-11-27): 「정확히 시스템으로 회원 가입의 프로세스 부분에 문제가 없는지 정확히 확인」 · 「대충 보지 말고 정확히 계약 부분을 확인 하고 결함의 문제를 정확히 증거를 바탕으로 보고 … 끝까지 확인」
- 상태: **감사·보고만. 코드·DB 변경 없음.**
- 확인 조건
  - 코드: 운영 Production 배포 `dpl_7QEJfCT4T89hxW2JEVRbJiTp95Q8` = main `9c5dcd6be` (Vercel READY). 그 커밋을 별도 폴더로 꺼내 읽음. 작업 브랜치(41개 파일 차이)는 근거로 쓰지 않음.
  - 운영 DB `ckdosyydvgzqwpbwuhon` 읽기 전용 조회 (12:20~13:40 PHT). 쓰기 시험 없음.
  - 실기기·운영 사이트 열기 없음 (실행 0회).
- 계약 원문
  - **C1** `auth-entry-phone-address-consent-design-2026-11-20.md` v3 (Owner 「승인, 구현 진행」)
    - 가입 = 동의 + 전화 인증 + 대표 주소.
    - 가입 검사 예외: 통화 API 전체(시작 포함) · 기존 매장 운영 · 진행 중 거래/제안/모임 관리 · 계정·설정·고객지원·결제 완료 확인·계측 · 내 연락처 · 배달 광고 운영.
  - **C2** `registration-action-cta-ssot-design-2026-11-21.md` (Owner 「설계대로 진행」)
    - §4 규칙 1줄: 새로 만드는 행동 = 가입 필요. 이미 있는 내 것의 관리 = 가입 없이.
    - 표 A(새 행동) · 표 B(관리) · 표 C(섞인 경로).
  - **C3** `registration-ssot-redesign-2026-11-24.md` (Owner 「설계대로 진행」)
    - Owner 원문 「회원 가입 및 첫진입시에는 전화 번호 주소 인증」.
  - **C4** `docs/dibay-first-entry-legal-consent-ssot.md` B6
    - 「전화 OTP·주소 저장은 동의 뒤, SG-06」.

## 0. 작업자 정정 (앞선 보고의 잘못)

| 앞선 보고 | 정정 | 근거 |
|---|---|---|
| 회원 172명 · 약관 33·전화 46·주소 23 | **지금 86명.** 11:13~12:35 PHT 에 마스터 관리자 계정(`1111…`)이 `user_purge` 를 99회 실행해 94명을 지움. 앞의 숫자는 지워지기 전 값. 누가 실행했는지는 확인 못 함 | `audit_logs` action=user_purge 99행 |
| 통화 기록 `calls/stub-message` = FAIL | **가입 계약상 PASS.** C1 이 「통화 API 전체(시작 포함)」를 가입 검사 예외로 승인함. 「실제 통화 없이 부재중 기록을 넣을 수 있다」는 점은 통화 API 자체의 문제(5월부터 있던 코드)로, 가입 범위 밖 — 보고만 | C1 §4-4 · `stub-message/route.ts:17,97-108` |
| 가격 제안 수락 `offers/[id]/accept` = FAIL | **PASS.** C1 예외 목록에 정확히 이 경로가 있음 | `git show 389200868^:lib/auth/member-registration-mutation-policy.ts:83` |
| DB 직접 쓰기 3개 표 | **이용 중인 표 8개**(§1 F3) | `pg_policies` 전수 조회 |
| 「동의 전 OTP 2건」(1차 쿼리) | **0건.** `terms_accepted_at` 은 재동의 때 덮인 값. 동의 기록 표로 보면 두 건 모두 동의 30초 뒤 OTP | `member_consent_events` |

## 1. FAIL — 계약과 다름

### F1. 1:1 대화 시작 `POST /api/community-messenger/direct/start` — 계약 A(가입 필요)인데 주소 없이 새 방을 만든다
- 계약: C2 §4 A 표 「`POST /api/community-messenger/direct/start` … 메신저 대화 시작」 = 가입 필요.
- 구현:
  - 규칙 표 `member-action-registry.ts:65` = `manage`. 커밋 `00ce58fe1`(11-21) #6 「기존 대화방 다시 열기는 가입 없이」로 바꿈.
  - 이 변경에 대한 Owner 승인 문서는 찾지 못함.
- 실제 동작:
  - `service.ts startCommunityMessengerDirectChat` → `ensureGeneralFriendDirectRoom` 이 방이 없으면 **새로 만든다**(`created:true`). 다시 열기만 하는 것이 아니다.
  - 친구가 아니어도 `canMessage:true`(`social-relations.ts` 끝 반환)라서 아이디만 알면 누구와도 방을 만든다.
  - 라우트 검사는 동의 + `messenger_new_chat`(전화·표시 이름)뿐이다. 주소는 `SERVER_ROUTE_ADDRESS_CHECK_ACTIONS` 에 없어 확인하지 않는다(`profile-requirements.ts:133-138`).
- 운영 흔적: 11-21 이후 가입 미완료 회원이 만든 메신저 방은 **0건**이다(남은 86명 기준).
- 함께 적을 충돌(규정 7): C2 §4 C 는 `POST /rooms` 의 1:1 방 만들기를 「내용 없는 방 → 전화 인증만」으로 정했다. direct/start 의 지금 동작은 이것과 같다. 계약 A 문구와 C 의 원리가 충돌하므로 **Owner 결정이 필요하다.**

### F2. 사진 올리기 5개 경로 — 계약 A(가입 필요)인데 가입 없이 공개 주소로 올라간다
- 계약: C2 §4 A 에 `POST /api/posts/upload-image`, `/api/community/upload-image(+from-url)`, `/api/philife/upload-image(+from-url)` 가 있다.
- 구현:
  - 규칙 표 = `manage` 5개.
  - 커밋 `00ce58fe1` #7 「사진 올리기 단계는 manage」. Owner 승인 문서 없음.
- 실제 동작(`posts/upload-image/route.ts`):
  - 로그인만 확인한다.
  - 한도는 분당 45장, 장당 8MB(`rate-limit-presets.ts:108-116`).
  - 공개 버킷 `post-images`(public=true)에 올리고 공개 주소를 돌려준다.
  - 글에 붙지 않은 사진을 지우는 예약 작업은 없다. `community-post-images-gc` 는 삭제된 글의 사진만 지운다.
- 비교: 같은 「사진 올리기 단계」인 `store-reviews/upload-image`·`event-promotion-requests/[id]/upload-image` 는 `new` 로 남아 있어 기준이 서로 다르다.
- 운영 흔적: 11-21 이후 가입 미완료 회원이 올린 사진은 **0개**다(전체 48개 중).

### F3. 운영 DB 직접 쓰기 — API 가입·동의 검사를 거치지 않고 회원 토큰으로 바로 넣을 수 있는 표
- 조회: `has_table_privilege('authenticated', …,'INSERT')` 가 참이고, INSERT/ALL 정책이 「본인 행」뿐인 표. 앱이 지금 쓰는 표만 적었다.

| 표 | 계약상 행동 (C2 §4 A) | 정책(with check) |
|---|---|---|
| `community_post_saves` | 글 저장 = 가입 필요 | `user_id = auth.uid()` |
| `job_applications` | 일자리 지원 = 가입 필요 (INSERT 트리거가 글 지원 수 +1) | `applicant_id = auth.uid()` |
| `store_favorites` | 매장 찜 = 가입 필요 | `auth.uid() = user_id` |
| `trade_appointments` | 거래 약속 = 가입 필요 | `auth.uid() = proposer_id` |
| `ad_payment_requests` | 광고 신청 = 가입 필요 | `user_id = auth.uid()` |
| `community_friend_favorites` | (계약 문구 없음) | `auth.uid() = user_id` |
| `chat_messages` | 거래 채팅 전송 = 가입 필요 | 보낸 사람 = 본인 **그리고** `chat_room_participants` 에 본인 행 |
| `chat_room_participants` | — | `user_id = auth.uid()` — **방 조건 없음** |

- **보안 결함(가입 범위 밖, 심각)**:
  - `chat_room_participants` 에는 아무 방(room_id)에나 본인을 넣을 수 있다.
  - 넣고 나면 앱 API(거래 채팅 메시지 조회)가 참여자 행만 보고 메시지를 돌려줘 **그 거래 채팅방의 메시지를 읽을 수 있었다.**
  - (정정 2026-11-27 F3 적용 시험: DB 에서 직접 읽기는 기존 SELECT 정책의 무한 재귀(42P17)로 실패한다. 실제 경로는 「DB 에 참여자 직접 추가 → 앱 API 조회」. F3 설계 §10-1)
  - 대상 데이터: `chat_messages` 1,907행(마지막 11-19).
  - 조건: 방 id(UUID)를 알아야 한다.
  - 방 주인이 아닌 참여자 행은 2건(2026-03-31, community 방)이다. 최근 악용 흔적은 없다.
- 운영 흔적: 위 표들의 마지막 행은 모두 11-19 이전이다(저장 10-31, 지원 08-16, 찜 09-17, 약속·광고 0행). 직접 쓰기로 만든 흔적은 없다.
- 실제로 쓰기 시험은 하지 않았다(운영 쓰기 금지). 판정 근거는 운영 정책·권한 조회 결과다.
- 앱이 쓰지 않는 표(`ads`·`chat_requests`·`dibay_*`·`open_chat_*`·`post_likes`)도 같은 형태로 열려 있다. 코드 참조 0건이라 화면 영향은 없다.

### F4. 전화 OTP·주소 저장 서버에 동의 확인 없음 — 계약 C4(동의 뒤)를 화면 순서로만 지킨다
- 계약: C4 B6 「전화 OTP·주소 저장은 동의 뒤, SG-06」. C1 §1 「동의 전 전화 인증 = 결함」.
- 구현:
  - `POST /api/me/phone-verification/send` 는 로그인·세션만 확인하고 SMS 를 보낸다(`send/route.ts:16-55`).
  - 중앙 게이트에서도 동의 예외(`session_identity`)다. `POST /api/me/addresses` 도 동의 예외(`profile_address_correction`)다.
  - 그래서 동의하지 않은 회원도 API 를 직접 부르면 번호가 SMS 업체로 간다.
- 운영 흔적: 11-20 이후 OTP 발송 9건은 모두 동의 기록(`member_consent_events`) 뒤에 있었다. 동의 전 주소 저장은 0건이다.

- **정정 (2026-11-27 F4 설계 §0):** 앱이 쓰는 OTP 경로는 `POST /api/account/phone/send-otp`·`verify-otp` 다(`/api/me/phone-verification/*` 는 호출처 없는 옛 경로). 이 경로는 회원 상태 EXEMPT 라 중앙 게이트를 통째로 건너뛰고, 미동의 회원도 프로필 수정 화면(동의 화면 관문 예외)에서 닿는다. 판정 FAIL 그대로. 수정: `docs/audit/f4-otp-address-consent-design-2026-11-27.md`.

### F5. 전화번호 없이 「전화 인증 완료」인 SNS 회원 13명 — 이 중 12명이 가입 완료로 판정된다
- 계약:
  - C3 Owner 원문 「회원 가입 … 전화 번호 주소 인증」.
  - C3 §11-5 는 「수동 회원 아닌 번호 없는 인증 완료 13명 … 설계 범위 밖이라 그대로 — 보고만」으로 남겨 두었다(미해결).
- 구현: `verifiedPhoneVerdict`(`store-member-policy.ts:152-162`)는 `provider=admin_manual` 일 때만 번호를 요구한다. SNS 회원은 `phone_verified=true` 이면 번호가 없어도 인증으로 본다.
- 운영(86명 기준):
  - 13명이 해당된다: google 6 · kakao 4 · email 3. 모두 `phone_verification_method=admin_manual`, 인증 시각은 2026-04~08.
  - 12명은 동의·대표 주소까지 있어 **가입 완료**로 판정된다.
  - 8명은 11-20 이후 로그인했다(최근 11-27 12:40 PHT).
- 지금 관리자 승인 경로는 번호를 필수로 확인한다(`phone-verification/route.ts:89-92`, `[id]/route.ts:971-974`). 새로 생기지는 않는다.

## 2. Owner 결정 필요 — 계약 문구로 정할 수 없음 (규정 1·7)

| 경로 | 동작 (코드 근거) | 충돌 |
|---|---|---|
| `direct/start` | F1 | C2 A(가입 필요) ↔ C2 C 원리(내용 없는 1:1 방 = 전화만) |
| `POST /api/moim/host-transfers/[transferId]` (수락) | 수락하면 모임장이 됨. 약관 동의만 확인 | C2 「모임 … 수락 = 가입 필요」 ↔ 「모임장 관리 = 가입 없이」 |
| `POST /api/moim/[moimId]/host-inactive-request` | 관리자 큐에 모임장 변경 요청을 새로 등록 | 「관리」인지 「신청」인지 |
| `POST /api/community-messenger/friends/[friendUserId]/favorite` | 친구 즐겨찾기 행 추가(나만 봄). 전화만 확인 | 「찜 추가 = 가입 필요」인지 「내 친구 관리」인지 |
| `POST /api/me/store-phone-verification/send·verify` (`store_apply`) | 새 입점 신청 전 단계 SMS 발송 | 신청 자체(`POST /api/me/stores`)는 가입 필요, 준비 단계는 계약에 없음 |
| 매장 운영 중 새로 만드는 것: 쿠폰 캠페인 생성·재발행, 상품권 신청, 배달 광고 파트너 신청(비즈캐시 차감), 비즈캐시 충전 신청 | 매장 소유만 확인 | C1 「기존 매장 운영 = 예외」 ↔ C2 「신청·결제 = 가입 필요」 |
| `POST /api/community-messenger/bridge/product-chat` | 기존 거래 채팅 참여자만. 메신저 방이 없으면 새로 만듦(`service.ts:11521-11527`) | 근거가 `00ce58fe1`(승인 문서 없음) |

## 3. PASS — 확인한 것

| 항목 | 판정 | 근거 |
|---|---|---|
| 단계 판정·순서(동의 → 전화 → 주소, 관리자 면제) | 코드 PASS | `dibay-registration-steps.ts` `nextRegistrationStep` |
| 화면 이동 관문(미완료면 단계 화면, 통화 화면 예외) | 코드 PASS | `registration-gate.ts` |
| 서버 중앙 쓰기 관문(동의 → 가입, 조회 실패 = 거부) | 코드 PASS | `enforce-api-member-mutation-policy.ts:201-232` |
| 규칙 표 누락 | PASS — 230/230, 표에 없으면 기본 가입 필요 | 계약 테스트 + 별도 집계 |
| C2 §4 A 81개 경로 | F1·F2 6개 외 PASS. split 7개(좋아요·저장·반응·거래 채팅 진입 등)는 새로 만들 때만 가입 확인 | 아래 |
| C2 §4 B 32개 경로(가입 없이 허용) | PASS 32/32 — `new` 로 남은 것 0개 | 규칙 표 대조 |
| C2 §4 C · split 14개 | PASS 14/14 — 새 행동 분기에서만 `requireRegistrationForAction` | 각 라우트 줄 확인 |
| manage 145개 | F1·F2 외 계약 위반 0. 결정 필요 §2 | 라우트 본문 전수(에이전트 2 + 작업자 표본 재확인) |
| 동의 예외 POST 91개 | 분류 이름과 메서드가 맞음(로그인·OTP·탈퇴·기기·신고·차단·나가기·읽음·진행 중 통화·계측). 생성 행동 0 | `member-consent-mutation-policy.ts` |
| 브라우저 코드의 DB 직접 쓰기 | 0건 | 클라이언트 파일 전수 grep |
| 운영 데이터: 11-21 이후 미완료 회원이 만든 글·댓글·좋아요·찜·채팅방·메시지·메신저 방·주문·모임 참여·사진 | 0건 (13개 표 + 저장소) | 읽기 전용 조회 |
| 운영 데이터 정합 | 대표 주소 2개 이상 0 · 같은 번호로 인증된 계정 0 · OTP 발송 실패 0/9 | 읽기 전용 조회 |
| 로그인 계정은 있는데 회원 행이 없음 | 9건(08~11-09 생성, purge 기록 없음). 관리자 목록에 안 보임. 다음 로그인 때 회원 행이 생겨 1단계부터 | `ensure-profile-for-user-id.ts` |

## 4. NOT_PROVEN
- 실기기 신규 가입 전 과정(Android·iPhone).
- F3 직접 쓰기를 실제로 실행해 보는 것(운영 쓰기 금지라 정책 조회로만 판정).
- purge 된 94명의 과거 활동(행이 지워져 조회 불가).
- 11:13~12:35 purge 를 누가 실행했는지.

## 5. 수정 시 규정
- F3 은 운영 DB 정책(RLS) 변경이라 Owner 승인 → DB 적용 → 확인 순서로 한다.
  - `chat_room_participants` 는 보안이라 가장 먼저 한다.
- F1 은 Owner 결정 뒤 진행한다(A 그대로 or C 원리).
- F1·F2 는 화면 안내(가입 이어하기 창) 연결까지 같은 PR 에서 처리한다(설계 규정 4).
- F5 는 데이터(번호 등록 or 인증 해제)와 판정식 중 하나를 Owner 가 정한다.
- 통화 API(`stub-message`)는 통화 변경 규정 대상이다. 가입 작업과 묶지 않는다.
