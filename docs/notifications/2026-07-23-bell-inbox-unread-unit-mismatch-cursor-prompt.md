# Cursor 작업 프롬프트 — Bell 패널 `1:1 메신저` unread 숫자, Bottom/Hub와 다른 단위 사용

> 이 문서를 그대로 Cursor에 붙여넣어 작업 지시로 사용할 것. 아래 "확정된 사실"은 코드 직접 추적으로 검증됨(추측 아님). "확정 안 된 것"은 절대 건드리지 말 것 — 이 레포는 같은 뱃지 버그를 놓고 수십 차례 patch→revert를 반복한 이력이 있음(`git log --oneline --all --grep=badge`), 스코프 이탈 시 또 revert 대상이 됨.

## 목표

Bell 알림 패널에서 특정 1:1 채팅 스레드 카드에 찍히는 숫자(예: `4`)가, 같은 계정·같은 순간에 하단 채팅 탭/채팅 목록에 찍히는 숫자(예: `1`)와 달라 보여서 사용자가 "숫자가 틀렸다"고 느낌. 실제로는 버그가 아니라 **두 Surface가 서로 다른 것을 세고 있는데, 그걸 구분할 수 있는 표시가 없어서** 생기는 문제. 이번 작업은 데이터 통합이 아니라 **표시 명확화**로 이 혼란을 없앤다.

## 확정된 사실 (코드 근거 포함, 재확인 완료)

1. `lib/notifications/group-inbox-by-thread.ts:157` `buildInboxGroupItems()` — 채팅 스레드별로 묶은 뒤, line 174: `const unreadCount = g.filter((x) => !x.is_read).length;`
   → 이건 **그 방에 쌓인 안읽은 알림/이벤트 "행(row)" 개수**다. `notifications` 테이블 + `notification_events` 테이블을 UNION해서 만든 로우 기반 카운트.

2. `lib/notifications/notification-inbox-surface-label.ts:28` `resolveInboxSurfaceBadge()` — `notification_type==="chat"` && `domain==="community_chat"` && `kind!=="group_chat"` 조건일 때 `notif_surface_direct_chat` (`"1:1 메신저"`) 라벨을 붙인다.

3. `components/notifications/InboxGroupCardList.tsx:77-93` — 위 두 값을 렌더. `SURFACE_BADGE`(77-79줄, `"1:1 메신저"` 칩)와 `CHAT_UNREAD_BADGE`(86-93줄, `item.unreadCount`, 즉 위 1번의 로우 카운트)가 같은 카드에 나란히 찍힌다.

4. 반면 하단 채팅 탭 / General·Group 목록은 전부 **"이 방이 안읽음 상태냐(0/1)"** 또는 **참가자 테이블의 unread_count**를 쓴다(`lib/notifications/messenger-chat-tab-badge.ts` → `lib/chat-domain/shell/hub-badge-shell-aggregator.ts` → `notification_targets` 기반, 방 단위). **로우 개수와 방 단위 플래그는 애초에 다른 정의**이며, 코드 검색 결과 `group-inbox-by-thread.ts`/`notification-inbox-surface-label.ts` 쪽에서 `notification_targets`나 `build-notification-badge-projection.ts` 쪽을 import/호출하는 곳이 전혀 없다(미연결, 의도적으로 분리된 별개 파이프라인).

5. **결론: 이건 "고쳐야 할 계산 오류"가 아니라 "다른 단위인데 라벨이 없는 UI 결함"이다.** Bell 카드의 숫자를 강제로 Bottom Nav와 같은 값(0/1)으로 맞추면, 그 방에 쌓인 실제 안읽은 메시지 개수라는 유의미한 정보가 사라진다. 반대로 Bottom Nav를 로우 카운트로 바꾸면 제품 규칙(하단 뱃지 = "방 개수"로 정의됨, `resolveBottomNavMessengerTabBadgeForOwnerStore` 주석 참고)을 깨고 다른 화면들과의 정합성을 새로 깨뜨린다. 그래서 데이터를 통일하지 말고 **의미를 구분해서 보여준다.**

## 확정 안 된 것 — 이번 작업에서 절대 건드리지 말 것

- 하단 채팅 탭 뱃지가 "안 뜬다"는 원래 신고 건은 **직접 실측(2026-07-23, asas55 계정)에서 재현되지 않음** — `badge-count` API 응답 `bottomChat=1`, `store-owner-hub-badge` API `communityMessengerUnread=1`, DOM에도 `1`이 정상 표시됨. 즉 이 파이프라인은 지금 살아있는 것으로 확인됨. **`lib/notifications/messenger-chat-tab-badge.ts`, `lib/chats/use-owner-hub-badge-total.ts`, `lib/chat-domain/shell/hub-badge-shell-aggregator.ts`, `app/api/me/store-owner-hub-badge/route.ts` 이 5개 파일은 이번 작업 범위에서 수정 금지.**
- Trade/Store Order 도메인 뱃지(과거 "29 vs 1" 이력) — 이번 신고 건과 무관, 별개 이슈. 건드리지 말 것.
- `PHASE8A_BADGE_PRODUCTION_WIRING`, `PHASE8B_BADGE_PRODUCTION_WIRING`, `PHASE11D_A_LEGACY_DELETE` 등 feature flag 값 변경 금지.
- `notification_targets`/`notification_events`/`community_messenger_participants` 관련 SQL 마이그레이션 작성 금지.
- 서버 API 응답 스키마 변경 금지(다른 클라이언트가 이미 소비 중).

## 작업 지시 (스코프: 아래 3개 파일만)

**파일 1: `lib/notifications/group-inbox-by-thread.ts`**
`InboxGroupItem` 타입(36-57줄)에 필드 추가: `unreadUnit: "message"` (리터럴, 지금은 값 하나뿐이지만 나중에 room 단위 소스가 붙을 걸 대비해 타입으로 명시). `buildInboxGroupItems()` 리턴 객체(215-232줄)에 `unreadUnit: "message"` 추가.

**파일 2: `lib/notifications/notification-inbox-surface-label.ts` 또는 i18n 카탈로그**
`notif_inbox_unread_n` 문구(현재 `InboxGroupCardList.tsx:89`에서 `t("notif_inbox_unread_n", { n: item.unreadCount })`로 툴팁에만 쓰이고 있음)를 카드 뱃지 자체에도 노출되게: 현재 숫자만 찍히는 칩을 "안읽은 메시지 N" 같은 의미가 드러나는 형태로 바꾼다. 구체적으로 `messages/*.json` (i18n 카탈로그, `lib/i18n/catalog/notifications.ts` 또는 해당 언어별 json)에서 `notif_inbox_unread_n` 키의 각 언어 문구를 확인하고, 숫자만 있는 배지가 아니라 최소한 스크린리더/툴팁에서는 "메시지 개수"라는 의미가 드러나도록 정리. 새 키를 만들 필요는 없으면 기존 키 재사용.

**파일 3: `components/notifications/InboxGroupCardList.tsx`**
86-93줄 `CHAT_UNREAD_BADGE` 렌더 부분: 현재 숫자만 나오는 칩 옆/아래에 아주 작은 보조 텍스트(예: "메시지" 또는 언어별 짧은 단어, 새 CSS 클래스 하나 추가 가능, 레이아웃 크게 흔들지 말 것)를 붙여서 "이 숫자는 방 단위 뱃지가 아니라 메시지 개수"라는 게 시각적으로 구분되게 한다. 기존 `title={t("notif_inbox_unread_n", {n: item.unreadCount})}` 툴팁은 유지.

## 하지 말아야 할 것 (이번 스코프에서)

- `unreadCount` 계산 로직(174줄) 자체를 바꾸지 말 것 — 로우 카운트가 "틀린" 게 아니라 의도된 다른 단위. 계산을 바꾸면 실제 메시지 개수 정보를 잃음.
- Bottom Nav/Hub 쪽 코드를 이 값에 맞추려고 건드리지 말 것.
- 새로운 API 호출이나 room-map 조회를 추가해서 두 숫자를 "통일"하려고 하지 말 것 — 이건 별도 승인 필요한 더 큰 작업(향후 옵션으로만 남겨둠, 이번 스코프 아님).

## 완료 조건 (Acceptance)

1. 타입체크/린트 통과 (`npm run lint`, `tsc --noEmit` 또는 레포의 기존 스크립트 사용).
2. Bell 패널에서 안읽은 1:1 채팅 스레드 카드를 봤을 때, 그 숫자가 "방이 안읽음이냐(0/1)"가 아니라 "이 스레드에 쌓인 메시지/이벤트 개수"라는 게 시각적으로 구분됨 (툴팁 또는 보조 라벨로).
3. 하단 채팅 탭/목록 뱃지 값과 렌더 경로는 diff에 전혀 등장하지 않음(수정 파일이 위 3개로 한정됨을 `git diff --stat`으로 확인).
4. 기존 `__tests__` 중 `group-inbox-by-thread`/`notification-inbox-surface-label` 관련 테스트가 있으면 통과. 새 필드(`unreadUnit`) 추가로 깨지는 스냅샷 테스트가 있으면 스냅샷만 갱신(로직 변경 아님을 diff로 확인 가능해야 함).

## 참고 (다음 단계, 이번 작업 아님)

Bottom Chat 뱃지의 "화면엔 안 뜨는데 API는 정상"이라는 원래 신고 건을 마저 닫으려면, 종(Bell) 숫자가 스크린샷 수준(~6)이고 하단 뱃지가 비어 보이는 그 순간에 다음 4지점을 순서대로 캡처해야 함: `badge-count` API 응답 → `owner-hub-badge-store.ts` 클라 store 적용값 → `useOwnerHubBadgeTabUnreadCount` selector 리턴값 → 실제 DOM. 이건 코드 수정이 아니라 재현/계측이 먼저이므로 별도 작업으로 분리함.
