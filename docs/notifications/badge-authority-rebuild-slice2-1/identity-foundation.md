# Slice 2-1 — Identity Foundation

## Types

```ts
MemberBadgeIdentity { scope: "member"; key: `user:${string}`; userId }
StoreBadgeIdentity  { scope: "store";  key: `store:${string}`; storeId }
```

## Rules

- Raw UUID ≠ identity (`RAW_UUID_IS_NOT_A_BADGE_IDENTITY`)
- `user:{id}` ≠ `store:{id}` even when raw ids match
- Member authorities require member identity
- Store authorities require store identity
- Multi-store keys independent (`store:a` ⊥ `store:b`)

## API

`memberBadgeIdentity` · `storeBadgeIdentity` · `parseBadgeRecipientIdentityKey` · `assertAuthorityIdentityCompatible`
