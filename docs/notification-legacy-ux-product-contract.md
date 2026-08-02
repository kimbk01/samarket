# Legacy Badge — UX Product Contract (SSOT Draft)

**Status:** TEMPLATE ONLY — 2026-08-02  
**Purpose:** PHASE1 **Legacy Evidence Collection** 결과를 담는 UX 계약 초안.  

| 선언 | 상태 |
|------|------|
| UX 계약 초안(템플릿) | ✅ 본 파일 |
| PHASE1 Evidence 기입 | ⏸️ FACT ONLY (PASS/FAIL/KEEP/REVERT/FIX 금지) |
| PHASE2 Gap | ⏸️ Phase1 STOP 후 별도 지시 |
| 코드 수정 / HARD LOCK | ❌ 금지 |

Phase1에서 `Status`는 `UNVERIFIED` / `OBSERVED` / `BLOCKED` / `N/A` 만. **PASS·FAIL 금지.**

### 제품 계약 우선순위 (변경 금지)

**1** 사용자 승인 명시 계약 → **2** Legacy UX 실측(본 문서) → **3** 현재 DIBAY 구현  

- 1순위와 충돌하지 않을 때 Legacy가 기준·증거다.  
- **Legacy ≠ 1순위 승인 계약** → Legacy를 따르지 말고 **보고·중단**. 사용자 결정.  
- DIBAY ≠ Legacy(예외 없음) → 코드로 계약을 정당화하지 않는다.

### Authority Lifecycle (필수)

Badge + Notification + Push = **하나의 계약**.  
조항마다 가능하면 아래를 채운다 (Badge만으로 OBSERVED 금지).

```
생성 → Push → Badge → 선택 → Deep Link → 확인 → Read → Projection → Badge 제거 → 재실행 유지
```

### Atomic Change (수정·실측 단위)

| Lifecycle | 순서 (하나를 끝낸 뒤 LOCK) |
|-----------|---------------------------|
| **A Notification** | 생성 → Push → Bell → Center → Deep Link → Read → Projection → Badge 제거 → 재실행 |
| **B Communication** | 생성 → Push → Room → Hub → Bottom → App Icon → 방 진입 → Read Cursor → Projection → Badge 제거 → 재실행 |

A LOCK 전 B 코드 수정 금지. 조각 수정(Bell만 / Push만 / Store만) 연쇄 금지.

**이 문서가 답해야 하는 질문**

> 사용자가 **어떤 행동을 하면**, Push/Badge가 **언제 생기고**, 선택 후 **어디로 들어가며**, 확인 후 **언제 사라지는가?**

금지: 코드 경로 설명, “왜”, 추측, 실측 중 KEEP/REVERT/FIX, 실측 직후 코드 FIX.

증거 루트(실측 시): `.qa-logs/badge-legacy-ux/<session-id>/`  
체크리스트 ID: [`notification-legacy-audit.md`](./notification-legacy-audit.md) §3

---

## 작성 규칙 (실측 중)

1. **사실만** — 화면 숫자 · 캡처/영상 · 로그 · DB/이벤트 중 최소 1종 이상.  
2. **0→N→0** — 생성 → 표시 → 선택 → 진입 → 읽음/삭제 → 재실행 유지까지.  
3. **단위 명시** — 메시지 수 / 방 수 / 알림 attention 1건 중 무엇인지.  
4. **표면별 분리** — Bell · Row · Hub · Bottom · Call · App Icon · Native · Push를 한 줄에 섞지 않음.  
5. 미확인은 `UNVERIFIED`. 빈칸을 PASS로 쓰지 않음.

---

## Contract 행 템플릿

각 계약 조항은 아래 형식을 복제한다.

```text
### C-XXX — <짧은 제목>
- User action:
- Surfaces affected: (Bell | Row | Hub | Bottom | Call | App Icon | Native | Push)
- Push: (delivered? tray text? data keys if observed)
- Appears when: (+N, unit)
- Disappears when: (−N, trigger)
- Tap / Deep Link destination: (exact screen)
- Confirm / readable:
- Read timing: (before enter | after enter | mark-all | N/A)
- Projection after read: (Bell/App Icon/Native observed)
- Delete timing: (N/A if none)
- Survives app restart?: (yes | no | partial)
- Evidence: <path>
- Checklist IDs: L-…
- Status: UNVERIFIED | OBSERVED
- Conflict with user-approved contract?: (no | YES → STOP)
```

---

## 1. Bell (Notification) — 우선순위 1

### C-BELL-01 — UNVERIFIED
- User action:
- Surfaces affected: Bell
- Appears when:
- Disappears when:
- Tap / open destination:
- Read timing:
- Delete timing:
- Survives app restart?:
- Evidence:
- Checklist IDs: L-A01 … L-A11
- Status: UNVERIFIED

*(실측 후 C-BELL-02… 로 digit=0 조건, 목록 일치, 선택 진입 등을 조항 분리)*

---

## 2. Communication — 우선순위 2

### C-COM-GD — General chat — UNVERIFIED
- User action:
- Surfaces affected: Row · Hub · Bottom · App Icon
- Appears when: (unit: message | room)
- Disappears when:
- Tap / open destination:
- Read timing:
- Delete timing: N/A
- Survives app restart?:
- Evidence:
- Checklist IDs: L-B01, L-B02, L-B09
- Status: UNVERIFIED

### C-COM-GROUP — Group chat — UNVERIFIED
- Status: UNVERIFIED · Checklist: L-B03

### C-COM-TRADE — Trade chat — UNVERIFIED
- Status: UNVERIFIED · Checklist: L-B04, L-B05

### C-COM-ORDER-CUSTOMER — Customer order chat — UNVERIFIED
- Status: UNVERIFIED · Checklist: L-B06, L-B07

### C-COM-ORDER-OWNER — Owner order chat — UNVERIFIED
- Status: UNVERIFIED · Checklist: L-B08, L-S03

### C-COM-STORE-INTAKE — Store new order (non-chat) — UNVERIFIED
- Status: UNVERIFIED · Checklist: L-S01, L-S02

---

## 3. Missed Call — 우선순위 3

### C-MISS-01 — Create / ack / clear — UNVERIFIED
- User action:
- Surfaces affected: Bell · Call · App Icon
- Appears when:
- Disappears when:
- Tap / open destination:
- Read timing:
- Delete timing:
- Survives app restart?:
- Evidence:
- Checklist IDs: L-C01 … L-C06
- Status: UNVERIFIED

---

## 4. Push — 우선순위 4

| ID | Kind | Appears / tap effect | Destination | Read timing | Evidence | Status |
|----|------|----------------------|-------------|-------------|----------|--------|
| C-PUSH-A | Notification | UNVERIFIED | | | | UNVERIFIED |
| C-PUSH-CHAT | Chat | UNVERIFIED | | | | UNVERIFIED |
| C-PUSH-STORE | Store Owner | UNVERIFIED | | | | UNVERIFIED |
| C-PUSH-MISS | Missed Call | UNVERIFIED | | | | UNVERIFIED |

Checklist: L-P01 … L-P04

---

## 5. Mark All / Delete / Delete All — 우선순위 5

### C-MARK-ALL — UNVERIFIED
- User action: Mark all (Bell / Center)
- Clears: (list surfaces observed)
- Does not clear: (list surfaces observed)
- App Icon after: 
- Evidence:
- Checklist IDs: L-M01, L-M02
- Status: UNVERIFIED

### C-DELETE-ONE — UNVERIFIED
- Checklist: L-M03, L-A07 · Status: UNVERIFIED

### C-DELETE-ALL — UNVERIFIED
- Status: UNVERIFIED *(Legacy에 기능 없으면 N/A + 증거)*

---

## 6. Cross-surface transition map (실측 후 채움)

| User event | Bell | Row | Hub | Bottom | Call | App Icon | Native |
|------------|------|-----|-----|--------|------|----------|--------|
| _(실측 후)_ | | | | | | | |

단위 주석을 셀마다 단다 (`msg` / `room` / `attn` / `0`).

---

## 7. Completion gate (이 문서)

| 조건 | 상태 |
|------|------|
| 우선순위 1–5 조항이 모두 OBSERVED 또는 N/A(증거 있음) | ⏸️ |
| 0→N→0이 각 조항에 연결됨 | ⏸️ |
| 증거 경로가 ID와 1:1 | ⏸️ |

**위가 충족된 뒤:**

1. [`notification-legacy-gap-analysis.md`](./notification-legacy-gap-analysis.md) — Legacy vs DIBAY · **FIX 후보**  
2. 사용자 승인  
3. KEEP / REVERT / FIX 확정 → 코드  

실측 직후 FIX · HARD LOCK 금지.
