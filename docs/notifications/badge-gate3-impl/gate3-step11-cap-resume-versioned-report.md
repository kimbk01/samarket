# Gate 3 Step 11 — Cap Resume Versioned Authority

**Verdict:**

```text
CAP RESUME VERSIONED AUTHORITY CODE PASS
```

| Declaration | Status |
|-------------|--------|
| CAP RESUME VERSIONED AUTHORITY CODE PASS | **YES** |
| Badge Authority CODE PASS | **NO** |
| RUNTIME / PRODUCT / HARD LOCK | **NO** |
| Production migration / deploy / device QA | **NO** |

---

## Policy

Approach A: versionless prefs do not apply. Resume does not re-paint from Cap cache. OS badge stays until versioned absolute echo.

## Flows

```text
Cold:  (optional OS retain) → Domain fetch → versioned commit → Native absolute
Warm:  Domain rebuild → versioned commit → Native absolute
Resume: Domain rebuild → versioned commit → Native absolute
         Cap applyFromCapBadgeCache → REJECT (no-op)
```

## Native

- iOS / Android `applyFromCapBadgeCache` → reject log, return false, **no apply**
- `apply(total)` / FCM echo unchanged
- No Native App Icon arithmetic

## Next

Step 12 room identity fallback → segmented legacy fallback → static gates → live dry-run → Runtime
