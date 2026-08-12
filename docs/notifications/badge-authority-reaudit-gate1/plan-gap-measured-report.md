# 계획 대비 실측 Gap 보고 (Gate 1 상세)

**Mode:** AUDIT · 수정/리버트/배포 없음  
**기준 계획:** DIBAY Badge·Notification·Chat Authority 재감사 및 재설계 명령서  
**Production HEAD:** `449e02771`  
**실측 계정:** asas55 · Xiaomi + Samsung  
**증거 경로:** `.qa-logs/badge-gate3-deploy/product-contradiction-stop/`  
**추가 실측:** 사용자 스크린샷 2026-08-03 NC 깨짐 (OwnerLite+FAB)

---

## 0. 한 줄

계획의 **제품 모델(A/B/C, App Icon=A+B, NC 전체화면)** 방향과  
**배포·검증·셸 cutover**가 어긋나 **PRODUCT FAIL**이다.  
`main` 전체 롤백은 아니다. **PARTIAL ROLLBACK REQUIRED**.

---

## 1. 왜 틀어졌는가 (원인 — 냉정)

원인이 “A/B 공식이 틀렸다”가 아니다. 아래 **네 겹**이다.

### 원인 1 — 게이트 순서 위반 (프로세스)

계획 순서:

```text
감사 → 분류 → 읽음 → 증감 → projection → 생존판정 → 부분롤백 → 구현 → 정적검증 → 배포 → 다기기실측 → HARD LOCK
```

실제:

```text
Slice 2-x 구현 → Gate3 freeze+NC Step8 배포 → backfill → API smoke를 PASS로 취급
→ 기기 숫자/셸 실측 전에 Product/Runtime 언어 사용
```

계획 §14 Gate4: 기기 실측 전 `CODE PASS`만 가능.  
실측 전 Product/Device PASS는 **계획 위반**.

### 원인 2 — App Icon cutover 미종결 (설계+배선)

계획 §2:

```text
Member App Icon = A + B   (하나만)
badge_count는 권위가 아니라 결과물
```

실측 (asas55, Xiaomi·Samsung 동일):

| 레이어 | 값 |
|--------|-----|
| Cap / projection / memberAppIcon 경로 | **20** |
| `unifiedAttention.appIconTotal` (HTTP) | **22** |
| 차이 | owner SO rooms가 unified chat에만 포함 |

First-bad: `06bab8001` (Slice 2-3 member icon 분리)  
증폭: `6c8e2c8eb` (Gate3가 memberAppIconAuthority를 잠그면서 unified를 응답에 남김)

Smoke는 unified 합을 PASS로 읽음 → **거짓 양성**.

### 원인 3 — Notification Center cutover 불완전 (계획 §7 vs 구현)

계획 §7.1: Bell → `/notifications` **전체화면 NC** (팝업이 최종 목표가 아님).

Gate3 Step8 (`6c8e2c8eb`): `router.push("/notifications")` — **방향은 계획과 일치**.

그러나 계획에 필수인 “독립 Notification Center” 셸이 없음:

| 셸 플래그 | `/notifications` 실제 |
|-----------|----------------------|
| `isBottomNavEligibleRoute` | true → BottomNav 유지 |
| `showOwnerLiteStoreBar` | true (커뮤니티 제외 목록에 NC 없음) |
| `showFloat` | true → `FloatingAddButton` |

사용자 실측 스크린샷:

- 상단 「주문 현황 / 받은 문의」+ badge **16** 이 NC 헤더·노치와 겹침  
- 좌하단 초록 **+** FAB  
- 본문 A empty (“새로운 알림이 없습니다”) — A=0과 **숫자는 일치**  
- 하단 채팅 **3**

즉 Step8은 **라우트만** 바꿨고, member/store identity 셸 분리를 안 함 → 계획 §1·§3.6·§9.4 위반이 UI로 터짐.

### 원인 4 — 보고와 제품 단위 혼동

| 주장 | asas55 실측 | 판정 |
|------|-------------|------|
| App Icon 레이어 불일치 | 20 vs 22 | **재현 · FAIL** |
| Bell digit vs list | 둘 다 0 / empty | 재현 · 숫자 일관 (UX/셸은 FAIL) |
| Bottom 뱃지 사라짐 | Samsung UI=3 = HTTP | **미재현** |
| Trade 목록 빔 | trade-chats roomLinkCount=**82**, unread rooms=**2** | **미재현** (허브=방수, 목록=멤버십 — 단위 다름) |

미재현을 first-bad에 묶거나, selector 오탐을 Product FAIL로 부풀린 적이 있음 → 신뢰 손상.

### 원인 5 — 절차 오염 (현재 dirty)

Gate1 “수정 금지” 전에 `PhilifeHeaderNotificationInbox` Step8→팝업 복구가 **미커밋 dirty**.  
계획 §7과 충돌 가능(NC가 최종). **커밋하지 않은 채 보존만** 한 상태.

---

## 2. 계획 조항별: 맞음 / 틀림 / 실측

| 계획 | 요구 | 코드 방향 | 실측 | Gap |
|------|------|-----------|------|-----|
| §1 A | Bell=A, 채팅 제외 | Slice 2-2 A | asas55 A=0, empty NC | 숫자 OK · NC 셸 FAIL |
| §1 B | 미읽음 **방** 수 | B projection | Bottom3, TradeHub2, OrderHub14 | 방향 OK |
| §1 C | store만, member icon 제외 | Cap에서 owner SO 제외 | Cap20; unified22에 owner 잔존 | **cutover 미완** |
| §2 App Icon | A+B **단일** | memberAppIcon + unified 공존 | 20≠22 | **FAIL** |
| §3.2 Bottom | GD+Group only | 계약 유지 | 3 = HTTP (Samsung) | OK (미재현 클레임 제외) |
| §3.4 Trade Hub | unread room count | Hub=2, list=82 rooms | 일치(단위) | OK |
| §5 읽음 순서 | read 확정→route | Step8은 route 우선 | NC 셸 깨짐 | FAIL |
| §7 NC UI | 독립 전체화면 | 페이지는 있음 | OwnerLite+FAB 침범 | **FAIL** |
| §11 금지 | API만 PASS | smoke PASS 사용 | PRODUCT FAIL | 프로세스 FAIL |
| §14 Gate4 | 실측 후 Runtime | 실측 전 PASS 언어 | — | FAIL |

---

## 3. 전체 롤백인가?

**아니오.**

| 옵션 | 판정 | 이유 |
|------|------|------|
| `main` → `1e2a560c1` 전면 | 금지에 가깝 | A/B 분리·C·Native echo·backfill까지 제거, 과거 실패 루프 |
| Gate3 전체 revert | 과잉 | NC 페이지·계약 문서·quarantine까지 날림; §7 NC 목표와 충돌 |
| **PARTIAL ROLLBACK** | **채택** | 경계가 증거로 특정됨 |

---

## 4. 뭘 어떻게 할 것인지 (정확 범위)

지금은 **실행하지 않음**. 승인 후 아래 순서만.

### Phase A — 즉시 정리 (Gate1 종료 조치)

1. Dirty `PhilifeHeaderNotificationInbox`  
   - 계획 §7 기준: **팝업 복구 커밋하지 말 것** (NC가 목표).  
   - `git checkout --` 로 Step8 원래(HEAD) 복원할지, 임시로 둘지 **지시 필요**.  
2. 미재현(Bottom 소실, Trade 빈 목록)은 **별 계정/재현 전까지 롤백 근거로 쓰지 않음**.

### Phase B — PARTIAL ROLLBACK / 차단 (증거 경계)

| ID | 대상 | 동작 | 근거 |
|----|------|------|------|
| R1 | HTTP/클라이언트 소비자 | `unifiedAttention.appIconTotal`를 App Icon·smoke·Native 권위에서 **제거/비권위화** | 실측 20 vs 22; 계획 §2 |
| R2 | `/notifications` 셸 | `showOwnerLiteStoreBar=false`, `showFloat=false` (필요 시 BottomNav 정책 재확인) | 스크린샷 Owner 16+FAB; §1 C·§7 |
| R3 | Step8 라우트 | **유지** (계획 §7) — 단 R2 없이 재배포 금지 | 방향은 맞음, 패키징만 틀림 |
| R4 | Smoke/PASS 언어 | unified 합 = Product PASS 금지 | STOP 증거 |

R1·R2가 “부분 롤백/차단”, R3는 “계획 정렬 유지”.

### Phase C — Gate 2 Contract (구현 전)

계획 §14 Gate2 산출물 작성·테스트 먼저:

- `badge-authority-contract.md` (A+B 단일 필드명 고정)
- `badge-increment-decrement-matrix.md`
- `notification-center-ui-contract.md` (**셸 제외 목록 포함**)
- `member-store-identity-contract.md`
- `push-routing-contract.md`

### Phase D — Gate 3 재구현 순서 (계획 §14 그대로)

```text
1 identity/classification 잔존 오염 제거 (owner_intake → C)
2 Bell A (숫자 유지 확인)
3 Conversation B
4 App Icon A+B 단일 경로만
5 Owner C
6 NC UI + 셸 계약
7 Push routing
```

한 커밋에 몰지 않음.

### Phase E — Gate 4 Runtime

Xiaomi / Samsung / iPhone · cold/warm/resume/push/read/delete.  
API JSON ≠ 기기 UI.  
그 전 HARD LOCK·Product PASS 금지.

---

## 5. 실측으로 확정된 FAIL vs 미확정

### 확정 FAIL (재현)

1. App Icon 이중 진리 20 vs 22 (Xiaomi+Samsung asas55)  
2. NC 상단 OwnerLite 침범 + FAB (사용자 스크린샷)  
3. Smoke≠Product 프로세스 실패  

### 숫자상 일치 (문제 아님 / 단위 혼동)

1. Bell A=0 ↔ empty NC  
2. Bottom=3 ↔ HTTP (Samsung 확정)  
3. Trade Hub unread=2 ↔ list 82 rooms (빈 목록 아님)

### 미확정 (롤백 근거 불가)

1. Bottom 뱃지 “없음” — asas55 미재현  
2. Trade list empty — asas55 미재현  

---

## 6. 판정 재확인

# PARTIAL ROLLBACK REQUIRED

전체 롤백 아님.  
권위 모델 전면 폐기 아님.  
**미종결 cutover(이중 App Icon) + NC 셸 미잠금 + 검증 게이트 위반**을 되돌리고, 계획 Gate2→3→4로 다시 올라간다.

---

## 7. 지금 대기 중인 결정 (실행 전 질문 1개)

Dirty Step8 팝업 복구 파일을:

- **A)** `git checkout --` 로 HEAD(NC 라우트) 복원 (계획 §7 정렬), 또는  
- **B)** 임시 dirty 유지  

중 어느 쪽으로 할지 지시가 필요합니다.  
그 전에는 코드·배포·추가 롤백을 하지 않습니다.
