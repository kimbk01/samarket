# DIBAY Product SSOT Index

Current product contracts live in **one** place per domain. Do not treat forensic reports or past SHA as authority.

| Domain | Canonical |
|--------|-----------|
| Execution (Owner Core) | `.cursor/rules/dibay-master-execution-contract.mdc` |
| Deploy | `.cursor/rules/dibay-production-deploy-authority-hard-lock.mdc` · `docs/dibay-build-deploy-hard-lock.md` |
| Inspection | `.cursor/rules/samarket-dev-inspection-regulation.mdc` |
| i18n | `.cursor/rules/samarket-i18n-core.mdc` |
| Device | `.cursor/rules/dibay-device-ssot.mdc` · `docs/dibay-device-fd*.md` |
| Delivery | `.cursor/rules/dibay-delivery-ssot.mdc` · `docs/dibay-delivery-address-service-area-final-ssot-hard-lock.md` |
| Messenger | `.cursor/rules/dibay-messenger-ssot.mdc` · `docs/community-messenger-mobile-room-viewport.md` |
| Call | `.cursor/rules/dibay-call-ssot.mdc` · `docs/dibay-call-native-runtime-ssot.md` · `docs/dibay-chat-call-current-normal-hard-lock.md` |
| Marketplace | `.cursor/rules/dibay-marketplace-ssot-index.mdc` · `docs/trade-lightweight-design.md` |
| Supabase | `.cursor/rules/dibay-supabase-ssot.mdc` |
| Auth / Member | `.cursor/rules/dibay-auth-hard-lock.mdc` · `docs/auth-hard-lock.md` |
| Notification | domain rules under `.cursor/rules/dibay-notification-*.mdc` + notify docs |
| Finance / Gift / Ads | referenced verify docs under `docs/dibay-*` (keep only contracts used by verify scripts) |

Historical evidence: not listed here. Do not promote `.tmp/` or `docs/perf/*` JSON/logs into execution context.
