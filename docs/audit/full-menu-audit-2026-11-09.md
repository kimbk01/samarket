# 전 메뉴 감사 — 로그인부터 각 도메인까지 (2026-11-09)

상태: **감사 보고 · 코드 무변경 · main 미반영 · Owner 검토 전**
기준 코드: 최신 `origin/main` `29d3dd046` (모든 결함은 이 트리에서 다시 읽어 판정)
운영 실측: 2026-11-09 05:18~05:45 PHT · 시험 계정 `11111111-…`(구매자) · 브라우저 창
iPhone·Android 실기 시험은 하지 않았다(Owner 시나리오 승인 전 금지).

판정 표기: **확인됨**(코드 끝까지 추적 또는 운영 실측) · **의심**(일부만 추적) · **NOT_PROVEN**(측정·확인 못 함)

---

## 0. 작업자 행동·한계 먼저 보고

1. 감사 중 거래 상품 상세 2개를 열어 운영 DB 에 메시지 없는 거래 채팅방 1개(`chat_rooms b25a108b`, `product_chats 54edd33e`)가 생기고, 다른 1개 방이 「다시 열림」으로 갱신됐다(§2 T1 결함). 정리하지 않았다 — 데이터 변경 승인 필요.
2. 1차 코드 감사 6개는 실수로 이전 브랜치(`7acd866c2`)를 읽었다. 그래서 **모든 항목을 최신 main 에서 다시 판정**했고, 아래 표는 재판정 결과만 싣는다.
3. 내정보 화면 순회 실측은 도중에 브라우저 폭 설정이 풀려 **대부분 데스크톱 폭(1024)** 으로 측정됐다. 휴대폰 폭 실측은 05:18~05:23 PHT 측정분(홈·커뮤니티·배달·메신저·거래)만이다.
4. 로그인은 운영에서 직접 하지 않았다(비밀번호 입력·로그아웃 금지). 실제 Owner iPhone 로그인(11-08 21:44:30 PHT) 운영 기록과 코드로 판정했다.
5. 감사 중 S2 커밋(`d7a9cdde9`)의 테스트 허용 목록 누락으로 CI 가 실패했다 — `37db602a3` 로 수정(테스트 파일만).

## 1. 동작별 운영 실측 (Supabase 요청 수 · 잠정 목표 30 이하)

조용한 시간 기준값: 12초당 3~5건. 60초 넘게 걸린 창은 다른 사용자 요청이 섞였을 수 있어 「참고」로 둔다.

### 1-1. 로그인 (Owner iPhone 실제 기록, 11-08 21:44 PHT)
- 로그인 화면: `/api/auth/login-settings`, `/api/auth-providers`, `resolve-identifier` POST → Supabase 비밀번호 로그인.
- 직후 1분: `devices/register` **POST 3회**, 프로필 2회, 설정 2회, 배지 3회, 커뮤니티 피드 5회·주제 옵션 4회, 팝업 4회, 친구 요청 5회, **내정보 메뉴 화면 15개를 각 2회씩 미리 받음**(열지 않았는데).

### 1-2. 휴대폰 폭 실측 (05:18~05:23 PHT)

| 동작 | Supabase | 앱 API | 비고 |
|---|---|---|---|
| 홈 첫 진입 | 157 | 28 | |
| 커뮤니티 목록 | 67 | 16 | |
| 커뮤니티 글 상세 | 48~57 | 9~10 | 쓰기 3 (C1) |
| 커뮤니티 목록 복귀 | 30~37 | 10 | |
| 배달 홈 | 96 | 9 | |
| 배달 매장 상세 | 41~47 | 8~10 | |
| 배달 업종 목록 | 57 | 4 | |
| 메신저 목록 | 178 | 40 | 방 bootstrap 미리 받기 28 (G1) |
| 거래 목록 첫 진입 | 132 | 31 | |
| 거래 상품 상세 | 100~110 | 11~13 | 채팅방 생성 (T1) |
| 거래 목록 복귀 | 32~45 | 10~11 | |

### 1-3. 내정보 전 메뉴 순회 (50개 화면 · 대부분 데스크톱 폭 · 05:31~05:45 PHT)

| 메뉴 | Supabase | 앱 API | 화면 진입 중 DB 쓰기(실측) |
|---|---|---|---|
| 내정보 홈 | 54 | 0 (캐시) | |
| 앱 설정 | 37 | 6 | |
| 신뢰도 | 37 | 11 | profiles UPDATE |
| 진행 거래 | 23 | 8 | |
| 거래 채팅 목록 | 41 | 20 | presence 쓰기, 배지 카운터 쓰기 |
| 주문 내역 | 18 | 4 | profiles UPDATE, 주문목록 스냅샷 쓰기 |
| 포인트 | 14 | 3 | |
| 분류 화면 6개 | 7~28 | 3~4 | |
| 알림 설정 | 17 | 7 | user_devices UPDATE |
| 채팅 설정 | 참고 138 | 4 | user_sessions·profiles·배지 쓰기 |
| 캐시 | 34 | 2 | |
| 버전 | 참고 104 | 4 | user_sessions·profiles 쓰기 |
| 주문 상세 | 47 | 5 | 알림 읽음, 상세·대시보드·거래 스냅샷 쓰기 |
| 포인트 충전 | 58 | 3 | |
| 포인트 프로모션 / 소멸 예정 | 29 / 20 | 7 / 3 | |
| 가격 제안 | 14 | 4 | |
| 찜 | 20 | 6 | |
| 최근 본 상품 | 19 | 8 | |
| 지역 설정 | 89 | 12 | user_devices UPDATE |
| 커뮤니티 글·활동·좋아요·북마크·친구 | 11~42 | 3~6 | profiles UPDATE, 토큰 갱신 |
| 매장 문의 | 6 | 3 | |
| 라이더 | 29 | 6 | user_devices UPDATE |
| 쿠폰 / 상품권 | 8 / 44 | 5 / 7 | 상품권: 주문목록 스냅샷 쓰기 |
| 광고 / 혜택 | 11 / 15 | 6 / 4 | |
| 계정 / 주소 | 6 / 6 | 4 / 3 | |
| 결제수단 | 41 | 8 | user_devices UPDATE |
| 즐겨찾기·차단·숨김 사용자 | 7~참고 78 | 1~3 | |
| 고객센터 / 공지 | 25 / 37 | 4 / 9 | 공지: 화면 사전조회 15 |
| 약관 / 개인정보 / 마케팅 | 8 / 참고 82 / 33 | 3~7 | 마케팅: 화면 사전조회 12 |
| 사업자(→사장님 화면) | 18 | 6 | |

**판정:** 내정보는 개별 화면 대부분이 30건 안팎이지만, ① 화면을 열 때마다 프로필·기기·세션 쓰기가 반복되고(L3·L7 실측 확인), ② 홈 진입·로그인 직후 메뉴 화면 15개를 미리 받는다(L8).

## 2. 결함 목록 (최신 main 재판정)

### A. 로그인·앱 시작·공통

| ID | 결함 | 판정 | 위치 |
|---|---|---|---|
| L1 | 화면(RSC)·미리받기 요청마다 proxy 가 프로필을 캐시 없이 조회 | 확인됨 | `lib/auth/proxy-signup-gate.ts:32-36`, `proxy.ts:263-270` |
| L2 | 쓰기 API 마다 회원 상태 RPC 캐시 없이 실행 | 확인됨 | `lib/auth/enforce-api-member-mutation-policy.ts:168-171` |
| L3 | 프로필 조회(GET)가 profiles UPDATE·세션 쓰기를 함 — 캐시된 옛 시각으로 판단해 15초 안에도 반복 | 확인됨 (운영 실측 PATCH profiles·POST user_sessions) | `app/api/me/profile/route.ts:537,667`, `lib/auth/server-guards.ts:571-590,657-700` |
| L4 | 앱 시작 시 프로필을 2번(lite→full) 읽음 (내정보 화면 제외) | 확인됨 | `lib/app-boot/schedule-app-boot-background.ts:98-113` |
| L5 | 로그인 확인 전 1초마다 세션 확인 — 화면 숨겨도 계속, 경로 바뀌면 재시작 | 확인됨 | `components/auth/AuthSessionBoundary.tsx:95,120,125` |
| L6 | 간편 로그인(구글 등) 합성 계정은 로그인마다 비밀번호·메타 재설정 | 확인됨 | `lib/auth/native/google-native-session.server.ts:141-151` |
| L7 | 로그인 직후 기기 등록 POST 최대 3회 (중복 방지 TTL 을 로그인 때 해제, iOS FCM·VoIP 따로, 실패 시 재전송) | 확인됨 (운영 3회) | `lib/push/device-register/register-device-once.ts:23-40` |
| L8 | 내정보 메뉴 링크가 기본 미리받기 → 홈·로그인 직후 메뉴 화면 15개 RSC 요청 | 확인됨 (운영 각 2회) | `components/mypage/myinfo/MyInfoHomeCategoryHub.tsx:134`, `MyInfoMenuItem.tsx:141` |

### B. 내정보·알림·고객센터

| ID | 결함 | 판정 | 위치 |
|---|---|---|---|
| M1 | 요약 API 가 내 글·찜·주문을 제한 없이 전부 읽어 개수만 셈, 서버 캐시 없음, 홈·분류 화면·복귀마다 | 확인됨 | `lib/mypage/mypage-summary.server.ts:109-120` |
| M2 | 항목 화면: 서버가 준 데이터를 클라이언트가 다시 받음 + 설정 재조회 | 확인됨 | `hooks/use-mypage-hub-model.ts:179-181,220` |
| M3 | 알림센터: 요청마다 미읽음 2000행 스캔 2개, 75초 폴링, 읽음 후 자기 이벤트로 재조회, 모두 읽음 2회 조회 | 확인됨 | `app/api/me/notifications/route.ts:378-396`, `components/my/MyNotificationsView.tsx:351-358,470-472` |
| M4 | 알림 상세를 보기만 해도 읽음 쓰기 + 목록 재조회 | 확인됨 | `app/(main)/notifications/[notificationId]/page.tsx:113-127` |
| M5 | 포인트 더보기·필터마다 소멸 예정 1000행 재조회, 고객센터가 잔액만 보려고 포인트 전체 API 호출 | 확인됨 | `app/api/me/points/route.ts:190-199`, `CustomerCenterHubClient.tsx:70` |
| M6 | 주소 연결 오류: 알림 2단 이동, 판매·후기 2단 이동, `/mypage/settings`→설정이 아니라 내정보 홈, `/my/edit` 는 수정 시트를 안 엶 | 확인됨 | `lib/mypage/mypage-profile-routes.ts:3,11,21`, `mypage-section-legacy-redirect.ts:18,24` |

### C. 커뮤니티·홈

| ID | 결함 | 판정 | 위치 |
|---|---|---|---|
| C1 | 글을 열 때마다 알림 지우기·스레드 읽음 POST(대상·로그인 확인 없음, 비로그인 401), 읽음은 지운 것 0건이어도 배지 전체 재계산 | 확인됨 (운영 쓰기 3건) | `components/community/CommunityDetail.tsx:96-106,149-157` |
| C2 | 글 1회 열기에 같은 글 행을 5회 이상 읽음 | 확인됨 | `view/route.ts:84-97`, `comments/route.ts:53,74-78` |
| C3 | `/community/posts/[id]` 메타데이터·본문이 상세 전체 조회를 2번 | 확인됨 | `app/(main)/community/posts/[postId]/page.tsx:19` |
| C4 | **숨김 글 작성자: 본문은 보이는데 댓글은 404** | 확인됨 (기능 결함) | `lib/community-feed/queries.ts:381,390`, `comments/route.ts:53-54` |
| C5 | **`/philife/meetings/[id]` 이동이 항상 실패해 오픈채팅 기본 화면으로 감** (redirect 를 try/catch 가 삼킴) | 확인됨 (기능 결함) | `app/(main)/philife/meetings/[meetingId]/page.tsx:17-28` |
| C6 | 홈 피드 진입마다 목록·주제 옵션 재조회(no-store), 탭 미리받기 | 확인됨 | `components/community/CommunityFeed.tsx:1097-1099,630-634` |
| C7 | 다른 화면에서 미리 받는 피드 주소(`sort=recommended`)를 실제 피드가 쓰지 않음 — 버려지는 조회 | 확인됨 | `components/community/PhilifeFeedWarmPrefetch.tsx:56-59` |
| C8 | 피드 GET 이 지역 행이 없으면 `locations` 에 씀 | 확인됨 | `lib/neighborhood/ensure-location.ts:132` |

### D. 거래

| ID | 결함 | 판정 | 위치 |
|---|---|---|---|
| T1 | **상품 상세를 열기만 해도 거래 채팅방 생성·재오픈**(메시지 0) — 운영 거래 방 444개 중 270개 메시지 0 | 확인됨 (운영 재현) | `components/post/PostDetailView.tsx:1091-1110` → `lib/trade/item-trade-chat-start-core.ts:89-92,346,396,410` |
| T2 | 기존 방 조회와 방 생성 요청이 동시에 나감(서버가 기존 방 정보를 안 줌) | 확인됨 | `services/trade/trade-detail.service.ts`, `PostDetailView.tsx:394-415` |
| T3 | **조회수: 읽고-쓰기(동시 열람 시 누락), 매번 `updated_at` 변경, 사람별 중복 제거 없음** | 확인됨 | `app/api/posts/[postId]/increment-view/route.ts:33-52` |
| T4 | 상세 렌더마다 최근 본 상품 쓰기 최대 4회 | 확인됨 (운영 실측) | `app/(main)/post/[id]/page.tsx:54-60` |
| T5 | 상세 열 때마다 알림 읽음 POST + 배지 재계산 | 확인됨 | `PostDetailPageClient.tsx:139-149` |
| T6 | 목록: 캐시 시작 시 노출 확인 POST 2회, 복귀마다 POST, 상위 16·10개 상세 미리받기 반복 | 확인됨 | `components/home/HomeProductList.tsx:614-636,697-707` |
| T7 | 사용자 프로필 화면: 6단계 순차 조회, 캐시 없음 | 확인됨 | `app/(main)/u/[username]/page.tsx:36-100` |
| T8 | 찜: 개수를 2개 API 가 각각 계산 | 확인됨 | `FavoriteProductsView.tsx:116,141` |

### E. 배달·매장·주문·라이더

| ID | 결함 | 판정 | 위치 |
|---|---|---|---|
| D1 | 배달 홈 주문 요약이 내 주문 전체를 제한 없이 읽음 | 확인됨 | `lib/delivery/customer/load-buyer-store-orders-hub-summary.ts:36-40` |
| D2 | 배달 홈 피드: 캐시 적중에도 캠페인 DB 재조회 | 확인됨 | `app/api/stores/home-feed/route.ts:272-274` |
| D3 | 업종 목록 GET 이 저장본이 없거나 오래되면 스냅샷 쓰기 | 확인됨 | `lib/stores/stores-browse-snapshot.ts:676,749` |
| D4 | 매장 카드마다 화면 근처에서 요약·배너 미리받기 + 페이지 미리받기, 15초 뒤 재실행 / 메뉴 GET 스냅샷 쓰기 | 확인됨 | `lib/dibay/use-delivery-store-detail-viewport-prefetch.ts:10-65`, `store-menus-snapshot.ts:100,331` |
| D5 | 매장 리뷰·가게정보 화면이 자기 API 를 HTTP 로 다시 호출 | 확인됨 | `stores/[slug]/reviews/page.tsx:34`, `info/page.tsx:34` |
| D6 | **주문 상세 GET 이 알림을 지움 — 카드에 마우스만 올려도(미리받기) 알림 배지가 사라짐** | 확인됨 | `app/api/me/store-orders/[orderId]/route.ts:78-89`, `MyStoreOrdersView.tsx:466-467,545-546` |
| D7 | 주문 목록: 탭 개수 제한 없는 조회, 펼침 패널이 같은 실시간을 따로 구독, 이벤트 1건에 목록·상세·이벤트 강제 재조회, 취소 후 2회 | 확인됨 | `MyStoreOrderExpandPanel.tsx:392-400`, `MyStoreOrdersView.tsx:841-844` |
| D8 | 라이더: 개수 세려고 400행, 28초 폴링(숨겨도 계속)+실시간 중복, 위치 32초 POST(숨겨도 계속) | 확인됨 | `app/api/me/rider/bootstrap/route.ts:31-35`, `RiderOrdersClient.tsx:54`, `RiderOrderDetailClient.tsx:150` |
| D9 | 주문 채팅 진입 쓰기 — S1(`de3d1601d`)로 같은 값이면 쓰지 않음. 마우스 올림 시 채팅 화면 미리받기는 남음 | 수정됨(일부) | `app/(main)/orders/store/[orderId]/chat/page.tsx:80` |

### F. 사장님

| ID | 결함 | 판정 | 위치 |
|---|---|---|---|
| O1 | **새 주문 실시간 신호가 와도 20초 캐시를 그대로 받아 배지가 최대 20초 늦음**(무효화 함수 import 만 하고 미사용) | 확인됨 (기능 결함) | `components/business/owner/OwnerHubRuntimeProvider.tsx:34,202,257-266` |
| O2 | 주문 관리: 45초 폴링이 120초 캐시를 읽어 대부분 무의미 + 제공자 45초 폴링 이중 + 같은 실시간 구독 2개 | 확인됨 | `OwnerStoreOrdersView.tsx:954-970`, `owner-store-orders-list-cache.ts:28` |
| O3 | 사업자 정보: 시각을 붙여 캐시를 깨고 매번 DB 조회 | 확인됨 | `BusinessInfoPageClient.tsx:17-18` |
| — | 사장님 설정·상품·쿠폰 등 나머지 화면 | NOT_PROVEN (추적 못 함) | |

### G. 메신저 (통화 항목은 통화 규정 대상)

| ID | 결함 | 판정 | 위치 |
|---|---|---|---|
| G1 | 목록이 상위 28개 방 데이터를 미리 받음 — 목록 서명·배열 참조가 바뀔 때마다 재실행 | 확인됨 (운영 진입 1회 178건) | `CommunityMessengerHome.tsx:2498-2518`, `room-prefetch-queue.ts:27,89-145` |
| G2 | 방 재진입: 실시간 채널 전체 재연결 + 첫 연결 때 모든 방 재조회, 상대 읽음 `>=` 판정으로 같은 값에도 방 데이터 재조회 | 확인됨 (운영 재현) | `global-messenger-room-bundle-channel.ts:493-547`, `messenger-peer-read-cursor-guard.ts:30` |
| G3 | 접속 상태 12초 쓰기(화면 보일 때만) · 수신 통화 확인 2~10초, **화면 숨겨도 멈추지 않음** — 통화 규정 대상 | 확인됨 | `use-community-messenger-presence-runtime.ts:28`, `call-v4-incoming-discovery.ts:32-41,256-271` |
| G4 | 오픈그룹 방 진입마다 참가자 보장 POST, 구 그룹방 진입마다 읽음 POST | 확인됨 | `CommunityMessengerRoomClientInner.tsx:87-105`, `GroupChatRoomClient.tsx:106-124` |
| G5 | 친구 요청: 시작 때 + 실시간 연결 때 2번 조회 | 확인됨 | `use-global-friend-request-feed.ts:171,181-184` |
| G6 | 거래 접속 기록 15초 POST — 거래방 아닌 메신저 방에서도, 숨겨도 계속 | 확인됨 | `components/chats/TradePresenceActivityContext.tsx:75-119` |

## 3. 우선순위 (데이터·기능 결함 먼저, 그다음 요청량)

1. **데이터·기능 결함:** T1(보기만 해도 채팅방 생성) · D6(마우스만 올려도 알림 사라짐) · C4(작성자 댓글 404) · C5(모임 이동 실패) · O1(사장님 새 주문 배지 지연) · T3(조회수 누락·`updated_at` 오염) · M6(잘못된 메뉴 연결).
2. **보기만 해도 DB 쓰기:** L3 · L7 · C1 · C8 · T4 · T5 · M4 · D3 · D4 · G4 · G6.
3. **대량 미리받기:** G1 · L8 · D4 · T6 · C6 · C7.
4. **같은 조회 반복·무거운 조회:** L1 · L2 · L4 · M1 · M2 · M3 · M5 · C2 · C3 · D1 · D2 · D5 · D7 · T7 · T8 · G2 · G5 · O2 · O3.
5. **상시 반복 요청:** L5 · D8 · G3(통화 규정) · M3 폴링.

각 항목은 원인별 설계 → Owner 승인 → 단독 반영 → 운영 실측 순서로 처리한다.

## 4. 확인하지 못한 것 (NOT_PROVEN)
- iPhone·Android 실기, 사장님 계정으로 본 화면 수치.
- 로그인 화면 자체의 운영 실측(작업자 로그인 불가) — 운영 기록 1건으로만 판정.
- 사장님 하위 화면 다수, 카트·주문하기·글쓰기 제출, 검색·이벤트 상세 실측.
- 「참고」로 표시한 창(다른 사용자 요청 섞임 가능)의 정확한 수치.
- 빈 거래 방 270개가 모두 T1 경로로 생겼는지, 판매자 목록에 보이는지.
