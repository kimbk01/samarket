# 04 — Design System HARD LOCK

Slice 2.5. Token → Component → (Slice 3) MyPage → Admin → 타 도메인.

브랜드: DIBAY green (`--dibay-green` / `#0B421A`). 당근 주황 금지.

코드 SSOT: [`lib/ui/design-system-hard-lock.ts`](../../lib/ui/design-system-hard-lock.ts)  
토큰 CSS: [`app/design-tokens.css`](../../app/design-tokens.css)  
컴포넌트: [`lib/ui/sam-component-classes.ts`](../../lib/ui/sam-component-classes.ts) · [`app/samarket-components.css`](../../app/samarket-components.css)  
Motion: [`03-NAVIGATION.md`](./03-NAVIGATION.md#motion-contract) · `MYPAGE_MOTION_MS`

```text
SLICE 2.5 DESIGN SYSTEM + ACCESSIBILITY HARD LOCK
```

## Token / Component Lock

| Area | Status | LOCK value / SSOT |
|------|--------|-------------------|
| Color Token | **LOCKED** | `--sam-primary` ← `--dibay-green` `#0B421A`; surface/text/border/danger/success via `--sam-*` |
| Typography | **LOCKED** | `--sam-text-*-size` / `--sm-font-*`; input ≥ `--sm-font-input` **16px** |
| Radius | **LOCKED** | `--sam-radius-sm` (8px rect via product bridge) · `--sam-radius-pill` |
| Elevation | **LOCKED** | `--sam-shadow-elevated` (card soft/none by default) |
| Motion | **LOCKED** | → [03](./03-NAVIGATION.md#motion-contract) · `MYPAGE_MOTION_MS` |
| Spacing | **LOCKED** | `--sam-space-1`…`6` (4–24px) · `--sam-card-padding` |
| Icon | **LOCKED** | `--sam-icon-default` / soft / on-primary |
| CTA | **LOCKED** | → [03](./03-NAVIGATION.md#cta-authority) · `Sam.btn.*` / Danger logout Slice 2 |
| Form | **LOCKED** | `sam-input` · `sam-form-field` · min height `--sam-input-min-height` |
| Card | **LOCKED** | `sam-card` · `--sam-card-padding` |
| List | **LOCKED** | `sam-list-row` / `sam-list-item` |
| Empty | **LOCKED** | domain empty copy via i18n + surface card pattern (no second brand palette) |
| Error | **LOCKED** | `--sam-danger` · `sam-btn-danger` / danger soft |
| Skeleton | **LOCKED** | muted surface placeholders; reduced-motion: no shimmer |

신규 색·타이포·반경 트리를 `app/design-tokens.css` 밖에 두지 않는다.

## Accessibility Contract (필수 동봉)

Windows · PWA · Native WebView 동일 규칙. SSOT: `DESIGN_SYSTEM_A11Y`.

| Rule | Contract |
|------|----------|
| Contrast | **WCAG 2.1 AA** — text ≥ **4.5:1** · UI ≥ **3:1** |
| Touch Target | 최소 **44×44px** (`--sam-tap-min`) |
| Dynamic Type | 시스템 글자 크기 존중; 고정 px만으로 본문 잠그지 않음(토큰 스케일) |
| Keyboard | 포커스 순서 = document; 모달 focus trap 유지 |
| Focus | **visible** `:focus-visible` ring 필수 (아이콘-only 포함) |
| ARIA | 시맨틱 · label · live region; icon-only control에 accessible name |
| Reduced Motion | `prefers-reduced-motion: reduce` 시 Motion Contract 단축/제거 (`DESIGN_SYSTEM_A11Y.reducedMotionMs`) |
| Screen Reader | 주요 CTA·폼·모달 읽기 가능 |

검증: `npm run verify:design-system-hard-lock`

Design System HARD LOCK = **Visual Token + Accessibility** 동시 PASS.
