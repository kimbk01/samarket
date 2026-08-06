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
- Required incomplete → **inline inputs** under manner battery (same as `/mypage/required`: dibay id check · phone OTP · address).  
- Required complete → **hide** home complete card; edit via account/sheets.  
- Address: no duplicate home-complete + address-menu twin CTA when complete.

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
