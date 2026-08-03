# DIBAY Badge — 전체 상태 보고 (증거 기준)

**날짜:** 2026-08-03  
**HEAD:** `f438f37e2`  
**모드:** 보고만 · 패치/리버트/PASS 없음

---

## 1. 한 줄

**제품 요구(A/B/C·App Icon 공식)는 대체로 맞다. 구현이 같은 사건을 화면마다 다른 집합으로 세서 제품이 FAIL이다. 필터 패치·전체 롤백·Slice2-6만 리버트로는 안 고쳐진다.**

---

## 2. 사용자가 원한 것

| 축 | 원함 | 감소 |
|----|------|------|
| A 회원 알림 | 공지·시스템·거래/주문 상태 등 persistent | 읽음/삭제 |
| B 회원 채팅 | GD/Group/Trade/고객주문방 + unresolved missed | 방 읽음 / missed seen |
| B_store 오너 채팅 | 고객→매장 주문채팅 | 오너 방 읽음 |
| C_store 운영 | 접수·환불·취소·문의 Action Required | Action Complete (읽음≠감소) |
| 광고 | OS만 | Bell/목록/App Icon 증가 없음 |

**공식 (원함)**

```text
Bell = A unread
목록 unread = Bell과 같은 A 집합
Popup = 그 A 목록
App Icon = A + 회원 unread rooms + unresolved missed
Bottom = GD+Group rooms
Owner Chat FAB = 활성 매장 owner rooms
Owner Ops = C actions
```

---

## 3. 지금 코드/제품이 틀린 곳 (원함 vs 실제)

| 항목 | 원함 | 실제 | 판정 |
|------|------|------|------|
| Bell digit | A event ID 집합 크기 | **attention key** 개수 | **틀림** |
| 알림 목록 | 같은 A unread 집합 | event row + read포함 + 별도 filter/탭 | **틀림** |
| Bell Popup | A 알림 | **중요대화(room)** + 초대 + missed 혼합 | **틀림** |
| mark-all | 같은 A 집합 | **legacy `notifications` + `notification_events`** | **틀림** |
| App Icon | 구성원 ID 증명 가능 | 주로 **total 숫자**만 전달 | **부족** |
| Bell ≠ App Icon (3 vs 23) | A만 vs A+B면 가능 | 공식상 가능 · **멤버십 dump 미증명** | 숫자만으로 FAIL 아님 |
| iOS Cap ≠ server | fresh snapshot 후 적용 | **resume에 Cap 캐시 재echo** (2-6 이전부터) | **틀림** |
| owner_intake | C만, Bell 금지 | Bell에선 **필터로 제외**, writer는 여전 | **반만** |
| Slice PASS/LOCK | 제품 정합 후 | 축 하네스만 PASS 취급 | **무효** |

**관측 FAIL 예:** Samsung App Icon 23 / Bell 3 / 목록 없음 / Popup에 숫자+중요대화 / iOS Cap 지연.

---

## 4. 문제의 본질 (뭐가 문제인가)

1. **A 권위가 하나 아님** — digit(key) / list(event) / popup(room) / mark-all(dual table).  
2. **Bell 크롬에 채팅을 넣음** — 중요대화는 baseline 이전부터 있던 CM 기능, Slice 2-6 아님.  
3. **Native가 stale Cap을 권위처럼 재적용** — e2cb 리버트와 무관.  
4. **PASS를 제품 PASS로 확장** — 또 터진 직접 원인(프로세스).  
5. baseline `1e2a560c1`도 이미 owner/chat 오염 FAIL — **전체 롤백 ≠ 안정**.

설계(축 분리·App Icon=A+B)는 살릴 가치 있음.  
**지금 깨진 건 구현 레이어의 이중 권위.**

---

## 5. 커밋이 뭘 건드렸나 (짧게)

| 커밋 | Bell digit/목록 | Popup | Hub | App Icon식 | FCM/Cap |
|------|-----------------|-------|-----|------------|---------|
| 2-2 `d6dbb91d4` | **건드림** | 안 함 | — | digit 연결 | — |
| 2-3 `06bab8001` | UI 안 함 | 안 함 | — | **건드림** | — |
| 2-4/2-5 | 안 함 | 안 함 | **건드림** | 제외 유지 | — |
| 2-6 `e2cb00ec8` | **안 건드림** | **안 건드림** | 안 함 | total 읽어 FCM | FCM always-send · Cap 경로 없음 |

→ **Bell/목록 FAIL 원인으로 2-6 리버트는 코드상 성립 안 함.**

---

## 6. 뭘 어찌 할 것인가

### 하지 말 것
- 필터/숫자 패치  
- 전체 reset → `1e2a560c1`  
- “Bell 고치려고” e2cb만 리버트  
- PASS/LOCK 선언  

### 할 것 (순서)
1. **패치 중지**  
2. **읽기 전용 ID dump** (같은 계정) — digit eventIds vs 목록 vs mark-all vs App Icon 구성  
3. **A 재구축:** `AUnreadEventIds` 하나 → digit·Popup A·목록·read/delete·App Icon A  
4. Popup에서 **중요대화 분리** (채팅 크롬으로)  
5. App Icon **구성원 집합** 응답  
6. Native: auth → **fresh** snapshot → absolute · resume 실패 시 Cap 재확정 금지  
7. B_store/C_store는 계약 유지·회귀만  
8. 그다음 Runtime → 제품 PASS (나중)

### 롤백?
- **전체/광범위 롤백 = 제품 복구에 더 느림**  
- 기계적 git은 빨라도 **예전 FAIL + 다시 깔기**  
- 빠른 길은 **A 단일 집합 재구축**

---

## 7. 현재 공식 상태

```text
제품                  : FAIL
설계(A/B/C 공식)      : 유지 가치 있음 (구현과 분리)
Slice PASS / LOCK     : 무효
PARTIAL ROLLBACK PLAN : EVIDENCE INSUFFICIENT (PASS 철회)
P0 REVERT             : 보류
다음                  : ID dump → A SSOT 재구축 (승인 후)
```
