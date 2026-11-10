# 메신저 전체 허브 재감사 + 연락처 동기화 통합 (A~I)

- 작성: 2026-11-10 PHT · 감사·설계·시안만 (코드·DB·API·네이티브·커밋·배포 없음)
- **감사 기준**: `origin/main` = `f10a59d5f` (2026-11-10 13:11 PHT). **Production 운영 주소 `samarket.vercel.app` → 배포 `dpl_FXtcYkvBc9TdYuR22uCmaYwLmowz` = 같은 SHA `f10a59d`** (Vercel 별칭 조회). 즉 **main = Production, 차이 없음.**
- 코드는 `git archive origin/main` 사본에서만 읽음. 이 작업 트리 브랜치(`fix/order-chat-list-leave`, main 보다 3커밋 앞섬·다른 작업)와 다른 세션의 미커밋 파일(`docs/design/chat-audit/`, `chat-v4/`, `messenger-chat-list-redesign-audit.html`)은 **읽기만, 수정 없음**.
- 운영 DB: SELECT 만.
- 시안: `docs/design/messenger-contacts-hub-integrated-mockup.html` (모바일 세로 / 태블릿·데스크톱 가로 전환, 버튼으로 이동, 현재·신규·Owner 결정·NOT_PROVEN 표시)
- 판정: **PASS**(확인됨) · **FAIL**(결함) · **PARTIAL** · **NOT_PROVEN**(미확인)

---

## A. 실제 DIBAY 메신저 전체 구조도

```
하단 탭: 홈 · 커뮤니티 · 스토어 · [채팅] · 내정보        (bottom-nav-config.ts:343-356)
   │  채팅 탭 → /community-messenger?section=chats&inbox=unread   (:350)
   ▼
/community-messenger  (모바일 <768: CommunityMessengerHome / ≥768: 목록|상세 분할 MessengerResponsiveShell)
 ├ 머리글 52px: 메신저 · [검색→전역검색] [설정] [알림]          (CommunityMessengerHeaderActions.tsx:38-51)
 ├ 탭 (고정 상수 MESSENGER_MAIN_SECTION_TAB_ORDER = chats·friends·call_logs, messenger-ia.ts:12-16)
 │   ├ 대화: 칩(전체·안읽음·1:1·그룹·거래·배달) + [거래 칸][주문 칸] + 1:1·그룹 목록 + 「보관된 채팅」 행
 │   │        ├ 거래 칸 → /community-messenger/trade-chats   (domain-read/trade-list)
 │   │        └ 주문 칸 → /community-messenger/delivery-chats (domain-read/store-order-customer-list)
 │   ├ 친구: 친구 추가(검색·추가 시트·관리) / 받은 요청 / 내 프로필 / 즐겨찾기 / 새 친구 / 친구
 │   └ 통화: 통화 기록
 └ 방: /community-messenger/rooms/{uuid}  ← 일반·그룹·거래·주문 모두 같은 주소
                                              (알림·푸시도 같은 주소, domain-room-route.ts:20-33)

저장 (운영 DB 2026-11-10):
 community_messenger_rooms (1,590) ─ chat_domain 별
   direct/general_direct 212 · private_group 103 · open_group 8 · direct/trade 444 · direct/store_order 823
 거래 원장: chat_rooms(item_trade 476) · product_chats(487) → community_messenger_room_id 로 연결
 주문 원장: store_orders.community_messenger_room_id → 방
 친구: user_social_relations(friend/blocked) · community_friend_requests · user_relationships(hidden)
```
- **결론: 거래·주문 채팅은 일반 메신저와 같은 방 표(`community_messenger_rooms`)를 쓰고 `chat_domain` 으로 나뉜다** (PASS — 코드 `service.ts:11361-11370`, `store-order-chat-service.ts:519-598` + 운영 행 수). 허브가 다른 저장소를 합치는 구조 아님. 단, 거래는 원장 표 2개(`chat_rooms`, `product_chats`)가 방과 연결됨.

## B. 일반·거래·주문 채팅 연결표

| 항목 | 일반 (1:1·그룹) | 거래 | 주문 |
|---|---|---|---|
| 방 표 | `community_messenger_rooms` | 같음 (`chat_domain='trade'`) | 같음 (`chat_domain='store_order'`) |
| 방 키 | `direct_key` = 두 회원 ID 정렬 `a:b` (`service.ts:1439`) / 그룹 uuid | `trade_item:{chat_rooms.id}` (구 `trade_pc:`), 상품+구매자 1방 (`item-trade-chat-start-core.ts:280-291`) | `store_order:{orderId}` (`store-order-chat-service.ts:519-598`) |
| 시작 | 프로필 「메시지」 → `POST /direct/start` (`service.ts:10039`) / 그룹 만들기 | 상품 상세 「채팅하기」 → `/api/trade/chat/entry/resolve` | 주문 상세 → `/orders/store/[orderId]/chat` → ensure → 방 / 매장 주인 콘솔 |
| 참여자 | 2명 / 그룹 | 판매자·구매자 | 고객·매장 주인 2명 (관리자는 읽기만, 감사 기록) |
| 목록 | bootstrap `chats`+`groups` (`use-community-messenger-home-state.ts:422-466`) | `/api/messenger/domain-read/trade-list` | `…/store-order-customer-list` |
| 목록 표시 | 이름·미리보기 | 상품 제목·상품 사진·판매/구매·상대 사진 | 매장 이름·주문 상태 |
| 안 읽음 | 하단 배지 = 일반+그룹 **방 수** (거래·주문 제외, `community-messenger-unread-total.ts`) | 거래 칸 배지 (`trade_domain`) | 주문 칸 배지, 끝난 주문은 고객 쪽 자동 읽음 (`mark-buyer-order-chat-read-on-close.ts`) |
| 알림 종류 | chat_message / group_message | trade_message | store_order_message · order_status |
| 알림 → 방 | `/community-messenger/rooms/{id}` | 같음 | 같음 |
| 나가기 | 그룹 주인 제외 | 가능 (다시 들어오면 복귀) | 고객 언제나 · 매장 주인 불가 |
| 보내기 막힘 | 차단(1:1) · 거절 | 거래 모드 limited/readonly | completed · cancelled (refunded 등은 **막히지 않음** → §I-결함) |
| 차단 영향 | 1:1 양방향 막힘 | **기존 방 막지 않음**, 새 방 생성만 막음 (`community-direct-social-block-gate.ts:21-26`) | **막지 않음** |
| 통화 | 상대 통화 설정(기본 everyone) | 판매자 글 설정(기본 없음) | 매장 설정(기본 켜짐) |
| 친구와 관계 | 친구 아니어도 1:1 가능 | **친구 아님** (친구 행 생성 코드 없음, 계약 금지) | **친구 아님** |
| 허브 표시 | 대화 탭 목록 | 대화 탭 「거래」 칸 / 칩 | 대화 탭 「주문」 칸 / 칩 |

## C. 메신저 허브 UI/UX/CTA 전수 감사표

| 화면·요소 | 현재 (코드) | 연락처 기능 반영 | 판정 |
|---|---|---|---|
| 하단 탭 | 5개, 방 화면에서 숨김(분할 화면 제외) | 변경 없음 | PASS |
| 머리글 | 52px, 검색·설정·알림. **추가 버튼 없음** | 변경 없음 (연락처 새로고침은 연락처 화면 안에만) | PASS |
| 상단 탭 | 대화·친구·통화 (고정 상수, 변경은 Owner 승인) | **변경 없음** — v2 「전체 친구/연락처/요청」 하위 탭 안 철회 | PASS |
| 대화 탭 | 칩 6 + 거래·주문 칸 + 목록 + 보관 행, 정렬 = 고정 → 최근 활동 | 변경 없음 | PASS |
| 거래·주문 구분 | 전용 칸·하위 주소·색 표시(거래/배달) | 변경 없음 | PASS |
| 친구 탭 | 친구 추가(검색·추가·관리) / 받은 요청 / 내 프로필 / 즐겨찾기 / 새 친구 / 친구 | **내 프로필 아래에 「내 연락처의 DIBAY 회원」 섹션 1개만 추가** (3명 + 모두 보기, 동의 전엔 1줄 안내) | 신규 |
| 친구 추가 시트 「연락처」 탭 | 스위치 2개, **아무 동작 없음** | 동의 화면 / 연락처 화면 열기 버튼으로 교체 | FAIL(현재) → 신규 |
| 친구 행 | 이름·상태 | 친구이면서 내 연락처에 있으면 「내 연락처」 작은 표시 | 신규 (#5) |
| 친구 프로필 시트 | 메시지·음성·영상·즐겨찾기·숨김·알림·그룹 초대·삭제·차단·신고·요청 버튼 (`MessengerFriendProfileSheet.tsx:150-247`) | **전부 유지**. 4단계에 통화 버튼 → DIBAY/휴대폰 선택 | PASS / 신규(4단계) |
| 관리 | 보관함·「친구 관리」 시트: 숨김·차단·거절한 요청 | 같은 행 형식으로 「숨긴 추천」·「연락처 동기화」 2줄 추가 | 신규 |
| 거래·주문 방 | 상품·주문 카드, 거래 상태 줄, 주문 상태 | 변경 없음 | PASS |
| 거래·주문 상대 프로필 | 방 머리글 메뉴 (세부 동작 미추적) | 변경 없음 | NOT_PROVEN |
| 분할 화면 (≥768px) | 목록 clamp(360px,35vw,470px) | 연락처 화면·관리는 오른쪽 칸 | 신규 (시안) |
| Windows | WebView2 셸, 메신저 전용 분기 없음 | 연락처 읽기 불가 → 보기·관리만 | PASS |
| Android·iOS | 메신저 목록 분기 없음 (통화 코드만) | 연락처 읽기는 네이티브 플러그인 (2단계) | PASS |
| 시트·안전 영역 | `MessengerSheetUi` + `--safe-bottom` | 같은 시트 사용 | PASS |
| 터치 영역 | 버튼 46/40px, 탭 44px | 시안 44px 이상 | PASS (시안) |
| 기존 접근 단계 | — | 기존 기능 숨김·이동·단계 추가 **없음** | PASS (설계) |
- 다른 세션 미승인 시안(`chat-v4` — 친구 탭을 「받은 친구 요청 / 새 친구 / 친구」로 정리, 행 높이 72/64/56)과 **충돌 없음**: 연락처 섹션은 어느 쪽 구성에도 「내 프로필 아래 1섹션」으로 들어감.

## D. 연락처 v4 × 기존 기능 충돌·회귀 분석

| # | 상황 | 기존 코드 동작 | 신규 영향 | 변경 필요 | 회귀 위험 |
|---|---|---|---|---|---|
| 1 | 거래 상대를 연락처에서 발견 | 거래방(`trade_item:`)은 친구 무관 | 연락처 회원 행 1개. 거래방과 **합치지 않고 친구로 바꾸지 않음** | 없음 | 없음 |
| 2 | 주문 상대(매장 주인)를 발견 | 주문방은 주문 단위 | 매장 주인의 **개인 번호**가 내 연락처에 있을 때만 회원 행. 매장 전화번호와 무관 | 없음 | 없음 |
| 3 | 이미 친구 | 친구 목록 | 연락처 섹션에서 빠짐, 친구 행에 「내 연락처」 표시 | 없음 | 없음 |
| 4 | 연락처에서 친구 요청 + 기존 방 있음 | 친구 요청은 방을 만들지 않음 | 기존 1:1·거래·주문 방 그대로 | 없음 | 없음 |
| 5 | 친구 삭제 + 거래방 있음 | 거래방은 친구와 무관 | 트리거가 재추천 제한 1행만. 거래방 영향 없음 | 없음 | 트리거 실패 시 친구 삭제 실패 가능 (§G-5) |
| 6 | 친구 차단 + 주문 진행 중 | 주문방 보내기는 차단 검사 제외 → 계속 가능 | 영향 없음 | 없음 | 없음 |
| 7 | 거래 상대 차단 | 기존 거래방 보내기 가능, 새 거래방 생성 막힘 | 영향 없음 (연락처 섹션에서는 빠짐) | 없음 | 없음 |
| 8 | 친구 숨김 vs 방 숨김(보관) | 서로 다른 표 (`user_relationships` hidden / 방 `is_archived`) | 연락처는 둘 다 건드리지 않음 | 없음 | 없음 |
| 9 | 연락처 끄기·동의 철회 | — | 방·친구 그대로 (연락처 표만 삭제) | 없음 | 없음 |
| 10 | A 기기 발견 회원을 B 에서 | — | 계정 목록, B 에 번호 없으면 「다른 기기」 | 없음 | 없음 |
| 11 | 채팅 상대 번호 변경 | 방은 회원 ID 기준 | 연락처 매칭만 하루 안에 갱신 | 없음 | 없음 |
| 12 | 닉네임·ID 변경 | 방은 uuid 기준 | 영향 없음 | 없음 | 없음 |
| 13 | 같은 상대와 일반·거래·주문 방 동시 | 방 3개 별도 (도메인 분리 HARD LOCK `dibay-chat-call-current-normal-hard-lock.md:123`) | 연락처는 사람 1행, 「메시지」 = 일반 1:1 방 | 없음 | 없음 |
| 14 | 기존 알림 → 방 | 공통 주소 해석 (`resolve-notification-destination.ts`) | 가입 안내만 친구 탭으로 (기존 친구 알림과 같은 경로) | 없음 | 없음 |
| 15 | 그룹방에 차단 회원 | 그룹 보내기는 차단 검사 제외, 초대만 막힘 | 영향 없음 | 없음 | 기존 계약 확인 NOT_PROVEN (§I) |
- **원 요구 「자동 친구 추가」 vs v4 「친구 요청」 불일치 → Owner 결정 #16** (§I).

## E. 통합 HTML 시안
`docs/design/messenger-contacts-hub-integrated-mockup.html` — 화면 1~10 + 동의 전·기기 B·숨긴 추천·기기 목록. 모바일 세로 / 가로 분할 전환. 운영 API 호출 없음.
- 확인 조건: 로컬 파일, 앱 내 브라우저(데스크톱). 14개 바로가기 버튼 클릭 시 오류 0 (JS 실행 확인), 가로 분할·시트 화면 캡처 확인. **실기기 미확인.**

## F. 서버 요청량·DB 부하·용량

### F-1. 기존 메신저 부하 (실측 · 운영 `pg_stat_statements`, 2026-10-22 14:31 UTC 이후 누적)
| 함수 | 호출 | 평균 | 최대 |
|---|---|---|---|
| `get_cm_bootstrap_full_snapshot` | 967 | 183 ms | 7,908 ms |
| `get_cm_bootstrap_critical_snapshot` | 877 | 99 ms | 4,671 ms |
| `upsert_cm_bootstrap_snapshot_if_watermark_fence` | 1,622 | 22.6 ms | 1,344 ms |
| `invalidate_cm_bootstrap_snapshot_watermark` | 4,341 | 2.6 ms | 1,229 ms |
| `user_social_relations` 조회 (상위 3종) | 43,493 / 24,718 / 8,620 | 0.1 ms | — |
| `cm_send_friend_request` / `cm_accept_friend_request` | 80 / 40 | 4.7 / 7.7 ms | 21 / 23 ms |
- 과부하 이력: 2026-10-23 02:15~03:07 PHT — 반복 통화 시험이 홈·방 bootstrap 재호출을 일으켜 full snapshot 평균 2.9초·연결 고갈 → DB 정지 (`docs/audit/messenger-2026-10-22-reaudit-plan.md:913-958`). 「낡은 스냅숏 먼저」 정책 유지 필수.

### F-2. 연락처 기능의 요청 설계 (기존 경로에 0 추가)
| 규칙 | 근거 |
|---|---|
| bootstrap·home-sync·critical 응답에 연락처 **넣지 않음** | `docs/messenger-bootstrap-contract.md:56` (친구 그래프는 bootstrap 밖) |
| 연락처 목록은 친구 탭이 **보일 때** 1회 GET (버전 비교), 같은 화면 머무는 동안 재호출 없음, 탭 재진입 60초 안 재호출 없음, 회원별 single-flight | `docs/messenger-realtime-policy.md:12,48-51` |
| 메시지·읽음·통화·친구 Realtime 이벤트로 **연락처 재조회 안 함** (친구 탭 「내 연락처」 표시는 받아 둔 목록으로 계산) | 같은 문서 |
| 방 진입 시 연락처 호출 없음 | — |
| 앱 시작·복귀: 기기 안 비교만, 바뀐 게 있을 때만 업로드 + 기기 하루 1회 `last_used_at` 갱신 | §G-3 |
| 응답 `Cache-Control: private, no-store` (회원별) | 기존 edge cache 는 bootstrap 만 |

### F-3. 요청 수 (가정 — 실측 아님)
| 종류 | 1기기 기준 | 가정 |
|---|---|---|
| 첫 전체 동기화 | 3요청 1회 (출처 등록 1 + 500번호 조각 1 + 목록 1) · DB 500행 쓰기·500회 색인 조회 | 연락처 500개 |
| 변경분 업로드 | 0~1요청/일 | 연락처 변경 하루 1회 이하 |
| 기기 사용 갱신 | 1요청/일 | §G-3 |
| 목록 버전 확인 | 친구 탭 방문 수 (대부분 「변경 없음」, 1행 읽기) | 하루 5회 |
| 합계 | 첫날 ~10, 이후 ~7 요청/일 | 활성 142명 → ~1,000요청/일 |
| A·B 동시 | 출처별 행 잠금, 계정 버전 1행 갱신만 직렬 | — |
| 가입 안내 | 가입 1건당 최대 200건 알림 (기존 친구 알림 경로) | — |
| 예약 작업 | 하루 1회, **20:10 UTC (04:10 PHT)** — 기존 19:30·19:50 정리 작업과 겹치지 않게 | 현재 수백 행 |
- 기존 bootstrap(평균 183ms)과 비교할 실측 쿼리 시간: 신규 표가 없어 **실행 계획·쿼리 시간 NOT_PROVEN**.

### F-4. 용량 (검증값 / 계산값 분리)
| 항목 | 값 | 구분 |
|---|---|---|
| 운영 DB | 336 MB | 검증 |
| 메신저 최대 표 | room bootstrap snapshots 31 MB · messages 17 MB · unread idempotency 10 MB | 검증 |
| 연락처 1행 데이터 / 색인 키 | 100 B / 73 B | 검증 (`pg_column_size`) |
| 1행 점유 | 약 320 B | 계산 |
| 142명×500×1기기 | 약 23 MB (DB 의 약 7%) | 계산 |
| 1만 / 10만 명 | 1.6 GB / 16 GB | 계산 |
| 디스크 한도·여유율 | 조회 불가 | **NOT_PROVEN** |

## G. v4 계획 수정 필요 사항 (→ 계획안 v5)
| # | v4 | 수정 | 이유 |
|---|---|---|---|
| G-1 | 친구 화면 하위 탭 「전체 친구/연락처/요청」 (v2~v4 시안) | **철회.** 친구 탭에 「내 연락처의 DIBAY 회원」 섹션 1개 + 연락처 전용 화면 | 기존 요청 카드 위치·탭 구조 변경 금지, 접근 단계 증가 금지 |
| G-2 | 새 알림 종류 `messenger_contact_joined` (종류 목록·등록부·선호 정책·DB 체크 제약 4곳 변경) | **새 종류 없음.** 기존 친구 알림과 같은 `appendUserNotification`(`notification_type:"status"`, `push_kind:"community"`, `meta.kind:"contact_joined"`, 친구 탭 링크) | 알림·푸시 코드 변경 0. 계약 `friend-contact-ssot-lock.md` 「기존 appendUserNotification 경로만」과 일치. 푸시 채널은 community(`dibay_community_v1`) |
| G-3 | `last_used_at` = 연락처 API 호출 시 | **앱 시작 시 하루 1회 출처 갱신** 추가 | 친구 탭을 안 여는 정상 기기가 180일 뒤 삭제되는 결함 방지 |
| G-4 | OS 권한 철회 → 업로드 중단, 데이터 계속 사용 | 철회 감지 시 「이 기기 연락처를 서버에서도 지울까요? [지우기] [유지]」 1회 | 사용자 기대(권한 끔 = 사용 중단)와 다를 수 있음 → Owner #19 |
| G-5 | 트리거 「무시 수준」 | **철회.** 트리거는 친구 삭제·차단과 같은 트랜잭션 → 트리거 오류 = 친구 삭제·차단 실패. 방식 2개 중 결정 필요 (#18): ① 엄격(같이 실패 · 재추천 보장) ② 관대(트리거 오류를 경고로 남기고 친구 작업은 성공 · 드물게 1회 재추천) | 기존 친구 기능 보호 vs 재추천 보장 |
| G-6 | 「테스트 후 적용」 | 테스트 DB·새 환경 사용 금지 규정 → 트리거는 **로컬 SQL 단위 시험 + 운영 적용 직후 읽기 확인**만 가능. 운영에서 킬스위치로 막을 수 없음(트리거는 적용 즉시 동작) → 1단계를 **1a(표·RPC·API, 꺼진 상태) / 1b(트리거)** 로 분리 | 운영 위험 분리 |
| G-7 | 예약 작업 시각 미지정 | 20:10 UTC (04:10 PHT) | 기존 정리 작업과 겹침 방지 |
| G-8 | 연락처 화면 위치 미정 | 모바일 = 전체 화면 / 가로 = 오른쪽 칸 | 기존 분할 규칙 |
| G-9 | — | 비목표 명시: 거래·주문 방·배지·알림·차단 규칙·통화 정책 **변경 없음** | 도메인 분리 HARD LOCK |

## H. 단계별 구현·검증·롤백 (v5)
| 단계 | 범위 | 검증 | 롤백 |
|---|---|---|---|
| 1a | 신규 표 6·RPC·API 11·어드민 설정·예약 작업 (킬스위치 꺼짐) | typecheck·vitest(정규화·규약·제외 규칙)·eslint · 운영 적용 후 표·색인·RLS 조회 · 기존 메신저 경로 호출 수 변화 0 확인 | 킬스위치 · down 마이그레이션 · Vercel 되돌리기 |
| 1b | 트리거 2개 (#18 방식) | SQL 단위 시험 · 적용 직후 친구 삭제·차단·계정 삭제 운영 확인 (Owner 계정) | `DROP TRIGGER` (즉시) |
| 2 | 네이티브 플러그인·권한 + 친구 탭 섹션·연락처 화면·동의·관리 2줄·기기 목록·휴대폰 전화 | + `check:i18n-quality` · 실기기 Android·iPhone (Owner 계정) · 친구 탭 F-1~F-11 회귀 · S15 주요 상황 | 킬스위치 (구 바이너리 무영향) |
| 3 | 가입 안내 (기존 친구 알림 경로) · 어드민 집계 | 시험 가입 → 1회 · 재설치 재발송 없음 | 어드민 「가입 안내 끄기」 |
| 3-b | 차단·거절당한 쪽 문구 4개 (#7) | 차단한 쪽/당한 쪽 실기기 | 문구 되돌림 |
| 4 | 통화 선택 시트·기본 통화 방식·통화 문구 | 통화 규정 실기기 행렬 | 통화 단독 커밋 되돌림 |

## I. Owner 결정 최종 정책표 (결정이 필요한 것만)
| # | 항목 | 권장 |
|---|---|---|
| **16** | **원 요구 「자동 친구 추가」** vs v4 「연락처 표시 + 친구 요청」 | 요청 방식 (계약 `friend-contact-ssot-lock.md` Forbidden 「friend-add UX creating friend rows without accept」 · 거래·주문 상대 자동 친구화 위험). 자동 추가를 원하면 친구 계약 변경 승인 필요 |
| 18 | 트리거 실패 방식 | ② 관대 — 기존 친구 삭제·차단 보호 우선, 실패 시 경고 기록·어드민 집계 |
| 19 | OS 권한 철회 시 서버 연락처 | 지울지 1회 묻기 |
| 17 | 연락처 회원 프로필에 「거래 채팅 상대」 표시 | 표시 안 함 (추가 조회 필요, 범위 밖) — 시안에는 검토용으로만 표시 |
| 1 | 번호로 나를 찾기 기본값 | 모두 — 단, 번호를 아는 사람이 가입 여부를 알 수 있음(개인정보 영향). 「서로 저장한 사람만」도 가능 |
| 2 | 기존 회원 번호 등록 | 동의한 순간 |
| 3 | 가입 안내 대상 | 가입 7일 안 첫 동의 |
| 4 | 번호 변경 안내 | 안 보냄 |
| 5 | 친구 행 「내 연락처」 표시 | 표시 |
| 6 | 차단 해제 후 추천 | 안 함 |
| 7 | 상대 모름 범위 | A안 (문구 중립) |
| 8 | 유료 일반전화 | 안 넣음 |
| 9 | 기본 통화 방식 | 넣음 (4단계) |
| 10 | 미사용 기기 정리 | 180일 (+ G-3 하루 1회 갱신) |
| 14 | 친구 삭제 시 재추천 제한 | 양쪽 「이전 친구」 — 부작용: 삭제당한 쪽도 상대를 연락처 추천에서 못 봄 (ID 검색으로는 가능) |
| 15 | 기능 시작 전 삭제된 친구 | 1회 추천될 수 있음 |
| — | 승인됨 / 범위 제외 | #11·#12 승인 · #13 제외 |

### I-1. 감사 중 발견 결함 (보고만 · 이번 범위 아님)
| 결함 | 판정 | 근거 |
|---|---|---|
| 주문 채팅: `refunded`·`refund_requested`·`cancel_requested` 상태에서 보내기 안 막힘 (종료 상태 목록과 불일치) | FAIL | `assert-messenger-room-send-allowed.ts:25-32` vs `store-order-process-model.ts:35-40` |
| 친구 추가 시트 연락처 탭 스위치 무동작 | FAIL | `MessengerFriendAddSheet.tsx:171` |
| 전화 인증=true·번호 없음 32명 → 연락처로 찾을 수 없음 | FAIL (유지, 보정 안 함) | 운영 DB |
| 그룹방 안 차단 상대 송수신 가능 — 계약 여부 | NOT_PROVEN | `assert-messenger-room-send-allowed.ts:110-119` |
| 거래방 통화 오류 코드 `trade_chat_call_friend_required_after_complete` 정의만 있고 미사용 | 보고 | `enforce-messenger-trade-room-call-policy.ts:16` |
| 거래 글 삭제 시 채팅 숨김 여부 | NOT_PROVEN | `owner-delete/route.ts:110-123` |

### I-2. PASS / NOT_PROVEN 요약
- PASS: main=Production 동일 SHA · 방 저장 구조(도메인 공통 표) · 허브 탭·칩·칸 구조 · 친구 탭 구성 · 거래·주문의 친구 무관성 · 차단의 거래·주문 미적용 · 알림 공통 주소 · 기존 부하 실측값.
- NOT_PROVEN: 신규 표 쿼리 시간·실행 계획 · 디스크 한도 · 거래·주문 상대 프로필 세부 · 실기기 화면 · 재설치 후 설치 ID 유지 · 그룹 차단 계약.
