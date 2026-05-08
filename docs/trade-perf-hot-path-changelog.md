# 거래·체감 속도 핫패스 — 수정 이력 (append-only)

> **목적**: 속도·진입 경로를 바꿀 때 **무엇이 개선된 상태인지** 남겨, 이후 작업이 **의도 없이 예전(느린) 구조로 되돌아가는 것**을 줄인다.  
> **원칙**: 이 파일은 **삭제하지 않고**, 새 이력은 **항상 아래에 추가**한다. 예전 항목을 고치지 않는다(잘못 적었으면 새 행으로 정정 사유를 남긴다).

**연계 규칙**

- 절차: `.cursor/rules/samarket-perf-change-protocol.mdc`
- 계약: `.cursor/rules/trade-post-detail-chat-hot-path.mdc`, `.cursor/rules/chat-detail-bottom-nav-authority.mdc`
- 자동 검증: `npm run verify:trade-hot-path-contract`

---

## 이력 추가 방법 (PR·커밋 시 필수)

아래 **거래 핫패스·메신저 탭·RSC 분리** 중 하나를 바꾸면, **같은 PR(또는 연속 커밋)** 에서 반드시 표를 한 줄 추가한다.

1. **날짜**: `YYYY-MM-DD` (작업일)
2. **영역**: 예) 상세 RSC / 채팅 진입 / 목록 prefetch / 메신저 탭
3. **변경 요약**: 한 줄로 “무엇을 개선 상태로 고정했는지”
4. **주요 파일**: 쉼표 구분 경로
5. **검증**: 실행한 명령·수동 확인 (예: `verify:trade-hot-path-contract`, `tsc`)
6. **되돌림 시**: 되돌리려면 규칙·주석·스크립트를 **함께** 갱신해야 함을 적음

**역행 금지**: 이력 없이 계약만 지우거나, 검증 스크립트 금지 목록만 삭제해 통과시키지 말 것.

---

## 이력

| 날짜 | 영역 | 변경 요약 (개선으로 고정된 상태) | 주요 파일 | 검증 | 되돌림 시 |
|------|------|----------------------------------|-----------|------|-----------|
| 2026-05-03 | 메신저 탭 | 채팅 상세(`isChatRoomDetail`)에서 메인 BottomNav 비표시를 **경로 플래그 단일 권한**으로 고정. store·키보드로 탭을 다시 조종하지 않음 | `conditional-app-shell-flags.ts`, `ConditionalAppShell.tsx`, `useMessengerUIStore.ts`(플래그 제거), `CommunityMessengerRoomPhase2.tsx` | 수동·레이아웃 확인 | `chat-detail-bottom-nav-authority.mdc` 및 플래그 주석과 함께 제품 결정 필요 |
| 2026-05-03 | 채팅 진입 | 신규 거래 채팅: 상세에서 **동기 방 생성 대기 제거**, 즉시 `compose` 로 `replace` → `TradeChatComposeClient` 에서 확정 | `trade-chat-entry-navigation.ts`, `TradeChatComposeClient.tsx` | 수동 플로우 | `trade-post-detail-chat-hot-path.mdc`·모듈 CONTRACT 주석과 함께 변경 |
| 2026-05-03 | 상세 RSC | `getItemDetailPageData` **첫 응답에서 related·거래방 시드·판매자 제안 시드 제외**. related 는 `GET /api/posts/[id]/related` 만 사용 | `trade-detail.service.ts`, `PostDetailPageClient.tsx`, `app/api/posts/[postId]/related/route.ts` | `npm run verify:trade-hot-path-contract`, `tsc` | 검증 스크립트·계약 주석 제거 없이 RSC에 다시 합치지 말 것 |
| 2026-05-03 | 목록→상세 | 홈 거래 목록 상단 카드 **`/post/:id` idle prefetch** 로 상세 RSC 선행 | `HomeProductList.tsx` | 수동 | `trade-post-detail-chat-hot-path.mdc` 참고 후 조정 |
| 2026-05-03 | 상세→채팅 예열 | 상세 마운트·짧은 호버에서 `prefetchTradeChatEntry(..., prepareIfCreate)` 강화 | `PostDetailView.tsx` | 수동 | 계약 문서에 맞춰 조정 |
| 2026-05-03 | 운영 절차 | 역행 방지: **`samarket-perf-change-protocol.mdc`**(항시), **`verify:trade-hot-path-contract`**, `npm run check` 포함 | `.cursor/rules/*.mdc`, `scripts/verify-trade-hot-path-contract.cjs`, `package.json` | `npm run verify:trade-hot-path-contract` | 스크립트 완화 시 본 changelog 에 **사유 행** 추가 |
| 2026-05-03 | 상세 related UI | **유사·판매자 물품 미표시 수정**: related 클라 fetch 가 `runSingleFlight`+Strict Mode 에서 `setRelated` 영구 스킵되던 버그 → `AbortController` 로 교체 (하단 메뉴와 무관) | `PostDetailPageClient.tsx`, `trade-post-detail-chat-hot-path.mdc` | `tsc`, 수동 상세 확인 | 다시 `runSingleFlight`+cancelled 패턴으로 되돌리지 말 것 |
| 2026-05-03 | 상세 related 신뢰성 | 클라 `/api/.../related` 단독 의존 제거 → **`getItemDetailPageData` 가 `getTradeDetailRelatedData` 를 프로필·제안과 병렬 await** 해 RSC 번들에 실음 (유사·판매자 물품 복구) | `trade-detail.service.ts`, `PostDetailPageClient.tsx`, `trade-post-detail-chat-hot-path.mdc` | `verify:trade-hot-path-contract`, `tsc` | 상세 첫 화면을 클라 related 단독으로만 두지 말 것 |
| 2026-05-03 | 메신저 탭 | **`GET …/home-sync?tier=critical`** 방 목록 조립 시 프로필을 **`hydrateProfilesLabelsOnly`** 로만 채움(`getViewerRelationSets` 3쿼리 생략). **`tier=full`**·부트스트랩 전체 경로는 기존 **`hydrateProfiles`** 유지 | `lib/community-messenger/service.ts` (`listCommunityMessengerMyChatsAndGroups`) | `npx tsc --noEmit`, 수동 Network `home-sync` critical | critical 단계에서 관계 플래그가 비어 있으면 full 동기 후 정상; 되돌림 시 changelog·의도 명시 |
| 2026-05-04 | 채팅 진입 | 거래 방 URL이 **메신저 방 UUID** 일 때 `warmChatRoomEntryById`(레거시 `/api/chat/room/…/bootstrap`)만 웜업되던 간극을 줄이기 위해 **`prefetchCommunityMessengerRoomSnapshot(cmRoomId)`** 를 compose 확정·기존방 진입·목록 prefetch 에 추가해 `/api/community-messenger/rooms/…/bootstrap` 리스트 모드 캐시를 선채움 | `TradeChatComposeClient.tsx`, `trade-chat-entry-navigation.ts`, `room-snapshot-cache.ts`(기존 API 재사용) | `npm run verify:trade-hot-path-contract`, `npx tsc --noEmit` | 메신저 방 진입이 다시 콜드 스타트만 두지 말 것 |
| 2026-05-04 | 채팅 진입(resolve) | **`resolveTradeChatEntry` 가 동일 프로세스 안에서 `POST /api/chat/item/start` 를 다시 HTTP 호출하던 병목 제거** — `runItemTradeChatStartCore` 단일 코어 공유. **`TRADE_ENTRY_PERF_LOG=1`** 일 때 단계별 ms 로그(`trade-entry-perf-log.ts`). 측정 절차: `docs/trade-entry-resolve-perf.md` | `item-trade-chat-start-core.ts`, `trade-chat-entry-resolve.ts`, `app/api/chat/item/start/route.ts`, `app/api/trade/chat/entry/resolve/route.ts`, `trade-entry-perf-log.ts` | `verify:trade-hot-path-contract`, `tsc`, 수동 Network 3회 + 서버 `_total_ms` 대조 | 예전처럼 resolve 안에서 내부 `fetch(item/start)` 를 되살리지 말 것 |
| 2026-05-04 | 거래 표면 정합 | 글쓰기 런처 **거래 루트**를 `/market` 홈칩과 동일 소스(`getHomeChipCategories` ∩ `can_write`)로 통일. 거래 채팅 목록 `contextMeta`에 **`categoryMenuLabel`** 보강·1행 표시 | `getWritableRootCategoriesForWriteLauncher.ts`, `service.ts`, `view-model.ts`, `TradeChatListRowContent.tsx`, `category-menu-label.ts`, `community-messenger-trade-chat-list.md` | `verify:trade-hot-path-contract`, `npx tsc --noEmit`, `npm run verify:messenger-home`, vitest 해당 파일 | 런처만 `quick_create` 로 마켓 탭과 갈라지게 되돌리지 말 것 |
| 2026-05-05 | 거래 채팅 목록 | 1행 칩이 대메뉴만 보이던 문제를 **`productCategoryLabel`**(게시글 `trade_category_id` 의 카테고리 `name`) 우선 표시로 해소. `headline` 은 `title` 공백 시 `meta.listing_title` 등 보조 | `types.ts`, `room-context-meta.ts`, `product-chat-messenger-meta.ts`, `service.ts`, `trade-post-row-fields.ts`, `view-model.ts`, `TradeChatListRowContent.tsx`, `community-messenger-trade-chat-list.md` | `verify:trade-hot-path-contract`, `npx tsc --noEmit`, vitest 해당 모듈 | leaf 라벨 없이 대메뉴만 두고 세부 구분을 숨기지 말 것 |
| 2026-05-05 | 거래 채팅 목록 | **`useTradeChatListMetaHydration`**: 썸네일이 이미 있어도 `postId` 있는데 **`productCategoryLabel` 비면** `trade-chat-list-meta` 를 **방당 1회** 호출(구 캐시·옛 부트스트랩 보강). 거래 방만 `communityMessengerRoomIsTrade` 로 한정 | `use-trade-chat-list-meta-hydration.ts` | `tsc` | 썸네일만 조건으로 leaf 보강을 영구 스킵하지 말 것 |
| 2026-05-05 | 거래 채팅 목록 | **근본**: `sortRoomsWithStableOutput`·`visibleChatListInputKey` 정렬/가시 캐시 키가 **`thumbnailUrl`만** 포함해 `contextMeta` 보강 후에도 **옛 `chats` 행 참조가 캐시 히트**로 남음 → `messengerRoomTradeListMetaSig` 로 headline·leaf 라벨 등을 키·행 동결에 포함 | `use-community-messenger-home-state.ts` | `tsc` | 거래 목록 캐시 키에서 trade 메타 시그니처를 빼면 동일 증상 재발 |
| 2026-05-05 | 거래 채팅 목록 | **근본(2)**: `home-sync` `critical_patch` 가 `mergeCriticalRoomPatchesIntoLists` 로 상단 방을 **통째 교체**하면서 서버 페이로드가 `contextMeta` 를 빼거나 `headline:"거래"` 만 주면 **클라 보강분이 덮어써져 소거**됨 → `mergeMessengerRoomSummaryForHomeSyncCriticalPatch` 로 이전 trade 메타 우선 유지 | `merge-critical-home-sync-room-summary.ts`, `use-community-messenger-home-bootstrap.ts` | `tsc`, vitest `merge-critical-home-sync-room-summary.test.ts` | critical 병합 시 trade 메타를 무조건 incoming 만 믿지 말 것 |
| 2026-05-05 | 거래 채팅 목록 | 목록 2행 제목·가격: `contextMeta` 가 `"거래"` 등일 때 **`GET /api/community-messenger/trade-post-list-preview?postId=`** 로 `posts` 제목·가격 확정 + `useTradeChatListPostPreviewFields` 클라 캐시 | `trade-post-list-preview/route.ts`, `use-trade-chat-list-post-preview-fields.ts`, `MessengerChatListItem.tsx`, `TradeChatListRowContent.tsx` | `tsc`, vitest, `verify:trade-hot-path-contract` | 인증 없이 postId 열람 API 추가 금지 |
| 2026-05-04 | 거래 채팅 목록 | **4행 UI**: 1행 칩은 **`categoryMenuLabel`(5대 메뉴)만**; 4행은 **`sellerDisplayName`**(`enrichTradeRoomContextMetaForBootstrap` 마지막 배치 — `product_chats.seller_id` 우선·없으면 `posts.user_id` + `fetchProfilesByIds`). 삭제 글은 preview **404** 시 제목 **「삭제된 거래글」**. 정렬 캐시 시그니처에 `sellerDisplayName` 포함 | `types.ts`, `room-context-meta.ts`, `product-chat-messenger-meta.ts`, `merge-critical-home-sync-room-summary.ts`, `service.ts`, `view-model.ts`, `use-trade-chat-list-post-preview-fields.ts`, `TradeChatListRowContent.tsx`, `MessengerChatListItem.tsx`, `use-community-messenger-home-state.ts`, `community-messenger-trade-chat-list.md` | `verify:trade-hot-path-contract`, `npx tsc --noEmit` | 목록 enrich 호출 순서·tier·입장 경로를 바꾸지 말 것; `critical_patch` 병합 시 `sellerDisplayName` 역행 방지 유지 |
| 2026-05-05 | 거래 채팅 목록 | **연결·enrich**: `item_trade` 경로에서 **`product_chats.community_messenger_room_id` 미저장**이면 Phase B 조인 실패 → **항상** `persistProductChatMessengerRoomId`. 썸네일만 있고 headline `"거래"`·`postId` 비면 **`product_chats`→`posts` 재보강**. 브리지가 **`summary` 를 카테고리 없는 메타로 덮어쓰던 것** 제거 | `service.ts` (`ensureCommunityMessengerDirectRoomFromProductChat`, `enrichTradeRoomContextMetaForBootstrap`), `app/api/community-messenger/bridge/product-chat/route.ts`, `MessengerChatListItem.tsx`(dev 로그), `community-messenger-trade-room-post-linkage.md` | `verify:trade-hot-path-contract`, `npx tsc --noEmit` | `trade_post_id` 컬럼 추가·unread/bootstrap 변경 금지 |
| 2026-05-05 | 거래 채팅 생성 | **`product_chats` 원장 고정**: `runItemTradeChatStartCore` 가 메신저 링크를 **`after()` 만** 돌리던 것을 **`await ensureMessengerRoomIdForItemTrade`** 로 응답 전 완료로 바꿈. `chat_rooms` 에만 CM id 있을 때 **`persistProductChatMessengerRoomIdIfNull`** 로 PC 보강 | `item-trade-chat-start-core.ts`, `persist-trade-messenger-room-link.ts`, `ensure-messenger-room-for-trade-chat.ts` | `verify:trade-hot-path-contract`, `tsc` | resolve 응답 직후 목록이 비지 않게 할 것 |
| 2026-05-09 | 메신저 탭 | **home-sync trade enrich 브리지**: Phase B `product_chats`(cm_room)·Phase C ledger(`chat_rooms`) 조회를 **Promise.all** 로 겹침·seed `product_chats` 에 **`community_messenger_room_id`** 로 Phase B DB 왕복 축소. **`tradePcBridgeQueriesMs`** = B+C 병렬 벽시계(`phaseBcLedgerParallelWallMs`) + CC + D | `lib/community-messenger/service.ts`, `lib/community-messenger/home-sync-trace.ts` | `npx tsc --noEmit` | ledger 선조회는 Phase B 전「썸네일 미비」방 상한; 적용 시 post-B `stillNeedThumb` 로 필터(역행 시 순차 이중 조회로 되돌아감) |
| 2026-05-09 | 거래 채팅 목록 | **`GET …/trade-post-list-preview`**: 운영·로컬 일부 스키마에 **`posts.currency` 미존재** 시 PostgREST 500 방지 — `currency` 포함 SELECT 실패 시 **`id,title,price,meta`** 로 재시도·통화는 기존처럼 **PHP 폴백** | `app/api/community-messenger/trade-post-list-preview/route.ts` | `npx tsc --noEmit` | 마이그레이션으로 `currency` 추가 후에도 폴백 유지 권장 |
| 2026-05-09 | 거래 채팅 목록 | **`trade-post-list-preview` 보강**: Supabase 에러 **`message/details/hint`·코드 `42703`** 로 재시도 판정·**`meta` 미존재** 시 **`id,title,price`** 3단계·중복 `not_found` 분기 제거 | `app/api/community-messenger/trade-post-list-preview/route.ts` | `npx tsc --noEmit` | 동일 |
| 2026-05-09 | 거래 채팅 목록 | **`trade-post-list-preview`**: **`posts.currency` SELECT 제거** — 레거시 DB·PostgREST에서 컬럼 누락 500 차단·통화는 **`meta.currency` 또는 PHP** | `app/api/community-messenger/trade-post-list-preview/route.ts` | `npx tsc --noEmit` | 목록 프리뷰에서 DB 통화 컬럼 의존 되살리지 말 것 |
| 2026-05-09 | 거래 채팅 목록 | **`trade-post-list-preview` 근본**: **`POSTS_TABLE_READ`(posts_masked) 미사용** — 마스킹 뷰가 과거 컬럼(`currency` 등)을 고정 참조하면 컬럼 드롭 후 뷰만 깨져 동일 에러 반복 → 서비스 롤로 **`posts` 실테이블**만 조회 | `app/api/community-messenger/trade-post-list-preview/route.ts` | `npx tsc --noEmit` | 마스킹이 필요한 클라 직접 조회는 `posts_masked` 재생성 마이그레이션으로 정합 유지 |

---

*(이후 변경 시 위 표에 행을 추가한다.)*
