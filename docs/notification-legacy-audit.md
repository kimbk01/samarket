# DIBAY Badge Authority — Legacy Audit Checklist (DOCUMENT BASELINE)

**Status:** DOCUMENT BASELINE FIXED — 2026-08-02  
**Phase:** PHASE0 CODE PASS → **PHASE1 Legacy Evidence Collection** → STOP → PHASE2 Gap → STOP → 승인 → Atomic Change → HARD LOCK  

| 선언 | 상태 |
|------|------|
| PHASE 0 Contract Wire | ✅ CODE PASS |
| PHASE 1A Legacy Availability | ✅ **NOT FOUND** (증거: `.qa-logs/badge-legacy-ux/phase1a-availability-20260802-133641/`) |
| PHASE 1B Legacy Evidence Collection | ⏭️ SKIPPED (1A NOT FOUND) |
| PHASE 2 Gap (계약↔DIBAY) | ✅ 후보 기입 → 승인 대기 ([`notification-legacy-gap-analysis.md`](./notification-legacy-gap-analysis.md)) |
| 코드 수정 | ⏸️ 승인된 FIX만 |
| CONTRACT / RUNTIME / PRODUCT / HARD LOCK | ❌ 미선언 |
| BLOCKED (프로젝트 전체) | ❌ **철회** — Legacy 부재는 1A 증거이며 프로젝트 정지가 아님 |

### PHASE 1 — Legacy Evidence Collection (감사 아님)

이름: **Evidence Collection**. Audit/판정 단계가 아니다.

| 허용 | 금지 |
|------|------|
| 행동 → 결과 → 증거 | PASS / FAIL |
| FACT 칸만 (`OBSERVED` / `BLOCKED` / `N/A`) | KEEP / REVERT / FIX / FIX 후보 |
| 캡처·영상·로그·DB 경로 | OPINION · “버그인가?” · 구현 |
| | Phase2 Gap 표 작성 |

기록 형식 (이것만):

```
행동: …
결과: … (표면 + 숫자 변화)
증거: … (파일 경로)
```

`PASS`/`FAIL` 한 글자도 쓰지 않는다. Phase1 종료 시 **즉시 STOP**. Phase2는 별도 지시 후에만.

### 제품 계약 우선순위 (변경 금지 · 최우선)

| 순위 | 기준 | 역할 |
|------|------|------|
| **1** | 사용자 승인 명시 계약 | **최우선** — 이미 승인된 A/B 예외 포함 |
| **2** | Legacy UX 실측 | 기준·증거 (1순위와 충돌하지 않을 때) |
| **3** | 현재 DIBAY 구현 | 기준 아님. 계약 변경 근거로 사용 금지 |

**충돌 규칙 (필수)**

| 상황 | Cursor 행동 |
|------|-------------|
| DIBAY ≠ Legacy, **1순위 예외 없음** | Legacy UX를 기준으로 Gap에 `FIX 후보` — 코드로 계약 정당화 금지 |
| **Legacy ≠ 사용자 승인 계약** | **Legacy를 따르지 않음.** 즉시 보고·중단. 사용자가 최종 결정 |
| DIBAY ≠ 1순위 승인 계약 | Gap `FIX 후보` (Legacy와 같아도 1순위가 이김) |

이미 승인된 1순위 예외 예 (재확인은 Gap E-*): Bell=A만 · Missed∉Bell · Owner SO∉Member App Icon · Store intake∉Member Bell.

Cursor는 **현재 구현을 근거로 제품 계약을 바꾸면 안 된다.**

### Authority Lifecycle (Badge + Notification + Push = 하나의 계약)

본 프로젝트는 Badge만의 프로젝트가 아니다.

**Badge Authority + Notification Authority + Push Authority** 를 하나의 계약으로 본다.  
실측·PASS는 아래 **전체 생명주기**가 통과해야 한다. Badge 숫자만 PASS여도 안 된다.

```
생성 → Push → Badge 표시 → 선택 → Deep Link 진입
  → 실제 확인 → Read → Projection 재계산 → Badge 제거 → 재실행 후 유지
```

실측 시 각 항목에 **Badge · Push · Deep Link(선택 후 진입)** 를 같이 기록한다.

### Atomic Change 원칙 (변경 단위 · 변경 금지)

Badge Authority는 **Lifecycle 단위로만** 수정·검증한다. **기능 조각 단위로 수정하지 않는다.**

**A — Notification Lifecycle** (하나를 끝낸 뒤에만 다음)

```
생성 → Push → Bell → Notification Center → Deep Link
  → Read → Projection → Badge 제거 → 재실행 유지
```

**B — Communication Lifecycle** (A LOCK 후)

```
생성 → Push → Room → Hub → Bottom → App Icon
  → Room 진입 → Read Cursor → Projection → Badge 제거 → 재실행 유지
```

**진행 순서 (이 순서만)**

```
Notification Lifecycle 완료 → LOCK
  → Communication Lifecycle 완료 → LOCK
  → 최종 통합 검증
  → BADGE AUTHORITY HARD LOCK
```

**절대 금지 (회귀 패턴)**

- Notification 수정 중 Chat으로 넘어가기  
- Push 수정 중 Store로 넘어가기  
- Call / RoomUnread / Unread를 다른 Lifecycle과 섞어 수정  
- Bell → Push → Store → Unread → Call 식의 **조각 수정 연쇄**  

한 Lifecycle이 LOCK되기 전에 다음 Lifecycle 코드 수정 금지.

### Cursor / 실측 강제 원칙

| # | 원칙 | 의미 |
|---|------|------|
| 1 | 추측 금지 | 화면·로그·DB/이벤트 변화로만 기록 |
| 2 | 증거 필수 | 항목마다 캡처/영상 + 로그 및/또는 DB·이벤트 경로 |
| 3 | 0→N→0 | 생성 → 표시 → 선택 → 진입 → 읽음/삭제 → 재실행 유지 |
| 4 | 분류 금지 | 실측 중 KEEP / REVERT / FIX 금지 — 사실만 |
| 5 | 레거시 UX | “왜”가 아니라 **어떻게 동작하는지**만 |
| 6 | 산출물 | UX 제품 계약서 → Gap(FIX **후보**) → 승인 후 구현 |
| 7 | 실측 직후 FIX 금지 | Legacy → DIBAY → 차이 → **승인** → Class → 코드 |

**구조 ≠ 코드.** Legacy UX를 DIBAY Projection 안에서 맞춘다.

**Related**

- UX SSOT: [`notification-legacy-ux-product-contract.md`](./notification-legacy-ux-product-contract.md)  
- Gap: [`notification-legacy-gap-analysis.md`](./notification-legacy-gap-analysis.md)  
- [`docs/notification-badge-authority.md`](./notification-badge-authority.md)  
- [`docs/notifications/2026-08-02-ab-axis-document-contract-draft.md`](./notifications/2026-08-02-ab-axis-document-contract-draft.md)

---

## 0. 제품 축 (사용자 요구 — 비교 목표, 실측 전제)

### A Notification (대화 아님)

| 포함 | 출력 표면 |
|------|-----------|
| 거래 상태 · 주문 상태 · 배달 상태 · 시스템 · 공지 · 운영 알림 | Bell · Notification Center · Read · Delete · Mark All |

### B Communication (사람↔사람)

| 포함 | 출력 표면 |
|------|-----------|
| 일반 · 그룹 · 거래 채팅 · 주문 채팅(Customer) · 주문 채팅(Owner) · Missed Call | Room · Hub · Bottom · Call · App Icon |

### Member 집계 공식 (DIBAY 목표 — Legacy와 “구조” 대조용)

```
memberBellTotal     = A_member
memberAppIconTotal  = A_member + GD + Group + Trade + Customer rooms + orphan missed
```

- Owner 주문채팅 · Store intake → Member Bell / Member App Icon **+0** (기존 Store FAB/Bottom/Hub만).  
- Store Projection / Store Authority **만들지 않음**.

---

## 1. 분류 범례 (Gap + 사용자 승인 **이후**에만)

| Class | 의미 |
|-------|------|
| **KEEP** | 동일, 또는 사용자 승인 예외 |
| **REVERT** | Badge 범위 밖·불필요 확장 |
| **FIX** | Gap의 **FIX 후보**가 사용자 승인된 것 |

실측 §3 = **`FACT`만**.  
Gap = **`FIX 후보`까지**.  
확정 Class = **사용자 승인 후**.

---

## 1b. 실측 우선순위 (이 순서만)

| 순위 | 영역 | 체크리스트 | UX 계약 섹션 |
|------|------|------------|--------------|
| 1 | Bell (Notification) | §3.1 | C-BELL-* |
| 2 | Communication (GD→Group→Trade→Customer→Owner) Row→Hub→Bottom→App Icon | §3.2–3.3 | C-COM-* |
| 3 | Missed Call (생성·확인·제거) | §3.4 | C-MISS-* |
| 4 | Push (A / Chat / Store Owner / Missed) | §3.5 L-P* | C-PUSH-* |
| 5 | Mark All / Delete / Delete All | §3.6 | C-MARK-* · C-DELETE-* |

순위 건너뛰기 금지. 증거 없는 순위 완료 선언 금지.

---

## 2. Legacy 실측 — 필수 기록 필드 (사실만)

각 체크리스트 행에 대해 Legacy에서 **반드시** 아래를 기록한다. 추측·기억·코드 역추정 금지.

| 필드 | 의미 |
|------|------|
| **+N 트리거** | 무엇이 생겼을 때 숫자가 증가하는가 (단위: 방/메시지/알림 1건) |
| **−N 트리거** | 무엇이 끝났을 때 감소하는가 |
| **진입** | 탭/푸시/행 선택 시 도착 화면 |
| **읽음** | 읽음이 기록되는 시점 (진입 전/후, mark-all 포함 여부) |
| **삭제** | 삭제 시 숫자·목록 변화 (없으면 `N/A`) |
| **재실행** | 앱 재시작 후 숫자가 되살아나는지 |
| **증거** | `.qa-logs/badge-legacy-ux/<session>/…` (캡처·로그·DB) |
| **FACT** | `OBSERVED` / `BLOCKED` / `N/A` — **분류 아님** |

기기: **Xiaomi · Samsung · iPhone**. 일부만이면 이후 RUNTIME PARTIAL만 허용.  
실측 중 매 행 결과를 UX 계약서 조항으로 **즉시 옮긴다**.

---

## 3. Legacy 필수 체크리스트 (확정)

### 3.1 A Notification — Bell / Center

| ID | 시나리오 | +N | −N | 진입 | 읽음 | 삭제 | 재실행 | 증거 | FACT |
|----|----------|----|----|------|------|------|--------|------|------|
| L-A01 | 거래 상태 알림 1건 | | | | | | | | UNVERIFIED |
| L-A02 | 고객 주문 상태 알림 1건 | | | | | | | | UNVERIFIED |
| L-A03 | 배달 상태 알림 1건 | | | | | | | | UNVERIFIED |
| L-A04 | 시스템/공지 알림 1건 | | | | | | | | UNVERIFIED |
| L-A05 | Bell digit ↔ 목록 건수 일치 | | | | | | | | UNVERIFIED |
| L-A06 | 항목 선택 → 정확 화면 → 읽음 → digit −1 | | | | | | | | UNVERIFIED |
| L-A07 | 항목 삭제 → digit/목록 | | | | | | | | UNVERIFIED |
| L-A08 | Mark all 후 Bell·rooms·missed·Store 각각 (사실만) | | | | | | | | UNVERIFIED |
| L-A09 | 채팅 메시지 도착 시 Bell digit 변화 여부 | | | | | | | | UNVERIFIED |
| L-A10 | Missed call 시 Bell digit 변화 여부 | | | | | | | | UNVERIFIED |
| L-A11 | Store 신규 주문(오너) 시 Member Bell 변화 여부 | | | | | | | | UNVERIFIED |

### 3.2 B Communication — Room / Hub / Bottom

| ID | 시나리오 | +N | −N | 진입 | 읽음 | 삭제 | 재실행 | 증거 | FACT |
|----|----------|----|----|------|------|------|--------|------|------|
| L-B01 | 일반 채팅: 메시지 3개 → 행 / 허브 / Bottom / App Icon (단위: 메시지 vs 방) | | | | | | | | UNVERIFIED |
| L-B02 | 일반 채팅: 방 진입·readable → 각 표면 − | | | | | | | | UNVERIFIED |
| L-B03 | 그룹 채팅: 동일 규칙 | | | | | | | | UNVERIFIED |
| L-B04 | 거래 채팅: 메시지 3개 → 행 / 거래 허브 / Bottom / App Icon | | | | | | | | UNVERIFIED |
| L-B05 | 거래 상태 변경: 채팅 unread vs Bell (사실) | | | | | | | | UNVERIFIED |
| L-B06 | 고객 주문 채팅: 오너→고객 → 행/허브/App Icon/Bell | | | | | | | | UNVERIFIED |
| L-B07 | 고객 주문 상태: Bell vs 채팅 unread | | | | | | | | UNVERIFIED |
| L-B08 | Owner 주문 채팅: 고객→오너 → Owner 표면 / Member Bell·App Icon | | | | | | | | UNVERIFIED |
| L-B09 | 상위 표면 감소 단위 (메시지 vs 방) | | | | | | | | UNVERIFIED |

### 3.3 Store (Badge 범위 안 — 기존 표면만)

| ID | 시나리오 | +N | −N | 진입 | 읽음 | 삭제 | 재실행 | 증거 | FACT |
|----|----------|----|----|------|------|------|--------|------|------|
| L-S01 | 신규 주문 → Store FAB/Bottom/Admin 중 어디 + | | | | | | | | UNVERIFIED |
| L-S02 | 위 경우 Member Bell / Member App Icon 변화 | | | | | | | | UNVERIFIED |
| L-S03 | Owner 주문채팅 → Owner Hub/FAB / Member Bell·App Icon | | | | | | | | UNVERIFIED |

### 3.4 Missed Call / Call

| ID | 시나리오 | +N | −N | 진입 | 읽음 | 삭제 | 재실행 | 증거 | FACT |
|----|----------|----|----|------|------|------|--------|------|------|
| L-C01 | 실제 missed → Bell / Call / App Icon 각각 | | | | | | | | UNVERIFIED |
| L-C02 | 통화 항목 확인 → Call / App Icon − | | | | | | | | UNVERIFIED |
| L-C03 | 정상 수락 → missed 변화 | | | | | | | | UNVERIFIED |
| L-C04 | 다른 기기 수락 → missed 변화 | | | | | | | | UNVERIFIED |
| L-C05 | cancel/busy 시 관찰 | | | | | | | | UNVERIFIED |
| L-C06 | 동일 callId 중복 + 여부 | | | | | | | | UNVERIFIED |

> Call 판정·CallKit·VoIP·callId 정책은 **감사만**. 코드 수정 대상 아님. 회귀 시 Badge 밖에서 별도 보고.

### 3.5 App Icon / Native / Push

| ID | 시나리오 | +N | −N | 진입 | 읽음 | 삭제 | 재실행 | 증거 | FACT |
|----|----------|----|----|------|------|------|--------|------|------|
| L-I01 | A 알림 1 → App Icon → 읽음 후 | | | | | | | | UNVERIFIED |
| L-I02 | unread 방 1 → App Icon → 방 읽음 후 | | | | | | | | UNVERIFIED |
| L-I03 | missed 1 → App Icon · Bell 각각 | | | | | | | | UNVERIFIED |
| L-I04 | Native 숫자 vs 화면 숫자 (사실) | | | | | | | | UNVERIFIED |
| L-P01 | Notification 푸시 탭 | | | | | | | | UNVERIFIED |
| L-P02 | Chat 푸시 탭 | | | | | | | | UNVERIFIED |
| L-P03 | Store Owner 푸시 탭 | | | | | | | | UNVERIFIED |
| L-P04 | Missed Call 푸시 탭 | | | | | | | | UNVERIFIED |

### 3.6 Mark All / Delete / Delete All

| ID | 시나리오 | +N | −N | 진입 | 읽음 | 삭제 | 재실행 | 증거 | FACT |
|----|----------|----|----|------|------|------|--------|------|------|
| L-M01 | A·room·missed·Store 동시 존재 상태에서 Mark all | | | | | | | | UNVERIFIED |
| L-M02 | Mark all 후 각 표면 숫자 (사실만) | | | | | | | | UNVERIFIED |
| L-M03 | 단건 삭제 | | | | | | | | UNVERIFIED |
| L-M04 | Delete All (없으면 N/A + 증거) | | | | | | | | UNVERIFIED |

> **UX 계약 §5(C-MARK-*) OBSERVED 전 Legacy mark-all 코드 FIX 금지.**

---

## 4. Gap → 승인 → Class (실측 직후 FIX 금지)

전제: UX 계약 Completion gate PASS.  
비교·판정 후보는 **[`notification-legacy-gap-analysis.md`](./notification-legacy-gap-analysis.md)** 에만 기입한다.

```
Legacy 실측 → UX 계약 → DIBAY 대조 → Gap(차이·FIX 후보)
    → 사용자 승인 → KEEP / REVERT / FIX 확정 → 코드
```

본 §4는 Gap 승인 요약 링크용이다. 상세 표는 Gap 문서.

---

## 5. DIBAY 코드 참고 (실측·분류에 사용 금지)

현재 트리 관찰용 메모. **Legacy UX로 인용 금지. 실측 중 읽지 않아도 됨.**

| 주제 | 관찰 (코드) |
|------|-------------|
| Member Bell / App Icon 공식 | A/B wire 존재 |
| Legacy mark-all | events vs `notifications` 이중 경로 — **의미는 L-M* 실측으로만** |
| Call / RoomUnread / Native / FCM | Badge 실측에서 수정 금지 |

---

## 6. 실측 중 즉시 중단

- 증거 없이 FACT=`OBSERVED` 기입  
- 실측 중 KEEP / REVERT / FIX 기입  
- 코드로 Legacy 동작 역추정  
- **Legacy 실측이 사용자 승인 계약(1순위)과 충돌** → Legacy 추종 금지, 보고·중단  
- Call/Chat/Store/Native 코드 수정 시도  
- 새 Architecture 제안  
- Badge만 PASS로 Lifecycle 완료 선언  
- A LOCK 전 B(Communication) 수정  
- Notification↔Chat↔Store↔Call 조각 수정 연쇄  
- 우선순위 건너뛰고 완료 선언  

(관찰된 이상은 **사실로만** 기록. 분류는 Gap + 사용자 승인 이후.)

---

## 7. 진행 게이트

| 순서 | 게이트 | 진입 조건 | 산출 |
|------|--------|-----------|------|
| 0 | ✅ PHASE0 Contract Wire | — | CODE PASS → **STOP** |
| 1 | ⏸️ **PHASE1 Legacy Evidence Collection** | Legacy 앱 + 기기 + 계정 | 행동·결과·증거만 → **STOP** |
| 2 | ⏸️ PHASE2 Gap (KEEP/REVERT/FIX **후보**) | Phase1 STOP + 별도 지시 | gap 표 → **STOP** |
| 3 | ⏸️ 사용자 승인 | Gap 표 | Class 확정 |
| 4 | ⏸️ PHASE3 Atomic Change A Notification → LOCK | 승인 FIX | Lifecycle → **STOP/LOCK** |
| 5 | ⏸️ PHASE4 Atomic Change B Communication → LOCK | A LOCK | Lifecycle → **STOP/LOCK** |
| 6 | ⏸️ PHASE5 Runtime 통합 | A·B LOCK | 기기 0→N→0 |
| 7 | ⏸️ HARD LOCK | 통합 + 회귀 0 | `BADGE AUTHORITY HARD LOCK` |

---

## 8. Verdict / BLOCKED

**PHASE0 = CODE PASS (동결).**  
**PHASE1 = Legacy Evidence Collection** — 미착수. 판정·PASS/FAIL·Gap 작성 금지.

**Phase1 시작 입력**

1. Legacy 앱 식별 (패키지명 / APK·IPA 경로)  
2. 기기 serial/UDID  
3. Member · Owner · 상대 계정  
4. 증거 루트: `.qa-logs/badge-legacy-ux/<session>/`  

지시어: **`PHASE1 Legacy Evidence Collection 시작`** + 위 1–3.  
끝나면 **STOP**. Phase2는 다음 지시에서만.
