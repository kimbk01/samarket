# Final Product Validation — RUNTIME PARTIAL (2026-08-01)

**Production SHA:** `ec9c3e7b3` (GitHub Production deployment + team confirm)  
**APK:** `docs/perf/dibay-fpv-ec9c3e7b3-ec9c3e7b3.apk`  
**APK SHA-256:** `3633c86427e7000a0a63edbcaaf1f9ef44cd2ec23c9b17043d3987226dad2816`  
**server.url:** `https://samarket.vercel.app`  
**Viewer:** asas55 / `35dd245c-d398-4ea3-93a0-c0eda37cc777`

## Authority baseline (Explain = Surface)

| Surface | Value |
|---------|-------|
| App Icon / Explain appIcon | **32** |
| Bottom / Explain bottom | **4** |
| Trade | **1** |
| Customer | **25** |
| Owner | **2** |
| Bell / Explain bell | **2** |

## Platform results

| Platform | Result | Evidence |
|----------|--------|----------|
| Xiaomi `24076RP19G` | **PASS** | warm×3, bg→fg×3, cold, logout Badge.get=0; app=32=explain; bell=2=explain; Badge.get=32 |
| Samsung `SM-M156S` | **PASS** | same matrix |
| Web Chrome (cookie session) | **PASS** | warm×3; app/bell Explain 일치 |
| iPhone | **BLOCKED** | not run this session |
| Bell Inbox identity (server) | **PASS** 28/28 | `fpv-bell-identity.log` |

## Declared (team-lead vocabulary)

```text
ANDROID PRODUCT VALIDATION PASS
WEB PRODUCT VALIDATION PASS
IOS PLATFORM BLOCKED
DIBAY NOTIFICATION SYSTEM RUNTIME PARTIAL
```

## NOT declared

```text
DIBAY NOTIFICATION SYSTEM PRODUCT PASS — FINAL LOCK
```

Reasons: iOS not validated; OEM **Launcher icon glyph** is Cap `Badge.get` aligned but human eyeball of home-screen digit still recommended as final App Icon product close.

## Held

- Batch B
- Legacy delete
- Phase 1–3 LOCK reopen
- Temporary number patches

## Artifacts

- `.qa-logs/badge-ssot-phase4/fpv-final-product-validation.json`
- `.qa-logs/badge-ssot-phase4/fpv-final-product-validation.log`
- `.qa-logs/badge-ssot-phase4/fpv-apk-install.json`
- `.qa-logs/badge-ssot-phase4/fpv-bell-identity.log`
