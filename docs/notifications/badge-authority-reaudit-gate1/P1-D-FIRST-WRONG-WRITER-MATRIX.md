# P1-D — First Wrong Writer Matrix

**Part of:** P1 (`P1-INDEX.md`)  
**Mode:** 감사만 · 코드 수정 없음  
**목적:** Task마다 **제품 계약이 처음 깨지는 파이프라인 단계**를 적는다.  
감으로 KEEP/REBUILD하지 않기 위한 핵심 산출물.

---

## 0. 단계 코드

`Writer → Projection → Publisher → Reader → Native → Surface`

First Wrong = 왼쪽부터 최초 FAIL.  
이전 단계는 PASS 또는 N/A.

---

## 1. Matrix (증거 있는 FAIL 우선 · 나머지 UNKNOWN)

| Task / 주제 | Writer | Projection | Publisher | Reader | Native | Surface | **First Wrong** | 증거 |
|-------------|--------|------------|-----------|--------|--------|---------|-----------------|------|
| **Icon ∪ SSOT** (asas55 20 vs 22) | N/A (메타) | member path Owner 제외 **의도** | HTTP에 `memberAppIconAuthority` **와** `unifiedAttention.appIconTotal` **동시** | Cap/Apply≈20 | echo 20 | 런처 20 | **Publisher** | STOP capture; `build-domain-badge-authority-http` dual return; smoke가 unified 22 |
| **Bottom 집합** (제품 +Trade+CO) | C writers OK 가정 | `bottomChat = GD+Group` **만** | domain bottomChatTotal | BottomNav | — | Bottom digit | **Projection** | `member-conversation-b-authority` / 구 계약; 제품 Bible과 불일치 |
| **Bell IA** Modal→History | N writer 별개 | N digit 방향 | — | — | — | Step8 `router.push(/notifications)` + OwnerLite/FAB | **Surface** | `6c8e2c8eb` PhilifeHeader; shell flags 미제외; 스크린샷 |
| **O_bell on Top Bell** | O writer | O→종 투영 | ? | ? | — | Modal 섹션·어드민 | **UNKNOWN** | P0 수식은 LOCK, 구현 감사 미완 |
| **C05 OwnerChat vs O** | participant | owner rooms | unified chat incl owner | member Icon excl | Cap 20 | FAB | **Publisher/Projection 분기** | 동일 owner room이 unified Icon에만 +2; FAB 경로와 Icon ∪ 불일치 |
| **N\* 일반** | createNotificationEvent | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | **UNKNOWN** | Writer SSOT 후보만 확인, chain 미완 |
| **C01 GD** | participant | UNKNOWN full | UNKNOWN | UNKNOWN | UNKNOWN | Bottom 일부 | **UNKNOWN** | Bottom 축소는 Projection First Wrong (위) |
| **O01 NEW_ORDER** | C_store / commerce | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | FAB·종 | **UNKNOWN** | Trace Rule4 동시감소 미실측 |
| **X08 NC 셸** | — | — | — | — | — | OwnerLite+Float on `/notifications` | **Surface** (+ shell flags 미갱신) | Step8 경로 × conditional-app-shell |
| **Resume/Cache** | — | — | — | — | Cap cache apply 경로 | — | **UNKNOWN / 계약상 Native 재발명 금지** | cap-resume tests; 제품 echo-only |

---

## 2. First Wrong 요약 (지금 확정분)

| First Wrong 단계 | 무엇 | 다음 단계 입력 (P3 예고 · 아직 결정 아님) |
|------------------|------|------------------------------------------|
| **Publisher** | dual App Icon total | Icon Union SSOT 단일화 REBUILD 후보 |
| **Projection** | Bottom⊂GD+G only | Conversation Bottom 집합 REBUILD 후보 |
| **Surface** | Bell→풀페이지+셸 | Notification Inbox IA REBUILD 후보 |
| **Publisher/Projection 분기** | owner room Icon 이중 | C_ownerChat∪O Icon 단일 REBUILD 후보 |

Writer(1단계)가 First Wrong인 Task는 **아직 확정 행 없음** (성급히 Writer 탓 금지).

---

## 3. 채우기 규칙

1. FAIL을 주장하려면 **증거 링크** (파일·커밋·실측 경로) 필수  
2. First Wrong 왼쪽은 모두 PASS 또는 N/A로 명시  
3. UNKNOWN First Wrong인 채 P3 금지  
4. 같은 First Wrong이 여러 Task에 반복되면 **한 REBUILD 단위**로 묶을 것 (P3)

---

## 4. P1-D → P3 연결 (감사 완료 후만)

```text
First Wrong = Publisher (dual Icon)
  → REBUILD: HTTP/Apply/Native 단일 ∪ 필드
  → REVERT 아님 (습관 Gate3 통째 X)

First Wrong = Surface (Step8 IA)
  → REBUILD: Modal+History+셸
  → setOpen만 revert = 땜빵 (거절)

First Wrong = Projection (Bottom)
  → REBUILD: C_memberBottom 공식
```

---

## 5. 상태

- 증거 확정 First Wrong: **3 클러스터** (Publisher dual Icon, Projection Bottom, Surface Bell IA)  
- Task 전수 First Wrong: **미완** → P1-B와 함께 계속  
- P1 COMPLETE: 전 FAIL Task에 First Wrong 기입 후
