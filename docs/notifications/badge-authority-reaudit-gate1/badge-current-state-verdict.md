# Gate 1 — Current State Verdict

**Mode:** AUDIT ONLY · 코드 수정/리버트/배포 금지 유지  
**HEAD:** `449e02771` = `origin/main`  
**Date:** 2026-08-03

---

## §15 즉시 제출 (1–12)

### 1. HEAD / origin/main / dirty

| | |
|--|--|
| HEAD | `449e02771` |
| origin/main | `449e02771` (동기) |
| Dirty badge | `PhilifeHeaderNotificationInbox.tsx` — Step 8 팝업 복구 **미커밋** (이전 턴; Gate1 전 무단) |
| Dirty other | capacitor-www/android/ios markup, qa-logs, docs(product-badge-audit 등) |

### 2. 최근 뱃지 커밋 (요지)

| SHA | 요약 |
|-----|------|
| `449e02771` | Gate3 테스트 정렬 |
| `fc1fc1410` | Production backfill incident close |
| `6c8e2c8eb` | **Gate 3 freeze** — NC `/notifications`, Bell→NC, contracts, quarantine… |
| `e2cb00ec8` | Native/FCM echo MemberAppIcon |
| `aa2d46b09` | C_store ops |
| `06bab8001` | App Icon A+B_member, owner room exclude Cap |
| `d6dbb91d4` | Bell A 분리 |
| `1e2a560c1` | 이전 A/B 시도 **전체 리버트** (정상 후보 기준점) |

### 3–7. Writers (요약)

| 표면 | Writer 요약 |
|------|-------------|
| App Icon | Domain HTTP → `memberAppIconAuthority` → apply → NativeBadgeSync `Badge.set` / FCM echo |
| Bell | `createNotificationEvent` → A projection → `applyBellBadgeProjection` |
| Bottom | Conversation B GD+Group → domain apply / BottomNav |
| Trade/Order Hub | B trade / customer SO room counts |
| Owner FAB | store hub GET — B_store + C |

상세: `badge-event-writer-map.md`

### 8. 읽음·삭제 mutation

`inbox-read-bridge` mark/read/delete, PATCH `/api/me/notifications`, room read ACK.  
상세: `badge-read-writer-map.md`

### 9. member_id / store_id

Member events: `user_id`. Owner: `store:{id}` 계약은 있으나 **unifiedAttention·OwnerLite 셸**에서 혼선.  
상세: `badge-identity-contamination-report.md`

### 10. 현재 실제 공식

```text
Cap/launcher ≈ A_member + B_member (owner SO 제외)     // 의도 계약
unifiedAttention.appIconTotal = Chat(+owner) + Notif   // 잔존 이중
Bell = A_member
Bottom = |GD| + |Group|
TradeHub = |Trade|
OrderHub = |Customer SO|
```

### 11. 마지막 정상 기준점 후보

| 후보 | 의미 | 한계 |
|------|------|------|
| `1e2a560c1` | 실패한 A/B 축 시도 리버트 직후 | 이후 Slice 2 재구축 전; “구 UI”에 가깝지만 A/B 미완 |
| `d6dbb91d4` 직전 | Bell 분리 전 | Bell/chat 혼합 위험 |
| **부분 기준:** Step 8 직전 (`6c8e2c8eb^` Bell click) | 팝업 Bell UX | App Icon dual·C는 남음 |

**전체 main을 `1e2a560c1`로 되돌리는 것은 비추천** — Slice 2 A/B 분리·C·backfill까지 날림.

### 12. 판정 (하나)

# PARTIAL ROLLBACK REQUIRED

---

## 왜 전체 롤백이 아닌가

명령서 §10:

- 원천 `createNotificationEvent` / room unread cursor는 **생존 가능**.
- A/B/C 계약·Slice 2-2~2-6 방향은 명령서 모델과 **대체로 일치**.
- 안전한 부분 경계가 있다:
  1. **Gate 3 Step 8** Bell→`/notifications` (셸 미잠금) — UI/라우트 롤백 또는 셸 계약 후재도입
  2. **`unifiedAttention.appIconTotal` 소비자 경로** — dual authority 제거
  3. `/notifications`에 **OwnerLite + FloatingAdd** 노출 — 셸 플래그 (구현은 Gate3; 감사만)

전체 저장소/`main` hard reset은 증거 기준 **과잉**이며, 이미 한 번(`1e2a560c1`) 전면 리버트 후 재구축한 이력이 있다. 또 하면 같은 루프.

## 왜 SALVAGEABLE만으로 부족한가

§10 부분 롤백 조건 해당:

- App Icon에 **독립·이중 누적 공식** 공존 (`unified` vs member)
- 변경 범위가 Step8+dual+셸로 **특정 가능**하고 이전 팝업 기준점 존재
- member/store UI bucket 혼용 (OwnerLite on NC)
- “숫자만 맞추는 패치”로 닫으면 명령서 위반 → **부분 롤백 후** 계약 재구현

## 왜 AUTHORITY REBUILD REQUIRED가 아닌가 (지금)

원천 이벤트·읽음·A/B projection이 **네 축 전부 붕괴**한 상태는 아님.  
이미 rebuild 진행 중이며 문제는 **미종결 cutover + NC 제품 미완 + 검증 프로세스 실패**.  
전면 rebuild 선언은 중복 공사; Gate2에서 계약 재고정 후 Gate3는 **남은 경계만**.

---

## 무엇이 틀어졌는가 (냉정)

| # | 틀림 | 종류 |
|---|------|------|
| 1 | 제품 모델(A/B/C, App Icon=A+B)과 **일부 코드 방향은 맞음** | — |
| 2 | Gate3 Step8 NC를 **셸 계약 없이** 배포 → UI 폭발 | 구현/게이트 실패 |
| 3 | App Icon **이중 필드**를 HTTP에 남김 | cutover 미완 |
| 4 | API smoke를 Device/Product PASS로 취급 | 프로세스 실패 |
| 5 | 무단 Step8 팝업 복구가 dirty로 남음 | 절차 위반 (보존만, 커밋 금지) |

---

## Gate1 이후 (아직 실행 금지)

감사 승인 후에만:

1. dirty Step8 처리 방침 결정 (유지 커밋 vs discard)
2. PARTIAL ROLLBACK 범위 확정 커밋
3. Gate2 contracts
4. 그 다음 구현

지금은:

```text
코드 수정 금지
리버트 금지
배포 금지
```

---

## 최종 한 줄

**전체 롤백 아님. PARTIAL ROLLBACK REQUIRED.**
