# DIBAY Badge · Bell 종합 정리 및 할 일 보고

> **SUPERSEDED** — 실행 순서는 `11-product-execution-plan.md` + `DIBAY-BADGE-PRODUCT-BIBLE.md` 를 따른다.  
> 본 문서는 초기 할일 초안 보존용.

**Date:** 2026-08-03  
**Status:** 제품 기준 잠금용 보고 · **코드 미착수**  
**HEAD:** `449e02771` (working tree STOP 보존 중)

---

## A. 제품 공식 (확정)

### 단위

| 단위 | 의미 |
|------|------|
| 메시지 수 | 방 미읽음 **대화** (시스템 상태 제외) |
| 방 수 | 미읽음 대화 ≥1인 방 개수 |
| 이벤트/업무 | Bell·오너 알림·업무 건수 |

### 표면별

| 표면 | 공식 |
|------|------|
| **Row** | 해당 방 미읽음 **메시지** 수 |
| **Hub** | 도메인 미읽음 **방** 수 = 리스트 미읽음 방 개수와 **동일** |
| **Bottom Chat** | 일반 + 그룹 + **거래** + **주문(고객·오너 대화, 시스템 제외)** 미읽음 **방** 수 |
| **Member Bell** | 회원 상태·공지·커뮤니티 등 **이벤트** (채팅 메시지 제외) |
| **Owner 종** | 매장 오너 알림 (`storeId`) |
| **Bottom 배달** | 오너 매장/배달 미확인 |
| **Owner FAB** | 오너 업무·(정의된) 오너 채팅 |
| **App Icon** | Member Bell + Bottom Chat 방집합 + **Owner 구성요소** (중복 없이). 메시지 총합 아님 |

### 오너 규칙

- App Icon에 Owner **포함** (Icon만의 유령 숫자 금지 → 종·배달·FAB에서 동일하게 찾아 제거)
- 종 · 배달 Bottom · FAB **각각** 표시
- **매장 주문 관련 종 항목 선택 → 해당 매장 어드민 진입**
- `storeId`별 분리

### 감소

Bell 읽음/삭제 · 방 Read ACK · 오너 처리/채팅 읽음 → App Icon은 **재합산** (직접 −1 금지)

---

## B. 종(Bell) UI/UX (확정)

### 흐름

```text
종 탭
  → 모달 (미읽음·뱃지 대상만)
       → 「알림 보기」
            → 알림 도메인 전체/내역 (읽은 항목 포함)
```

| 단계 | 내용 |
|------|------|
| **모달** | **뱃지(미읽음)만** 표시. 읽은 항목 모달에 안 넣음 |
| **알림 보기** | 전체 알림 도메인. **읽은 메시지/내역** 보임 |

### 모달 기능

- 미읽음 우선 표시 (뱃지 영역)
- 전체 선택 / 개별 선택
- 모두 읽음 / (개별 읽음)
- 개별 삭제 / 전체 삭제
- 모바일 **눌림(press)** 인터랙션
- **스타벅스 컬러** UI
- **FAB 없음 · 매장 OwnerLite 메뉴 없음**
- APK · iOS 규격 (safe-area, 터치 타깃, 모달 오버레이)

### 금지 (현재 깨진 것)

- 종 클릭 → `/notifications` 풀페이지 + FAB + 매장 메뉴 겹침
- Gate3 Step8이 팝업을 제거하고 셸 미잠금 NC로 보낸 상태

---

## C. 지금 뭐가 틀어졌는가 (실측·코드)

| # | 문제 | 증거 |
|---|------|------|
| 1 | App Icon **20 vs 22** (Owner 포함/미포함 이중) | asas55 Cap20 / unified22 |
| 2 | Bottom Chat이 제품과 다름 (코드 **GD+Group만**) | 제품은 +거래+주문 |
| 3 | 종 → NC 풀페이지 + OwnerLite + FAB | Step8 + 셸 미제외 |
| 4 | 모달=미읽음만 / 알림보기=내역 흐름 붕괴 | Step8이 모달 토글 제거 |
| 5 | smoke≠Product PASS 절차 | 기존 STOP |

**구도상 맞는 것:** Row=메시지, Hub=방 수 방향, Bell≠채팅 메시지(숫자)

---

## D. 뭘 할 것인가 (실행 계획 · 아직 미착수)

우선순위 고정. 한 번에 전체 rebuild 하지 않음.

### Phase 0 — 계약 문서 잠금 (선행)

- 본 보고 + `08-product-formula-restated.md` v2를 SSOT로 확정
- Owner App Icon 항 세부: **종∪배달∪FAB 중복 제거 합**으로 잠글지 한 줄 확인 (기본 권장)

### Phase 1 — Bell UX 복구 + 셸 제거 (P0 UI)

| 할 일 | 내용 |
|-------|------|
| 1.1 | 종 클릭 → **모달** 복구 (미읽음만) |
| 1.2 | 「알림 보기」→ 알림 도메인 (읽음 포함 내역) |
| 1.3 | 모달: 전체/개별 선택, 모두 읽음, 개별/전체 삭제, press |
| 1.4 | 스타벅스 컬러 적용 |
| 1.5 | `/notifications` 경유 시에도 **FAB·OwnerLite 금지** (모달 복구가 본선) |
| 1.6 | Dirty Step8→popup 보존분과 HEAD 정렬 (모달 쪽이 제품) |

### Phase 2 — Bottom Chat 공식 정렬 (P0 숫자)

| 할 일 | 내용 |
|-------|------|
| 2.1 | Bottom = GD+Group+Trade+CustOrder(오너 대화, 시스템 제외) |
| 2.2 | Hub↔리스트 미읽음 방 개수 정합 검증 |
| 2.3 | 상태 시스템 → Bell만 (Bottom/Hub 미가산) |

### Phase 3 — App Icon 단일화 (P0 숫자)

| 할 일 | 내용 |
|-------|------|
| 3.1 | 공식 = Member Bell + Bottom 방집합 + Owner 구성요소 |
| 3.2 | `unified` vs `member` **이중 권위 제거** (하나 SSOT) |
| 3.3 | Native/FCM/Cap echo = 그 SSOT만 |
| 3.4 | Owner 항 = 종·배달·FAB에서 제거 가능함을 계약 테스트 |

### Phase 4 — Owner 종 → 매장 어드민

| 할 일 | 내용 |
|-------|------|
| 4.1 | 매장 주문 종 페이로드에 `store_id` |
| 4.2 | 탭 → 해당 매장 어드민 라우트 |
| 4.3 | 회원 알림 탭과 경로 분리 |

### Phase 5 — 검증

- Xiaomi / Samsung / iPhone  
- 모달 미읽음만 · 알림보기 내역 · FAB/매장메뉴 없음  
- Bottom·Hub·Icon·Owner 증감 시나리오  
- API smoke만으로 Product PASS 금지  

---

## E. 가능한가?

| | |
|--|--|
| 가능 | Yes. 전면 main 롤백 불필요 |
| 난이도 | Phase1 UI 중 · Phase2–3 권위 중 · Phase4 라우팅 중하 |
| 막힘 | Owner Icon 항을 종만/FAB만/합집합 중 문장 하나로 잠그면 구현 착수 가능 (기본=중복 제거 합) |

---

## F. 지금 하지 않는 것

- 코드 수정 / 배포 / HARD LOCK  
- Partial Rollback 실행 선언 (범위는 위 Phase로 대체 정의)  
- 숫자 UI 직접 −1  

---

## G. 팀장 확인 요청 (착수 전)

1. 본 문서 A–B 제품 기준 **승인** 여부  
2. Owner App Icon 항 = **종∪배달∪FAB 중복 제거 합** 으로 잠가도 되는지  
3. 승인 후 **Phase 1 (Bell 모달 UX)** 부터 착수할지  

승인 전에는 수정하지 않습니다.

---

## H. 관련 문서

- `08-product-formula-restated.md` — 공식 v2  
- `06-product-criteria-reaudit.md` — 이전 재감사  
- `07-fix-plan-feasibility.md` — 구 계획 (Bottom/Owner 일부 **본 문서로 갱신**)  
- `.qa-logs/badge-gate3-deploy/gate1-stop-preserve/` — dirty STOP 보존  
