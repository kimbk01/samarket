# P2 — Product Decision Review

**Status:** **P2·R0·R0.5-A LOCK APPROVED** · **R0.5-B 실기 허용** · R1 보류  
**다음:** R0.5-B Wave 1 실기 (Expected 100% 일치)  
**순서:** R0✓ → R0.5-A✓ → **R0.5-B** → R1 → …  

---

## P2 승인 기록

| 항목 | 상태 |
|------|------|
| Task→제품계약→Decision 방법 | APPROVED |
| KEEP (N Writer, C ACK, OwnerChat∈C, O축 MEDIUM) | APPROVED |
| REBUILD 묶음은 **하나의 IA** | APPROVED — **R0 LOCK APPROVED** |
| Native/Cap DEFER | APPROVED — R4 전 금지 |
| R0 조건 1–5 · Surface 추가 금지 | APPROVED (Bible §A) |
| R0.5-A Expected Matrix | **LOCK APPROVED** |
| R0.5-B 실기 | **허용 · 미착수** |
| R1 Projection 문서·구현 | **보류** |

> DIBAY Badge는 Badge 시스템이 아니라 Task 추적 시스템이다.

---

## 0. 방법 (개발자 관점 금지)

```text
Task
  → 제품 계약 (P0 Bible)
  → 현재 구현
  → 차이
  → 제품 영향
  → 결정 (KEEP | REBUILD | REVERT | DEFER)
  → 이유 + Confidence
```

각 FAIL은 **7질문**을 모두 채운다.

| # | 질문 |
|---|------|
| 1 | 제품 계약은 무엇인가? |
| 2 | 현재 구현은 무엇인가? |
| 3 | 왜 달라졌는가? |
| 4 | 사용자에게 어떤 문제가 생기는가? |
| 5 | 수정하면 다른 Task에 영향이 있는가? |
| 6 | KEEP / REBUILD / REVERT / DEFER 중 무엇인가? |
| 7 | 왜 그렇게 결정하는가? |

**Confidence:** HIGH / MEDIUM / LOW  
**LOW → 결정하지 않음 → DEFER**

**절대 금지:** 파일 단위로 KEEP/REBUILD/REVERT.  
같은 파일 안에서도 Task별로 갈릴 수 있다.

증거 출처: P1-A~E, asas55 STOP, Bible P0 LOCK.

---

## 1. Decision Summary (집계)

| Decision | 건수 | Confidence |
|----------|------|------------|
| **KEEP** | 4 | HIGH×3 · MEDIUM×1 |
| **REBUILD** | 5 | HIGH×4 · MEDIUM×1 |
| **REVERT** | 0 | — |
| **DEFER** | 2 | LOW → 미결정 |

| ID | Task / 주제 | Decision | Confidence |
|----|-------------|----------|------------|
| DR-D1 | App Icon Union (단일 \|N∪C∪O\|) | **REBUILD** | **HIGH** |
| DR-D2 | Bottom Conversation 집합 | **REBUILD** | **HIGH** |
| DR-D3 | Bell Modal → History IA | **REBUILD** | **HIGH** |
| DR-D4a | Owner Chat **분류** (∈ C) | **KEEP** | **HIGH** |
| DR-D4b | Owner Chat·O 의 **Icon ∪ 투영** | **REBUILD** | **HIGH** |
| DR-D5 | Notification Event Writer SSOT (`createNotificationEvent`) | **KEEP** | **HIGH** |
| DR-D6 | Conversation unread = participant / Read ACK 축 | **KEEP** | **HIGH** |
| DR-D7 | Operation = store 업무 (O), 대화≠O | **KEEP** | **MEDIUM** |
| DR-D8 | Top Bell = \|N ∪ O_bell\| · 섹션·어드민 | **REBUILD** | **MEDIUM** |
| DR-D9 | Native echo-only (자체 ±1 금지) | **DEFER** | **LOW** |
| DR-D10 | Resume/Cap cache 권위 여부 | **DEFER** | **LOW** |

**REVERT 0건:** 전면/습관 revert 불필요. 깨진 층이 Writer가 아니라 Projection·Publisher·Surface·구 계약 → **REBUILD**가 맞음.

---

## 2. 7단계 본문

### DR-D1 — App Icon Union

| # | 답 |
|---|-----|
| 1 제품 계약 | `App Icon = \|N ∪ C ∪ O\|` · Trace §0 · Native = echo · 동일 identity 다중 Surface여도 Icon 기여 1 |
| 2 현재 구현 | Publisher가 `memberAppIconAuthority`(≈20)와 `unifiedAttention.appIconTotal`(≈22) **동시** 방출 · Cap≈20 · smoke가 22 |
| 3 왜 달라졌나 | Slice2-3 Owner 제외 cutover + unified legacy 잔존 · Product ∪ LOCK 전 배포 · dual을 임시로 남김 (P1-E W1) |
| 4 사용자 문제 | Icon 숫자를 앱 Inbox에서 **한 경로로** 끝까지 찾기 어려움 · Trace Rule 1 위험 · 신뢰 붕괴 |
| 5 타 Task 영향 | N/C/O **투영 공식** 전부 단일 Publisher에 맞춤 · FCM badge · Apply · Native 입력 통일 · 개별 Task Writer는 유지(KEEP) |
| 6 결정 | **REBUILD** |
| 7 이유 | Product Contract(단일 ∪) 위반. First Wrong = **Publisher**. Writer First Wrong 아님 → REVERT 대상 아님. |

**Confidence: HIGH**  
**증거:** asas55 20/22 · `build-domain-badge-authority-http` · P1-D Publisher · P1-E D1

---

### DR-D2 — Bottom Conversation 집합

| # | 답 |
|---|-----|
| 1 제품 계약 | `Bottom = \|C_general ∪ C_group ∪ C_trade ∪ C_customerOrder\|` |
| 2 현재 구현 | Projection `bottomChat = GD + Group` only |
| 3 왜 달라졌나 | 구 Gate2 계약 Bottom=GD+G · Trade/Order는 Hub만 · Bible과 SUPERSEDE 없이 freeze (P1-E W2) |
| 4 사용자 문제 | Trade/Order **답장 Task**가 Bottom에서 안 보여 Conversation Inbox 입구가 불완전 |
| 5 타 Task 영향 | Trade/Order Hub 수식은 유지 가능 · App Icon ∪에 이미 C_trade/C_co 포함이면 Bottom만 맞춤 · Row/ACK KEEP |
| 6 결정 | **REBUILD** |
| 7 이유 | Product Contract 위반 at **Projection**. 구 계약이 제품과 틀림 → 구 문서 SUPERSEDE + Projection REBUILD. 통째 REVERT 불필요. |

**Confidence: HIGH**  
**증거:** P1-D Projection · Bible §3 · 구 Gate2

---

### DR-D3 — Bell Modal → History

| # | 답 |
|---|-----|
| 1 제품 계약 | 종 → Modal(`N` 섹션 + `O_bell` 섹션) → History(내역) · FAB·OwnerLite 없음 · 스타벅스·선택/읽음/삭제 |
| 2 현재 구현 | Step8 `router.push(/notifications)` · 풀페이지 + OwnerLite + FAB · Modal 미확인 작업면 상실 |
| 3 왜 달라졌나 | Gate2/3 “종=즉시 NC” IA · shell flags 미개정 (P1-E W3) |
| 4 사용자 문제 | 즉시 미확인 확인 UX 상실 · 매장 메뉴/FAB 혼입 · Notification Inbox 철학 붕괴 |
| 5 타 Task 영향 | N Writer·History 데이터는 재사용 가능 · O_bell 섹션은 DR-D8과 연동 · `/notifications`는 History로 재정의 가능 |
| 6 결정 | **REBUILD** |
| 7 이유 | Product Contract(IA) 위반 at **Surface**. `setOpen`만 REVERT = 땜빵(거절). Inbox IA 전체 REBUILD. |

**Confidence: HIGH**  
**증거:** `6c8e2c8eb` · 스크린샷 · P1-D Surface · Bible Bell

---

### DR-D4a — Owner Chat 분류 (Task ∈ Conversation)

| # | 답 |
|---|-----|
| 1 제품 계약 | Owner Chat = **C** (`C_ownerChat`) · O 아님 · Completion = Read ACK |
| 2 현재 구현 | participant unread / owner SO rooms 존재 · FAB 등에 표시되는 경로 있음 |
| 3 왜 달라졌나 | (분류 자체) 제품과 대체로 맞음 · 문제는 Icon 투영(D4b) |
| 4 사용자 문제 | 분류 KEEP 시 직접 문제 없음 · D4b와 혼동 시 Icon 이상 |
| 5 타 Task 영향 | O와 분리 유지해야 X02(대화+업무 각각 1) 성립 |
| 6 결정 | **KEEP** |
| 7 이유 | Task 분류 계약과 구현 방향 일치. 같은 “owner” 파일/모듈이라도 **Conversation 부분은 KEEP**. |

**Confidence: HIGH**

---

### DR-D4b — Owner Chat / Operation 의 App Icon ∪ 투영

| # | 답 |
|---|-----|
| 1 제품 계약 | `C_ownerChat ⊂ C ⊂ AppIcon ∪` · `O ⊂ AppIcon ∪` · 단일 공식 · FAB=`\|O∪C_ownerChat\|` |
| 2 현재 구현 | member Icon에서 owner room 제외 · unified에 owner 포함 → 20/22 |
| 3 왜 달라졌나 | Slice “Member Icon Owner 제외” vs P0 ∪ 포함 (P1-E W4) |
| 4 사용자 문제 | Icon에 들어간 owner 관련 수를 FAB/배달/종에서 Trace하기 어려움 |
| 5 타 Task 영향 | D1 Publisher REBUILD와 **동일 스트림**으로 묶는 것이 안전 · D4a KEEP 유지 |
| 6 결정 | **REBUILD** |
| 7 이유 | Product Contract(∪·Trace) 위반. Owner Chat Task 자체(KEEP)와 **투영 경로(REBUILD)** 분리 결정 — 파일 단위 금지의 예시. |

**Confidence: HIGH**  
**증거:** asas55 · P1-D · Bible

---

### DR-D5 — Notification Event Writer

| # | 답 |
|---|-----|
| 1 제품 계약 | N Task는 단일 Writer로 identity 생성 · Bell/Icon은 투영 |
| 2 현재 구현 | `createNotificationEvent` SSOT 방향 · P1-D에 Writer First Wrong **없음** |
| 3 왜 달라졌나 | 이탈은 Publisher/Surface |
| 4 사용자 문제 | Writer KEEP 시 직접 이슈 없음 |
| 5 타 Task 영향 | N* 전반 |
| 6 결정 | **KEEP** |
| 7 이유 | First Wrong ≠ Writer. Writer를 갈아엎는 REBUILD/REVERT는 근거 없음. |

**Confidence: HIGH**

---

### DR-D6 — Conversation unread / Read ACK 축

| # | 답 |
|---|-----|
| 1 제품 계약 | C = 방·메시지 unread · Completion = Read ACK · Hub=List |
| 2 현재 구현 | participant unread · Hub 방 수 방향 · asas55 Hub/List 단위 정합 관찰 |
| 3 왜 달라졌나 | Bottom 집합만 구계약 (D2) |
| 4 사용자 문제 | ACK 축 KEEP |
| 5 타 Task 영향 | D2 REBUILD는 집합만 확장 · ACK 파이프 KEEP |
| 6 결정 | **KEEP** |
| 7 이유 | Conversation Task 핵심 권위 건재. Projection Bottom만 REBUILD. |

**Confidence: HIGH**

---

### DR-D7 — Operation = 매장 업무 (대화 ≠ O)

| # | 답 |
|---|-----|
| 1 제품 계약 | O = NEW_ORDER 등 · Completion = 접수/완료 · ≠ Read |
| 2 현재 구현 | C_store action types 존재 · owner_intake 혼선 **잔존 가능** |
| 3 왜 달라졌나 | 일부 legacy를 N/user_id에 넣던 역사 |
| 4 사용자 문제 | 혼선 시 종/Icon Trace 실패 |
| 5 타 Task 영향 | D8 Top Bell O_bell · D1 Icon |
| 6 결정 | **KEEP** (축) + 혼선 잔여는 D8/D1 REBUILD에 흡수 |
| 7 이유 | O 축 자체는 제품과 맞음 · 입증된 First Wrong는 Writer 아님 · **전면 O REVERT 금지**. Confidence MEDIUM = 혼선 잔여 UNKNOWN 때문에 축 KEEP만 확정. |

**Confidence: MEDIUM** (축 KEEP · 세부 혼선은 D8과 함께 구현 전 재확인)

---

### DR-D8 — Top Bell \|N ∪ O_bell\| · 섹션 · 어드민

| # | 답 |
|---|-----|
| 1 제품 계약 | Digit=`\|N∪O_bell\|` · Modal 섹션 분리 · O_bell→store admin · History 정책 분리 |
| 2 현재 구현 | Digit≈N 중심 · O_bell 섹션·어드민 딥링크 **미잠금/미완** · Step8이 Modal 자체를 붕괴 (D3) |
| 3 왜 달라졌나 | P0에서 수식 확정 · 구현·IA는 구 Gate |
| 4 사용자 문제 | 매장 업무를 종에서 바로 처리·Trace 못 함 |
| 5 타 Task 영향 | D3 Modal REBUILD에 **포함 필수** · D7 O 축 KEEP |
| 6 결정 | **REBUILD** |
| 7 이유 | Product Contract 명시. D3 없이 D8만 불가 → Notification Inbox UI REBUILD 범위에 O_bell 포함. |

**Confidence: MEDIUM** (계약 HIGH이나 구현 감사 일부 UNKNOWN → MEDIUM; LOW 아님 → 결정은 REBUILD로 진행 가능)

---

### DR-D9 — Native echo-only

| # | 답 |
|---|-----|
| 1 제품 계약 | Native = AppIcon echo · 자체 ±1 금지 |
| 2 현재 구현 | Cap sync / resume cache 경로 존재 · **First Wrong 미확정** |
| 3–4 | 실측 부족 |
| 5 | D1과 결합 가능 |
| 6 결정 | **DEFER** |
| 7 이유 | **Confidence LOW** → 결정하지 않음. D1 REBUILD 후 재검토. |

**Confidence: LOW → DEFER**

---

### DR-D10 — Resume / Cap cache 권위

| # | 답 |
|---|-----|
| 1 제품 계약 | Cache≠권위 |
| 2 현재 | versioned resume 계약 문서·테스트 존재 · 제품 Trace 실측 부족 |
| 6 결정 | **DEFER** |
| 7 이유 | LOW. D1 이후. |

**Confidence: LOW → DEFER**

---

## 3. Decision Confidence Board

| Decision 주제 | Decision | Confidence |
|---------------|-----------|------------|
| App Icon ∪ | REBUILD | **HIGH** |
| Bottom 집합 | REBUILD | **HIGH** |
| Bell Modal/History | REBUILD | **HIGH** |
| Owner Chat 분류 ∈ C | KEEP | **HIGH** |
| Owner/O Icon 투영 | REBUILD | **HIGH** |
| N Event Writer | KEEP | **HIGH** |
| C Read ACK 축 | KEEP | **HIGH** |
| O 업무 축 | KEEP | **MEDIUM** |
| Top Bell O_bell UI | REBUILD | **MEDIUM** |
| Native echo | DEFER | **LOW** |
| Cap resume 권위 | DEFER | **LOW** |

---

## 4. REBUILD 묶음 (구현 시 스트림 · 아직 착수 금지)

파일 목록이 아니라 **Task/계약 단위**:

| Stream | 포함 Decision | 제품 목표 | 구현 Phase |
|--------|---------------|-----------|------------|
| (공통) | 전 REBUILD | Inbox→Surface→Icon IA | **R0 LOCK 필수** |
| Icon ∪ · Owner 투영 | DR-D1, D4b | 단일 \|N∪C∪O\| | R1 Projection → R3 Publisher |
| Bottom 집합 | DR-D2 | C01–C04 Bottom | R1 Projection |
| Bell IA · O_bell | DR-D3, D8 | Modal+History+셸 | R2 Surface |

**착수 조건:** R0 IA LOCK 승인 + 팀장 구현 승인. 그 전 코드 금지.

---

## 5. 절대 규칙 재확인

- 파일 단위 결정 금지 (예: Owner 관련 파일 통째 REBUILD ❌)  
- Owner Chat **Task** = KEEP · Icon **투영** = REBUILD (DR-D4a/b)  
- LOW = DEFER  
- **P2 APPROVED** · 코드·롤백 실행은 **R0 LOCK + 구현 승인** 전 금지  
 

---

## 6. P2 완료 조건

```text
P2 COMPLETE ⇔
  모든 알려진 FAIL Divergence에 7질문 + Confidence + Decision 기록
  집계에 KEEP / REBUILD / REVERT / DEFER 숫자 존재
  REBUILD 스트림이 Task/계약 단위로 묶임
```

**상태:** **R0.5-A LOCK APPROVED** · R0.5-B 실기 허용 · R1 보류  
**다음:** Wave 1 실기 — Expected와 100% 일치 확인. 코드 금지.

---

## 7. 한 줄

**Writer를 탓하지 않는다. 제품 계약이 깨진 Projection·Publisher·Surface를 REBUILD하고, Conversation/Notification/Operation 축 Writer·ACK는 KEEP한다. REVERT 0 · DEFER는 Native/Resume.**
