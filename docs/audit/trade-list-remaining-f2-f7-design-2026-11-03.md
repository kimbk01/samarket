# 거래 목록 남은 항목 F2·F3·F4·F6·F7 — 감사·설계·승인 요청 (2026-11-03)

기준: origin/main `540bd81ee` · 운영 DB `ckdosyydvgzqwpbwuhon` 읽기 전용 조회(11:0x PHT) · 감사·설계만, 코드 변경 없음.
Owner 지시 원문: 「남은 부분은 정확한 감사 설계안을 만들어 승인 요청 해라」
선행 문서: `docs/audit/trade-list-v5-remaining-risk-design-2026-11-03.md` (F1·F5 는 `e620933be` 로 반영 완료)

## 0. 운영 DB 확인 결과 (읽기 전용)
| 항목 | 값 |
|---|---|
| 거래 글 숨김 테이블 | **없음** (`*hide*` 테이블: community_post_hides · 메신저 2종 · store_order_buyer_hides 뿐) |
| `posts.id` | uuid |
| `reports.target_type` CHECK | user · product · chat_room · chat_message · post · comment — **광고(feed_ad) 없음** |
| `reports` 행 | product 5 · user 2 · chat_room 1 |
| 피드 광고 캠페인 | active 5 · paused 24 · ended 42 — **지금 기간 안에 노출되는 캠페인 0건** |
| 샘플(showcase) 활성 | 60건 |
| 거래 글 | 판매완료 3 · 그 외 4 |
| 설치 앱 최신 빌드 | Android `1.2.5 (32)` · iOS `1.2 (21)` (`user_devices.app_version`) |

## 1. F3 광고 줄 어긋남 — 판정 FAIL (코드) · 지금 운영 노출 광고 0건이라 화면엔 아직 안 보임
**원인(코드로 확인):** 광고 위치(`planFeedAdSlots`)는 「실제 글 번호」만 센다. 그런데 같은 2열 격자에 ① 샘플 카드가 실제 글 4개마다 1장(`TRADE_SHOWCASE_EVERY_REAL = 4`) ② 판매완료 등 구분 줄(`col-span-full`)이 끼어든다. 끼어든 칸만큼 왼쪽/오른쪽이 밀린다.

**재현 계산 (모바일 2열, 광고 간격 4):**
```
글1 글2
글3 글4
[광고 — 2칸]          ← 글4 뒤 (정상)
샘플 글5             ← 샘플이 글4 뒤에 끼어 한 칸 밀림
글6 글7
글8 [빈칸]            ← 글8 뒤 광고 → 줄 중간에서 끊겨 빈칸
[광고 — 2칸]
```
- 태블릿(`sm:grid-cols-3`)·와이드(`lg:grid-cols-4`)는 간격을 2의 배수로만 맞추므로 샘플이 없어도 어긋난다.
- 홈(`HomeProductList.tsx:864`)·카테고리(`PostListByCategory.tsx:838`) 둘 다 같은 방식.

**설계:**
- 새 순수 함수 `lib/trade/marketplace/plan-trade-grid-sequence.ts`: 실제 그릴 순서(글·샘플·구분 줄·남은 샘플)를 그대로 받아 칸 위치(0…열 수−1)를 센다. 2칸 전체 항목(구분 줄·광고)을 만나면 0으로. 광고는 **「칸 위치 0」이면서 마지막 광고 뒤 글 수 ≥ 간격(4~6, 기존 시드 그대로)**일 때만 넣는다. 결과 = 「이 글 뒤에 광고」 목록 + 광고 순번.
- 열 수: `useGridColumnCount(ulRef)` — `ResizeObserver` 로 `grid-template-columns` 개수를 읽는다. 서버·첫 그림은 2(지금과 같음 → hydration 차이 없음).
- 홈·카테고리 둘 다 이 함수만 쓴다. `planFeedAdSlots` 의 columnCount 인자 제거(커뮤니티 1열 동작 그대로).
- 바뀌는 파일: 새 파일 2 · `HomeProductList.tsx` · `PostListByCategory.tsx` · `feed-ad-slot-policy.ts` · 테스트.
- 영향: 광고 위치만 바뀐다. 글 순서·페이지·캐시·prewarm 키(`TRADE_HOME_LIST_INVARIANT_IDS`) 무관. 광고 순번이 바뀌므로 같은 세션에서 보이던 광고 순서가 1회 달라질 수 있다.
- 테스트: 샘플 끼움 · 구분 줄이 홀수 뒤 · 2/3/4열 · 간격 4~6 유지 · 광고가 항상 칸 위치 0.
- 분류: **웹**. 실기기 확인: 운영 노출 광고가 0건이라 **광고 줄 화면 확인은 광고를 켜야 가능**(Owner 가 켜거나, 승인 시 기존 캠페인 1개 기간 연장 — 운영 데이터 변경이므로 별도 승인).

## 2. F2 숨김 서버 저장 — DB 변경 (운영 적용 별도 승인)
**현재:** `lib/trade/hidden-posts-store.ts` 메모리만 → 앱을 다시 열면 숨긴 글이 돌아온다(FAIL, 알고 반영한 한계).

**설계 (신고 저장소 `lib/reports/reported-posts-store.ts` 와 같은 방식):**
- 마이그레이션 `supabase/migrations/2026110312xxxx_trade_post_user_hides.sql`
  - `trade_post_user_hides(id uuid pk default gen_random_uuid(), post_id uuid not null → posts(id) on delete cascade, user_id uuid not null → auth.users(id) on delete cascade, created_at timestamptz default now(), unique(post_id, user_id))`
  - 인덱스 `(user_id, created_at desc)` · RLS 켬 · 본인 행 select/insert/delete 정책 (커뮤니티 `community_post_hides` 와 같은 모양)
- API
  - `GET /api/my/hidden-posts` → `{ postIds }` (최근 1000건, `private, no-store`)
  - `POST /api/posts/[id]/hide` · `DELETE /api/posts/[id]/hide` — 로그인 필수, 멱등(이미 있으면 그대로 ok)
- 저장소: 기기 저장 캐시(`dibay:trade-hidden-post-ids:v1`, 최대 500) + 처음 구독할 때 서버에서 1회 읽어 합침. 숨기기·되돌리기는 화면 먼저 바꾸고 서버에 보낸다(실패 시 원래대로 + 안내 없음 — 신고 저장소와 동일). 비로그인은 기기 저장만.
- 로그아웃·계정 전환 시 기기 저장은 기존 `clearEphemeralLocalStorage` 가 지운다(키가 기기 유지 목록에 없음 — 코드 확인).
- 목록 서버 응답에서 빼지 않는다(카드만 가림) → 공용 캐시·페이지 계약 불변. 화면 코드(`PostCard`) 변경 없음.
- 남는 한계: 새 기기 첫 실행에서는 서버 응답(1회) 전까지 숨긴 글이 잠깐 보였다가 가려질 수 있다.
- 바뀌는 파일: 마이그레이션 1 · API 2 · `hidden-posts-store.ts` · 테스트.
- 분류: **DB + 웹**. 순서: 코드 main 반영 → Owner 승인 후 운영 DB 적용 → 적용 결과 조회 보고. (테이블이 없으면 API 는 503 → 저장소는 메모리·기기 저장으로 동작하므로 화면은 깨지지 않는다.)

## 3. F4 광고 「···」 메뉴 — 새 기능 · Owner 결정 필요
**현재:** 광고에 메뉴 없음. DB `reports.target_type` 에 광고가 없어 **신고를 쌓을 수 없다**. 광고는 포인트로 산 유료 노출(`feed_ad_point_holds`)이다.
**설계안:**
- 광고 머리 줄 오른쪽 「···」 → 「이 광고 숨기기」·「광고 신고」.
- 숨기기: 회원별·캠페인별 숨김(기기 저장 + 새 테이블 `feed_ad_user_hides`), 숨기면 그 자리에 같은 슬롯의 다음 캠페인, 없으면 광고 줄을 그리지 않는다(F3 계산은 「광고 자리」 기준이라 빈칸 없음).
- 신고: `reports.target_type` CHECK 에 `feed_ad` 추가(DB) · `target_id = 캠페인 id` · 관리자 거래 신고 목록(`TradeReportsPage.tsx:169` 종류 분기)에 「광고」 종류 추가.
- 같은 광고 컴포넌트를 커뮤니티 피드(`CommunityFeed.tsx:2078`)도 쓰므로 함께 바뀐다.
- **Owner 결정 필요 2개:** ① 유료 광고를 고객이 숨길 수 있게 할지(광고주 노출 감소) ② 커뮤니티 피드까지 같이 적용할지. 계약에 없는 기능이라 작업자가 정하지 않는다.
- 분류: DB(테이블 1 + CHECK 변경) + 웹. 순서: F3 뒤.

## 4. F6 「홍보」→「광고」 문구 — 범위 확정안
**현재 확인:** 판매자는 세 단어를 본다 — 신청 화면 제목 「거래 상위노출」(`promo_sheet_title_trade`) · 상태·필터 「홍보 중」「포인트 홍보」 · 자기 카드·목록 배지 「광고」(`trade_promo_badge`, v5). 번역 카탈로그의 「홍보」는 약 80곳이고 그중 대부분은 관리자·매장·커뮤니티용이다.
**설계 (거래 판매자 화면만 · 작업자 결정):** 원칙 = 「사는 상품 이름은 상위노출, 노출 중 상태와 고객 표시는 광고」.
| 키 (파일) | 지금 | 바꿈 |
|---|---|---|
| `marketplace_seller_promoted_only` 외 6개 (`trade.ts:178-217`) | 포인트 홍보 / 포인트 홍보 중인 매물 … | 광고 중 / 광고 중인 매물 … |
| `promo_sheet_already_active` (거래에서만 새 키 `promo_sheet_already_active_trade`) | 홍보 중 | 광고 중 |
| `notify_trade_promotion_approved_body`·`_ended_body`·`_ended_refund_body` (`notifications.ts:293-298`) | 거래글 홍보가 … | 거래글 상위노출이 … |
| 신청 시트 안내 1줄 추가 (새 키, 거래만) | — | 「노출 중인 글은 목록에 ‘광고’로 표시돼요」 |
- 바꾸지 않음: 관리자 메뉴(「거래 홍보」 등 운영 용어) · 커뮤니티·매장·마이페이지 공용 「내 홍보 / 광고」. 공용 시트 키는 거래 전용 키를 새로 만들어 커뮤니티 문구가 바뀌지 않게 한다.
- 영향: 문구만. 영어 문구도 같은 키로 맞춤(Promoted → Ad / Top exposure 유지).
- 분류: **웹**.

## 5. F7 길게 누르기 실기기 확인 — 확인만 (F1 운영 반영 확인 후)
기준 앱: Android `1.2.5 (32)` · iOS `1.2 (21)` — 웹 변경이라 앱 재시작만. 각 항목에 Production SHA·계정·기기·PHT 시각 기록.
| # | 확인 | 판정 근거 |
|---|---|---|
| 1 | 글 0.5초 길게 누름 → 우리 메뉴(숨기기·신고 / 내 글은 수정·삭제) | 화면 캡처 |
| 2 | iOS 링크 미리보기·안드로이드 링크 복사 메뉴가 **안 뜸** | 캡처 (코드: 카드 `-webkit-touch-callout:none`·`contextmenu` 막음. iOS WKWebView 링크 미리보기 설정은 코드로 확인 못 함 — **NOT_PROVEN**) |
| 3 | 메뉴가 열린 뒤 손을 떼도 상세로 **안 넘어감** | 캡처 (코드: `suppressNextClickRef`) |
| 4 | 스크롤 시작하면 메뉴 안 뜸 · 짧게 누르면 상세 | 캡처 |
| 5 | 안드로이드: 타이머와 기본 길게 누름이 겹쳐 메뉴가 **두 번 열리지 않음** | 캡처 (코드상 두 경로 모두 같은 열기 함수 → 실기기로 확인 필요) |
| 6 | 하트 짧게 누름 = 찜 · 판매완료 글 = 메뉴 없음 | 캡처 |
| 7 | 숨기기 → 자리 카드 + 되돌리기 · 다른 화면(찜·최근 본·검색)에서도 가려짐 | 캡처 |
| 8 | 신고 → 신고 사유 창 → 신고 후 자리 카드 · 운영 `reports` 1행 | 캡처 + DB 조회 |
- 8번은 운영에 실제 신고 1건이 생긴다 → **시험 신고 진행 여부 승인 필요**(관리자 화면에서 기각 처리로 정리).
- 작업자 환경에서 실기기를 직접 못 누른다 → 1~8 은 Owner(또는 Cursor 실기기 세션) 확인용 시트로 넘기고, 작업자는 Production SHA·DB 결과만 대조한다.

## 6. 승인 요청 (순서·분류)
| 순서 | 항목 | 분류 | 필요한 승인 |
|---|---|---|---|
| 1 | F3 광고 줄 칸 위치 계산 | 웹 | 구현 |
| 2 | F6 거래 판매자 문구 (§4 표 범위) | 웹 | 구현 |
| 3 | F2 숨김 서버 저장 | DB + 웹 | 구현 + 운영 DB 적용 |
| 4 | F7 실기기 확인 시트 | 확인 | 시험 신고 1건 허용 여부 |
| 5 | F4 광고 메뉴 | DB + 웹 · 새 기능 | 결정 2개(§3) 후 구현 |

## 7. 범위 밖 · 보고만
- 신고 저장소 기기 키(`dibay:reported-post-ids:v1`)는 회원별이 아니다. 로그아웃·계정 전환 때 지워지므로 지금 화면 결함은 확인되지 않음 — 기록만.
- 운영 캠페인 active 5건이 모두 기간 밖(노출 0). 관리자 화면은 실제 상태를 따로 계산해 보여 준다(설계된 동작, 선행 문서 §0).

## 8. NOT_PROVEN
F1(`e620933be`) 운영 반영 · 길게 누르기 실기기 전부 · iOS 링크 미리보기 설정 · 광고 줄 운영 화면(노출 광고 0건) · Owner 휴대폰·계정 화면
