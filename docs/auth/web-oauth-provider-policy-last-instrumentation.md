# Web OAuth provider policy — last instrumentation (2026-08-04)

**Purpose:** Prove the first failure stage of iOS Google `provider_account_conflict`. Not a product fix.

**Log marker:** `[auth/web-oauth-policy]` (JSON, no PII)

**Correlation:** `/login?auth_callback_attempt=&auth_conflict_reason=`

**HARD rule:** This is the **last** Auth audit instrumentation for this failure. Next change must be a root fix from A/B/C — no additional probe logs.

**Do not:** auto-merge, ignore conflict, change launcher/session/profile/Kakao/Apple.
