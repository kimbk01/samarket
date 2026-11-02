# 메신저 남은 위험 — 상세 설계서 v2 (2026-11-02)

> **구분:** 설계만 · 코드 변경 없음 · **Owner 승인 후 구현**.
> **기준:** Production `db4378cdd` (Vercel READY 14:06 PHT) · 코드 전수 추적 · 운영 DB `ckdosyydvgzqwpbwuhon` **읽기 전용** 조회. 화면·실기기 확인은 없음 → 화면 판정은 전부 NOT_PROVEN.
> **기준 앱:** Owner 지정 정책 기준 **텔레그램** (`messenger-2026-10-24-stage1-ui-cta-friend-spec.md` §14-2, Owner 2026-10-25 18:58) + 보조로 카카오톡.
> **UI·UX·CTA 기준:** 같은 문서 §1 (공통 기준 SSOT).
> v1(같은 파일 이전 판)을 대체한다.

## 0. 내 잘못 먼저 (규정 「허위 보고 금지」 6번)

1. **v1 위험 3 권장이 기준 앱과 반대였다.** v1은 「상대가 나간 1:1 방 = 채팅 불가 + 서버 발송 차단」을 권장했다. 카카오톡은 1:1에서 한쪽이 나가도 **남은 쪽이 보내면 나간 쪽에게 방이 다시 생긴다**(공개 자료 확인). 텔레그램도 「나만 삭제」는 내 목록에서만 지운다(같은 결과로 보이나 공식 문서 미확인). DIBAY 나가기 확인 문구도 「대화를 나가면 **내 목록에서만** 삭제됩니다」(`cm_ui_leave_confirm_direct`)다. v1 권장대로 했다면 이 약속을 깨는 설계가 됐다. **v2에서 철회하고 바로잡는다.**
2. **v1 위험 1-b는 Owner가 명시 승인한 정책을 확인하지 않고 변경을 권장했다.** E-C1 승인 원문은 「수신자 stub·알림·unread·벨·푸시 금지」다(`messenger-2026-10-23-stage-e-c1-impl-report.md:14`, 18:50 PHT 승인). v2에서 권장을 「유지」로 바꾼다(§2).
3. 이미 반영된 `db4378cdd` 막힌 방 안내 줄의 사유 문구가 서버 발송 거부 문구와 **다른 키**를 쓴다(예: 관리자 차단 = 안내 줄 `cm_ui_blocked_room` 「차단된 방입니다」 / 발송 실패 스낵바 `nav_messenger_room_blocked_error`). 같은 상황에 두 문구가 존재해 SSOT가 아니다 → §4에서 통일한다.

---

## 1. 위험 1 — 거는 사람의 거절·응답 없음 기록 → **변경 없음 (확정)**

운영 DB 최근 7일 1:1 통화, 세션 ID ↔ 방 기록(`call_stub.metadata.sessionId`) 대조:

| 결과 | 세션 | 방 기록 | 받는 사람 부재중 알림 |
|---|---|---|---|
| 거절 | 33 | 33 (100%) | — |
| 발신 취소 | 74 | 74 (100%) | — |
| 부재중·응답 없음 | 62 | 62 (100%) | 62 (100%) |
| 정상 종료 | 156 | 156 (100%) | — |

거는 사람은 4초 팝업 + 방 기록 + 통화 기록 탭 + 목록 미리보기로 결과를 받는다. 카카오톡·텔레그램도 거는 쪽에 알림을 보내지 않는다. 변경할 결함이 없다.

## 2. 위험 1-b — 「상대 통화 중」일 때 받는 사람 기록 → **현행 유지 권장 (E-C1)**

**현재 (코드 확인):** 서버가 B의 다른 통화(ringing/active 세션)를 보고 busy 판정 → 세션 `cancelled/peer_busy` + **A 전용** 통화 기록만 저장(`service.ts:19789-19886`). B에게 푸시 0, 방 기록 0, 알림 0 (운영 12건/12건 확인).

**유지 권장 이유:**
1. Owner 명시 정책(E-C1, 2026-10-23)이다. 테스트 6개가 이 동작을 고정하고 있다(`call-busy-attempt-record.test.ts`, `call-missed-notification-authority.test.ts:123-140` 등).
2. 기준 앱 동작을 확인하지 못했다. 텔레그램 API에는 busy 종료 사유(`phoneCallDiscardReasonBusy`)만 있고, 받는 쪽에 부재중이 남는지는 공개 자료로 확인하지 못했다. 카카오톡도 확인하지 못했다.
3. **바꾸면 큰 위험이 있다.** 부재중 알림이 B가 **통화 중일 때** 도착하는 경로가 처음 생긴다. Android는 부재중 푸시를 받으면 `IncomingCallTerminalHandler.handle` 을 실행하는데, 이 함수는 통화 ID와 상관없는 **전역 정리**(`clearPersistedCallPendingRoute`·`clearNativeCalleeAcceptPending`, `IncomingCallTerminalHandler.java:41-44`)도 한다. 진행 중 통화에 영향이 갈 수 있다. 서버에는 통화 중 알림을 미루는 장치가 없다.

**바꾸려면 필요한 것(참고):** 기준 앱(텔레그램) 실기 확인 → Owner 정책 재결정 → 통화 영향 분석서(위 Android 전역 정리 분리, 수신자 문구 분기, unread·벨 규칙, 테스트 6개 수정) → 승인 → 통화 단독 반영.

---

## 3. 위험 3 — 상대가 나간 일반 1:1 방 (구조 재설계)

### 3.1 현재 구조 (전수 추적 · file:line)

| 단계 | 현재 동작 | 근거 | 판정 |
|---|---|---|---|
| 나가기 | 내 참가 행 **삭제**. 시스템 메시지·상대 알림 없음 | `leave-chat-room-orchestration.server.ts:231` | 텔레그램·카카오와 같음 (정상) |
| 나가기 권한 | `rooms.owner_user_id === 나` 면 거부. 2026-06-05 이전 방은 owner 가 채워져 **처음 대화를 건 사람이 1:1 을 못 나감** | `:227`, `20260605120000_…sql:19` · 운영 일반 1:1 **6개** owner 있음 | **FAIL** |
| 남은 사람 헤더·목록 | 상대를 참가자 목록에서만 찾음 → 상대 없음 → 제목 **「새 대화」**, 상대 ID null | `service.ts:2672-2688, 2786` | **FAIL** (NOT_PROVEN 화면) |
| 남은 사람 관계 판정 | 일반 1:1 판정이 상대 ID 를 요구 → 차단·거절·통화 판정 **꺼짐** | `messenger-room-domain.ts:137-138`, `service.ts:16194-16197` | **FAIL** |
| 남은 사람이 보냄 | 저장되지만 나간 사람은 참가자가 아니라 **안 읽음·푸시 0** — 메시지가 사라진 것처럼 됨 | 발송 게이트 `assert-messenger-room-send-allowed.ts:110`(보낸 사람만 확인) | **FAIL** (기준 앱: 다시 나타나야 함) |
| 차단 게이트 | 참가자에 상대가 없으면 `direct_key` 로 상대를 찾음 → 차단·거절은 계속 막힘 | `direct-room-communication-gate.ts:84-90` | 정상 (보안 구멍 없음) |
| 다시 들어오는 경로 | 친구 목록 1:1, 방 안 멤버 1:1, 선물 친구 선택, 친구에게 바로 걸기, 통화 기록 재발신, Philife 공유 → `ensureGeneralFriendDirectRoom` 이 **양쪽 모두** 되살림 | `service.ts:10717-10724` 외 | 현행 유지 (§3.3 근거) |
| 통화 | 방 안 버튼: 상대 없음 → 거부(벨 안 울림). 친구 목록·재발신: 위 경로로 되살린 뒤 울림 | `direct-call-permission.ts:266`, `service.ts:19997, 20026` | 통화 무변경 |

운영: 일반 1:1 208개 중 **13개**가 상대 나감 상태.

### 3.2 목표 프로세스 (텔레그램·카카오 기준 + DIBAY 나가기 문구 계약)

| 상황 | 목표 |
|---|---|
| A 가 나감 | A 목록에서만 사라짐. B 에게 알림·시스템 메시지 없음 (현행 유지) |
| B 방 화면 | 헤더에 **A 이름·사진 그대로**. 차단·거절·통화 판정 정상 동작. 별도 「나갔습니다」 안내 없음 (기준 앱과 같음 · 개인정보) |
| B 가 보냄 (차단·거절 아님) | 서버가 **A 를 다시 참가시키고** 저장 → A 안 읽음 +1, 푸시 1회, A 목록에 방 다시 나타남 |
| B 가 보냄 (A 가 차단·거절) | 기존 게이트로 거부. A 되살리지 않음. B 화면은 이미 반영된 「채팅을 할 수 없습니다」 |
| A 가 다시 열람 | 이전 대화도 보임 — 확인 문구가 「내 목록에서만 삭제」이고 대화 삭제를 약속하지 않음(규정으로 결정) |

### 3.3 변경 (웹·서버 · DB 변경 없음)

| # | 파일·함수 | 변경 | 깨질 수 있는 것 → 같은 단계 처리 |
|---|---|---|---|
| L-1 상대 신원 SSOT | `service.ts` `summarizeRoom` (2672-2786) | 일반 1:1(`isMessengerGeneralFriendDirectKey(direct_key)`, 거래·주문 키 제외)은 상대를 **`direct_key` 의 다른 ID** 로 정한다. 참가 여부는 별도 값 `directPeerParticipating` | 헤더·목록 제목·아바타·관계 판정이 모두 이 값을 쓰므로 자동 복구. 그룹·거래·주문은 분기 밖 |
| L-2 스냅샷 | `service.ts` 방 스냅샷(16194-16334) · `types.ts` | L-1 덕분에 일반 1:1 판정이 다시 참 → `directMessageDenied`·통화 게이트 계산 정상화. 새 필드 `directPeerParticipating?: boolean` | 포그라운드 병합 `merge-community-messenger-foreground-bootstrap.ts:139` 에 hasOwnProperty 병합 추가(다시 들어온 뒤 이전 값 남지 않게). 멤버 합집합(`:47-58`)은 그대로 |
| L-3 보내기 전 되살림 SSOT | 새 `lib/community-messenger/server/prepare-messenger-room-send.ts` | `prepareMessengerRoomSend()` = 기존 `assertMessengerRoomSendAllowed` 통과 후, 일반 1:1 이고 상대 참가 행이 없으면 상대 행 INSERT(`on conflict do nothing`, role member). **차단·거절 게이트 뒤에서만** 실행 | 모든 보내기 경로가 이 함수 하나를 쓰게 바꿈: 텍스트 `sendCommunityMessengerMessage`(17195 · 자체 게이트를 이 함수로 교체), 이미지 2, 파일 2, 음성 1, 스티커(17890), 게시글 공유(18109). 수정·반응은 기존 메시지 대상이라 제외 |
| L-4 안 읽음·푸시 | 변경 없음 | 행이 먼저 들어간 뒤 기존 RPC 가 「나 아닌 참가자」 안 읽음 +1·푸시 발송 | 구현 시 RPC 안 읽음 대상이 행 INSERT 직후 반영되는지 테스트로 확인 |
| L-5 나가기 권한 | `leave-chat-room-orchestration.server.ts:227` | owner 거부를 **그룹 방에만** 적용 | 운영 6개 방의 시작한 사람이 나갈 수 있게 됨. 그룹·주문 사장님 거부는 그대로 |
| L-6 테스트 | 새·기존 | 상대 신원(L-1), 되살림(일반 1:1만 · 차단/거절이면 안 함 · 이미 참가면 무동작), 모든 보내기 경로가 `prepareMessengerRoomSend` 를 쓰는지 고정하는 계약 테스트, 나가기 권한 | — |

**바꾸지 않는 것:** `ensureGeneralFriendDirectRoom` 의 양쪽 되살림(친구에게 바로 걸기·재발신이 이 경로로 상대를 참가시킨 뒤 통화를 건다 — 바꾸면 통화 시작이 `direct-call-permission.ts:266` 에서 거부되는 통화 회귀. 통화 규정상 이번 범위 밖). 통화 코드 무변경.

**운영 영향:** 13개 방은 다음 메시지부터 정상 전달. 과거에 상대가 못 받은 메시지는 상대가 되살아난 뒤 대화 기록으로 보인다(안 읽음 수에는 새 메시지 1건만).

---

## 4. 막힘 안내 UI·UX·CTA SSOT (Owner 지시 「ui ux cta ssot」)

### 4.1 현재 — 같은 「보낼 수 없음」이 3가지 모양·2가지 문구원

| 경우 | 모양 | 문구원 |
|---|---|---|
| 일반·주문·관리자 차단 등 (`db4378cdd`) | 입력창 대신 안내 줄 | 안내 줄 전용 키 표 (`MessengerRoomChatUnavailableBar.tsx`) |
| 거래 발송 막힘 | 노란 상자 + 버튼(친구 추가·상품 보기) + **흐린 입력창** 동시 표시 | `tradeMessaging.denyCode` → 서버 오류 문구표 |
| 실제로 보내다 서버가 거부 | 스낵바 | 서버 오류 문구표 `messenger-room-action-error-messages.ts` |

참고: 거래·주문 채팅은 모두 메신저 방 화면 하나로 열린다(`/chats/[roomId]` 는 거래·주문을 메신저로 보냄, `app/(main)/chats/[roomId]/page.tsx:66-78`). 따라서 입력창 SSOT 는 메신저 방 하나로 충분하다.

### 4.2 목표 구조 (한 곳에서 정하고 한 컴포넌트로 그림)

1. **사유 어휘 = 서버 발송 거부 코드** (`MessengerSendGuardError`). 화면 판정 함수(`resolveMessengerRoomChatUnavailableReason`)가 서버 게이트와 **같은 순서**로 같은 코드를 돌려준다: `room_deleted → room_blocked → room_archived → room_readonly → blocked_target/rejected_by_peer → trade_* → store_order_chat_closed`.
2. **문구 = 서버 오류 문구표 하나** (`getMessengerRoomActionErrorMessage`). 안내 줄 2행과 발송 실패 스낵바가 같은 문장. 안내 줄 전용 키 표 삭제.
3. **모양 = 안내 줄 컴포넌트 하나** (`MessengerRoomChatUnavailableBar`): 1행 「채팅을 할 수 없습니다」(제목 · `--sam-text-primary` · 마침표 없음) + 2행 사유(본문 · `--sam-text-secondary` · 마침표) + 선택 행동 버튼.
4. **예외 1개(Owner 결정):** 상대가 나를 차단 → 2행 없음.
5. **거래 노란 상자 폐지 → 같은 안내 줄**. 흐린 입력창 동시 표시도 없앰. 행동 버튼은 §1-4 기준 보조 버튼(`Sam.btn.outlinePrimaryCombo` · 터치 44px · 5가지 상태): **「상품 보기」만** 유지. 「친구 추가」는 거래 막힘 사유(판매자 종료·거래 단계·거래 제한)와 관계없는 행동이라 제거 — 친구 추가는 상단 상대 안내 바·메뉴에 이미 있음.

### 4.3 변경 파일

| 파일 | 변경 |
|---|---|
| `lib/community-messenger/room/messenger-room-chat-unavailable.ts` | 반환값을 서버 거부 코드로 · 거래 `denyCode` 포함 · 순서를 서버 게이트와 같게 |
| `components/community-messenger/room/phase2/MessengerRoomChatUnavailableBar.tsx` | 문구를 서버 오류 문구표에서 가져옴 · 「상품 보기」 버튼 슬롯 |
| `CommunityMessengerRoomPhase2Composer.tsx` · `CommunityMessengerRoomPass1ComposerShell.tsx` | 노란 상자·흐린 입력창 분기 제거 → 안내 줄 하나 |
| `lib/i18n/catalog/navigation.ts` 등 | 서버 문구 중 §1-5 위반 손질(마침표·띄어쓰기) — 새 문구 추가 없음 |
| 테스트 | 사유 순서 = 서버 게이트 순서 계약 · 거래 사유 · 상대 차단 예외 |

영향: 거래방 막힘 화면 모양이 바뀜(노란 상자 → 안내 줄). 발송 게이트·서버 판정은 무변경. 하단 높이: 안내 줄 최소 44px로 입력 줄과 같아 타임라인 여백 유지(`docs/community-messenger-mobile-room-viewport.md` 확인 항목).

---

## 5. 위험 2 — 상단 안내 바 「상대가 나를 차단」 계산

**현재:** `CommunityMessengerRoomPhase2PeerNotice.tsx:39-42` 에서 `blockedByPeer` 가 `blockedByMe` 와 같은 값(멤버 `blocked` = 내가 차단).
**수정:** `blockedByPeer = !blockedByMe && snapshot.directMessageDenied === "blocked"` (서버 값이 양방향 차단이므로 내가 아니면 상대). §3 L-1 로 상대가 나간 방에서도 이 값이 계산된다.
**결과:** 상대가 나를 차단한 방에서 상단 「친구 추가 | 차단」 바가 어떤 순간에도 뜨지 않음. 테스트 1건 추가.

---

## 6. 반영 단위·검증

| 단계 | 내용 | 배포 구분 | 커밋 |
|---|---|---|---|
| S-1 | §3 + §4 + §5 (메신저) | 웹(서버 API 포함) · DB·네이티브 없음 | 메신저 1회 반영 |
| — | §1·§2 | 변경 없음 | — |

**로컬 검증:** `typecheck:build` · `typecheck:test` · 관련 vitest · 변경 파일 eslint.

**실기기 검증 (Android↔iPhone, 매 시험 Production SHA·PHT·운영 DB 대조):**
1. iPhone(B) 1:1 나가기 → Android(A) 방 헤더에 B 이름 유지
2. A 텍스트 → B 푸시 1회·목록에 방 재등장·안 읽음 1 · DB 참가 행 재생성
3. A 이미지·음성·파일·스티커 각각 같은 결과
4. B 가 나간 뒤 A 를 차단 → A 발송 거부·안내 줄(2행 없음)·B 행 재생성 0
5. 2026-06-05 이전 방(owner 있음)에서 시작한 사람 나가기 성공
6. 거래방 막힘(판매자 종료) → 안내 줄 + 「상품 보기」, 노란 상자 없음
7. 관리자 차단·보관·완료 주문 → 안내 줄 2행 = 발송 실패 스낵바 문구와 동일
8. 회귀: 일반 1:1·그룹·거래·주문 보내기 정상, 친구에게 바로 걸기 정상(통화 무회귀)

**롤백:** 커밋 되돌림 → main → 앱 재시작. 되살린 참가 행은 정상 데이터라 정리 불필요.

---

## 7. Owner 승인 요청

| 항목 | 권장 |
|---|---|
| §1 위험 1 | 변경 없음 |
| §2 위험 1-b | E-C1 유지 (바꾸려면 기준 앱 실기 확인부터) |
| §3 + §4 + §5 | S-1 로 구현 · main 1회 반영 |

## 8. 출처 (기준 앱)

- 카카오톡 1:1 나가기 후 상대가 다시 보내면 방이 다시 생김: [yellowit.co.kr](https://yellowit.co.kr/it-review/%ec%b9%b4%ec%b9%b4%ec%98%a4%ed%86%a1-11-%ec%b1%84%ed%8c%85-%eb%82%98%ea%b0%80%eb%a9%b4-%ec%95%8c%eb%a6%bc-%ea%b0%88%ea%b9%8c-%ea%b0%a0%ed%86%a1-%eb%82%98%ea%b0%80%ea%b8%b0%c2%b71-%ec%82%ac%eb%9d%bc/), [jab-guyver.co.kr](https://jab-guyver.co.kr/7048)
- 텔레그램 busy 종료 사유: [core.telegram.org phoneCallDiscardReasonBusy](https://corefork.telegram.org/constructor/phoneCallDiscardReasonBusy)
- 텔레그램 「나만 삭제」 후 재수신 동작: 공식 문서 확인 못 함

---

## 9. S-1 구현 (Owner 「S-1 승인」 2026-11-02)

| 설계 | 구현 |
|---|---|
| L-1 상대 신원 SSOT | `service.ts` `generalDirectKeyPeerUserId` · `directKeyPeerUserIdsForRoomRows` — 방 요약 `peerUserId` = direct_key 상대, `directPeerParticipating` 추가. 프로필 조회 대상 보강: 목록 배치·홈 동기화·부트스트랩(lite·full)·통화 기록·단일 방 스냅샷 |
| L-2 스냅샷 | 스냅샷 관계·차단·통화 판정이 `summary.peerUserId` 를 쓰므로 L-1 로 자동 복구 (별도 병합 필드 불필요 — `directPeerParticipating` 은 방 요약에 포함돼 방 객체째 교체) |
| L-3 되살림 단일 함수 | `readmitLeftGeneralDirectPeerForSend`(기존 `ensureDirectMessengerRoomParticipantsForPair` 재사용). 대상 판정은 차단 게이트 `assertDirectRoomCommunicationNotBlocked().readmitPeerUserId`(일반 pair 키 · 거래·주문 연결 없음 · 차단·거절 통과 · 상대 미참가) — 추가 조회 없음. 텍스트: 게이트 직후 / 이미지·파일·음성·스티커·공유: `prepareMessengerRoomSend` / 업로드 URL 발급: 판정만 |
| L-5 나가기 | `owner_cannot_leave` 를 1:1 제외 |
| §4 SSOT | `resolveMessengerRoomChatUnavailable` = 서버 거부 코드·순서 · 문구 = `getMessengerRoomActionErrorMessage` · 거래 노란 상자·흐린 입력창 제거 → 안내 줄 + 「상품 보기」(`Sam.btn.outlinePrimaryCombo`) · Pass1·Phase2 동일 |
| §5 | `blockedByPeer = !blockedByMe && directMessageDenied === "blocked"` |

이전 반영(`db4378cdd`)과 달라진 화면 문구: 관리자 차단 방 2행 「차단된 방입니다」 → 「관리자에 의해 차단된 방입니다.」(발송 실패 문구와 통일), 관리자 안내 문구 `admin_chat_s2_app_blocked` 같이 정정.
