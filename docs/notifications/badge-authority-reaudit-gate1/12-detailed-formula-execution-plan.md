# DIBAY Badge · 상세 실행 계획안 (표면 수식 포함) v2

**Date:** 2026-08-03  
**Status:** P0·P1·P2·R0 APPROVED · **R0.5-A START** · 실기·R1 보류  
**순서:** R0✓ → **R0.5-A Oracle** → R0.5-B 실기 → R1 Projection → … 
**코드:** P1 완료 전 수정 없음  
**SSOT:** `DIBAY-BADGE-PRODUCT-BIBLE.md` (§0 Product Trace Contract 최상위)  
**정의:** DIBAY Badge는 Badge 시스템이 아니라 **Task 추적 시스템**이다.  
**P1 산출:** `P1-TASK-TRACE-AUDIT.md` (Gap 분석 아님)

---

## 0. 롤백 원칙

```text
금지(기본): 습관·무증거 전면 롤백
우선: REBUILD (P1 Trace FAIL 근거)
REVERT: first-bad + 범위 + manifest
예외: P1이 계약 전체 오연결을 증명하면 범위 한정 기능 롤백 허용
```

---

## Phase 요약

| Phase | 이름 | 상태 |
|-------|------|------|
| P0 | PRODUCT FORMULA LOCK | **APPROVED** |
| P1 | A–E Audit | **COMPLETE APPROVED** |
| P2 | Decision Review | **APPROVED** · 구현 NOT |
| **R0** | Information Architecture Lock | **APPROVED** (조건 1–5) |
| **R0.5-A** | Expected Result Matrix (Oracle) | **LOCK APPROVED** |
| **R0.5-B** | 실기 Trace | **허용 · 미착수** |
| R1 | Projection Contract (= Trace 복사) | **보류** |
| R2 | Surface | 금지 |
| R3 | Publisher | 금지 |
| R4 | Native | DEFER until R0–R3 |
| Runtime | 실측 | 금지 |

---

## 0. 롤백 원칙

```text
금지(기본): 습관·무증거 전면 롤백, “일단 Gate3 통째”, Icon 숫자만 강제
우선: REBUILD
REVERT: first-bad + 영향 범위 + manifest

예외(열어둠):
  P1 Gap에서 계약 전체 오연결이 증거로 나오면
  범위가 증명된 기능 롤백은 허용
```

또 “11번째 일단 롤백”으로 시작하지 않는다. P0 수식 잠금 → P1 Gap → 분류.

---

## 1. Canonical identity

```text
notification:{eventId}
conversation:{domainIdentityKey}
operation:{storeId}:{operationType}:{sourceId}
```

∪·Trace·Icon·종 Digit 모두 이 키 기준.

---

## 2. 잠긴 최종 수식

```text
N = 회원 미확인 알림 identity 집합

C_general, C_group, C_trade, C_customerOrder, C_ownerChat
C = C_general ∪ C_group ∪ C_trade ∪ C_customerOrder ∪ C_ownerChat

O(storeId) = 해당 매장 미처리 업무 identity 집합
O_bell     = 종에 투영하는 Operation 집합 (관리 매장분; id는 operation:…)

App Icon           = | N ∪ C ∪ O |
Native Badge       = App Icon

Top Bell Digit     = | N ∪ O_bell |
Bell Modal         = [N 섹션] + [O_bell 섹션]
                     O_bell tap → storeId 검증 → 매장 관리자
Bell History       = 회원 알림 내역 정책 ‖ 매장 업무 내역 정책 (분리)

Bottom Chat        = | C_general ∪ C_group ∪ C_trade ∪ C_customerOrder |
Bottom Delivery /
Owner FAB          = | O(activeStoreId) ∪ C_ownerChat(activeStoreId) |

Hub(D)             = | C_D |
Row(room)          = msgUnread(room)
```

### 감소

| 집합 | Completion |
|------|------------|
| N | 읽음 · 삭제 · Archive |
| C | server Read ACK |
| O | 접수 · 확인 · 완료 · 취소 처리 |

```text
이후 매번: App Icon = | 현재 N ∪ 현재 C ∪ 현재 O |
로컬 -1 금지
```

### 중복

- 같은 Owner **operation** identity → 종·배달·FAB에 보여도 Digit/Icon 기여 **1**  
- 같은 주문의 **대화** vs **업무** → identity가 다르면 **각각 1**  
- Owner Chat ∈ **C** (O에 넣지 않음)

---

## 3. 이전 문서 대비 수정 (P0 BLOCK 사유였던 2건)

| # | 잘못된 수식 | 수정 |
|---|-------------|------|
| 1 | Top Bell = \|N\| | **\|N ∪ O_bell\|** · Modal 섹션 분리 · O_bell→어드민 |
| 2 | FAB/배달 = O (+ OwnerChat을 O에 섞음) | OwnerChat ∈ **C** · 표면만 **\|O ∪ C_ownerChat\|** |

---

## 4. Phase (승인 후 · 코드는 P0 후 P1만)

| Phase | 내용 |
|-------|------|
| **P0** | 본 수식 + Bible §8 승인 → **PRODUCT FORMULA LOCK** |
| **P1** | Gap 표: 현재 구현 수식 vs §2 · Trace · **코드 수정 없음** |
| P2 | 계약 테스트가 §2 assert |
| P3 | KEEP / REBUILD / (증거 시) 범위 REVERT |
| P4 | S1 Notification+TopBell(N\|O_bell) → S2 Conversation → S3 Operation → S4 Icon∪ → S5 Push |
| P5–P8 | 정적 · 배포 · Trace 실측 · HARD LOCK |

---

## 5. P1 Gap 표 템플릿 (승인 후 채움)

| 표면 | Bible 수식 | 현재 구현 | Gap | Trace |
|------|------------|-----------|-----|-------|
| App Icon | \|N∪C∪O\| | | | |
| Top Bell | \|N∪O_bell\| | | | |
| Bell Modal | N 섹션+O_bell 섹션 | | | |
| Bottom Chat | \|Cg∪Cgr∪Ct∪Cco\| | | | |
| Delivery/FAB | \|O∪C_ownerChat\| | | | |
| Hub/Row | \|C_D\| / msgUnread | | | |

---

## 6. 팀장 판정 반영

```text
P0 LOCK: 문서 개정 완료 → 재승인 대기 (BLOCKED 해제 요청)
승인 시: P0 PRODUCT FORMULA LOCK → P1 Gap · 코드 수정 없음
```

---

## 7. 한 줄

**종=\|N∪O_bell\|, Icon=\|N∪C∪O\|, OwnerChat∈C, FAB=\|O∪C_ownerChat\|, Completion 후 ∪ 재계산.**
