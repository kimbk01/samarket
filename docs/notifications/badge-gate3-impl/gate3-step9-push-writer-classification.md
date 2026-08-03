# Gate 3 Step 9 — Push writer classification

| Piece | Role | Classification |
|-------|------|----------------|
| `notify-push-dispatcher` | Domain snapshot → absolute `badgeCount` echo | **KEEP** (transport echo) |
| `resolveMemberAppIconTotalForNativeFcm` | Prefer App Icon authority total | **KEEP** |
| `buildFcmDataFields` + transport envelope | `recipientScope` / `pipeline` / Gate 2 keys | **ROUTE** (transport identity) |
| `PushRouteListener` mark-read | Was: any notificationId → A read | **REWRITE** → Member A gate only |
| Chat push tap → room unread 0 | Forbidden before timeline ACK | **DELETE** (not via push tap) |
| Owner push → Member Bell/App Icon | Forbidden | **DELETE** |
| FCM `badge++` / local invent | Forbidden | **DELETE** |
| Android `setNumber(0)` domain child + Delivery Adapter absolute | Echo only | **KEEP** |
| Cap `Badge.set` via `NativeBadgeSync` ← Projection | Echo after Projection | **KEEP** |
| Cap resume prefs as authority | Residual risk | **DEFER** (Runtime prep) |

```text
Push cannot compute independent Bell / Bottom / App Icon digit
Push cannot zero Conversation B on tap alone
Owner push cannot mutate Member A
```
