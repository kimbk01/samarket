# 가입 진행 중 회원 — 행동·안내·버튼 단일 정의(SSOT) 설계 (2026-11-21)

상태: **설계안 — 구현 전, Owner 승인 대기.** 코드·DB 변경 없음.
조회 조건: 운영 `a8032b7`(PR #538~#541 반영) 코드 · 운영 DB 읽기 전용 · 운영 사이트 비로그인 요청(curl, 브라우저 자동화 아님).
근거: Owner 2026-11-21 「계속적인 결함으로 수정 감사 수정을 반복 … 끝까지 시나리오별 프로세스를 확인하고, 결함안의 수정안을 보고하고, ui ux cta ssot 되도록 정확한 설계안」.

## 0. 왜 반복됐나 (작업자 원인)

1. **규칙이 세 곳에 따로 있다.**
   - 서버 경로 예외표: `lib/auth/member-registration-mutation-policy.ts`
   - 화면 행동표: `lib/profile/profile-requirements.ts`
   - 버튼별 오류 처리: 화면마다 따로
   - 셋을 사람이 맞춰야 해서, 하나를 고치면 다른 곳이 어긋났다.
2. **경로 목록 추출이 두 번 틀렸다.**
   - ① 한 파일에 쓰기 방식이 여러 개(수정+삭제 등)인 경로를 빠뜨렸다.
   - ② 다른 파일의 처리를 다시 내보내는 별칭 경로(`/api/philife/*` 9개 — 화면이 실제로 부르는 경로)를 빠뜨렸다.
   - 재감사 때 「91개」로 봤지만 실제는 **123개**다(운영 코드 a8032b7, 세 방식 모두 포함해 다시 셈).
3. **한 경로가 「수락·거절」 또는 「추가·해제」를 같이 처리한다.** 경로만 보는 서버 문지기로는 둘을 나눌 수 없다.
4. **버튼 대부분이 서버 거절을 일반 오류로 보여 준다.** 「가입 이어하기」로 이어지지 않는다(§3).

→ 고치는 방향:
- 규칙은 **한 표**에만 두고, 서버·화면이 모두 그 표를 읽는다.
- 안내는 **한 장치**만 쓴다.
- **새 쓰기 경로가 표에 없으면 CI 가 실패**하게 해서 다시 어긋나지 않게 한다.

## 1. 회원 상태 (판정은 서버 `getOnboardingStatus` 하나)

| 상태 | 조건 |
|---|---|
| G 비로그인 | 세션 없음 |
| C 미동의 | 로그인 + 약관 미동의 |
| P 전화 필요 | 동의 + 전화 미인증 (대표 주소 무관) |
| A 주소 필요 | 동의 + 전화 인증 + 대표 주소 없음 |
| R 가입 완료 | 동의 + 전화 + 대표 주소 |
| M 관리자 | 활성 관리자 멤버십 admin·super_admin — 가입 조건 면제 |

관리자가 만든 아이디 계정(`admin_manual`)은 전화 인증 완료로 본다(기존 `hasVerifiedPhone`).

## 2. 시나리오별 확인 결과 (운영 코드 기준)

| # | 시나리오 | 지금 | 판정 |
|---|---|---|---|
| S1 | 비로그인 홈·필라이프·마켓·매장·내정보·메신저 첫 화면·글 상세 | 200, 글 데이터 응답 | PASS (운영 curl) |
| S2 | 비로그인 글쓰기·채팅 목록 | 로그인으로 이동 | PASS (계약) |
| S3 | 비로그인 배달 매장 메뉴 | 로그인 유도 패널 | 계약(Owner 10-29) |
| S4 | 신규 가입(웹·카카오·구글·애플·아이디·PC QR) | 동의 → 전화 → 주소 → 원래 화면 | 코드 PASS · 실기 NOT_PROVEN |
| S5 | 기존 P·A 회원 로그인 | 빠진 단계부터, [나중에 하기] | 코드 PASS |
| S6 | 앱 재실행(로그인 유지) | 세션당 1회 단계 화면 | 코드 PASS |
| **S7** | **푸시 알림·링크로 채팅방·글에 바로 진입(P·A)** | **세션당 1회 안내가 그 화면을 가로채 가입 화면부터 뜬다**(예외는 통화 화면뿐) | **FAIL** |
| S8 | 약관 개정 재동의(11-20 게시) | 재동의 → 원래 화면, 다음 이동 때 1회 단계 안내 | 코드 PASS |
| S9 | 받은 통화 수신·수락·종료(P·A) | 통화 API 전부 예외 | 코드 PASS |
| **S10** | **통화 걸기** | 대화방이 이미 있으면 전화 인증만 확인(결정대로). **대화방이 없는 상대에게 걸면** 통화 경로가 먼저 방을 만드는데(`POST /api/community-messenger/rooms` — `lib/community-messenger/call-session-navigation-seed.ts`), 이 방 만들기가 대표 주소까지 요구해 A 회원은 걸 수 없다 | **FAIL** — Owner 결정(전화 인증만)과 충돌 |
| **S11** | **P·A 의 새 행동(글·댓글·좋아요·채팅·주문·친구 요청 등)** | 서버는 막는다. 화면 안내는 일부 버튼만 「가입 이어하기」, 나머지는 일반 오류·무반응 | **FAIL** (§3) |
| **S12** | **P·A 의 정리·관리·수정·거절·읽음** | 일부가 막힌다 — §4 B·C | **FAIL** |
| S13 | 같은 번호, 다른 로그인 방법(이메일 같음) | 「기존 계정으로 로그인 후 연결」 안내 | PASS |
| S14 | 같은 번호, 다른 로그인 방법(이메일 다름·없음·숨김) | 새 계정 → 전화 단계 「이 번호로 가입된 계정이 있어요」 | 코드 PASS |
| **S15** | **S14 뒤 원래 계정에서 그 로그인 방법을 연결** | 먼저 생긴 계정이 그 로그인 방법을 잡고 있어 **연결 거부**, 탈퇴로도 안 풀림 | **FAIL** (§8-1) |
| S16 | 탈퇴 신청~관리자 처리 사이의 번호 | 다른 계정에서 사용 불가 (대기 0건) | 낮음 |
| S17 | 관리자(M) | 서버·화면 모두 면제 | 코드 PASS |
| S18 | 가입 진행 중 사장님(1명) | 기존 매장 운영·주문 처리·쿠폰·배달 광고 예외 | 코드 PASS |

## 3. 화면 버튼별 처리 (전수 조사 · 코드 기준, 실제 화면은 NOT_PROVEN)

가입 진행 중 회원이 서버에 거절당했을 때(403 `signup_incomplete`) 사용자가 보는 것:

| 보이는 것 | 호출부 수(근사) | 대표 |
|---|---|---|
| 「가입 이어하기」 안내 창 (정상) | 약 25 — **모임만** | 모임 글·일정·초대·참여 |
| 동의 화면을 거쳐 가입 단계 화면으로 **전체 이동** — 보던 화면·쓰던 글·보내던 사진/음성 사라짐 | 약 32 | 메신저 전송·사진·파일·음성·스티커·반응, 거래 채팅 전송, 거래·서비스 글 등록, 배달 주문 |
| 오류 코드 **원문 「signup_incomplete」** 표시 | 약 16 | 상품 댓글, 일자리 지원, 필라이프 댓글 수정, 내 공감·저장 해제, 동네 일괄 변경, 사장님 이벤트·팝업 신청 |
| **틀린 문구** | 6 | 「차단 관계에서는 공감/댓글을…」 3, 전달 「연결이 불안정해요」, 상품권 「친구에게만…」, 친구 요청 기본 문구 |
| 일반 실패 문구 | 약 40 | 친구 요청 수락·거절, 그룹 참여, 광고·포인트·상품권·리뷰, QR, 후기, 고객센터 댓글 |
| **아무 표시 없음** | 약 15 | 그룹 차단 해제, 가입 요청 승인·거절, 가입 요청 취소(**화면만 성공 표시**), 그룹채팅 전송, 매장 찜, 관심이웃, 「모두 읽음」, 선물함 받기, /products/new |
| 자동 호출이 조용히 실패 | 4 | 그룹방 읽음 수(방 열 때마다), 선물 카드 보낸 사람 표시, 작성기 닫을 때 사진 정리, 「채팅하기」 누르기 시작 때 방 미리 만들기 |

- 로그인한 회원에게 **미리 확인(행동 게이트)이 있는 버튼은 약 17곳**뿐이다. 나머지는 서버에 보낸 뒤에야 거절을 안다.
- 행동표에 정의만 있고 어디서도 쓰지 않는 항목: `messenger_send_message`(연결된 버튼 행동 없음), `review_write`(사용처 0).

## 4. 123개 쓰기 분류 — 단일 규칙

**규칙 1줄:**
- **새로 만드는 행동** — 글, 댓글, 좋아요·저장·찜 **추가**, 채팅 시작·전송, 주문·결제·쿠폰 받기, 친구·모임·그룹 **참여·초대·수락**, 후기, 신청 → 가입 필요.
- **이미 있는 내 것의 관리** — 수정, 삭제, **해제**, **거절**, 취소, 숨기기, 읽음, 방장·모임장 관리, 고객지원 → 가입 없이 가능.

### A. 새 행동 — 가입 필요 (지금 그대로 막음, 안내만 통일)
| 경로 | 행동 |
|---|---|
| `POST /api/ads/apply`, `POST /api/me/feed-ad-requests`(+`upload`), `POST /api/me/feed-ad-campaigns/[id]/renew`, `POST /api/me/platform-popup-requests`(+`creative`·`submit`), `POST /api/me/event-promotion-requests`(+`submit`·`upload-image`) | 광고·홍보 신청 |
| `POST /api/chat/create-room`, `POST /api/chat/item/start`, `POST /api/trade/chat/entry/resolve`, `POST /api/chat/room/[roomId]/send`, `POST /api/chat/rooms/[roomId]/messages`, `POST /api/chat/rooms/[roomId]/appointments` | 거래 채팅 시작·전송·약속 |
| `POST /api/community-messenger/direct/start`, `POST …/rooms/[roomId]/messages`(+`forward`·`sticker`·`voice`·`images`·`images/upload-urls`·`files`·`files/upload-url`), `POST …/messages/[messageId]/reactions` | 메신저 대화 시작·전송·반응 |
| `POST …/friend-requests`, `POST …/friend-qr/add` | 친구 요청 보내기 |
| `POST …/group-rooms`, `POST …/groups/create`, `POST …/group-rooms/join`, `POST …/group-rooms/join-request`, `POST …/open-groups/[roomId]/join`, `POST …/group-rooms/[roomId]/participants`(초대) | 그룹 만들기·참여·초대 |
| `POST /api/group-chat/rooms`, `…/[roomId]/join`, `…/[roomId]/messages` | 그룹 채팅 |
| `POST /api/community/posts`, `POST /api/community/neighborhood-posts`, `POST …/posts/[postId]/comments`, `POST …/comments/[commentId]/like`, `POST …/posts/[postId]/like`, `POST …/posts/[postId]/save`, `POST …/share/internal`, `POST /api/community/upload-image`(+`from-url`) 와 같은 처리의 별칭 `POST /api/philife/posts`·`…/neighborhood-posts`·`…/posts/[postId]/comments`·`…/comments/[commentId]/like`·`…/posts/[postId]/like`·`…/upload-image`(+`from-url`) | 필라이프 글·댓글·좋아요·저장·공유 |
| `POST /api/posts/create`, `POST /api/posts/upload-image`, `POST /api/posts/[postId]/comments`, `POST /api/posts/[postId]/job-apply`, `POST /api/offers` | 거래 글·댓글·지원·가격 제안 |
| `POST /api/trade/product-chat/[roomId]/rating`, `POST /api/me/store-reviews`(+`upload-image`) | 후기 |
| `POST /api/me/store-orders`, `POST /api/me/store-coupons/claim`, `POST /api/me/points/charge`, `POST /api/me/points/promotion-orders`, `POST /api/me/apple-iap/prepare`, `POST /api/me/gift-certificates/purchase`, `…/transfers/offer`, `…/transfers/presentation`, `…/transfers/[transferId]/accept` | 주문·결제·쿠폰·선물 |
| `POST /api/me/stores` | 새 입점 신청 |
| `POST /api/stores/[slug]/favorite` | 매장 찜 추가 |
| `POST /api/me/settings/notices/[noticeId]/comments` | 공지 댓글 |
| `POST /api/moim`, `POST /api/moim/[moimId]/join`, `…/posts`, `…/album`, `…/boards`, `…/schedules`, `…/invites`, `…/invite-links`, `POST /api/moim/posts/[postId]/comments`, `POST /api/moim/schedules/[scheduleId]/join` | 모임 만들기·참여·글·초대 |

### B. 관리·정리·수정·읽음 — **가입 없이 허용으로 바꿈** (지금 막혀 있는 것 = 결함)
| 경로 | 행동 | 지금 |
|---|---|---|
| `POST /api/me/settings/notices` | 공지 **모두 읽음** | 막힘 — 읽기 처리 |
| `POST /api/community-messenger/group-rooms/[roomId]/media` | 그룹 대화 **읽음 수 조회** | 막힘 — 읽기 |
| `DELETE /api/community/posts/[postId]/like`, `DELETE …/save`, `DELETE /api/stores/[slug]/favorite` | 좋아요·저장·찜 **해제** | 막힘 |
| `PATCH /api/community/neighborhood-posts/[postId]`, `PATCH /api/community/posts/[postId]/comments/[commentId]`, `PATCH /api/community-messenger/rooms/[roomId]/messages/[messageId]`, `PATCH /api/moim/posts/[postId]` | 내 글·댓글·메시지 **수정** | 막힘 |
| `DELETE /api/me/settings/notices/[noticeId]/comments/[commentId]` | 내 공지 댓글 삭제 | 막힘 |
| `PATCH`·`DELETE /api/me/event-promotion-requests/[requestId]`, `PATCH /api/me/feed-ad-requests/[id]`, `PATCH /api/me/platform-popup-requests/[requestId]` | 내 신청 수정·취소 | 막힘 |
| `POST /api/community/upload-image/discard` | 안 쓴 사진 정리 | 막힘 |
| `POST /api/me/posts/bulk-region` | 내 글 지역 일괄 정리 | 막힘 |
| `POST /api/community-messenger/friend-qr/regenerate` | 내 친구 QR 다시 만들기 | 막힘 |
| `DELETE /api/community-messenger/friend-requests/[requestId]` | 보낸 친구 요청 취소 | 막힘 |
| `POST`·`DELETE /api/community-messenger/group-rooms/[roomId]/bans`, `POST …/join-requests`(방장 승인·거절), `DELETE …/participants`(내보내기·나가기) | 그룹 방장 관리·나가기 | 막힘 |
| `PATCH /api/moim/[moimId]`, `PATCH …/profile`, `POST /api/moim/album/[itemId]/pin`, `POST /api/moim/posts/[postId]/pin`, `PATCH`·`DELETE /api/moim/schedules/[scheduleId]`, `POST …/participants/[userId]`(모임장 승인·출석) | 모임장 관리·내 모임 프로필 | 막힘 |
| `POST /api/me/admin-notes/[threadId]` | 고객지원(관리자 쪽지) 답장 | 막힘 |
| `POST /api/community-messenger/group-rooms/[roomId]/media` 외 읽기성 POST: `POST /api/me/gift-certificates/transfers/presentation`(선물 카드 보낸 사람 표시) | 읽기 | 막힘 — 자동 호출 실패 |
| `PATCH /api/community-messenger/rooms/[roomId]/messages/[messageId]` 의 「나에게서 삭제」·「모두에게서 삭제」 | 내 메시지 삭제 | 막힘 |
| `PATCH /api/philife/neighborhood-posts/[postId]`, `PATCH /api/philife/posts/[postId]/comments/[commentId]` | 필라이프 내 글·댓글 수정(별칭) | 막힘 |
| `POST /api/auth/naver/*` | 사용 중지(410) 경로 | 분류 대상 아님 → 회원 쓰기 분류에서 제외 |

### C. 한 경로에 「새 행동」과 「정리」가 함께 — **라우트 안에서 새 행동만 가입 확인**
| 경로 | 가입 필요 | 가입 없이 |
|---|---|---|
| `PATCH /api/community-messenger/friend-requests/[requestId]` · `POST …/respond-incoming` | 수락 | **거절**·취소 |
| `POST /api/moim/invites/[inviteId]` | 수락 | **거절** |
| `POST /api/favorites/toggle` | 찜 추가 | 찜 해제 |
| `POST /api/community/neighbor-relations` | 관심이웃 추가 | 해제 |
| `POST /api/community-messenger/rooms` (1:1 방 만들기) | — (방만 만들고 내용은 없음 → **전화 인증만**) | 메시지 전송은 A 그대로 가입 필요. 통화 걸기 경로가 이 방 만들기를 쓰므로 Owner 결정(통화 = 전화 인증만)과 맞춘다(S10) |

C 는 중앙 문지기(경로만 봄)에서 빼고, 각 라우트가 같은 서버 함수 `requireRegistrationForAction(userId)`(쓰기 검사 스냅샷과 같은 판정)를 **새 행동 분기에서만** 부른다.

## 5. 단일 정의 설계 (UI·UX·CTA SSOT)

### 5-1. 규칙 — 한 표 `lib/auth/member-action-registry.ts` (신규)
- 회원 쓰기 경로마다 `{ method, path, kind: "new" | "manage" | "split", actionId }` 를 둔다. `actionId` 는 화면 행동 이름이다(예: `community_like`).
- 서버 중앙 문지기는 이 표에서 `kind: "new"` 만 가입을 확인한다. 지금의 예외 목록(`member-registration-mutation-policy`)은 이 표에서 만든다.
- 화면 행동표(`ACTION_PROFILE_REQUIREMENTS`)의 가입 요구도 같은 표의 `actionId` 로 만든다. 둘이 따로 정의되지 않는다.
- **계약 테스트**:
  - `app/api` 의 모든 회원 쓰기(PRODUCT_WRITE·동의 대상) 경로가 표에 있어야 한다. 새 경로가 표에 없으면 CI 가 실패한다.
  - 경로를 셀 때 세 방식을 모두 센다: `export function`, `export const`, 다시 내보내기 `export { … } from`(이번에 두 번 빠진 원인).
  - 행동표에만 있고 쓰이지 않는 행동(`messenger_send_message`·`review_write`)은 표에서 실제 버튼에 연결하거나 지운다.

### 5-2. 서버 응답 — 하나
- 가입 진행 중 거절 = `403 { code: "signup_incomplete", step: "phone" | "address" }` (지금 그대로).
- C 라우트도 같은 응답을 쓴다.

### 5-3. 화면 안내 — 한 장치, 두 겹
1. **미리 확인 (주 경로)** — 모든 새 행동 버튼은 `requireAuthAction(actionId)` 를 거친다. 비로그인 → 로그인 창, 미동의 → 동의 화면, P·A → 「가입 이어하기」 창. 로그인한 회원도 예외 없이 거친다. §3 의 미연결 버튼을 전부 연결한다.
2. **동의 화면 경유 이동을 없앤다** — 공용 처리 `redirectForBlockedAction`(메신저·거래 채팅·글 등록·주문 약 32곳)은 `signup_incomplete` 에 `step` 이 있으면 화면을 옮기지 않고 「가입 이어하기」 창만 연다. 보던 화면·쓰던 글·보내던 사진이 남는다. 동의 미완(`step` 없음)은 지금처럼 동의 화면.
3. **안전망 (빠진 곳 대비)** — `/api` 응답을 한 곳에서 보는 장치를 둔다.
   - 선례: 같은 방식인 `lib/auth/session-freshness-fetch-gate.client.ts` 가 이미 승인돼 쓰이고 있다.
   - 403 `signup_incomplete`+`step` 을 받으면 「가입 이어하기」 창을 1회 연다(같은 순간 여러 요청은 1번만).
   - 같은 순간 버튼 쪽 일반 오류 알림(메신저 스낵바·내정보 토스트)은 띄우지 않는다. 이 알림 함수들이 「안내 창 열림」 표식을 본다.
   - 통화 경로(`call`)는 제외한다(통화 규정).
   - 서버 403 의 `message` 를 코드 원문 대신 요청 언어의 문장(카탈로그 `auth_reg_gate_title`)으로 준다 — 원문을 그대로 찍는 화면 16곳도 사람 말로 보인다.

### 5-4. 안내 창·단계 화면 — 문구·버튼 고정
| 자리 | 문구 키 | 버튼 |
|---|---|---|
| 가입 이어하기 창 | `auth_reg_gate_title`「가입을 마치면 이용할 수 있어요」 + 빠진 항목(전화번호 인증·대표 주소) | 주 버튼 `auth_reg_gate_cta`「가입 이어하기」 → 빠진 단계(`next` = 지금 화면) · 보조 「취소」 |
| 전화 단계 | `auth_reg_phone_*` | 인증(기존 전화 인증) · [나중에 하기] → `next` · 중복 번호면 원래 계정 안내 |
| 주소 단계 | `auth_reg_address_*` | [주소 등록하기](기존 주소 흐름) · [나중에 하기] |
| 통화 걸기(P) | 기존 전화 인증 안내 | 기존 그대로 |

모든 새 행동에서 이 창 하나만 쓴다(필라이프·거래·메신저·모임·주문 공통). 버튼마다 따로 쓰던 실패 문구는 가입 진행 중일 때 쓰지 않는다.

### 5-5. 세션당 1회 안내 — 진입 화면 한정 (S7 수정)
- 탭 첫 화면(홈·필라이프·마켓·매장·메신저·내정보)에 들어올 때만 1회 안내한다.
- 푸시·링크로 바로 들어온 채팅방·글·주문·통화 화면에서는 안내하지 않는다. 그 화면은 그대로 열린다.

### 5-6. 같은 번호 · 로그인 방법 (S15 — 설계서 `auth-entry-phone-address-consent-design-2026-11-20.md` §8-1)
- 전화 단계 중복 안내에 버튼 「이 계정 지우고 원래 계정으로 로그인」을 추가한다.
- 서버가 빈 계정인지 확인한 뒤에만 지운다. 빈 계정 = 전화 미인증, 글·댓글·거래·채팅·주문·친구 0.
- 지운 뒤 로그인 화면으로 보낸다. 원래 계정에서 연결된 로그인 관리로 그 로그인 방법을 추가할 수 있다.
- 빈 계정이 아니면 고객센터 안내만 한다.

## 6. 바뀌는 파일 (예상)
- 표: `lib/auth/member-action-registry.ts`(신규) · `member-registration-mutation-policy.ts`(표에서 생성) · `lib/profile/profile-requirements.ts`(표에서 생성)
- 서버 C: 친구 요청 PATCH·respond-incoming, 모임 초대, 찜 토글, 관심이웃, 1:1 방 만들기(전화 인증만) 라우트 + `requireRegistrationForAction`
- 공용 처리: `lib/auth/client-access-flow.ts` `redirectForBlockedAction`(이동 대신 안내 창)
- 안내: `lib/auth/registration-guidance-fetch-gate.client.ts`(신규, 설치 위치 = 세션 신선도 관문과 같은 곳) · 알림 함수 2~3곳(표식 확인) · §3 미연결 버튼
- 세션 1회: `lib/auth/profile-setup-flow.ts` (탭 첫 화면만)
- §5-6: 빈 계정 삭제 API 1개 + 전화 단계 버튼
- 테스트: 표 계약(전 경로) · 분류 · C 분기 · 안전망 · 세션 1회
- `[배포 구분]` 웹만. DB 변경 없음.

## 7. 통화 규정 확인
- 통화 코드·통화 API·푸시·네이티브는 바꾸지 않는다.
- 바뀌는 것은 1:1 방 만들기(`POST /api/community-messenger/rooms`)의 가입 요구다. 「대표 주소까지」를 「전화 인증만」으로 낮춘다.
- 이 변경으로 A 회원이 대화방이 없는 상대에게 통화를 걸 수 있게 된다. 지금은 대표 주소가 없어 실패한다.
- 통화 결과가 바뀌므로 통화 규정 5번 최소 행렬로 실기 확인한다. 대상: 대화방이 없는 상대에게 음성·영상 발신·수신·종료. 통화 규정 4번대로 이 변경만 **단독 PR·단독 병합**으로 한다(PR 0).

## 8. 반영 순서·검증
0. 1:1 방 만들기 = 전화 인증만 (PR 0, 통화 영향 단독) → 1. 규칙 표 + 서버 B·C (PR 1) → 2. 화면 안내 SSOT + 버튼 연결 + 세션 1회 (PR 2) → 3. §5-6 빈 계정 정리 (PR 3, 계정 삭제라 단독)
- 각 PR: 로컬 `typecheck:build`·`typecheck:test`·`test:ci`·`check:i18n-quality` 1회. 배포 전 보고 → Owner 「병합」.
- 실기 (Android 시험폰, 실행 10회 이내): 상태 P·A 계정으로 §4 A 대표 행동 각 1개(안내 창), B 대표 각 1개(동작), C 수락/거절, 푸시 진입 채팅방(가로채지 않음), 신규 가입 전체 흐름.

## 9. 결정 기록 (Owner 2026-11-27 「권장안대로 설계」 → 「승인, 구현 진행」)

- 이 문서는 2026-11-21 승인 뒤 저장소에 커밋되지 않은 채 로컬 파일로만 있었다(코드 주석은 이 문서를 가리킴). 2026-11-27 원문 그대로 커밋하고, 이 절만 덧붙였다.
- 감사 `registration-process-contract-audit-2026-11-27.md` §2 「Owner 결정 필요」 7건의 결정. 설계 `f1-registration-decisions-design-2026-11-27.md`.

| 경로 | 결정 |
|---|---|
| `POST /api/community-messenger/direct/start` | **split** — 새 1:1 방 = 가입 필요(§4 A 그대로) · 기존 방 다시 열기 = 가입 없이 |
| `POST /api/community-messenger/rooms` (1:1) | **그대로** — 통화 경로라 전화 인증만(§4 C·§7). 메시지 보내기는 가입 필요 |
| `POST /api/moim/host-transfers/[transferId]` | **split** — 수락 = 가입 필요 · 거절 = 가입 없이 |
| `POST /api/moim/[moimId]/host-inactive-request` | **새 행동(가입 필요)** — 관리자 큐에 새 요청 |
| `POST /api/community-messenger/friends/[friendUserId]/favorite` | 관리(가입 없이) — 그대로 |
| `POST /api/me/store-phone-verification/send` | **split** — 새 입점 신청(store_apply·storeId 없음) = 가입 필요 · 내 매장 번호 변경·보완 제출 = 가입 없이. `verify` 는 그대로 |
| 매장 운영 중 쿠폰·상품권 신청·배달 광고 신청·비즈캐시 충전 | 기존 매장 운영 예외 — 그대로 |
| `POST /api/community-messenger/bridge/product-chat` | 관리(가입 없이) — 그대로 |
