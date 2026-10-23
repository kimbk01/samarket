# §2 묶음 3 차단 정책 — 감사·원인·최소 수정 설계 (구현 전)

- 작성: 2026-10-24 ~00:50 PHT
- Owner 지시: 묶음 2 CLOSED 후 순서대로 · **감사 · 원인 · 최소 설계까지** (코드·DB·main·Prod·네이티브 **금지**)
- SSOT: `docs/audit/messenger-2026-10-22-reaudit-plan.md` §2 우선3 · §5-3
- **제외:** 묶음 1·2·4~5 · 통화/네이티브 · SIDE · E-C* · CLOSED 재조사 · F-5/6/8+ (우선7)

참고: 묶음 2 운영 반영은 웹+DB 마이그레이션이었으나 **앱 재빌드 불필요**(Owner 확인). 본 감사는 구현 없음.

---

## 1. §2 묶음 3 원래 요구사항

| ID | 결함(계획 원문) | 설계 방향(§5-3) | 당시 근거 경로 |
|---|---|---|---|
| **F-2** | 차단 시 주문·거래 채팅도 전송 불가 | 차단 게이트를 three-pillars **community 1:1** 에만 적용 · 주문·거래 유지 | `assert-messenger-room-send-allowed.ts` |
| **F-4** | 차단당한 쪽 방도 숨김 | 방 숨김은 **차단한 사람 쪽만**(D2) | `participant-block-hide.ts` |
| **F-1** | 두 경로에서 해제해도 방 숨김 유지 | 해제 경로 **모두** 같은 복원 함수 | `me/relations` · `chat/.../unblock` · CM block route |
| **F-3** | 상대 즐겨찾기 삭제 | 차단 시 **상대 즐겨찾기 행을 지우지 않음**(본인 쪽만 정리 가능) | `social-relations.ts` `blockUserSocial` |
| **F-7** | 확인창 없음 | 차단 전 확인 UI | 방·친구·프로필 진입점 |

실기기 표기(계획): N. **이번 세션 실기기 재측정 없음 → DEVICE NOT_PROVEN.**

---

## 2. 항목별 현재 상태 (코드 대조 · HEAD `4f92abf63` 계열)

| ID | CODE | DEVICE | 요약 |
|---|---|---|---|
| **F-2** | **FAIL** | **NOT_PROVEN** | `assertMessengerRoomSendAllowed` 가 비그룹이면 무조건 `assertDirectRoomCommunicationNotBlocked`. peer 해석은 `room_type=direct` + **participants 우선**이라 `trade_*` / `store_order:` 키여도 참가자가 있으면 차단 게이트 적용. `chat_domain` 미검사. 숨김 쪽은 이미 `general_direct`만 대상으로 좁혀져 있음과 **불일치**. |
| **F-4** | **FAIL** | **NOT_PROVEN** | `hideDirectRoomsOnBlockForViewer`: `participantUserIds = [viewer, peer]` **양측** `blocked_hidden_at` 설정. 계획 D2(차단한 쪽만)와 반대. |
| **F-1** | **FAIL** | **NOT_PROVEN** | 복원 SSOT `restoreDirectRoomsOnUnblockForViewer` 존재. **호출:** `community-messenger/relations/block` DELETE · `community/block-relations` 해제. **미호출:** `me/relations/[type]` blocked DELETE · `chat/rooms/[roomId]/unblock`. 후자 두 경로로 해제하면 방 숨김 잔존 가능. |
| **F-3** | **FAIL** | **NOT_PROVEN** | `blockUserSocial` 이 `community_friend_favorites` 를 **양방향** `or(owner↔target, target↔owner)` delete. 상대가 나를 즐겨찾기한 행까지 삭제. |
| **F-7** | **PARTIAL / FAIL** | **NOT_PROVEN** | `MessengerBlockPeerConfirmModal` + 친구 퀵메뉴·방 PeerNotice 는 확인 후 차단. **홈 프로필 시트 등** `toggleBlock(...)` **직접 호출** 경로(확인 없음) 잔존. |

---

## 3. 확인된 결함 원인

### F-2
- 송신 가드가 「비그룹 = 전부 차단 검사」로 묶여 commerce direct 방까지 동일 취급.
- peer resolve 가 participants 우선이라 trade/store_order 키 예외가 실질적으로 우회됨.

### F-4
- P3 주석/구현이 bilateral hide. 제품 계약(D2)은 blocker 단측.

### F-1
- 복원 함수는 있으나 해제 API 진입점이 3곳+ 이고 2곳이 미배선.

### F-3
- 차단 부수효과로 즐겨찾기 양방향 삭제 — 상대 데이터 침해.

### F-7
- 확인 모달은 있으나 모든 차단 CTA에 강제되지 않음.

---

## 4. 최소 수정 설계 (승인 후 구현)

| ID | 파일(예상) | 변경 요지 | 웹/DB/네이티브 |
|---|---|---|---|
| **F-2** | `assert-messenger-room-send-allowed.ts` (± `direct-room-communication-gate.ts`) | 차단 게이트를 **community 일반 1:1** 에만: 예) `chat_domain` ∈ {null,`general_direct`} 이거나 trade_/store_order: 키·product_chats/store_orders 연결 방이면 **스킵**. 거래·주문 전송은 기존 trade/order 가드만. | **웹만** |
| **F-4** | `participant-block-hide.ts` | `hideDirectRoomsOnBlockForViewer` 가 **viewer(blocker)만** hide. peer 행 미갱신. 테스트: 피어 inbox 유지. | **웹만** |
| **F-1** | `me/relations/[type]/route.ts` · `chat/rooms/.../unblock/route.ts` | 해제 성공 후 공통 `restoreDirectRoomsOnUnblockForViewer(owner, peer)` 호출(기존 CM/community 경로와 동일). | **웹만** |
| **F-3** | `social-relations.ts` `blockUserSocial` | 즐겨찾기 삭제를 **owner→target 한 방향만**(또는 본인 `user_id=owner`만). 상대→나 행 유지. | **웹만** |
| **F-7** | 홈 프로필 시트 등 확인 없는 `toggleBlock` 진입점 | `MessengerBlockPeerConfirmModal` 경유 후 실행으로 통일(친구·방과 동일). | **웹만** |

**잠금 테스트(구현 시)**
- F-2: trade/store_order room + active block → send **허용**(다른 가드 통과 시) · general_direct → **거부**.
- F-4: block 후 blocker participant만 `blocked_hidden_at` set · peer null.
- F-1: me/relations·legacy unblock 경로 소스에 restore 호출 존재.
- F-3: favorites delete filter = owner만.
- F-7: 프로필 차단 CTA가 confirm 모달을 염.

**영향:** 차단·해제·목록 숨김·즐겨찾기·확인 UX. 통화 종료 부수(`terminateDirectCallsOnBlockBestEffort`)·묶음2 삭제 트리거 **비변경**.

**미변경:** CallKit/VoIP · 네이티브 · DB 스키마 · 묶음 4~5 · 기존 데이터 백필(피어에 이미 찍힌 `blocked_hidden_at` 일괄 해제 금지 — 필요 시 별도 Owner 승인).

---

## 5. Owner 추가 승인 필요 여부

| 항목 | 필요 |
|---|---|
| F-1·2·3·4·7 **웹 최소 수정 구현** | **예** |
| main · Production | **별도** |
| DB 마이그레이션 | **본 설계상 불필요** |
| 피어 쪽 잔존 `blocked_hidden_at` 백필 정리 | **별도**(기본 금지) |
| 실기기 | 구현 후 · 미실시면 **NOT_PROVEN** |

---

## 6. 결론 (감사 시점)

- 묶음 3 **수정 대상: F-1 · F-2 · F-3 · F-4 · F-7** (웹 최소).
- 구현·배포·실기기 **미실시** · 본 문서로 **STOP** (Owner 구현 승인 대기).

---

## 7. 구현 보고 (Owner 웹 승인 후 · 로컬만 · ~01:00 PHT)

| ID | 원인 | 수정 | 테스트 실측 | 회귀 위험 | 미검증 |
|---|---|---|---|---|---|
| **F-2** | 비그룹 send에 무조건 소셜 차단 | `shouldApplyCommunityDirectSocialBlockGate`: product_chats·store_orders·`chat_domain` trade/store_order·commerce `direct_key` 증거로 스킵. **null domain만으로 스킵 금지**. 불명확 시 게이트 적용. `assertMessengerRoomSendAllowed` + `assertDirectRoomCommunicationNotBlocked` | vitest PASS (헬퍼·gate·send-allowed 배선) | 레거시 null 도메인+무연결 방은 계속 차단 적용(의도) | DEVICE |
| **F-4** | hide 양측 | viewer만 hide/restore. peer `blocked_hidden_at` 미갱신 | hide 1행 · restore 1행 PASS | 과거 bilateral로 찍힌 peer 잔존은 **백필 안 함** | DEVICE |
| **F-1** | me/relations·chat unblock 미배선 | 두 경로에 해제 **성공 후** `restoreDirectRoomsOnUnblockForViewer` | 소스 계약 PASS | 해제 실패 시 복원 없음 | DEVICE |
| **F-3** | favorites 양방향 delete | owner→target만 | 소스 계약 PASS | — | DEVICE |
| **F-7** | 홈 프로필·방 액션 직행 | `requestBlockWithConfirm` + `MessengerBlockPeerConfirmModal`. 해제는 확인 없음. 친구 탭 기존 confirm 유지 | 소스 계약 PASS | archive/privacy **해제** CTA는 확인 없음(의도) | DEVICE |

**검증:** vitest 관련 PASS · eslint error 0 (기존 warning만) · `typecheck:build` PASS · `npm run build` PASS.  

---

## 8. main · Production 반영 (Owner 승인 후)

- 범위: F-1·F-2·F-3·F-4·F-7 웹 파일 + 본 감사 문서 + 관련 vitest 만 (DB·네이티브·백필·묶음1/2/4/5 제외)
- main SHA / Production Ready / DEVICE 판정: 배포 직후 §9 에 기입

