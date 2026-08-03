# Gate 3 Step 11 — Cap / resume writer map

**Policy:** Approach A — versionless Cap prefs never final-publish App Icon. Resume ignores Cap cache.

| 경로 | 실행 시점 | 입력 | version 존재 | 최종 publish | 조치 |
|------|-----------|------|--------------|--------------|------|
| `AppDelegate.applicationDidBecomeActive` → `applyFromCapBadgeCache` | iOS resume/active | `capacitor.badge` int | **없음** | **NO** (rejected) | **DELETE authority** — no-op reject |
| `MainActivity.onResume` → `applyFromCapBadgeCache` | Android resume | SharedPreferences int | **없음** | **NO** (rejected) | **DELETE authority** — no-op reject |
| `DibayAppIconDeliveryAdapter.apply(total)` | JS/FCM absolute echo | Domain total | n/a (absolute) | YES (echo only) | **KEEP** echo |
| `applyFromPushUserInfo` / `onDomainNotificationPosted` | APNS/FCM | wire badgeCount | echo of Domain | YES (echo) | **KEEP** transport echo |
| `NativeBadgeSync` → `syncNativeBadgeCount` | surface change | `surface.appIconTotal` | via Domain commit | YES after Projection | **KEEP** |
| `commitMemberAppIconAuthority` | HTTP/badge-count | `memberAppIconAuthority` | `ai1\|rev\|…` required | YES | **KEEP** gate |
| Capawesome `Badge.set` prefs write | after syncNative | absolute n | not stored as authorityVersion | echo cache only | **KEEP** cache write; **not** resume authority |
| Debug `DibayBadgeSilentProbeReceiver` | debug only | calls applyFromCapBadgeCache | — | NO (no-op) | harmless |

```text
cold/warm/resume FINAL = canonical_builder_only
Cap prefs FINAL publish = FORBIDDEN
```
