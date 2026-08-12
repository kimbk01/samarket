# DIBAY Badge Product Bible

**Status:** **P0 FORMULA LOCK APPROVED** · **R0 IA LOCK APPROVED** (2026-08-03)  
**Mode:** 제품 SSOT · 코드보다 문서 · **문서보다 제품 Trace**  
**다음:** **R0.5-B Wave 1 실기** (R0.5-A LOCK✓) · R1 보류

---

# 한 문장 정의

> **DIBAY Badge는 Badge 시스템이 아니라 Task 추적 시스템이다.**

이후 구현은 Badge를 “만드는” 것이 아니라 **아래 아키텍처를 만족하는지 검증**하는 것이다.

```text
제품 Oracle (R0.5-A) → 실기 Trace (R0.5-B) → Projection Contract (R1) → 코드
Task → Inbox → Projection → Surface → Native → Runtime(QA)
```

**Projection은 설계로 발명하지 않는다. Oracle 대조 Trace의 복사본이다.**
---

# §A Architecture Authority Chain (첫 페이지 · R0 조건)

## 권위 vs Surface (절대)

```text
Task
  ↓
Inbox          ← 제품 단위 (N / C / O)
  ↓
Projection     ← 유일한 계산·집합 권위 (ONLY ONE)
  ↓
Surface        ← 표시만 (권위 아님)
  ↓
Native         ← Absolute Echo only
  ↓
Runtime        ← QA 증명 (권위 아님)
```

| 계층 | 역할 | Authority? |
|------|------|------------|
| Task / Inbox | 제품 단위·완료 정의 | 제품 계약 |
| **Projection** | 집합·∪·표면별 digit **유일 계산** | **YES — ONLY ONE** |
| Bell · Bottom · FAB · Hub · List · **App Icon** | 표시 | **NO — 전부 Surface** |
| Native | Projection 결과 echo | **NO — 계산 금지** |
| Runtime | Authority를 증명하는 QA | **NO** |

### A1 — Surface는 Authority가 아니다

Bell · Bottom · FAB · Hub · List · App Icon · 기타 UI counter는 **전부 Surface**다.  
Surface가 숫자를 **발명·합산·캐시 권위**로 쓰지 않는다.

### A2 — Surface는 서로 참조하지 않는다

```text
금지:  App Icon ← Bell 읽음 / Bottom ← Icon / FAB ← Bell …
필수:  Task → Inbox → Projection → (각) Surface
       Projection → App Icon (Surface로서의 표시)
```

Surface끼리 읽지 않는다. 감소도 Projection 재계산 후 각 Surface가 받는다.

### A3 — Projection ONLY ONE

Publisher A/B · Projection A/B 병행 금지.  
이중 Projection → **20 vs 22** 재발.  
제품에 Projection 엔진은 **하나**다.

### A4 — Native는 마지막 Echo

```text
금지: Native → Badge 계산
필수: Projection → Absolute Echo → Native
```

Native는 계산하지 않는다.

### A5 — Runtime ≠ Product PASS

> **Runtime PASS ≠ Product PASS.**  
> Runtime은 Authority를 **증명하는 QA**이지 Authority가 아니다.

### A6 — R0 LOCK 이후 새 Surface 금지

Bell / Bottom / FAB / 새 탭 / 새 Badge / 새 Counter —  
**R0 문서 수정 승인 없이 추가 금지.**

---

# §0 Product Trace Contract (최상위 계약)

DIBAY Badge의 **모든 숫자**는 추적 가능(Traceable)해야 한다.  
어떤 숫자도 App Icon이나 Bell에**만** 존재해서는 안 된다.

모든 Badge/숫자는 다음 경로를 따른다.

```text
Task 생성
  ↓
Inbox
  ↓
Projection (ONLY ONE)
  ↓
Surface 표시 (Bell / Bottom / FAB / Hub / List / App Icon …)
  ↓
사용자 확인
  ↓
Task 완료 (Inbox별 Completion)
  ↓
Projection 재계산
  ↓
모든 관련 Surface 동시 갱신
  ↓
Native Absolute Echo
```

### Trace Rule 1 — 발견 가능성

App Icon에 존재하는 모든 숫자는 반드시

- Notification Inbox, 또는  
- Conversation Inbox, 또는  
- Operation Inbox  

에서 찾을 수 있어야 한다.  
**찾을 수 없으면 PRODUCT FAIL.**

### Trace Rule 2 — Identity 단일성

어떤 Task도 Bell + Bottom + FAB + Icon에서 **중복 증가(산술 가산)** 하면 안 된다.  
여러 Surface에 **표시**는 가능하지만 **Task Identity는 하나** · **Projection은 하나**다.

```text
notification:{eventId}
conversation:{domainIdentityKey}
operation:{storeId}:{operationType}:{sourceId}
```

### Trace Rule 3 — 소멸 정의

모든 Task는 사라지는 방법이 정의되어야 한다.

| Inbox | Completion |
|-------|------------|
| Notification | 읽음 · 삭제 · Archive |
| Conversation | Read ACK (Reply는 UX) |
| Operation | 접수 · 완료 · 취소 처리 등 |

### Trace Rule 4 — 동시 감소

Task 하나를 완료하면 **Projection이 재계산**하고 **관련된 모든 Surface가 같이 갱신**된다.  
Surface가 다른 Surface를 읽어 감소시키지 않는다.

예: 신규 주문 Operation 완료 → Projection 재∪ → Bell(O_bell) · FAB · Delivery · App Icon 동시 갱신.

---

## §1 Inbox Contract

제품 1등 시민 = **Notification / Conversation / Operation Inbox**.

| Inbox | 내용 |
|-------|------|
| **N** | 회원 미확인 알림 |
| **C** | 미읽음 대화 방 (General·Group·Trade·CustomerOrder·**OwnerChat**) |
| **O** | store별 미처리 매장 업무 (대화 ∉ O) |

---

## §2 App Icon Union Contract

```text
Projection computes:  AppIconDigit = | N ∪ C ∪ O |
App Icon (Surface)  = Projection.AppIconDigit   // 표시만 · Authority 아님
Native Badge        = Absolute Echo(Projection.AppIconDigit)
```

동일 identity 다중 Surface 표시 가능, Icon 기여는 **1**. Surface끼리 참조 금지.

---

## §3 표면 수식 (P0 LOCK)

```text
Top Bell Digit     = | N ∪ O_bell |
Bell Modal         = [N 섹션] + [O_bell 섹션]
                     O_bell → storeId 검증 → 매장 관리자
Bell History       = 회원 알림 내역 ‖ 매장 업무 내역 (정책 분리)

Bottom Chat        = | C_general ∪ C_group ∪ C_trade ∪ C_customerOrder |
Bottom Delivery /
Owner FAB          = | O(activeStore) ∪ C_ownerChat(activeStore) |

Hub(D)             = | C_D |
Row(room)          = msgUnread(room)

App Icon           = | N ∪ C ∪ O |
```

Completion 후 매번 `App Icon = |현재 N ∪ C ∪ O|`. 로컬 −1 금지.

---

## §4 Completion Contract

| Inbox | 허용 Completion |
|-------|-----------------|
| N | 읽음 · 삭제 · Archive |
| C | Read ACK |
| O | 접수 · 확인 · 완료 · 취소 처리 |

혼용 금지 (N 읽음 ≠ O 완료).

---

## §5 열한 관계

Notification Inbox · Conversation Inbox · Operation Inbox · App Icon ·  
Bell Modal · Bell History · Bottom · Trade · Order · Owner · Native Badge  

수식·Trace는 §0–§3.

---

## §8 LOCK 기록

| 항목 | 상태 |
|------|------|
| Inbox Contract | APPROVED |
| App Icon Union Contract | APPROVED |
| **§0 Product Trace Contract** | APPROVED (최상위) |
| **§A Architecture Authority Chain** | **APPROVED (R0 조건)** |
| Projection ONLY ONE | APPROVED |
| Surface ≠ Authority · Surface 상호참조 금지 | APPROVED |
| Native = Absolute Echo only | APPROVED |
| Runtime ≠ Product PASS | APPROVED |
| R0 이후 새 Surface 금지 | APPROVED |
| Completion Contract | APPROVED |
| Top Bell = \|N ∪ O_bell\| | APPROVED |
| OwnerChat ∈ C · FAB=\|O ∪ C_ownerChat\| | APPROVED |
| “Task 추적 시스템” 정의문 | APPROVED |

**P0 PRODUCT FORMULA LOCK: APPROVED**  
**R0 INFORMATION ARCHITECTURE LOCK: APPROVED** (조건 1–5 · A6 반영)  
**다음:** **R0.5-B Wave 1 실기** · Expected 100% · R1·코드 보류

---

## 부록 — 레거시 별칭

A/B/O · Bottom Chat 등 → Inbox/수식 §3. 제품 SSOT 아님.
