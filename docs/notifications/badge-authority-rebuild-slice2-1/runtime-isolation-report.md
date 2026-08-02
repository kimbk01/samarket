# Slice 2-1 — Runtime Isolation Report

## Gates

| Gate | Result |
|------|--------|
| Vitest `slice2-1-runtime-isolation.test.ts` | PASS |
| `npm run verify:badge-authority-rebuild-isolation` | PASS |

## Rules

Product paths under `app/`, `components/`, `hooks/`, `services/`, `android/`, `ios/`, and selected `lib/*` runtime trees must not import:

- `badge-authority-rebuild/badge-authority-types`
- `badge-authority-rebuild/badge-recipient-identity`
- `badge-authority-rebuild/badge-event-classifier`
- `badge-authority-rebuild/badge-surface-eligibility`
- `badge-authority-rebuild/badge-count-units`
- `badge-authority-rebuild/badge-authority-assertions`

Allowlist: `badge-authority-rebuild/**`, `scripts/**`, `**/__tests__/**`, `*.test.*`

## Product Phase B files checked (no foundation import)

- `chat-notification-attention-projection.ts`
- `build-notification-badge-projection.ts`
- `domain-app-icon-badge.ts`
- `projection-authority.ts`
- `notify-push-dispatcher.ts`
- `sync-native-badge-count.ts`
- `notify-store-commerce.ts`

## Digit behavior

**Unchanged.** Foundation is not wired to Bell / App Icon / Hub / FAB / FCM / Native.
