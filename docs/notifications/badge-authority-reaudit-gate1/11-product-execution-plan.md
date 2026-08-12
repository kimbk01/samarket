# DIBAY Badge · 재계획안 (Product Bible 선행 · 땜빵 금지)

> **상세 수식·실행:** `12-detailed-formula-execution-plan.md` 가 본 문서보다 우선한다.  
> 본 문서는 Phase 골격. **습관적/전면 롤백은 계획에 없음.**

**Date:** 2026-08-03  
**Status:** 실행 계획 초안 · **코드 미착수** · Bible §8 승인 전 LOCK 아님

---

## 0. 이 계획이 대체하는 것

| 폐기·보류 | 이유 |
|-----------|------|
| A/B/O를 제품 SSOT로 둔 Phase1/Gate2/3 계약 | 개발자 축 · 제품 Inbox와 불일치 |
| Gate2「종 = 즉시 `/notifications`」 | Bible: Modal → History |
| App Icon = 산술 A+B_member (Owner 제외) | Bible: \|N ∪ C ∪ O\| |
| Bottom = GD+Group only | Bible: Conversation Inbox (+Trade+CustOrder) |
| Step8만 revert / FAB hide / unified 필드만 삭제 | **땜빵** → Trace·Union 미충족 |
| smoke = Product PASS | 최초 명령서·Bible Trace 위반 |
| Bible 잠금 전 KEEP/REVERT 최종 | 팀장: Bible 완성 후에만 |

| 유지하는 최초 계획 의도 | 새 계획에서의 위치 |
|--------------------------|---------------------|
| 숫자 맞추기·조건문 금지 | 전 구간 |
| 감사 → 분류 → 증감 → projection → 생존판정 → 구현 → 실측 → HARD LOCK | Phase 순서에 매핑 |
| identity / 읽음·완료 / 표면 / Native echo | Inbox·Completion·Trace로 재표현 |
| 3기기 실측 전 HARD LOCK 금지 | Phase R |
| 전체 저장소 롤백 금지 · 증거 기반만 | Phase S (Bible 후) |

---

## 1. 목표 상태 (제품)

```text
App Icon = | Notification Inbox ∪ Conversation Inbox ∪ Operation Inbox |

App Icon
  → Bell → Notification Inbox (Modal 미확인 / History 내역)
  → Bottom / Trade / Order → Conversation Inbox
  → Owner / 배달 / FAB → Operation Inbox
  → Row → Completion(Inbox별)
  → App Icon 재합산
  → 0

Trace 100% · 유령 Icon = PRODUCT FAIL
```

Completion 혼용 금지:

| Inbox | Completion만 허용 |
|-------|-------------------|
| Notification | 읽음 · 삭제 · Archive |
| Conversation | Reply · Read ACK |
| Operation | 업무 처리 · 접수 · 완료 |

---

## 2. 전체 Phase (땜빵 아닌 순서)

```text
P0  Product Bible 잠금          ← 지금 (승인 대기)
P1  증거 재매핑 (Inbox·Trace 언어)
P2  Inbox 계약·테스트 (구 Gate2 대체)
P3  생존/폐기/재구현 판정        ← 최초 §10 · Bible 후에만
P4  구현 (Inbox 스트림 · 커밋 분리)
P5  정적 검증
P6  배포
P7  다기기 Runtime + Trace 매트릭스
P8  HARD LOCK                    ← 최초 Gate4 대응
```

**금지:** P0 없이 P3–P4, P7 없이 P8, Icon/UI 단독 핫픽스로 P4 진입.

---

## 3. Phase 상세

### P0 — Product Bible 잠금

**산출:** `DIBAY-BADGE-PRODUCT-BIBLE.md` §8 서명

필수 4계약:

1. Inbox Contract  
2. App Icon Union Contract (`|N ∪ C ∪ O|`)  
3. Trace Contract (최상위)  
4. Completion Contract  

**할 일:** 팀장 §8 체크 승인만. 코드 없음.  
**완료 정의:** LOCK 선언 문서 1장.

---

### P1 — 증거 재매핑 (최초 Gate1 정신 · Inbox 언어)

최초 명령 §9·§15를 **Inbox/Trace로 다시** 수행. 수정 금지.

| 산출물 | 내용 |
|--------|------|
| `inbox-event-writer-map.md` | 누가 Notification/Conversation/Operation identity를 만드는가 |
| `inbox-completion-writer-map.md` | 읽음·ACK·접수 등 Completion writer |
| `inbox-projection-map.md` | 11표면 각각 현재 입력 vs Bible |
| `trace-contamination-report.md` | Icon 유령·이중 합·Union 위반 identity |
| `trace-verdict.md` | 표면별 Trace PASS/FAIL (실측 asas55 포함) |

판정 언어 (최종 KEEP는 P3):

```text
TRACE_FAIL | UNION_FAIL | INBOX_MISMATCH | UI_IA_FAIL | COMPLETION_MIX
```

**실측 재사용:** `.qa-logs/.../product-contradiction-stop/` (20/22 = Union/Owner cutover Trace 실패로 재기술).

---

### P2 — Inbox 계약·테스트 (최초 Gate2 대체 · SUPERSEDE)

구 `badge-gate2-contract/*` 중 제품 본문과 충돌하는 것은 **SUPERSEDED** 표기 후 Bible 하위로 재작성.

| 신규 계약 문서 | 대응 |
|----------------|------|
| `inbox-notification-contract.md` | Bell Modal / History / Completion |
| `inbox-conversation-contract.md` | Bottom·Trade·Order·Hub=List·Read ACK |
| `inbox-operation-contract.md` | Owner·배달·FAB·어드민·storeId |
| `app-icon-union-contract.md` | ∪ · Native echo · dual 금지 |
| `trace-contract.md` | Icon→Inbox→Row→Completion |
| `completion-contract.md` | Inbox별 동작 분리 |
| 계약 테스트 (vitest 등) | Union·Trace identity·Completion 혼용 금지 |

**완료:** 테스트가 Bible을 코드보다 먼저 고정.

---

### P3 — 생존 / 폐기 / 재구현 (최초 §10 · Bible·P1 증거 후)

| 판정 | 조건 |
|------|------|
| **KEEP** | Trace·Union·Inbox 경계가 Bible과 이미 일치하는 writer/모듈 |
| **REBUILD** | 방향은 쓰나 계약이 A/B/O·산술 Icon·풀페이지 NC 등 구설계에 묶임 |
| **REVERT (부분)** | Bible과 명백히 반대이며 경계가 커밋으로 증명된 조각만 |

**명시적 땜빵 거절 목록 (P3에서 REVERT/REBUILD로만 처리, 핫픽스 금지)**

| 거절 | 올바른 처리 |
|------|-------------|
| Step8 `setOpen`만 복구 | Notification Inbox IA 전체 REBUILD (Modal+History+셸) |
| `/notifications` FAB CSS hide | Inbox 라우트 셸 계약을 P2에 넣고 REBUILD |
| Cap을 20에 고정 | Union SSOT REBUILD |
| Bottom에 Trade +1 하드코드 | Conversation Inbox projection REBUILD |

**산출:** `keep-rebuild-revert-manifest.md` (파일·커밋·Inbox 태그).  
**전체 main 롤백:** 비권장 (최초 명령과 동일).

---

### P4 — 구현 (최초 Gate3 순서 · Inbox 스트림)

한 큐에 몰지 않음. **스트림 = Inbox**, 커밋 분리.

```text
S0  identity / classification (Notification vs Conversation vs Operation)
S1  Notification Inbox
      - Bell Modal (미확인만, 선택/읽음/삭제/Archive, 스타벅스, press, APK/iOS)
      - Bell History (내역)
      - 셸: FAB·OwnerLite 금지
      - Owner 주문 항목 → 매장 어드민
S2  Conversation Inbox
      - Bottom = GD∪G∪Trade∪CustOrder 방
      - Hub = List 미읽음 방 개수
      - Row = 메시지 · 시스템 상태 ≠ Conversation
      - Read ACK Completion
S3  Operation Inbox
      - 종·배달·FAB 각각 표시
      - storeId · 처리/접수/완료 Completion
S4  App Icon Union + Native echo
      - 단일 ∪ SSOT
      - dual total 권위 제거
      - Trace: 모든 Icon id → Inbox row
S5  Push routing (최초 §5.6)
      - payload identity · Inbox별 진입
```

각 스트림 종료 조건: **해당 Inbox Trace 샘플 시나리오 문서화** (코드만 머지 금지).

---

### P5 — 정적 검증

최초 add 게이트 정신 + Bible:

- 관련 lint/tsc  
- Union·Trace·Completion 계약 테스트  
- Inbox 혼용(읽음을 Operation에 적용 등) 정적 금지  
- **전체 무관 verify 일괄·build는 push 직전 (프로젝트 검사 규정)**

---

### P6 — 배포

Production SHA · APK · iOS 바이너리 기록.  
배포 ≠ Product PASS.

---

### P7 — Runtime (최초 Gate4 · Trace 매트릭스)

기기: Xiaomi · Samsung · iPhone  
시나리오: cold / warm / resume / push / 각 Inbox Completion  

**필수 Trace 표 (매 시나리오)**

| Icon 항 id | Inbox | Row | Completion | Icon 감소 |
|------------|-------|-----|------------|-----------|
| … | N/C/O | … | … | yes/no |

Union 검증: 동일 주문 Bell+FAB+배달 → Icon **1** → 처리 후 **0**.

API JSON만으로 PASS **금지**.

---

### P8 — HARD LOCK

최초와 동일:

```text
BADGE / NOTIFICATION / INBOX PRODUCT HARD LOCK
```

조건: P0–P7 PASS + Trace 매트릭스 첨부 + dual Icon 없음 + 유령 0.

---

## 4. 현재 문제 → Phase 매핑 (패치로 닫지 않음)

| 문제 | Bible 위반 | 닫는 Phase |
|------|------------|------------|
| Icon 20 vs 22 | Union + Trace | P1 재기술 → P3 → P4-S4 |
| Bottom GD+G only | Conversation Inbox | P2 → P4-S2 |
| 종→NC+FAB+OwnerLite | Notification IA + 셸 | P4-S1 |
| 모달/History 붕괴 | Notification Inbox | P4-S1 |
| Owner 종→어드민 미잠금 | Operation + Trace | P4-S1/S3 |
| Completion 혼동 | Completion Contract | P2 → 전 구현 |
| smoke PASS | Trace/Runtime | P7 전 금지 |

---

## 5. 최초 명령서 Gate 대비표

| 최초 | 본 재계획 |
|------|-----------|
| Gate1 Audit | **P1** (Inbox·Trace 언어) |
| Gate2 Contract | **P2** (Bible 4계약 중심 · 구 NC 계약 SUPERSEDE) |
| §10 생존/롤백 | **P3** (Bible 승인 후) |
| Gate3 Impl | **P4** (Inbox 스트림) |
| 정적·배포 | **P5–P6** |
| Gate4 Runtime / HARD LOCK | **P7–P8** |
| (없음 · 누락) | **P0 Product Bible** ← 이번에 추가된 필수 선행 |

---

## 6. 성공 정의

1. Bible §8 LOCK  
2. App Icon 단일 = \|N ∪ C ∪ O\| · Native echo 동일  
3. Icon 모든 항 Trace 표로 증명  
4. Bell Modal ≠ History · FAB/매장메뉴 없음  
5. Bottom Conversation 공식 = Bible  
6. Owner 종 → 매장 어드민 · Completion = 처리  
7. 3기기 Trace 매트릭스 후 HARD LOCK  

---

## 7. 지금 상태 · 다음 한 방

| 항목 | 상태 |
|------|------|
| P0 Bible 문서 | 작성됨 · **§8 승인 대기** |
| P1–P8 | 미착수 |
| 코드 | STOP · dirty 보존만 |
| 땜빵 수정 | **하지 않음** |

**다음:** 팀장 — Bible §8 네 계약 승인 → P0 LOCK 선언 → P1 증거 재매핑 착수.

---

## 8. 관련 문서

| 문서 | 역할 |
|------|------|
| `DIBAY-BADGE-PRODUCT-BIBLE.md` | 제품 SSOT 후보 |
| `10-design-divergence-and-redesign.md` | 구설계 괴리 |
| `09-master-plan-what-to-do.md` | 구 할일 (본 문서로 **SUPERSEDE**) |
| `11-product-execution-plan.md` | **본 재계획안** |
