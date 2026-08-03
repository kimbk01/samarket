# Gate 3 Step 6 — App Icon writer classification

| Writer | 기존 입력 | 기존 공식 | 새 역할 | 분류 | Version gate |
|--------|-----------|-----------|---------|------|--------------|
| `buildNotificationBadgeProjection` memberAppIconWebTotal | A + rooms + orphan | A+B_rooms+missed | Echo A+B_rooms via canonical snapshot | **ROUTE** | via `memberAppIconAuthority.authorityVersion` |
| Domain badge-count HTTP | Facts | mixed totals | Build `resolveMemberAppIconAuthority` | **KEEP** (trigger) | `revision=projectionVersionMs` |
| `apply-badge-count-authority-response` | HTTP JSON | Projection commit | Also `commitMemberAppIconAuthorityFromHttpBody` | **KEEP** | stale reject |
| `domain-badge-surface-store` | Projection | surface paint | Display pipe only | **ADAPTER** | inherits commit |
| `NativeBadgeSync` | surface appIconTotal | Cap set | Absolute echo | **KEEP** (display) | no arithmetic |
| Capawesome `Badge.set` | JS total | prefs write | Cache echo only | **ADAPTER** | not authority |
| `DibayAppIconDeliveryAdapter.apply` | absolute int | launcher | Absolute display | **KEEP** (display) | no ±1 |
| FCM `badge_count` | memberAppIconWebTotal | push echo | Prefer snapshot total | **ROUTE** | absolute |
| `applyFromCapBadgeCache` resume | prefs int | paint without version | **DELETE as authority**; display-only until canonical reconcile | **DELETE** (authority) | must lose to newer `ai1\|rev\|…` |
| UI Bell / Bottom / Hub | surface | invent | Forbidden App Icon input | **DELETE** | — |
| Owner C / store ops | store facts | — | Excluded from Member App Icon | **ROUTE** → Step 7 | publish rejects |

```text
Canonical App Icon publisher = 1
  commitMemberAppIconAuthority / publishMemberAppIconAuthority

Triggers: HTTP / cold / warm / resume fetch → same resolveMemberAppIconAuthority
```
