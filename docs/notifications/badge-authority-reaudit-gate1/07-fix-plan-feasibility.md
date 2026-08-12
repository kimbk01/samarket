# 수정 계획안 — App Icon Owner 미결 + NC 셸 (실행 전 보고)

**Mode:** 계획 보고 · 코드 수정 아직 없음  
**기준 제품:** 행=메시지 / Hub·Bottom=방 / Bell=이벤트 / App Icon=최상위 중복 없는 합 / Owner는 계약으로만 Icon 포함  
**실측:** asas55 20 = Owner 미포함 합, 22 = Owner 방 포함 합  
**날짜:** 2026-08-03

---

## 1. 그래서 “이 부분을 적용해서” 뭘 했는가?

**제품 공식(Owner 포함 확정 후 단일 App Icon)은 아직 코드에 적용하지 않았습니다.**

한 일 = **감사·증거·분류** 뿐입니다.

| 한 일 | 안 한 일 |
|-------|----------|
| PRODUCT FAIL 인정, smoke PASS 무효 | App Icon 단일 공식 고정 배포 |
| asas55 20/22 실측·분해 (owner 방 +2) | unified / member 중 하나 제거 구현 |
| Step8 → NC OwnerLite/FAB 인과 증명 | shell flags 수정 |
| Gate3 기능 인벤토리 · First-bad · KEEP/REVERT/REBUILD **분류** | Partial Rollback 실행 |
| Dirty Step8 팝업 복구 **STOP 보존** (커밋·checkout 없음) | Owner Icon 포함 여부 **대신 결정** |
| 문서 `badge-authority-reaudit-gate1/00–06` | HARD LOCK / 재배포 |

즉: **문제를 증명했고, 고치지는 않았습니다.**

---

## 2. 뭐가 틀어졌는가 (확정)

### P0-A — App Icon 이중 공식 (제품 미결을 코드가 양쪽 다 살림)

```text
20 = Bell + GD/G + Trade + CustomerOrder     ← Owner 미포함
22 = 20 + Owner SO 미읽음 방 2               ← Owner 포함
```

| 경로 | 값 | 역할 |
|------|-----|------|
| Cap / memberAppIconAuthority | 20 | 런처가 그림 |
| unifiedAttention.appIconTotal | 22 | HTTP·smoke가 읽음 |

**틀린 것:** Owner를 Icon에 넣을지 **제품 결정 없이** 두 합을 동시에 권위처럼 노출한 것.  
**First-bad:** `06bab8001` (분리 시작) → `6c8e2c8eb` (member 정식화 + unified 유지).

### P0-B — NC에 Owner 셸 혼입

Bell → `/notifications` (`6c8e2c8eb` Step8)  
`/mypage/notifications`는 OwnerLite OFF, `/notifications`는 ON.  
shell flags는 Gate3에서 **안 바꿈**.

### P1 — 절차

API smoke를 Product PASS / HARD LOCK 전 단계로 쓴 것.

### 틀리지 않은 것 (구도 유지)

- Row = 메시지 수  
- Bottom / Trade / Order Hub = 방 수  
- Bell 숫자 = A (asas55 0=empty 일관)  
- “App Icon = 메시지 총합”은 아님 (둘 다 방·이벤트 합)

---

## 3. 뭘 해야 하는가 (순서 — 수정 계획)

### Step 0 — 제품 결정 1개 (코드 전 필수)

```text
Owner(신규주문·업무·오너채팅)를 Member App Icon에 포함하는가?
  YES → Icon 단일 공식에 Owner항 포함. Owner FAB/목록에 동일 수. 없애기=오너 처리/읽음.
  NO  → Icon에 Owner 0. Owner는 배달 Bottom/FAB/관리자만.
```

이 결정 전: App Icon 코드 단일화·Partial Rollback 범위 **확정 금지**.

### Step 1 — Dirty STOP 정리 (결정 후)

Working tree Step8→popup diff: 증거는 `.qa-logs/.../gate1-stop-preserve/`에 있음.  
제품이 NC(`/notifications`)면 dirty는 **버리고 HEAD(NC) 유지**가 원칙(§7).  
(구현 시점에 checkout — 지금은 STOP 유지)

### Step 2 — App Icon 단일 권위 (P0-A)

결정 = NO (미포함) 가정 시 작업 예:

| # | 작업 | 결과 |
|---|------|------|
| 2.1 | Member App Icon SSOT = Bell + GD/G + Trade + CustOrder only | = 실측 20 경로 |
| 2.2 | `unifiedAttention.appIconTotal`를 Member Icon·Native·FCM·smoke 권위에서 제거 또는 진단 전용 마킹 | 22가 Icon으로 안 씀 |
| 2.3 | HTTP/Apply/NativeBadgeSync/FCM `badge_count` 입력을 SSOT 하나만 | 런처=앱 합 |
| 2.4 | 계약 테스트: Icon == Bell+Bottom도메인+TradeHub+OrderHub (Owner 0) | 이중 FAIL |

결정 = YES (포함) 가정 시:

| # | 작업 | 결과 |
|---|------|------|
| 2.1' | SSOT = 위 + Owner(정의: 방만? 업무+채팅?) | ≈ 22 또는 재정의 합 |
| 2.2' | Owner FAB/허브에 **같은 항** 표시·감소 | Icon만의 유령 금지 |
| 2.3' | member path에 Owner 항 합산 복원 + unified 경쟁 제거 | 단일 |

### Step 3 — NC 셸 (P0-B) — Owner 결정과 독립, 가능·필요

| # | 작업 |
|---|------|
| 3.1 | `/notifications` (+ `/notifications/[id]`)에서 `showOwnerLiteStoreBar=false` |
| 3.2 | 동일 경로 `showFloat=false` (글쓰기 FAB) |
| 3.3 | (선택) BottomNav 유지/숨김 제품 확인 — 기본은 알림 서브페이지로 단순화 |
| 3.4 | 회귀: `/mypage/notifications`·커뮤니티·배달 허브 OwnerLite 동작 유지 |

Step8 NC **라우트 자체**는 제품 §7과 맞음 → **popup으로 되돌리는 것을 기본안 하지 않음**.  
고치는 것은 **셸 계약**.

### Step 4 — 검증 (PASS 남용 금지)

| 단계 | 내용 |
|------|------|
| 정적 | tsc 해당 범위 · Icon 단일 필드 계약 테스트 |
| 실측 | Xiaomi/Samsung/iPhone: Icon == 화면 최상위 합; Bell 읽음↓; 방 ACK↓; Owner 결정대로 Icon 증감 |
| 금지 | unified 합만 보고 Product PASS |

### Step 5 — 그 다음만

Partial Rollback을 **실행할 변경 목록**은 Step 0 답 받은 뒤 `04-keep-revert-rebuild`를 확정본으로 잠금.

---

## 4. 가능한가?

| 항목 | 가능? | 이유 |
|------|-------|------|
| App Icon 단일화 | **가능** | 이미 20/22가 같은 구성요소+Owner±2로 분해됨. 새 권위 발명 불필요 |
| NC OwnerLite/FAB 제거 | **가능** | pathname 제외 1곳 (`conditional-app-shell-flags`) — 범위 작음 |
| Row/Hub/Bell 구도 유지 | **가능** | 이미 동일 구도. 전면 rebuild 불필요 |
| Owner YES/NO 없이 Icon 고정 | **불가능** | 팀장 기준 그대로 |
| main 전체 롤백으로 해결 | **비권장·불필요** | A/B 축까지 날림 |
| 숫자만 UI에서 -1 | **금지·불가** | 원칙 6 |

**종합:**  
전면 Authority Rebuild가 아니라, **(1) Owner Icon 결정 → (2) 단일 합 고정 → (3) NC 셸 차단** 이면 가능합니다.  
난이도: NC 셸 = 낮음 / App Icon 단일화 = 중(Apply·FCM·테스트 동시) / Owner YES면 Owner 표면 정합 추가 = 중.

---

## 5. 지금 팀장에게 필요한 것 (한 줄)

```text
Owner를 Member App Icon에 포함합니까?  YES / NO
```

답 주시는 즉시 Step 2 분기를 확정한 **실행용 수정 PR 범위(파일 목록)** 를 다시 올리고,  
승인 후에만 코드를 만지겠습니다.

---

## 6. 파일 범위 초안 (실행 시 · 미착수)

결정 무관 (P0-B):

- `lib/layout/conditional-app-shell-flags.ts`
- (필요 시) 계약 테스트 / verify

결정 NO (P0-A):

- `lib/notifications/pipeline/build-domain-badge-authority-http.ts`
- `lib/notifications/chat-notification-attention-projection.ts` (소비자 분리)
- `lib/notifications/apply-badge-count-authority-response.ts`
- `lib/notifications/badge-authority-rebuild/native-fcm-member-app-icon-authority.ts`
- 관련 `__tests__` · smoke가 unified를 PASS로 쓰는 경로

결정 YES:

- 위 + Owner FAB/hub projection이 Icon Owner항과 **동일 SSOT**인지 강제

Dirty:

- `PhilifeHeaderNotificationInbox.tsx` → NC 유지 시 preserve 후 HEAD 복원

---

## 7. 한 줄 요약

| 질문 | 답 |
|------|-----|
| 이 부분 적용해서 뭘 했나? | **감사만.** 공식 미적용. |
| 뭐가 틀어졌나? | Icon 20/22 동시 + NC Owner 셸. |
| 뭘 해야 하나? | Owner YES/NO → Icon 단일화 → NC 셸 → 실측. |
| 가능하나? | **가능.** 전체 롤백 불필요. 결정 없이 Icon 고정은 불가. |
