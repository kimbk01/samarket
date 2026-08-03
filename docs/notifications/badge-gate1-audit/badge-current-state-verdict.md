# Gate 1 — Current State Verdict

**Date:** 2026-08-03  
**Mode:** AUDIT ONLY — 코드 수정·리버트·배포·숫자 강제·PASS/LOCK **없음**  
**Product status:** `BADGE PRODUCT FAIL`

---

## 즉시 제출 항목 (§15)

### 1. HEAD / origin / dirty

| Item | Value |
|------|--------|
| HEAD | `f438f37e2e07b6c7dcb49faed37c72de0bbfbc8f` |
| origin/main | 동일 |
| Tracked dirty (badge paths) | **없음** (해당 경로 clean) |
| Untracked | `.qa-logs/`, audit docs, misc rules 등 다수 — **이번 Gate에서 삭제·정리하지 않음** |

### 2. 최근 뱃지 관련 커밋 (1e2a560c1..HEAD)

| SHA | Summary |
|-----|---------|
| `ca86a20c1` | foundation tests |
| `d6dbb91d4` | member Bell A 분리 |
| `1a814053b` | mark-all dual stores |
| `06bab8001` | B_member / App Icon |
| `f3dd1bb5d` | room read reconcile |
| `5ee177ca6` | B_store |
| `c78dd7a1e` / `c673ac444` | hub cache |
| `aa2d46b09` | C_store + migration |
| `e2cb00ec8` | FCM/Native wire |
| `f438f37e2` | 2-6 test align |

### 3–8. Writer / mutation 맵

→ `badge-event-writer-map.md`  
→ `badge-read-writer-map.md`  
→ `badge-projection-map.md`  
→ `badge-identity-contamination-report.md`

### 9. member_id / store_id 사용

- Member paths: `notification_events.user_id`, participants by user  
- Store C: `get_owner_hub_store_attention_counts(p_store_id)`  
- **오염:** owner commerce notify → owner `user_id` (`owner_intake`)

### 10. 현재 숫자를 만드는 실제 공식

```text
Bell       = |A attention keys|          // NOT |A events|
List       = filtered notification_events (read+unread)
Popup      = chat important rooms + invites + missed
Bottom     = |GD+Group unread rooms|
TradeHub   = |Trade unread rooms|
OrderHub   = |Customer SO unread rooms|
AppIcon    = BellKeys + |member unread rooms| + unresolved missed
OwnerChat  = |active store owner unread rooms|
OwnerOps   = pending+refund+cancel(+inquiry)
FCM badge  = AppIcon total echo (absolute)
```

### 11. 마지막 정상 기준점 후보

| 후보 | 판정 |
|------|------|
| `1e2a560c1` | **정상 아님** — phase0: owner_intake→Bell/AppIcon, owner rooms→AppIcon, RUNTIME_PARTIAL_OR_FAIL |
| Slice RUNTIME PASS 커밋들 | **제품 정상점 아님** — 축 하네스 ≠ 전표면 정합 (PASS 문서/대화 과대) |
| **결론** | 안전한 “이전 정상 git 기준점” **없음** |

### 12. 판정 (셋 중 하나)

# AUTHORITY REBUILD REQUIRED

---

## 왜 SALVAGEABLE이 아닌가

명령서 조건: 원천·identity·읽음·문제가 projection만 · 중복 writer 제거 가능.

| 조건 | 결과 |
|------|------|
| 원천 domain event 정확 | **부분** — owner_intake user_id · 메시지 다중 writer |
| member/store identity 정확 | **아니오** — 오염 writer 생존 |
| message unread cursor 정확 | **대체로** B 방향 |
| Bell read_at 정확 | **부분** — dual legacy+events |
| 문제 = projection/UI만 | **아니오** — writer + read + projection + Native Cap |
| 중복 writer 제거 가능 | 가능하나 **경계만 패치하면 재발** |

→ projection 재배선만으로 Gate 통과 주장 **불가**.

---

## 왜 PARTIAL ROLLBACK REQUIRED가 아닌가 (단독 판정)

부분 롤백 조건 일부는 해당:

- Bell/채팅이 **동일 필드**를 digit에 쓰진 않음 (필터로 분리)  
- 그러나 Popup은 채팅 혼합  
- member/store **동일 bucket에 owner_intake 기록**  
- App Icon Cap 독립 재echo  
- **이전 정상 기준점 없음** → “증거 기반 패치만 제거하면 정상” 성립 안 함  
- `e2cb`만 리버트해도 Bell/목록/Popup **파일 미변경 PROVEN** → Bell FAIL 미해결  

부분 git 리버트는 **도구로 남을 수 있으나**, 이번 Gate의 **단일 판정 라벨로는 부적합**.

---

## 왜 AUTHORITY REBUILD REQUIRED인가

명령서:

```text
원천 이벤트 · recipient identity · 읽음 권위 · projection
네 가지가 모두 혼합 + 안전한 부분 롤백 경계 없음
→ AUTHORITY REBUILD REQUIRED
```

| 축 | 혼합 증거 |
|----|-----------|
| 원천 | events + legacy + participant unread + owner_intake + Cap prefs |
| identity | user_id owner ops · store RPC · room id in Bell popup |
| 읽음 | dual mark-all · 홈 mark vs room-open gap · FCM≠room clear(의도) |
| projection | attention keys vs events vs rooms vs total-only Native |

재구축 범위: **뱃지·알림 권위 레이어** (전체 저장소 reset 아님).  
살릴 입력: chat atomic unread, C store RPC, buyer A notifies, classifier/identity 순수 타입.

---

## 사용자 원함 vs 틀림 (요약)

| 원함 (명령서) | 현재 |
|---------------|------|
| Bell = A event unread count = 목록 unread 집합 | digit=keys · list≠digit · Popup≠A |
| App Icon = A_events + B_rooms · 구성원 증명 | A_keys + rooms · total 위주 · Cap stale |
| Bottom/Trade/Order = room counts · row = messages | **대체로 맞음** |
| Owner ≠ member Bell/App Icon | filter로 완화 · writer 오염 잔존 |
| 읽음 후 전 표면 단일 commit | 경로 분절 |
| Notification Center UI | 미구현 · 현재 popup+목록 분열 |
| 광고 push-only ≠ A | marketing 제외 시도 · 정책 미완 |

---

## 이전 거짓말/과대 보고 정정

| 과거 | 정정 |
|------|------|
| Slice/축 LOCK·PRODUCT PASS | **무효** · Gate1 입력 증거일 뿐 |
| PARTIAL ROLLBACK PLAN PASS | **철회됨** · 증거 부족이었음 |
| P0(e2cb) = Bell 수리 | **코드상 거짓** |
| DELETE_AFTER_REBUILD 확정 | 재구축 후보일 뿐 · 삭제 일정≠증명 |
| “설계만 맞고 연결만 문제” | **과소** — identity/writer/read도 혼합 |

---

## 금지 유지 (다음 승인 전)

```text
코드 수정 금지
리버트 금지
배포 금지
App Icon 강제 set 금지
숫자 초기화 금지
HARD LOCK / RUNTIME PASS / CODE PASS 선언 금지
```

---

## Gate1 다음 (명령서 순서 · 미실행)

Gate 2 Contract 문서·계약 테스트 **승인 후에만**.  
구현·배포·런타임은 그 다음.
