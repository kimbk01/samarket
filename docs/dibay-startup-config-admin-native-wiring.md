# DIBAY Startup Config — Admin → Native Intro wiring

Lock date: 2026-07-27  
Base: `e785d24d3` (Web Intro = 0, Native Splash direct remote)

## Product contract

- **Web Intro = 0** (`isStartupIntroActive` always false; layout has no Intro markup).
- **Startup Surface = 1** — Native overlay only (`DibayStartupIntroSurface` / iOS Intro overlay).
- **No** LocalRuntimeApp · fake AppShell · fake BottomNav · second Web Intro.
- Cold apply order: **bundle default → device cache → paint Intro → app start → background API → atomic cache → next cold**.
- Intro removal = **shellReady** → exit animation → remove. Exit duration ≠ completion timer.

## Field wiring table

| Admin control | Admin state | PUT `/api/admin/startup-config` | DB `admin_settings.startup_config_v1` | Public `/api/app/startup-config` | Web cache + `DibayBootBridge.persistStartupConfig` | Native cache | Android renderer | iOS renderer | Live paint |
|---|---|---|---|---|---|---|---|---|---|
| initialSurface | `draft.initialSurface` | `config.initialSurface` | nested payload | same | prefs `initial_surface` / `dibay_initial_surface` | JSON + prefs | `ensureInitialRemotePathOnce` | UserDefaults reader (nav) | **WIRED** |
| Logo file pick | upload → `logo.url` | `logo.source/url` | nested | same | download → `startup-logo.bin` | filesDir/Documents | ImageView local bitmap | UIImage local | **WIRED** (next cold) |
| Logo size/position | `logo.widthPreset` / `verticalPosition` | nested | nested | same | JSON fields | JSON | dp + Gravity | AutoLayout | **WIRED** |
| Enter/Exit/Ambient | `introAnimation.*` | nested | nested | same | JSON | JSON | ObjectAnimator | UIView.animate | **WIRED** |
| Background solid/gradient/image | `background.*` | nested | nested | same | `startup-background.bin` when image | files | Color/Gradient/bitmap | Color/CAGradient/UIImage | **WIRED** |
| Caption ko/en + spinner | `caption` / `spinner` | nested | nested | same | JSON | JSON | TextView / ProgressBar | UILabel / UIActivityIndicator | **WIRED** |
| Web Intro enabled | legacy flat | stored | stored | — | — | — | ignored (`isStartupIntroActive=false`) | ignored | **DEAD (intentional)** |

## Upload

`POST /api/admin/startup-config/upload-image` — admin auth, campaign image validation (PNG/JPEG/WEBP ≤2MB), storage path `_admin/startup/{logo|background}/…`.

## Preview SSOT

`lib/startup/startup-intro-visual.ts` enums + CSS class helpers shared by Admin preview and Native enum IDs.

## QA notes

- Admin E2E without admin session: **BLOCKED**.
- iOS device runtime: **BLOCKED** if no device; build required.
- Android: cold ×5 after save with custom logo/bg/enter/exit.
