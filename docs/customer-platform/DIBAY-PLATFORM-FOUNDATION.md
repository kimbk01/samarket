# DIBAY Platform Foundation — SSOT / TOC

**역할:** 최상위 색인 · Gate 순서 · 판정만 둔다. 세부 계약은 하위 문서.  
**경로:** `docs/customer-platform/DIBAY-PLATFORM-FOUNDATION.md`

```text
PLAN LOCKED
SCOPE LOCKED
ARCHITECTURE GATE DEFINED
PRODUCTION SHA PASS
SLICE 0 AUDIT PASS
AUDIT PASS — IMPLEMENTATION READY
ARCHITECTURE LOCKED
SLICE 1 FACTS LOCKED
SLICE 2 AUTHORITY LOCKED
SLICE 2.5 DESIGN SYSTEM HARD LOCKED
SLICE 3 UI CODE LOCKED
SLICE 3 DEPLOYED
SLICE 3 UI RUNTIME PASS
SLICE 3 UI RUNTIME LOCK
SLICE 4 PROFILE/TRUST CODE LOCKED
SLICE 4 DEPLOYED
SLICE 4 RUNTIME PASS
SLICE 4 LOCK
SLICE 5 ACTIVITY CODE LOCKED
SLICE 5 DEPLOYED
SLICE 5 RUNTIME PASS
SLICE 5 ACTIVITY LOCK
SLICE 6 ACCOUNT CODE LOCKED
SLICE 6 DEPLOYED
SLICE 6 RUNTIME PASS
SLICE 6 ACCOUNT LOCK
SLICE 7 ADMIN PROJECTION CODE LOCKED
SLICE 7 DEPLOYED
SLICE 7 RUNTIME PASS
SLICE 7 ADMIN PROJECTION LOCK
SLICE 8 LEGAL CMS PHASE 1 CODE LOCKED
SLICE 8 DEPLOYED
SLICE 8 RUNTIME PASS
SLICE 8 LEGAL CMS PHASE 1 LOCK
SLICE 8 BUSINESS CMS PHASE 2 CODE LOCKED
SLICE 8 BUSINESS CMS PHASE 2 DEPLOYED
SLICE 8 BUSINESS CMS PHASE 2 RUNTIME PASS
SLICE 8 BUSINESS CMS PHASE 2 LOCK
SLICE 9 RESPONSIVE / MULTIPLATFORM AUTHORIZED
SLICE 9 PHASE 1 APPROVED
SLICE 9 PHASE 1 CODE LOCKED
SLICE 9 PHASE 1 DEPLOYED
SLICE 9 MULTIPLATFORM RUNTIME PASS
SLICE 9 MULTIPLATFORM RUNTIME LOCK
SLICE 10 DEAD CLEANUP AUTHORIZED
SLICE 10 PHASE 1 INVENTORY PASS
SLICE 10 PHASE 2 BUNDLE A PASS (type SSOT)
SLICE 10 PHASE 2 BUNDLE B PASS (verify + orphan deletes)
SLICE 10 PHASE 2 BUNDLE C PASS (InstagramView/Console/MyProfileCard DEAD_PROVEN)
SLICE 10 DEAD CLEANUP COMPLETE
SLICE 11 PRODUCT RUNTIME REGRESSION PASS
```

다음: **Slice 12** PRODUCT PASS / FINAL HARD LOCK — **별도 인가**.  
증거: `_ios-mypage-audit-2026-08-06/dibay/SLICE11-RUNTIME-STATUS.md`  
(비밀번호는 env/수동만 · 문서·커밋·로그 미기록)

---

## 현재 판정

```text
SLICE 1–9 LOCKED
SLICE 10 DEAD CLEANUP COMPLETE
SLICE 11 PRODUCT RUNTIME REGRESSION PASS
Product SHA: 6a4c414e4 · Deploy: dpl_2vBqxdDzqCEs1Mr5BZ37oC27R86s
Windows/Tablet/APK/iOS PASS · Slice 4–8 child suites PASS
SLICE 12 NOT AUTHORIZED
```

**Git / Production:** `6a4c414e4ae020e201c850003622f0b2766d81f8`  
상세: `_ios-mypage-audit-2026-08-06/dibay/SLICE11-RUNTIME-STATUS.md`

---

## Gate 순서

```text
Slice 0 Audit
  → AUDIT PASS
  → Architecture LOCK   (아래 6계약)
  → Slice 1 Facts
  → Slice 2 Authority
  → Slice 2.5 Design System HARD LOCK (+ Accessibility)
  → Slice 3 UI …
  → Runtime PASS → PRODUCT PASS → HARD LOCK
```

---

## Architecture LOCK (6계약)

| # | 계약 | 문서 |
|---|------|------|
| 1 | User Facts | [01-USER-FACTS.md](./01-USER-FACTS.md) |
| 2 | Domain Contract | [02-DOMAIN-CONTRACT.md](./02-DOMAIN-CONTRACT.md) |
| 3 | Navigation | [03-NAVIGATION.md](./03-NAVIGATION.md) |
| 4 | CTA | [03-NAVIGATION.md](./03-NAVIGATION.md#cta-authority) (동일 권위 묶음) |
| 5 | Motion | [03-NAVIGATION.md](./03-NAVIGATION.md#motion-contract) |
| 6 | Runtime Contract | [05-RUNTIME.md](./05-RUNTIME.md) |

LOCK 세션에서 TBD를 확정값으로 채우기 전 Slice 1 구현 금지.

---

## 문서 목차

| Doc | 내용 |
|-----|------|
| [ARCHITECTURE-LOCK.md](./ARCHITECTURE-LOCK.md) | **Architecture LOCK 확정 기록 (PASS)** |
| [00-FOUNDATION.md](./00-FOUNDATION.md) | 원칙 · Gate · 금지 · 적용 범위 |
| [01-USER-FACTS.md](./01-USER-FACTS.md) | Facts Projection · Reader/Writer/Cache/Authority |
| [02-DOMAIN-CONTRACT.md](./02-DOMAIN-CONTRACT.md) | Member · Owner · Admin · Guest · System · Service |
| [03-NAVIGATION.md](./03-NAVIGATION.md) | Nav · CTA · Motion |
| [04-DESIGN-SYSTEM.md](./04-DESIGN-SYSTEM.md) | Token · Component · **Accessibility** |
| [05-RUNTIME.md](./05-RUNTIME.md) | Cold Start … Deep Link |
| [06-CMS.md](./06-CMS.md) | 공지·정책·FAQ·배너·팝업·i18n |
| [07-ADMIN.md](./07-ADMIN.md) | Admin Projection · Audit |
| [08-HARDLOCK.md](./08-HARDLOCK.md) | 최종 HARD LOCK 체크리스트 |

감사 스냅샷: `_ios-mypage-audit-2026-08-06/dibay/SLICE0-STATUS.md`

---

## Slice 요약

| Slice | 이름 |
|-------|------|
| 0 | Audit |
| A | Architecture LOCK |
| 1 | Facts |
| 2 | Authority (Nav/CTA/Motion/Domain 강제) |
| 2.5 | Design System + Accessibility HARD LOCK |
| 3 | MyPage UI IA |
| 4–7 | Profile/Trust · Activity · Account · Admin Projection |
| 8 | CMS |
| 9–12 | Multi-runtime · Dead cleanup · PRODUCT PASS · HARD LOCK |

---

## 다음 액션 (고정)

1. ~~Production SHA~~ → **PASS** (`20d97f01e8602f72acb98a5947f2e452746af83c`)  
2. Architecture LOCK → **`ARCHITECTURE-LOCK.md` LOCKED**  
3. ~~Slice 1 Facts~~ → **FACTS LOCKED**  
4. ~~Slice 2 Authority~~ → **AUTHORITY LOCKED**  
5. ~~Slice 2.5 Design+A11y~~ → **HARD LOCK**  
6. ~~Slice 3 UI hub IA code~~ → **CODE LOCKED** + **DEPLOYED** (`fa3e6b4a2…`)  
7. ~~Slice 3 Runtime~~ → **PASS / LOCK** (APK·Tablet·Windows·iOS)  
