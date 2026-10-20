# Phase 1 — Legacy IA contract LOCK (2026-08-06)

```text
AUDIT FAIL AXIS (in scope): /mypage assembly IA · scroll flow · section hierarchy · responsive · nav/motion evidence
OUT OF SCOPE (do not reopen): Facts · Authority writers · Point · Policy CMS · Inquiry/Inbox · routes · dead cleanup
```

## 1. Behavior-flow order (all viewports)

1. identity (profile start)  
2. activity (trade)  
3. store_order  
4. assets (points)  
5. account (security · address · payment · notifications · language · region)  
6. service (app settings)  
7. support (notices · CS · inquiries · inbox)  
8. policy (terms · privacy · business)  
9. danger (logout · leave)  

Feature-catalog cards are **not** IA authority.

## 2. Profile / required

- One identity start: avatar · name · DIBAY ID · manner summary · edit entry.  
- **필수정보 3행 상시 표시 (2026-10-20 Owner 승인, real-screen-redesign §11)** — 프로필 카드 바로 아래 아이디 · 전화번호 인증 · 대표 주소 3행을 완료 여부와 관계없이 항상 표시 (행 = 아이콘 · 제목 · 현재 값 · 상태 배지 · CTA, 행 전체 탭 = CTA). 계정 화면(S03)도 같은 컴포넌트. 이동 = 아이디·전화 시트, 주소 `/mypage/addresses`.  
- ~~Required complete → hide home complete card~~ (폐기 2026-10-20).  
- Address: 대표 주소 값은 필수정보 「대표 주소」 행만 표시 — 「주소관리」 메뉴 행의 오른쪽 값(동네)은 비운다 (같은 값 2회 표시 금지).

## 3. Responsive

| Band | px | Contract |
|------|-----|----------|
| Mobile | ≤767 | 1-col · one scroll root · BottomNav · push detail |
| Tablet | 768–1199 | **same 1-col** · centered max-width · **no** 2-col menu catalog |
| Desktop | ≥1200 | **same 1-col** · centered · hover/focus · **no** list+detail unless separate UX proof |

**FAIL:** `grid-cols-2` / `grid-cols-3` menu catalog · mobile section parallel expand.

`KARROT LARGE-SCREEN = NOT_AVAILABLE` → do not claim “Karrot-identical” wide UI.

## 4. Motion

Keep `MYPAGE_MOTION_MS` (push/back 300 · sheet 280 · modal 200).  
Row press / mid-frame: NOT_PROVEN → **no arbitrary token change**.

## 5. Implementation authority files

- `MyPageHomeDashboard.tsx` · `MyPageGuestHomeDashboard.tsx`  
- `mypage-home-menu-config.ts` · `MyInfoHomeMenuSections.tsx`  
- `MyInfoMenuSection.tsx` · `MyInfoMenuItem.tsx`  
- `mypage-responsive-breakpoints.ts` · related tests / `verify:mypage-authority-contract`  
- `MypageRequiredInfoSummary.tsx` (complete hide)

Feature delete = 0 · writer clone = 0 · route clone = 0.

```text
PHASE 1 IA CONTRACT = LOCKED
→ Phase 2 implement immediately
```
