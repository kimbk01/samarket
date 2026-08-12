# 01 — User Facts

**Status: LOCKED** (see `ARCHITECTURE-LOCK.md`)

Member와 Admin은 **동일 User Facts**의 다른 Projection이다.

## Trust SSOT (Slice 1)

```text
Runtime Authority = profiles.trust_score (+ reputation_logs)
Member temperature = projection of trust_score (not independent authority)
Admin detail MUST read/show/adjust the same trust_score
```

| Fact | Reader | Writer | Member Projection | Admin Projection | Cache | Runtime Authority |
|------|--------|--------|-------------------|------------------|-------|-------------------|
| Profile | profiles APIs | profile update / Admin edit | mypage summary | Admin header + edit | session/home | `profiles` |
| Trust | hydrate | applyTrustScoreDelta / Admin trust-score API | `/mypage/trust` | detail + history + adjust | session temp | **`profiles.trust_score`** |
| Point | points APIs | charge/ledger | points strip | points section | strip cache | points domain |
| Badge | badge SSOT | system | nav badges | ops badges | badge store | existing badge |
| Order | order APIs | checkout/ops | store orders | activity summary | list cache | orders |
| Store | owner APIs | owner writes | owner/rider menus | store link | owner hub | store |
| Community | community reads | posts | activity links | later | feed | community |
| Notification | settings/inbox | settings / Admin send | notif settings | send CTA | settings | notifications |
| Policy Consent | CMS/legal | accept | terms routes | CMS audit | CMS | CMS |
| Admin Audit | admin | moderation | — | logs | — | moderation |

Slice 0 conflict PROVEN → Slice 1 closes it.
