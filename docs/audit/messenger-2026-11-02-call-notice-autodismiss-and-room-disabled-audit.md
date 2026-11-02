# 메신저 감사 — ① 통화 종료 팝업 자동 닫힘 ② 차단·종료 방 「채팅할 수 없음」 안내 (2026-11-02)

> **구분:** 감사·수정안만 (코드 변경 없음). 구현·main 반영은 Owner 승인 후.
> **기준:** 로컬 `main` HEAD `c90b03276` · 2026-11-02 13:58 PHT · 코드 정적 감사만. 실기기·운영 화면 확인 없음 → 화면 판정은 전부 **NOT_PROVEN**.

## 0. Owner 지시 (원문 요지)

1. 통화의 부재중·거절·취소 등 팝업이 「일정 시간 후 자동으로 보이고 없어지는」 것이 아니라 **닫을 때까지 계속 떠 있다**. → **확인 버튼 하나**, 다른 곳을 누르거나 확인을 누르면 닫히고, **일정 시간 후 자동으로 사라지고**, 기록은 알림으로 남게.
2. 메신저 방에서 친구 차단 등으로 **채팅할 수 없는 방**은 거래·주문 채팅의 비활성 화면처럼 **「채팅을 할 수 없습니다」 명확한 안내**가 보여야 한다.

---

## 1. 통화 종료 팝업

### 1.1 현재 동작 (코드 확인)

통화 종료 안내의 단일 정의: `lib/community-messenger/call-ui/call-in-app-notice-contract.ts` (`CALL_IN_APP_NOTICE_SPECS`).

| 이벤트 | 누가 보나 | 표시 방식 | 자동 닫힘 | 판정 |
|---|---|---|---|---|
| `peer_declined` 상대 거절 | 발신자 | **중앙 팝업** (`CENTER`) | **없음** (`durationMs: null`) | **FAIL** (지시와 다름) |
| `no_answer` 응답 없음 | 발신자 | 중앙 팝업 | **없음** | **FAIL** |
| `peer_busy` 상대 통화 중 | 발신자 | 중앙 팝업 | **없음** | **FAIL** |
| `caller_busy` 내가 통화 중 | 발신자 | 중앙 팝업 | **없음** | **FAIL** |
| `call_failed` 연결 실패 | 발신자 | 중앙 팝업 | **없음** | **FAIL** |
| `missed` 부재중 | 수신자 | 상단 배너 | 4.2초 | 지시와 맞음 (코드) |
| `remote_ended` 통화 종료 | — | 상단 배너 | 3.6초 | 지시와 맞음 (코드) |
| `cancelled` 발신 취소 | — | **표시 없음** (`classifyCallTerminalReason` → `NONE`) | — | 팝업 없음 |

- 중앙 팝업 화면: `components/messenger/call/CallInAppNoticeCenterDialog.tsx` — 버튼은 이미 **「확인」 1개**. 바깥(배경) 터치·뒤로가기로도 닫힘(`DibayOverlayRoot` `dismissible`). 단 **배경 첫 터치는 팝업만 닫고 아래 화면 버튼은 눌리지 않음**(모달). 자동 닫힘 타이머는 스토어(`stores/call-in-app-notice-store.ts`)가 `durationMs` 있을 때만 건다 → 위 5종은 영원히 남음.
- 네이티브 통화 화면(iOS `NativeCallInAppNotice.swift`, Android `NativeCallInAppNoticeOverlay.java`)은 **상단 배너 + 1.6~4.8초 자동 닫힘** — 이미 지시와 같은 방식. 문제는 **웹 중앙 팝업**뿐.
- 기록(「알림이 오든」): 수신자 부재중은 `missed_call` 알림(푸시 + 알림 목록, `call-missed-notification-authority.ts`) + 방 안 통화 기록 메시지(call_stub)로 남음. 발신자의 거절·응답 없음·취소는 **방 안 통화 기록 메시지만** 남고 별도 알림은 없음 (`call_rejected`/`call_canceled` 푸시는 화면 정리 신호용).

### 1.2 원인

**설계 충돌 (규정 「허위 보고 금지」 7번에 따라 그대로 보고):** 2026-10-23 Owner 승인 설계 E-C3 (`docs/audit/messenger-2026-10-23-stage-e-c3-central-notice-design.md`, 「CLOSED · 재개 금지」)가 「확인을 누를 때까지 대기 · 자동 닫힘 없음(배너+팝업 경합 방지)」으로 **`durationMs: null` 을 의도적으로 정했다.** 오늘 지시(자동으로 사라짐)는 이 승인 설계와 다르다. 결함이 아니라 승인된 계약이 지시와 다른 것이며, 오늘 지시를 새 기준으로 삼으려면 E-C3 계약 변경 승인이 필요하다.

### 1.3 수정안 (웹만 · 네이티브 무변경)

| # | 파일 | 변경 |
|---|---|---|
| C-1 | `lib/community-messenger/call-ui/call-in-app-notice-contract.ts` | CENTER 5종 `durationMs: null` → **4000ms** (네이티브 기본 4.2초와 맞추려면 4200ms — 값은 Owner 결정 필요, 기본 제안 4초) |
| C-2 | `components/messenger/call/CallInAppNoticeCenterDialog.tsx` | 변경 없음 (확인 1버튼·바깥 터치·뒤로가기 닫힘 이미 있음). 선택: 남은 시간 표시 막대 — **계약에 없음 → 넣지 않음** |
| C-3 | `lib/community-messenger/stores/call-in-app-notice-store.ts` | 변경 없음 (`durationMs` 있으면 자동 dismiss 타이머 이미 동작) |
| C-4 | 테스트 `call-in-app-notice-contract` 관련 vitest | 「CENTER = null」 단언이 있으면 새 값으로 갱신 |

- **바깥 터치 한 번에 아래 버튼까지 눌리게** 하려면 모달을 비모달로 바꿔야 함 → 공통 `DibayDialog` 변경 범위라 이번 수정안에서 **제외**(필요하면 Owner 결정).
- **발신자 거절·응답 없음 알림 추가**(알림 목록 기록)는 서버 알림 발송(`lib/push/**` 통화 경로)을 바꾸는 일 → 통화 변경 규정 3번에 따라 **별도 영향 분석·승인 대상**. 이번 수정안에 넣지 않음. 현재 기록 수단은 방 안 통화 기록 메시지.

### 1.4 영향·위험 (통화 변경 규정 3번)

- 바뀌는 것: 웹 중앙 팝업이 4초 뒤 스스로 닫힘. 발신·세션·VoIP/FCM 발송·CallKit·수신 화면·통화 기록은 **무변경** (표시 시간 값 1곳).
- 구 바이너리 호환: 웹 번들 값만 바뀜 → 설치된 앱 재시작으로 반영, 네이티브 재빌드 불필요.
- 회귀 위험: 사용자가 읽기 전에 닫힐 수 있음(4초). 같은 이벤트 연속 시 타이머 재시작은 스토어가 처리.
- 롤백: 값만 `null` 로 되돌림.
- 실기기 검증 항목(최소): Android·iPhone 발신 → 거절 / 무응답 타임아웃 / 상대 통화 중 → 팝업 4초 후 자동 닫힘 · 확인 · 바깥 터치 · 뒤로가기 각 1회. 수신자 부재중 배너·알림 회귀 없음.
- 배포 구분: **웹** (main 반영 후 앱 재시작).

---

## 2. 차단·종료 방 「채팅할 수 없음」 안내

### 2.1 비교 — 거래·주문 채팅 vs 메신저 방

| 화면 | 막힘 표시 방식 | 파일 |
|---|---|---|
| 거래 채팅 (`/chats`) 차단 | **입력창을 없애고** 하단에 가운데 정렬 안내 줄 「차단된 사용자와는 메시지를 보낼 수 없습니다」 | `components/chats/ChatDetailView.tsx:2229-2250` |
| 거래 채팅 종료 방 | 상단 안내 띠 「…이 채팅은 종료된 방입니다」 | `components/trade/TradeFlowBanner.tsx:155` |
| 메신저 안 거래방 발송 막힘 | 입력창 위 **노란 안내 상자** + 버튼 | `CommunityMessengerRoomPhase2Composer.tsx:555` |
| **메신저 1:1 차단·거절 / 보관·차단·읽기전용 방 / 완료·취소 주문방** | 입력창은 그대로 두고 **흐린(opacity 50%) 입력칸 안 회색 placeholder 문구만** 바뀜 | `CommunityMessengerRoomPhase2Composer.tsx:403-428`, `line-ui/messenger-composer-sector.tsx:222` |

### 2.2 미흡 항목

| # | 항목 | 판정 | 근거 |
|---|---|---|---|
| R-1 | 메신저 막힌 방에 거래 채팅 같은 명확한 「채팅할 수 없음」 안내 줄 없음 — 흐린 입력칸 placeholder 뿐(긴 문구는 한 줄 입력칸에서 잘릴 수 있음) | **FAIL** (지시 기준) | 위 표 |
| R-2 | **배달·주문 방이 완료·취소돼 입력이 막혀도 placeholder 가 「메시지를 입력하세요」류로 나옴** — `isDeliveryRoom` 분기가 `roomUnavailable`·`storeOrderClosed` 보다 먼저 판정됨 | **FAIL** (코드상) · 화면 NOT_PROVEN | `Composer.tsx:403-404` |
| R-3 | CHAT-01 주석은 「완료/취소 주문 채팅 **배너**」라 하나 실제 렌더는 placeholder 뿐 | 주석·구현 불일치 | `Composer.tsx:401`, `use-messenger-room-phase2-room-presentation.ts:67` |
| R-4 | 상대가 나를 차단한 경우: 상단 안내 바 없음(개인정보 의도, `peer-notice-logic.ts:81`) — 그런데 입력칸에는 「차단된 사용자와는…」이 나와 차단 사실이 드러남 | 문구 정책 Owner 결정 필요 | `direct-room-peer-relation.ts:99` (`blockedEitherWay` → `"blocked"`) |
| R-5 | `CommunityMessengerRoomPhase2PeerNotice.tsx:39-42` `blockedByPeer` 가 `blockedByMe` 와 **같은 값**(멤버 `blocked`)으로 계산됨 — 상대 차단 여부를 담지 못함 | 범위 밖 결함 · 보고만 | 현재 분기 결과에는 영향 없음(코드상) |
| R-6 | 1:1 방에서 상대가 방을 나간·탈퇴한 경우의 막힘 상태 | **확인 못 함** (해당 상태 필드 찾지 못함) | — |

### 2.3 수정안 (웹만)

| # | 파일 | 변경 |
|---|---|---|
| M-1 | `components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Composer.tsx` | `vm.roomUnavailable && !tradeOnlyBlocked` 일 때 **입력창(`MessengerComposerSector`) 대신** 거래 채팅과 같은 형식의 가운데 안내 줄을 렌더: 1행 굵게 **「채팅을 할 수 없습니다」** + 2행 사유(아래 표). 거래방 노란 상자(`tradeOnlyBlocked`)는 그대로 |
| M-2 | 같은 파일 사유 문구 순서 | `roomUnavailable` 판정을 `isDeliveryRoom` placeholder 보다 **먼저** — R-2 해소 |
| M-3 | `lib/i18n/catalog/community-messenger-ui.ts` | 새 키 `cm_ui_chat_unavailable_title` 「채팅을 할 수 없습니다」 / "You can't chat in this room" |
| M-4 | 테스트 | 차단·거절·완료 주문·보관·읽기전용·관리자 차단 각 사유 → 안내 줄 표시 / 입력창 미표시 단언 |

사유 문구(기존 키 재사용, 새 문구 없음):

| 상태 | 2행 사유 |
|---|---|
| 1:1 차단(어느 쪽이든) | `cm_social_blocked_message_denied` 「차단된 사용자와는 메시지를 주고받을 수 없습니다.」 — R-4 결정에 따라 상대 차단 시 사유 생략 가능 |
| 친구 요청 거절 | `cm_social_rejected_message_denied` |
| 완료·취소 주문 | `nav_messenger_store_order_chat_closed` |
| 읽기 전용 / 관리자 차단 / 보관 | `nav_messenger_room_readonly_error` / `cm_ui_blocked_room` / `nav_messenger_room_archived_error` |

영향: 막힌 방의 입력·첨부·음성·이모지 버튼이 화면에서 빠짐(지금도 전부 disabled). 발송 게이트·서버 판정·Realtime·뷰포트 계약 무변경. 단 입력창 높이가 바뀌므로 **방 하단 여백·키보드 계약**(`docs/community-messenger-mobile-room-viewport.md`) 회귀 확인 필요 — 안내 줄 높이를 입력창 최소 높이와 맞춰 타임라인 하단 패딩이 변하지 않게 한다. 관리자 안내 문구 `admin_chat_s2_app_*`(「입력창에 『차단된 방입니다』가 표시」)는 표시 위치가 바뀌므로 같은 단계에서 문구 정정.

배포 구분: **웹**.

---

## 3. Owner 결정 필요 (1개씩)

1. **E-C3 계약 변경 승인** — 통화 중앙 팝업 5종을 자동 닫힘으로 바꾸고 시간은 **4초**로 할지.
2. **상대가 나를 차단한 방의 사유 문구** — 「채팅을 할 수 없습니다」만 보일지, 지금처럼 「차단된 사용자와는…」을 함께 보일지(차단 사실 노출 여부).

## 4. 남은 위험 / 범위 밖

- 발신자용 거절·응답 없음 **알림 목록 기록 추가**는 서버 통화 푸시 변경 → 별도 설계·승인.
- R-5 `blockedByPeer` 계산 오류, R-6 상대 나감 상태는 보고만.
- 모든 화면 판정 NOT_PROVEN — 실기기·Owner 계정으로 확인한 것 없음.

---

## 5. Owner 결정·구현 (2026-11-02 PHT)

- 결정 1: 권장안 — 통화 중앙 팝업 5종 **4초 자동 닫힘** (E-C3 「확인 대기」 대체). 통화 단독 커밋 `7870b5c2a` main 반영.
- 결정 2: 상대가 나를 차단한 방은 **「채팅을 할 수 없습니다」만** (사유 없음).
- 메신저 구현: 사유 판정 `lib/community-messenger/room/messenger-room-chat-unavailable.ts` · 안내 줄 `components/community-messenger/room/phase2/MessengerRoomChatUnavailableBar.tsx` · Pass1·Phase2 입력창 두 곳 모두 막힌 방이면 입력창 대신 안내 줄. 거래 발송 막힘 노란 상자는 유지. 목록 캐시 임시 셸(`clientShellPlaceholder`)에서는 표시하지 않음. R-2(배달방 placeholder 우선순위)는 안내 줄이 대신하므로 해소. 관리자 안내 문구 `admin_chat_s2_app_*` 정정.
- 범위 밖 그대로: R-5, R-6, 발신자 거절·응답 없음 알림 목록 기록.
