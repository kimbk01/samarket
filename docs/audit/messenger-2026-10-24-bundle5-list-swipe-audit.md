# §2 묶음 5 대화 목록 스와이프 — 감사·원인·최소 수정 설계 (구현 전)

- 작성: 2026-10-24 ~02:05 PHT
- Owner 지시: 묶음 4 CLOSED 후 순서대로 · **감사 · 원인 · 최소 설계까지** (코드·DB·main·Prod·네이티브 **금지**)
- SSOT: `docs/audit/messenger-2026-10-22-reaudit-plan.md` §2 우선5 · §5-5
- **제외:** 묶음 1~4 CLOSED 재개봉 · 통화/네이티브 · SIDE · E-C* · 우선7 L-4/5/8~11 · 친구 요청(묶음6)

기준 HEAD(감사 시점 tip): `3da54656e` (묶음4 docs tip; 런타임 코드 tip `eada61f2e` 계열과 동일 스와이프 경로)

---

## 1. §2 묶음 5 원래 요구사항

| ID | 결함(계획 원문) | 설계 방향(§5-5) | 당시 근거 경로 |
|---|---|---|---|
| **L-1** | 열린 채 남음 | 열림 상태 **단일 소유자** · 외부 탭·스크롤·cancel 때 닫기 | `MessengerChatListItem.tsx` |
| **L-2** | 반쯤 멈춤 | 제스처 종료 시 **스냅**(열림/닫힘)만 · 중간 위치 금지 | 동상 |
| **L-3** | 열린 상태에서 탭하면 입장 | 열린 행 탭 → **먼저 닫기**(입장 금지) | 동상 |
| **L-7** | 주문 채팅을 사장님도 나감·문구 오류 | 주문 채팅에서 **사장님 나가기 금지** · 확인 문구 정합 | `getSwipeActions` · leave 오케스트레이션 |
| **L-6** | 방장 나가기 노출 | 방장(그룹 owner)에게 나가기 **비노출/비활성** (서버는 이미 거절) | `leave-chat-room-orchestration.server.ts` · UI |

실기기 표기(계획): L-1·2 Y. **이번 세션 실기기 재측정 없음 → DEVICE NOT_PROVEN.**

---

## 2. 항목별 현재 상태 (코드 대조)

| ID | CODE | DEVICE | 요약 |
|---|---|---|---|
| **L-1** | **FAIL** | **NOT_PROVEN** | Home에 `openedSwipeItemId` 단일 소유자·스크롤/외부 탭 닫기는 있음. 그러나 `onPointerCancel` 이 **dragX 스냅·`onOpenSwipeItem` 갱신 없이** 종료 → 로컬 `dragX`가 열린/중간 상태로 남을 수 있음. |
| **L-2** | **FAIL** | **NOT_PROVEN** | `pointerUp` 은 50% 스냅. **cancel/lostcapture** 경로는 스냅 없음 → 반쯤 정지 가능. |
| **L-3** | **PARTIAL** | **NOT_PROVEN** | 같은 행 `pointerUp`(비드래그)에서 `dragXRef < -16` 이면 `closeSwipe` 후 return(입장 안 함). **단** cancel로 `openedSwipeItemId=null` 인데 `dragX`만 남은 비동기 상태·다른 행 탭 순서 등은 DEVICE 재확인 필요. |
| **L-7** | **FAIL** | **NOT_PROVEN** | `toMessengerPolicyRoomType`: delivery → **direct**. `getSwipeActions` 가 **policyType 무시**하고 leave 항상 활성. 확인 키도 `cm_ui_leave_confirm_direct`(주문 전용 문구 없음). 서버 unified leave는 trade 분기 후 `owner_user_id`만 검사 — **스토어 사장님≠room owner** 이면 주문방 나가기 성공 가능. |
| **L-6** | **FAIL** | **NOT_PROVEN** | 서버: non-trade 에서 `owner_user_id === uid` → `owner_cannot_leave`. UI: `getSwipeActions` 가 그룹 방장도 leave 노출(`void input.policyType`). 목록에 `room.ownerUserId` 있으나 스와이프 정책에 미사용. |

---

## 3. 확인된 결함 원인

### L-1 · L-2 (제스처 종료 불완전)
- 열림 SSOT는 부모 `openedSwipeItemId` (+ 행 로컬 `dragX`).
- `onPointerUp` 만 스냅·소유자 갱신.
- `onPointerCancel` / `onLostPointerCapture` → active 해제만, **`setDragX`/`onOpenSwipeItem` 없음** (`MessengerChatListItem.tsx` ~764–774).
- 스크롤 dismiss는 소유자만 null → effect로 다른 행은 리셋되나, **cancel 직후 같은 행 로컬 상태**는 남을 수 있음.

### L-3
- 의도된 닫기 분기는 존재(열린 행 탭 → close).
- 실패 모드는 주로 L-1/L-2 잔존 `dragX`와 소유자 desync, 또는 액션 버튼 영역 외 히트 테스트 — **DEVICE로 확정**.

### L-6
- 서버 거절만 있고 UI 게이트 없음 → 방장이 나가기 탭 후 실패 토스트/무반응 UX.

### L-7
- 주문(delivery) 방이 정책축 `direct`로 접혀 leave·확인 문구가 일반 DM과 동일.
- 사장님 식별(목록 viewer role / store participant)이 `getSwipeActions` 입력에 없음.
- 서버도 주문·사장님 전용 leave 거절이 없음(owner_user_id 휴리스틱만).

---

## 4. 최소 수정 설계 (구현 승인 전 · 웹만 예상)

공통: **묶음 5만** · 통화·네이티브·DB 마이그레이션 금지(서버 leave 가드 TS 변경은 웹 배포). 키보드/뷰포트 계약 비변경.

| ID | 변경 위치 | 동작 | 분류 |
|---|---|---|---|
| **L-1·L-2** | `MessengerChatListItem.tsx` `onPointerCancel`(+ lostcapture 경로) | cancel 시 **항상 스냅**: `dragX→0` + `onOpenSwipeItem(null)` **또는** 50% 이상이면 열림 스냅(Up과 동일). 중간 위치 금지. | **웹만** |
| **L-3** | 동상(+ 필요 시 행 탭 가드) | `swipeOpen` 또는 `dragX < -16` 이면 navigate 금지·닫기만. L-1/2 수정 후 DEVICE로 잔여 확인. | **웹만** |
| **L-6** | `chat-room-swipe-actions.ts` · list item | `getSwipeActions({ policyType, listContext, viewerIsGroupOwner })` — 그룹+방장이면 leave **disabled 또는 배열에서 제외**. 서버 `owner_cannot_leave` 유지. | **웹만** |
| **L-7** | `chat-room-swipe-actions.ts` · confirm key · (권장) leave 서버 | delivery/주문: **사장님(viewer store role) leave 비활성**. 확인 문구 `cm_ui_leave_confirm_*` 주문용 키(ko/en catalog 동시). 서버: store_order/delivery 사장님 leave → `forbidden`/`store_owner_cannot_leave` (클라만 막으면 우회 가능). | **웹만** (API TS) |

**영향:** 채팅 홈·보관함·오픈채팅 목록 스와이프·나가기 확인. 타임라인·차단·입력창·통화 **비변경**.

**롤백:** 해당 커밋 revert.

**검증(구현 승인 시):**
- vitest: cancel→닫힘 스냅 · 방장 leave 미노출 · delivery 사장 leave disabled · confirm key
- `messenger-policy-matrix` 갱신
- DEVICE: L-1 열림 후 스크롤/외부 탭/취소 · L-2 반쯤 드래그 후 손 뗌·cancel · L-3 열린 행 탭 비입장 · L-6 방장 · L-7 주문 사장 (ops 규칙 준수)

---

## 5. 명시적 비범위

- L-4·L-5·L-8~L-11 (우선7)
- 친구 스와이프·통화 기록 스와이프(별도 컴포넌트) — 동일 패턴이면 **보고만**, 묶음5 필수 아님
- 그룹 방장 위임 RPC(G-1)·DB RLS
- 묶음 1~4·SIDE·E 재조사

---

## 6. 결론 (감사 시점)

- 묶음 5 **수정 대상: L-1 · L-2 · L-3 · L-6 · L-7** (웹 최소; L-7 서버 가드 권장).
- 구현·배포·실기기 **미실시** · 본 문서로 **STOP** (Owner 구현 승인 대기).
- 묶음 1~4 **CLOSED 유지**.

---

## 7. 구현 결과 (Owner 웹 최소 승인 · 로컬만 · 2026-10-24 ~02:15 PHT)

**배포 구분:** 웹만 — Vercel 배포 후 앱 재시작 (재빌드 불필요).  
**main/Prod:** 미반영 (별도 Owner 승인 대기).  
**DEVICE:** NOT_PROVEN.

| ID | 원인 | 수정 | 로컬 테스트 | 미검증 |
|---|---|---|---|---|
| **L-1·L-2** | cancel/lostcapture가 스냅·부모 소유자 미갱신 | `forceCloseSwipeOnCancel` → 닫힘(0)+`onOpenSwipeItem(null)`; `ignoreNextLostCaptureRef`로 pointerUp 후 lostcapture가 정상 열림을 덮어쓰지 않음 | vitest contract PASS | 실기기 cancel/스크롤 |
| **L-3** | 부모·로컬 desync 시 탭 입장 가능 | `openByParent \|\| openByLocal \|\| swipeOpen` → close only (pointer + keyboard) | vitest contract PASS | 실기기 열린 행 탭 |
| **L-6** | UI가 그룹 방장 leave 노출 | `viewerIsGroupOwner` → leave 배열 제외; 서버 `owner_cannot_leave` 유지 | vitest + policy-matrix PASS | 실기기 방장 스와이프 |
| **L-7** | delivery→direct·사장님 leave 허용·문구 공용 | UI: `storeOwnerUserId`(stores)로 leave 미노출; 서버: `store_orders→stores.owner_user_id` → `store_owner_cannot_leave`; confirm `cm_ui_leave_confirm_delivery` ko/en | vitest + typecheck + i18n + build PASS | API 직접 호출 실서버·실기기 |

**게이트:** eslint 0 error · `typecheck:build` PASS · `verify:i18n-key-exposure` PASS · vitest bundle5+matrix PASS · `npm run build` PASS.  
**비범위 유지:** L-4/5/8–11 · 묶음1–4 · 통화/네이티브/SIDE · DB 마이그레이션 · 방장 위임.

---

## 8. Production Ready · DEVICE · CLOSED (2026-10-24 ~02:40 PHT)

| 항목 | 결과 |
|---|---|
| main SHA | `682abb2a2` |
| Vercel Production | **Ready** `dpl_3ibnh2SM4Tm9PjVzyfx4mxJbYYHy` (`samarket.vercel.app` alias · meta `githubCommitSha=682abb2a2`) |
| 배포 구분 | 웹만 |

| ID | CODE | DEVICE Samsung | DEVICE Xiaomi | 비고 |
|---|---|---|---|---|
| **L-1** | PASS | **PASS** (open 후 스크롤 → CDP `opened=[]`) | NOT_PROVEN | Xiaomi 스와이프 제스처 미개봉 |
| **L-2** | PASS | **PASS** (스냅 `tx=-234` · 보관/읽음/나가기 노출) | NOT_PROVEN | |
| **L-3** | PASS | **PASS** (열린 행 탭 → 비입장·닫힘 `opened=[]`) | NOT_PROVEN | |
| **L-6** | PASS | NOT_PROVEN | NOT_PROVEN | 테스트 계정 소유 그룹 0건 — 비방장 leave 노출은 정상 |
| **L-7** | PASS | PARTIAL | NOT_PROVEN | bootstrap `storeOwnerUserId`·`meIsStoreOwner` 메타 PASS · UI 스와이프 미노출·API leave 실호출은 ops 금지로 NOT_PROVEN |

**신규 결함:** 없음 (닫힌 행 우측 얇은 액션 색 슬iver는 tx=0에서도 배경 액션 레이어 peek — 이번 묶음 회귀로 단정하지 않음).  
**§2 묶음 5: CLOSED.** 묶음 1–4 CLOSED 유지. 묶음 6·7·통화·SIDE 미착수.
