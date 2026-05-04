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

---

*(이후 변경 시 위 표에 행을 추가한다.)*
