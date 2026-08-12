# P1 INDEX — Task Trace + Writer Audit

**Prerequisite:** P0 PRODUCT FORMULA LOCK — APPROVED  
**Mode:** 감사만 · 코드 수정 없음 · KEEP/REBUILD/REVERT는 **P1-A~D 완료 후**  
**서두르지 않음:** UNKNOWN은 UNKNOWN으로 둔다. 감으로 채우지 않는다.

> DIBAY Badge는 Badge 시스템이 아니라 **Task 추적 시스템**이다.

---

## 두 축

```text
P1-A  Task Trace
  Task → Inbox → Surface → Done → 전 Surface·Icon 감소

P1-B  Writer Trace
  Task → Writer → Projection → Publisher → Reader → Surface
```

---

## 최종 산출물 (5종)

| ID | 문서 | 내용 |
|----|------|------|
| **P1-A** | `P1-A-TASK-TRACE.md` | Task → Inbox → Surface → Done |
| **P1-B** | `P1-B-WRITER-TRACE.md` | Writer chain (**추가 굴착 STOP**) |
| **P1-C** | `P1-C-SURFACE-TRUTH-TABLE.md` | Surface → Task ID |
| **P1-D** | `P1-D-FIRST-WRONG-WRITER-MATRIX.md` | First Wrong 단계 |
| **P1-E** | `P1-E-PRODUCT-DIVERGENCE-MATRIX.md` | Product Contract + WHY 체인 |

---

## P1 COMPLETE — APPROVED (팀장 2026-08-03)

| 산출 | 상태 |
|------|------|
| P1-A~E | ✅ COMPLETE APPROVED |
| Writer 추가 굴착 | STOP 유지 |
| **P2** | **APPROVED** · 구현 NOT APPROVED |
| **R0** | **APPROVED** (조건 1–5 · Surface 추가 금지 · Bible §A) |
| **R0.5-A** | **LOCK APPROVED** |
| **R0.5-B Wave1** | **FAIL** — N11/C01 PASS · O01 FAIL |
| **O01 Reverse Trace** | First break = Projection 입력 ([`O01-REVERSE-TRACE.md`](./O01-REVERSE-TRACE.md)) |
| **O01 판정** | 계약 미반영 · REBUILD O Projection · 롤백/임시패치 반대 ([`O01-DECISION-CONTRACT-NOT-IMPLEMENTED.md`](./O01-DECISION-CONTRACT-NOT-IMPLEMENTED.md)) |
| 판정 | N11 **KEEP** · C01 **KEEP** · O01 **REBUILD** |
| R1 / O Projection 구현 | **별도 착수 승인 전 금지** |

```text
Wave1 FAIL(O01): pending만↑ · Bell Δ0 · Icon Δ0.
R1·제품 코드는 팀장 지시 전 금지.
```
