# ARO-OPS-UX-002-B9 — Admin Surface Authority

## ADMIN_SURFACE_AUTHORITY: WEB + PHYSICAL_TABLET_BROWSER

### WEB
- Primary delivery: Desktop / laptop browser → `/admin/**`
- Shell: `AdminPlatformShell` (`components/admin/shell/AdminPlatformShell.tsx`)
- Breakpoint: Tailwind `md` (768px) — `<768` hamburger + fixed drawer (`app/samarket-components.css` `@media (max-width: 767px)`)

### PHYSICAL TABLET BROWSER
- Product ops surface: Chrome on Android tablet (historical CUT I-P0-12 · Xiaomi Pad `24076RP19G`)
- NOT Chrome DevTools device emulation alone
- Landscape primary (same as P0-12)

### ANDROID NATIVE (Capacitor Admin console)
**NOT_APPLICABLE**
- CapApp loads same HTTPS origin but Admin is not a native product console surface
- No Admin tab / deep-link / native shell; B8 forbids app bottom-nav offset on Admin
- Device QA for Admin uses Chrome CDP, not CapApp WebView

### IOS NATIVE
**NOT_APPLICABLE** — same rationale; no Admin console product surface in iOS CapApp

### MIN_SUPPORTED_ADMIN_WIDTH
**768 CSS px** (shell `md` / drawer transition boundary)
- Below 768: drawer mode (supported)
- Sub-phone widths (e.g. 320) are **not** B9 blockers / not product Admin ops targets
