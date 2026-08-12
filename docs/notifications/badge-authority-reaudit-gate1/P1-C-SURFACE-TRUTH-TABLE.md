# P1-C — Surface Truth Table

**Part of:** P1 (`P1-INDEX.md`)  
**Mode:** 감사만 · 코드 수정 없음  
**목적:** Surface에 올라간 숫자를 **Task ID 목록**으로 분해해, 사람이 Icon→N/C/O→Task→Row까지 따라가게 한다.

---

## 0. 사용법

```text
App Icon = 22  (예)
  → P1-C에서 Icon 행의 Task ID 나열
  → 각 ID를 P1-A에서 Completion·감소 확인
  → P1-B/D에서 Writer chain·First Wrong 확인
```

실측 asas55 (참고 · 당시 A=0, Cap Icon=20, unified=22):

| 성분 (실측) | 대략 |
|-------------|------|
| N | 0 |
| C_member (GD3+Trade2+CustOrder15) | 20 |
| O 또는 owner chat in unified | +2 → 22 |

→ Icon 22를 Task ID로 열려면 **당시 unified에 들어간 owner 관련 identity 2개**를 특정해야 함 (P1-C 보강 + 실측 재취득).

---

## 1. Surface → Task ID (제품 계약 · 할당)

| Surface | 포함 가능 Task ID (Bible) | 수식 |
|---------|---------------------------|------|
| **App Icon** | 모든 active N* ∪ C* ∪ O* | \|N∪C∪O\| |
| **Native Badge** | = App Icon Task 집합 | echo |
| **Top Bell Digit** | N* ∪ O_bell(O*) | \|N∪O_bell\| |
| **Bell Modal N섹션** | N* (미확인만) | N |
| **Bell Modal O섹션** | O_bell | O 투영 |
| **Bell History** | N 내역 + O 업무 내역(정책) | — |
| **Bottom Chat** | C01,C02,C03,C04 (+C06 동일방) | \|Cg∪Cgr∪Ct∪Cco\| |
| **General Hub** | C01 | \|C_general\| |
| **Group Hub** | C02 | \|C_group\| |
| **Trade Hub** | C03 | \|C_trade\| |
| **Order Hub (고객)** | C04 | \|C_customerOrder\| |
| **Room Row** | 해당 C0x instance | msgUnread |
| **Bottom Delivery** | O* ∪ C05 | \|O∪C_ownerChat\| |
| **Owner FAB** | O* ∪ C05 | \|O∪C_ownerChat\| |
| **Store Admin** | O* (처리면) | Completion |

---

## 2. 역방향 — Task → Surfaces (Truth)

| Task ID | Surfaces (계약) |
|---------|-----------------|
| N01–N22 | Bell(N), History, App Icon |
| C01 | Row, GD Hub, Bottom, Icon |
| C02 | Row, Group Hub, Bottom, Icon |
| C03 | Row, Trade Hub, Bottom, Icon |
| C04 | Row, Order Hub, Bottom, Icon |
| C05 | Row, FAB, Delivery, Icon |
| C06 | Row (↑), Hub/Bottom/Icon 유지 |
| C07 | Room/C, Icon (정책) |
| O01–O04 | Bell(O_bell), FAB, Delivery, Admin, Icon |

---

## 3. 실측 스냅샷 슬롯 (채울 표)

| 시각/계정/기기 | Surface | 관측 숫자 | 분해 Task IDs (채움) | 합=숫자? |
|----------------|---------|-----------|----------------------|----------|
| 2026-08-03 asas55 Xiaomi | App Icon Cap | 20 | C: GD×3+Trade×2+CO×15? | 재확인 |
| 동 | unified | 22 | 20 + ?owner×2 | UNKNOWN id |
| 동 | Bottom | 3 | C01×3? | UNKNOWN |
| 동 | Trade Hub | 2 | C03×2 | UNKNOWN |
| 동 | Order Hub | 14~15 | C04 | UNKNOWN |
| 동 | Bell | 0 | (empty N) | PASS empty |
| 동 | NC UI | broken | — | FAIL IA |

---

## 4. 완료 조건

- Icon 관측값마다 Task ID 목록으로 **합집합 크기 = 관측값** 설명 가능  
- Bell/Bottom/FAB도 동일  
- 설명 불가면 Trace Rule 1 FAIL → P1-D
