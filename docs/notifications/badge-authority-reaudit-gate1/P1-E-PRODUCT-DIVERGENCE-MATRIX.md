# P1-E — Product Divergence Matrix

**Part of:** P1 (`P1-INDEX.md`)  
**지시:** P1 CONTINUE · **UNKNOWN Writer 끝까지 파기 금지**  
**Mode:** 감사만 · 구현·수정·롤백·KEEP/REBUILD/REVERT **금지**  
**다음(P1 후):** **DECISION REVIEW** (P2 계약 테스트가 아님)

> Writer(1단계)가 First Wrong인 Task가 아직 없다  
> → **제품 계약 깨짐은 Projection / Publisher / Surface에 있을 가능성이 크다.**

---

## 0. 이 문서가 하는 일

각 FAIL을 다음 체인으로만 기록한다.

```text
Task
  → Writer
  → Projection
  → Publisher
  → Surface
  → Product Contract (Bible P0)
  → WHY → WHY → WHY …
```

**하지 않는 일:** Writer UNKNOWN 전수 굴착, 코드 패치, REBUILD 개수 성급 선언.

---

## 1. Product Divergence Matrix (증거 있는 FAIL)

| Task / 주제 | Writer | Projection | Publisher | Surface | Product Contract (P0) | Divergence |
|-------------|--------|------------|-----------|---------|----------------------|------------|
| **Icon ∪** (20 vs 22) | N/A / PASS 가정 | member path Owner 제외 | **FAIL** dual total | 런처=20 | `AppIcon=\|N∪C∪O\|` 단일 | Publisher가 계약 ∪를 둘로 쪼갬 |
| **Bottom 집합** | PASS 가정 | **FAIL** GD+G만 | FAIL 전파 | Bottom digit | `Bottom=\|Cg∪Cgr∪Ct∪Cco\|` | Projection이 계약 집합보다 작음 |
| **Bell IA** | N Writer≠원인 | digit 방향 OK 가능 | — | **FAIL** Step8 풀페이지+셸 | Modal=`N`+`O_bell` 섹션 → History | Surface IA·셸이 계약과 불일치 |
| **Owner room on Icon** | C/O Writer≠First | **FAIL 분기** member vs unified | **FAIL** dual | Cap vs smoke | OwnerChat∈C · Icon∪에 포함·단일 | Projection/Publisher가 동일 Task를 두 공식으로 |
| **NC OwnerLite/FAB** | — | — | — | **FAIL** | Modal/History에 FAB·OwnerLite 없음 | Surface(+shell) 계약 위반 |

PASS/UNKNOWN Writer는 **더 파지 않음**. First Wrong가 Writer가 아님이 이미 핵심 증거.

---

## 2. Why Matrix (FAIL → WHY × n)

### W1 — App Icon 20 vs 22

```text
FAIL: Icon/스모크 숫자 이중
  WHY1: Publisher가 memberAppIconAuthority 와 unifiedAttention.appIconTotal 동시 방출
  WHY2: Slice2-3이 member Icon에서 Owner 제외하며 unified(legacy ChatAttention)를 남김
  WHY3: cutover를 “임시 dual”로 배포하고 smoke가 unified를 PASS로 읽음
  WHY4: Product Contract(단일 ∪) 없이 Gate/Slice 공식을 제품이라 부름
  WHY5: Trace Contract(§0)가 잠기기 전에 HARD/Product 언어 사용
```

**제품 계약 이탈 지점:** Publisher (+ Projection 분기)  
**Writer 이탈?** 아니오 (First Wrong ≠ Writer)

### W2 — Bottom = GD+Group only

```text
FAIL: Bottom이 Trade·CustOrder 방 미포함
  WHY1: Projection bottomChat = general+group 만
  WHY2: Gate2/구 Phase 계약이 Bottom=GD+G 로 잠김
  WHY3: Trade/Order는 Hub만이라는 구 제품 가정
  WHY4: 팀장 Bible(Conversation Inbox 확장)과 구 Gate 계약이 충돌한 채 코드는 구계약 유지
  WHY5: 계약 SUPERSEDE 없이 구현 freeze
```

**제품 계약 이탈 지점:** Projection (원인 문서 = 구 Gate2 계약)  
**Writer 이탈?** 아니오

### W3 — Bell Modal → 풀페이지 + 셸

```text
FAIL: 종 → /notifications + OwnerLite + FAB
  WHY1: Surface가 Step8에서 popup 제거·router.push
  WHY2: Gate2/3이 “종=즉시 NC 풀페이지”로 IA 잠금
  WHY3: /notifications 가 mypage 제외 규칙 밖인데 shell flags 미개정
  WHY4: Notification Inbox = Modal(미확인)+History(내역) 제품 IA가 문서화되기 전 배포
  WHY5: UI 경로 변경을 Authority freeze에 묶음
```

**제품 계약 이탈 지점:** Surface (+ 구 Gate IA 계약)  
**Writer 이탈?** 아니오

### W4 — Owner 관련 Icon 이중

```text
FAIL: owner room이 Cap Icon과 unified에 다르게 반영
  WHY1: Projection member는 OwnerChat 제외, unified ChatAttention은 Owner 포함
  WHY2: OwnerChat∈C · Icon∪ 포함이 P0에서야 잠김
  WHY3: “Member Icon에서 Owner 제외” 구 Slice 목표와 팀장 ∪ 요구 충돌
  WHY4: dual Publisher가 충돌을 가림
```

**제품 계약 이탈 지점:** Projection/Publisher  
**Writer 이탈?** 아니오

---

## 3. Divergence 요약 (한 장)

| ID | Product Contract | 깨진 층 | 구 설계/문서 원인 | Writer 문제? |
|----|------------------|---------|-------------------|--------------|
| D1 | AppIcon 단일 ∪ | Publisher | dual cutover + smoke | **아니오** |
| D2 | Bottom Conversation 집합 | Projection | Gate2 Bottom=GD+G | **아니오** |
| D3 | Bell Modal+History | Surface | Gate2/3 NC IA | **아니오** |
| D4 | OwnerChat∈C ∧ Icon∪ | Projection/Publisher | Slice2-3 exclude vs ∪ | **아니오** |

---

## 4. STOP 경계

```text
P1-E까지 = 제품 계약에서 왜 벗어났는지
P1 중 Writer UNKNOWN 추가 굴착 = STOP (지시)
KEEP / REBUILD / REVERT 숫자 선언 = STOP
구현·수정·롤백 = STOP

다음 허용 단계:
  DECISION REVIEW
    — FAIL마다 KEEP가능? / REBUILD? / REVERT?
    — 근거 · 증거 · 영향
    — 그 결과로만 개수 집계
```

---

## 5. DECISION REVIEW 입력 초안 (판정 아님 · 템플릿만)

| Divergence | KEEP? | REBUILD? | REVERT? | 근거(채울 곳) | 증거 | 영향 |
|------------|-------|----------|---------|---------------|------|------|
| D1 dual Icon | | | | | P1-D Publisher | Icon·FCM·smoke |
| D2 Bottom | | | | | P1-D Projection | Bottom·Icon∪ |
| D3 Bell IA | | | | | Step8·스크린샷 | Modal·History·셸 |
| D4 Owner/Icon | | | | | 20/22 | C∪O Icon |

**칸은 DECISION REVIEW에서만 채운다. 지금 채우지 않음.**

---

## 6. P1 상태 (팀장 평가 반영)

| 단계 | 상태 | 판정 |
|------|------|------|
| P1-A Task Trace | ✅ | 맞음 · 유지 |
| P1-B Writer Trace | ✅ | 맞음 · **추가 굴착 STOP** |
| P1-C Surface Truth | ✅ | 맞음 · 유지 |
| P1-D First Wrong | ✅ | 맞음 · Writer≠First Wrong이 핵심 |
| **P1-E Product Divergence** | ✅ 본 문서 | 제품 계약·WHY 연결 |

P1 COMPLETE ≠ DECISION REVIEW 완료.  
P1-E 후 **DECISION REVIEW** 착수 지시가 있으면 그때 FAIL별 KEEP/REBUILD/REVERT 근거표를 작성한다.
