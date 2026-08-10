# DIBAY Global Input UX Parity — Platform / Orientation Matrix HARD LOCK

**HARD LOCK (2026-08-10).**

## Core sentence

**동일 UX 계약 ≠ 동일 inset 계산.**

DIBAY form / composer / sheet input UX shares one **product** contract (focus visible, no blank gap, CTA reachable, keyboard restore, press/haptic semantics).  
Raw geometry (**must not** be unified into one number or one formula across devices):

- raw bottom inset · safe-area · keyboard height · viewport height · navigation bar height  
- orientation geometry · iOS / Android resize model · tablet / desktop layout

## Architecture

```
Platform Detection / Capability
        ↓
Orientation
        ↓
Navigation Mode / Safe Area (measured, never invent)
        ↓
Keyboard Resize / Overlay Model (capability)
        ↓
Platform Adapter
        ↓
Global Form Keyboard SSOT  →  normalized outputs
        ↓
Surface Adapter
        ↓
Form / Composer
```

**ONE PRODUCT CONTRACT · MULTIPLE PLATFORM ADAPTERS · ONE NORMALIZED OUTPUT INTERFACE**

Normalized consumer fields (same *names*, not same *raw values*):

| Field | Meaning |
|---|---|
| `effectiveViewportTop` | Measured chrome / sticky / vv offsetTop band |
| `effectiveViewportBottom` | Last visible layout Y |
| `effectiveBottomInset` | Footer padding authority for **this** environment |
| `keyboardOpen` / `keyboardOcclusion` | Capability-derived |
| `safeBottom` | CSS `--safe-bottom` / bridge — **measured** |
| `focusVisibleBand` | top/bottom clip policy |

`effectiveBottomInset` is **not** “one shared pixel value.” It is the adapter result on a common interface.

## Platform adapters (required splits)

### Android

Must branch (capability / measurement — **not** device-name guess):

- gesture navigation vs 3-button navigation  
- nav bar shown vs hidden / immersive  
- portrait vs landscape  
- phone vs tablet  
- keyboard open/closed  
- whether `adjustResize` / layout-aligned actually applied  

**FAIL:** assume gesture and 3-button share the same bottom inset.  
**FAIL:** if layout already includes nav bar height, add it again as padding.  
**FAIL:** reuse 3-button measured padding on gesture (or reverse).

### iOS

Must branch:

- home indicator / safe-area bottom (measured)  
- portrait vs landscape  
- iPhone vs iPad  
- keyboard overlay vs resize behavior  
- `visualViewport.offsetTop` change  

**FAIL:** hardcode home-indicator px.  
**FAIL:** reuse iPhone portrait safe-bottom on landscape or iPad.

### Windows / Web

Must branch:

- physical keyboard vs on-screen keyboard  
- desktop vs tablet mode  
- portrait vs landscape  
- browser chrome resize  

Physical KB → `keyboardOcclusion = 0`, no mobile reposition.  
OSK → apply visibility contract only when viewport/vv actually changes.  
**FAIL:** force mobile keyboard mode from OS name / UA alone.

### Tablet

Not a “wide phone.” Separate portrait/landscape, split/resize, physical KB, max-width / centered column scroll vs full viewport scroll.

## Orientation

Portrait PASS alone **does not** CLOSE. Landscape is a separate geometry case (usable height can collapse; do not reuse portrait offsets).

PASS when:

`focusedRect.top >= effectiveViewportTop`  
`focusedRect.bottom <= effectiveViewportBottom`

If usable viewport is tiny: prioritize focus target with **minimal** scroll; keep CTA reachable.

## Runtime matrix (NOT_PROVEN ≠ PASS)

Minimum independent rows (each environment is its own case):

| Device | Orientation | Nav / KB mode |
|---|---|---|
| Samsung | P / L | gesture / 3-button |
| Xiaomi | P / L | gesture / 3-button |
| iPhone | P / L | home-indicator measured |
| Tablet | P / L | (no phone reuse) |
| Windows | — | physical KB / OSK / tablet modes |

Record per case (not one-line PASS): platform, device, orientation, navigationMode, viewport*, visualViewport*, safe*, keyboard*, effective*, focused*, cta*.

Representative surfaces (min phone P+L): Community, Trade, Profile, Delivery, Messenger.  
Risk surfaces: BottomSheet, sticky CTA, textarea, composer — measure on each platform representative env.

## Verdict policy

- Samsung Community PASS = **that** device + **that** nav mode + **that** orientation + Community write only.  
- **Forbidden:** expand to Android PASS / Global PASS / device-independent PASS.  
- Unmeasured row = **NOT_PROVEN**.  
- FINAL stays **OPEN** until CLOSED criteria (product contract + adapters + orientation + Android nav split + iOS split + tablet + Windows + representative evidence + zero hidden/gap/excessive/CTA fail) are all met.

## Code ownership

| Layer | Path |
|---|---|
| Normalized contract | `lib/ui/form-keyboard-viewport-contract.ts` |
| Platform adapter / capability | `lib/ui/form-keyboard-platform-adapter.ts` |
| Runtime hook | `lib/ui/use-form-keyboard-viewport.ts` |
| Focus band | `lib/ui/use-form-keyboard-focus-visibility.ts` |
| Press / haptic | `FORM_INTERACTIVE_PRESS_CLASS` · `lib/ui/light-tap-feedback.ts` |
| CM Room (KEEP LOCK) | `cm-room-*` — do not fold into Form adapters |

## DO NOT (without reopen)

- One raw formula for `effectiveBottomInset` on all devices (`safeBottom + keyboardHeight` shared globally)  
- Hardcode Android 3-button height or iPhone home-indicator px  
- Reuse portrait → landscape or phone → tablet insets  
- `window.innerHeight` alone for all environments  
- UA-only keyboard mode  
- Assume Android and iOS `visualViewport` behave the same  
- Guess navigation bar from device marketing name  
- Declare CLOSED from a single env PASS  

## Reopen

Explicit user approval required to change this LOCK, weaken matrix rows, or claim CLOSED without evidence.
