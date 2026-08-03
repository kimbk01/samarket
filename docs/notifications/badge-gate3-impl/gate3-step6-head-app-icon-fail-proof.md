# Gate 3 Step 6 — HEAD App Icon failure proof

**Proven in code (not device Runtime).** Baseline: after Step 4–5 CODE PASS.

---

## F1 — Total without A/B components

| Evidence | `memberAppIconWebTotal` / `appIconTotal` as scalar |
|----------|-----------------------------------------------------|
| Gap | No `resolveMemberAppIconAuthority` snapshot with `memberNotificationUnread` + domain room parts |
| Breach | Cannot prove `appIconTotal = A + B` from payload alone |

## F2 — attentionKeys / legacy total influence

| Evidence | `buildNotificationBadgeProjection` falls back to `notificationAttentionTotal`; Slice 2-3 adds `memberUnresolvedMissedCallCount` onto A for icon axis |
| Breach | attention / orphan path can feed App Icon independently of canonical A event set |

## F3 — resume stale Cap cache

| Evidence | `MainActivity.onResume` / `AppDelegate` → `DibayAppIconDeliveryAdapter.applyFromCapBadgeCache` |
| Gap | Prefs int applied with **no authorityVersion / memberKey gate** |
| Breach | Older Cap total can paint over newer Web Authority |

## F4 — writer formula split

| Writers | Domain builder · surface store · NativeBadgeSync · Cap Badge.set · Delivery Adapter · FCM badge_count · Cap resume |
| Breach | Seven paths; resume/FCM may echo different totals than canonical A+B |

## F5 — orphan double-count risk

| Evidence | `memberAppIconWebTotal = aMember + bMemberTotal` and `bMemberTotal = rooms + missed` while Step 4 puts orphan in **A** |
| Breach | Orphan can contribute via A **and** B_missed |

## F6 — member/store mix risk

| Evidence | Domain `store_order` bag historically mixed customer+owner; owner FAB separate |
| Breach | If owner rooms leak into member App Icon axis → C contamination |

---

Runtime / Product / Hard Lock: **not claimed**.
