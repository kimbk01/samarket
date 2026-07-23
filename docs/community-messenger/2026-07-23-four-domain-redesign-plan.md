# DIBAY 채팅 4 Domain 재설계 실행 계획

**작성:** 2026-07-23  
**기준 commit (작업 전 SSOT):** `e5e44fcd5` (롤백 tip `da5ad3fdb` + Vercel trigger)  
**금지 복원 구간:** `36bd68ada` ~ 롤백 직전 HEAD (Domain Authority / Phase R / Projection cutover / Atomic / 뱃지 추측 패치)

이 문서는 **실행 계획**이다. Phase A 승인 전 구현·커밋·푸시·배포 금지.

---

## 0. 왜 재설계인가 (실패 학습)

| 실패 | 교훈 → 이번 규칙 |
|------|------------------|
| writer 여러 개 위에서 구멍만 막음 | **패치 금지.** surface당 writer 1개로 교체 후 삭제 |
| 로그 없이 “이 함수다” 추측 | **Phase A 전 구현 금지.** 코드 경로(+실측)만 |
| 레거시 옆 Domain Authority 중첩 | **중첩 금지.** quarantine → 호출 0 → **파일 삭제** |
| 7/14 이후 84커밋 thrash | 그 코드 **복원 금지.** 현재 HEAD에서 재도출 |
| 방 진입은 안 건드림 | **다단 셸도 재설계 범위.** Pass0/1/deferred/BootstrapGate |
| QA 전 완료 선언 | Gate + 실기기 3회 전 **PASS 금지** |

Native Voice/Video LOCK · 통화 런타임: **전 Phase 수정 금지.**

---

## 1. 제품 계약 (고정 · 변경 시 별도 승인)

DIBAY 채팅 ≠ 통합 1목록. **4 Domain**만:

| Domain | Canonical identity (후보) | Bottom Chat | 목록 표면 |
|--------|---------------------------|-------------|-----------|
| `general_direct` | `general_direct:{sortedA}:{sortedB}` | 포함 | 메신저 일반 |
| `group` | `group:{groupId}` | 포함 | 메신저 그룹 |
| `trade` | `trade:{itemId}:{sellerId}:{counterpartyId}` | **제외** | 거래 허브만 |
| `store_order` | `store_order:{orderId}` | **제외** | 고객 주문 / 오너 주문만 |

권한 흐름 (최종):

```
DB Domain facts → Domain query/service → Domain projection → Surface store(1 writer) → UI
```

Surface별 숫자 정의:

- **Bottom Chat** = unread **방 수**(general_direct + group만)
- **일반/그룹/거래/주문 리스트** = 각자 Domain만
- **Header Bell** = notification projection 합산 (participant unread 직접 재계산 금지)
- **App Icon** = 통합 projection (participant + notification **이중 합산 금지**)

---

## 2. 현재 HEAD 현실 (계획의 출발점)

기준: `e5e44fcd5`

| 사실 | 의미 |
|------|------|
| `lib/chat-domain/chat-domain.ts` **없음** | 4 Domain SSOT 타입/락 미구축 |
| pillars = `trade` / `community` / `store_order` | 제품 3종 bag; `community` 안에 GD+group 혼재 |
| `MESSENGER_DOMAINS`에 philife/store/call 혼재 | 경계 문서만 있음, 데이터 분리 미완 |
| 목록·bootstrap | `lib/community-messenger` + `lib/chats` **이중 ledger** |
| 뱃지 | `owner-hub-badge-store` + `notification-badge-count-store` + poll/optimistic **다 writer** |
| 방 진입 | Pass0 / Pass1 / RouteEntry / Deferred / BootstrapGate / Stable **다단** |

→ “복원”이 아니라 **현재 코드 감사 → KEEP/REMOVE → 신규 Domain 축으로 교체**.

---

## 3. 전체 Phase (순서 고정 · 건너뛰기 금지)

```
A 감사 → [STOP·승인]
B 계약 freeze + 파일락 초안 → [STOP·승인]
C DB/API Domain 분리 (migration 작성만, 운영 적용은 별도 승인)
D Domain bootstrap·list projection
E Domain realtime·dedupe
F 원자 read·unread projection
G notification·push·sound projection
H Bell / Bottom / App Icon / Domain list 단일 연결
I UI route·header·방 진입 단일 크롬
J quarantine 완료분 삭제 + import 락 테스트
K lint/tsc/i18n/vitest/build
L commit/push/Vercel Ready + APK + 2기기×3 QA
```

**각 Phase 끝 Gate를 통과하기 전 다음 Phase 금지.**  
**A~B 끝에서 구현 범위를 freeze하지 않고 C로 폭주하면 = 이전 실패 반복.**

---

## 4. Phase A — 전수 감사 (수정 0)

### 4.1 목표

현재 checkout만으로 **표 2종 + REMOVE 격리 계획**을 만든다. 코드 변경 없음.

### 4.2 추적 흐름 (파일·함수 단위)

1~26항 (방 생성 ~ 오너 context 전환) — 사용자 프롬프트 §2 그대로.

### 4.3 필수 산출물

**표 1 — 영역 SSOT**

| 영역 | 현재 SSOT | writer 전체 | reader 전체 | Domain 구분 | 오염 위험 | 수정 필요 |
|------|-----------|-------------|-------------|-------------|-----------|-----------|

필수 영역 최소: 홈목록, GD/group/trade/SO 목록, preview, unread, Bell, Bottom, Domain badge, App Icon, notification read, room entry chrome, bootstrap critical/full, realtime, bus, cache/sessionStorage.

**표 2 — writer inventory**

| 상태/데이터 | writer 함수 | 호출 조건 | 저장 위치 | Domain 정보 | 충돌 | KEEP/REFACTOR/REMOVE |

**표 3 — 의심 A~D** (가설 문장 금지, `path:symbol` + 호출 체인만)

- A 새로고침 뱃지 flash 타임라인 T0~T6  
- B trade list row = unique room  
- C 읽음 후 재등장  
- D user vs owner identity  

**표 4 — REMOVE 격리·삭제 계획**

| 파일/심볼 | 현재 호출자 수 | quarantine 방법 | 삭제 전 증명 | 대체(KEEP/신규) |
|-----------|----------------|-----------------|--------------|-----------------|

**표 5 — 방 진입 셸 inventory**

| 컴포넌트 | paint 역할 | 제거/병합 후보 | 비고 |
|----------|------------|----------------|------|
| `CommunityMessengerRoomPageClientEntry` | | | |
| `…Deferred` | | | |
| `…RouteEntryShell` | | | |
| `…BootstrapGate` | | | |
| `…Pass0Shell` | | | |
| `…Pass1StableShell` | | | |
| `…Pass1ComposerShell` | | | |
| `…StableEntryShell(+Light)` | | | |

**표 6 — DB**

| 불변식 | 현재 schema/제약 | 충돌 | migration 필요 | 데이터 손실 위험 |
|--------|------------------|------|----------------|------------------|

### 4.4 Phase A Gate

- [ ] 표 1~6 완비  
- [ ] surface당 writer ≥2인 곳 **최초 충돌 지점** 명시  
- [ ] 7/14 이후 파일 **복원 제안 0건**  
- [ ] 코드 diff = 0  
- [ ] 판정: `PASS` (감사만) / `BLOCKED` (DB·권한 접근 불가 등)

**STOP.** 사용자 승인 전 Phase B 금지.

---

## 5. Phase B — 계약 freeze + 파일 락 초안

### 5.1 산출

1. 4 Domain canonical identity **확정문** (DB 충돌 반영)  
2. Surface → **단일 writer 파일** 매핑 (목표)  
3. `verify:chat-domain-file-lock` (또는 동등) **테스트 초안**:  
   - REMOVE quarantine 경로 import 시 FAIL  
   - Bell/Bottom/AppIcon이 inventory 외 함수에서 set 시 FAIL  
4. KEEP / REFACTOR / REMOVE **동결 목록** (이후 무단 추가 금지)

### 5.2 Gate

- [x] identity 문자열·unique 규칙 문서화 → `2026-07-23-four-domain-phase-b-freeze.md` + `lib/chat-domain/four-domain-freeze.ts`
- [x] 락 테스트가 CI에서 돌 수 있는 형태 (아직 REMOVE 미삭제도 OK) → `npm run verify:chat-domain-file-lock`
- [ ] 승인 (사용자) — 승인 전 Phase C 금지

**Phase B 산출:** `docs/community-messenger/2026-07-23-four-domain-phase-b-freeze.md`

---

## 6. Phase C~I — 구현 (요약 · A/B 후 상세 분해)

| Phase | 핵심 작업 | 삭제/락 |
|-------|-----------|---------|
| **C** | ~~…~~ → phase-c + **migration promoted** `20261001120000_cm_rooms_chat_domain_identity.sql` | |
| **D** | ~~GD/group/trade/SO 독립 bootstrap; list DTO~~ → `2026-07-23-four-domain-phase-d.md` (**PASS contract · STOP**) | 클라 type-split 단일 API 금지 유지 |
| **E** | ~~Domain envelope realtime + dedupe~~ → `2026-07-23-four-domain-phase-e.md` (**PASS · STOP**) | 목록 직접 조작 payload 제거는 **계획만** (실행 H) |
| **F** | ~~방 단위 원자 read; stale snapshot version~~ → `2026-07-23-four-domain-phase-f.md` (**PASS · STOP**) | optimistic이 authority 되지 않게 |
| **G** | ~~Domain push/sound/route~~ → `2026-07-23-four-domain-phase-g.md` (**PASS · STOP**) | FCM/Native/sound SSOT 미배선·미수정 |
| **H** | ~~Bell/Bottom/AppIcon/Domain list projection 1 writer~~ → `2026-07-23-four-domain-phase-h.md` (**PASS contract · STOP**) | quarantine 목록만 · **실배선/실삭제 금지** |
| **I** | ~~진입 Domain별 · chrome 1단 계약~~ → `2026-07-23-four-domain-phase-i.md` (**PASS contract · STOP**) | REMOVE **준비만** · 실삭제 금지 |

각 Phase 끝: 해당 Domain/surface **단위 테스트** + 회귀 vitest.

---

## 7. Phase J — 격리 → 삭제 (요청 반영)

순서 **절대 변경 금지** — slice-1 완료: R10·R8b 삭제 (`2026-07-23-four-domain-phase-j.md`).

1. **Quarantine:** 호출부 제거 또는 dead export + `verify:…-import-ban`  
2. **증명:** `rg` / contract test로 **제품 경로 호출 0**  
3. **삭제:** 파일·심볼 실삭제 (주석 quarantine만 남기기 금지)  
4. **락 강화:** 삭제된 경로 re-import = CI FAIL  

대상 예 (A에서 확정·여기선 후보만):

- hub optimistic unread 직접 set  
- badge-count / hub **이중 poll**이 surface를 동시에 쓸 때  
- trade↔CM unread enrich 이중집계  
- 방 진입 다단 셸 중 paint에만 쓰이는 중복  
- sessionStorage를 authority로 쓰는 hydrate  

---

## 8. Phase K~L — Gate / 배포 / QA

### K

~~`architecture/domain contract` → …~~ → `2026-07-23-four-domain-phase-k.md` (**PASS contract gate · STOP**)  
lint/i18n/build/기기 = add·push·L로 분리.

### L

commit → push → **Vercel Ready를 CLI/대시보드로 확인** (추정 금지) → Capacitor/APK → Xiaomi+Samsung × **3회**  
시나리오·기록 숫자는 사용자 프롬프트 §15 그대로.  
판정: `PASS` | `FAIL` | `BLOCKED` only.

---

## 9. 일정 감각 (냉정)

| 구간 | 내용 | 대략 |
|------|------|------|
| A | 감사만 | 수일 (서면 밀도 우선) |
| B | freeze+락 초안 | 1~2일 |
| C~F | 데이터·bootstrap·RT·read | 수주 |
| G~I | 알림·뱃지·UI·진입 | 수주 |
| J~L | 삭제·Gate·QA | 수일~1주 |

**“빠른 전체 완료”를 약속하지 않는다.**  
대신 **A/B에서 실패를 끊고**, 이후는 surface/Domain 단위로만 전진한다.

---

## 10. 즉시 다음 액션 (지금)

1. ~~A~~ … ~~Hub badge slice-1~~ · ~~Domain list slice-1~~ · ~~R1 remove (측정)~~
2. **사용자:** trade-chats / delivery-chats / 일반 홈 새로고침·뱃지 재확인
3. 잔여: Bell/AppIcon cutover · Domain list **paint** SSOT · R2 재평가 — **별도 승인**

---

## 11. 성공 정의 (최종)

배포 앱에서 2기기×3회 QA가 §15 숫자를 동시에 만족하고,  
각 surface writer가 락 테스트상 **1개**이며, REMOVE 목록이 **실삭제**된 상태만 `PASS`.
