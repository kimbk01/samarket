# 제품 기준 재감사 — 동일 구도 vs 틀어진 부분

**Mode:** 감사만 · 수정/롤백/해결안 구현 없음  
**기준:** 팀장 확정 원칙 1–6 + Owner App Icon 포함 **미확정**  
**실측:** asas55 · Xiaomi home · `capture-all.json`  
**HEAD:** `449e02771`

---

## 0. 질문

> 확실히 동일 구도인지, 어디가 틀어진 부분인지?

답:

- **큰 구도(1–4, 6의 의도)** 는 코드·실측이 **대체로 같은 축**이다.  
- **틀어진 핵심은 5번 App Icon** 이다. Owner 포함 여부를 제품이 확정하기 전에 **두 공식(20 / 22)을 동시에 살려 둔 것**.

---

## 1. 원칙별 대조

### 1) 채팅방 행 = 방 미읽음 **메시지** 수

| | |
|--|--|
| 제품 | roomUnread(room) · ACK 후 0 |
| 코드 | participant `unread_count` → row |
| 실측 | 허브/목록 단위 분리와 정합 (Trade hub=2, list 방 다수) |
| 판정 | **동일 구도** |

---

### 2) Bottom / Trade Hub / Order Hub = 미읽음 **방** 수 (메시지 합 아님)

| 표면 | 제품 공식 | 코드 | asas55 실측 | 판정 |
|------|-----------|------|-------------|------|
| Bottom | GD+Group 미읽음 방 | `bottomChat = general+group` | 3 | **동일** |
| Trade Hub | Trade 미읽음 방 | `tradeHub` | 2 | **동일** |
| Order Hub | Customer Order 미읽음 방 | `orderHub` / orderUnreadRooms | 15 | **동일** |
| 같은 방 메시지 1→20 | Hub 유지 1 | room count 단위 | (단위 계약) | **동일** |

---

### 3) Bell = 비채팅 이벤트 수 (메시지 아님)

| | |
|--|--|
| 제품 | 상태/공지/커뮤니티/검증 정보성/orphan missed 등 |
| 코드 | A_member / bellTotal |
| 실측 | A=0, list unread=0, empty NC 문구 | **숫자 동일** |
| 틀어짐 | NC **셸**(OwnerLite/FAB) — Bell **숫자 의미**와 별개 UI 회귀 | **숫자 구도는 동일 · NC 표면 깨짐** |

---

### 4) 매장 오너 분리 (storeId)

| | |
|--|--|
| 제품 | 신규주문·업무 → Owner FAB/배달; 오너채팅 → Owner hub; store별 |
| 코드 | C / B_store 축 존재; Cap member icon에서 owner SO **제외** 시도 |
| 실측 | `store_order` domain=17, customer order=15 → owner 추정 **2** |
| 틀어짐 | Owner 2가 **unified App Icon 22에만** 들어가고, member Cap 20에는 없음 → “포함 시 Owner 표면에 같은 수로 찾아 없애기” 계약이 **단일 App Icon에 고정되지 않음** |
| NC | OwnerLite 16이 member NC에 침범 | **분리 위반 (UI)** |

---

### 5) App Icon = 최상위 뱃지 **중복 없는 합** (메시지 총합 아님)

제품이 말한 합:

```text
App Icon =
  Bell
  + GD/Group 미읽음 방   (= Bottom과 동일 집합)
  + Trade 미읽음 방
  + Customer Order 미읽음 방
  + (제품 확정 시) Owner 미확인
```

asas55 재구성:

```text
Bell 0 + GD/G 3 + Trade 2 + CustOrder 15 = 20
+ Owner rooms 2                              = 22
```

| 경로 | 값 | 의미 |
|------|-----|------|
| Cap / `memberAppIconAuthority` / projection | **20** | Owner **미포함** 합 |
| `unifiedAttention` / 필드 B=22 | **22** | Owner rooms **포함** 합 |

| 절대 금지 항목 | 상태 |
|----------------|------|
| App Icon = 메시지 총합 | 두 경로 모두 **방 수 합** 쪽 — 이 금지와는 대체로 맞음 |
| API total 하나 설명 없이 | **위반** — 20과 22가 동시에 존재 |
| App Icon에만 있고 앱에서 못 없앰 | **22의 owner 2**가 Cap Icon에 안 보이면 “Icon만의 유령”은 20 쪽에선 없음; 22를 권위로 쓰면 Owner FAB에서 같은 2를 지울 수 있어야 하는데 **단일 권위가 아님** |
| Bell∩채팅 중복 합산 | asas55 A=0이라 실측 중복 없음; 구조적으로 A와 B 분리는 유지 |

**판정:** 구성요소 사고방식은 동일 구도.  
**틀린 점:** Owner 포함 **미결정**인데 구현이 **미포함(20)** 과 **포함(22)** 을 동시에 남김.

---

### 6) 없어지는 방식

| 구성요소 | 제품 | 코드 방향 | 비고 |
|----------|------|-----------|------|
| Bell | 읽음/삭제 | A read_at | NC 셸과 별개 |
| Row | room ACK | participant | |
| Bottom/Hub | 해당 도메인 방 0 | room count 재투영 | |
| Owner | 처리/오너채팅 읽음 | C / B_store | |
| App Icon | 위 합 재계산 (직접 -1 금지) | Cap echo member total | dual이면 “어느 합을 재계산하는지” 불명 |

**구도 동일 · App Icon 입력 집합이 이중.**

---

## 2. 동일 vs 틀림 — 한 장

| 영역 | 동일 구도? | 틀린/미결 부분 |
|------|------------|----------------|
| Row 메시지 수 | Yes | — |
| Bottom/Hub 방 수 | Yes | — |
| Bell = 비채팅 | Yes (숫자) | NC OwnerLite/FAB 혼입 |
| Owner store 분리 의도 | 부분 | Icon·NC에 경계 붕괴 |
| App Icon = 최상위 합 | **축은 Yes** | **Owner 포함 미확정 + 20/22 동시** |
| 직접 Icon -1 | 금지 준수 쪽 | — |

---

## 3. 20과 22의 본질 (재감사 결론)

```text
20 = 원칙5에서 Owner를 넣지 않은 합
22 = 원칙5에서 Owner 방 2를 넣은 합
```

커서/Gate3가 “어느 쪽이 제품 App Icon인지”를 닫지 않고  
**두 결정을 두 API 필드로 남긴 것**이 현재 P0다.

Owner를 App Icon에:

- **넣지 않기로 확정** → 단일 권위는 20 쪽; 22는 Member Icon 권위가 되면 안 됨  
- **넣기로 확정** → 단일 권위는 22 쪽(또는 Owner 업무+채팅 정의에 맞는 합); 그 수만큼 Owner 표면에서 찾아 없앨 수 있어야 함  

이 결정 전에는 App Icon 공식을 “완전히 고정”할 수 없다. (팀장 문구와 동일)

---

## 4. 이 재감사에서 하지 않은 것

- KEEP/REVERT 실행  
- Partial Rollback 선언  
- R1/R2 구현  
- Owner 포함 여부 대신 결정  

---

## 5. 한 줄

**큰 뱃지 구도(행=메시지, 허브=방, Bell=이벤트, Owner 분리)는 같다.  
틀어진 것은 App Icon 구성요소 집합(Owner 포함 여부)을 확정하지 않은 채 20과 22를 동시에 남긴 것과, NC에 Owner 셸이 섞인 UI다.**
