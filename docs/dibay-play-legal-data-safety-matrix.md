# DIBAY Google Play — Data Safety & App Content Matrix (evidence-only)

**Date:** 2026-08-08  
**Scope:** Production DIBAY / samarket — no invented processors or purposes.  
**Not a legal opinion.** Items needing counsel: `LEGAL_REVIEW_REQUIRED`.

## A. Data Safety matrix (code evidence)

| DATA TYPE | COLLECTED? | SHARED? | PURPOSE | REQUIRED/OPTIONAL | EPHEMERAL? | ENCRYPTED IN TRANSIT? | USER DELETION AVAILABLE? | EVIDENCE |
|---|---|---|---|---|---|---|---|---|
| Account / OAuth IDs | Yes | With IdP during login | Auth | Required for account | No | HTTPS (Vercel/Supabase) | Request via leave + Admin withdraw anonymize | `lib/auth/*`, Supabase Auth |
| Email / login email | Yes | No (internal) | Auth / contact | Optional depending on provider | No | HTTPS | Anonymize on withdraw | `profiles` |
| Phone | Yes | SMS via Semaphore | Verification / orders | Optional until gated features | No | HTTPS + SMS provider | Cleared on withdraw | `phone-otp-service`, `semaphore-sms` |
| Name / nickname / avatar | Yes | Other users (public profile) | Identity | Required for membership UX | No | HTTPS | Anonymize on withdraw | `profiles`, Storage |
| Approximate/precise location | Yes (on-use) | Google Maps/Places queries; stores via orders | Maps / delivery / nearby | Optional (permission) | Position probe ephemeral; saved addresses persist | HTTPS | Address/profile clear on withdraw; orders may retain | `geolocation.ts`, Manifest location perms |
| Messages / chat media | Yes | Peers; Agora for AV media | Chat / calls | Required for those features | No | HTTPS / Agora | Leave request; operational retention | CM / trade / store_order chat |
| Device / push tokens | Yes | FCM / APNs | Notifications / calls | Optional until push enabled | No | HTTPS | Device rows not hard-deleted in leave-request alone | `user_devices`, FCM/APNs |
| Purchase / order | Yes | Store operators | Fulfillment | Required for orders | No | HTTPS | May retain for settlement/legal | `store_orders` |
| Financial ledger (D-Point / Business Credit) | Yes (in-app) | Admin ops | Points / store credit | Optional product use | No | HTTPS | Ledger retention TBD | point ledgers |
| Crash / analytics SDK | No third-party SDK found | — | — | — | — | — | — | `package.json` (no Sentry/GA/AdMob) |
| Ads (first-party feed) | Yes (ad requests) | Internal | Promotion | Optional | No | HTTPS | Per product | feed-ad APIs |

## B. Play App Content mapping

| PLAY ITEM | DIBAY ANSWER (evidence-based) | WHY | CODE/RUNTIME EVIDENCE | CONSOLE ACTION |
|---|---|---|---|---|
| Privacy Policy | URL available | Public `/privacy` + CMS | `https://samarket.vercel.app/privacy` | Enter Privacy Policy URL |
| Account deletion | In-app + web resource | Play requires both | Leave path + `/account/delete` | Enter Account Deletion URL = `https://samarket.vercel.app/account/delete` |
| App access | All / restricted features behind login | Guest browse + auth gates | `guest-browse-access-policy` | Declare access as implemented |
| Ads | First-party feed ads/promotions exist; **no** third-party ad SDK evidenced | Google “Contains ads” depends on Play definition of ads — **LEGAL_REVIEW** if Feed Ad counts as ads | `feed-ad-requests`, points-ui | Confirm against Play Ads declaration wording before answering Yes/No |
| Data safety | See matrix A | Must match privacy | This doc | Complete Data safety form from matrix — do not copy unverified rows |
| Target audience | Not coded age gate | **OWNER / LEGAL_REVIEW** | No age gate in code | Owner sets audience; do not invent |
| Financial features | In-app points/credit; no card PSP SDK evidenced | Play Financial Features ≠ presence of points alone — **LEGAL_REVIEW** | point ledgers; GCash/Maya labels | Compare to Play Financial Features checklist |
| Health | Not a health app (no Health Connect evidenced) | No health SDK found | — | Typically Not applicable — confirm |
| Government apps | Not a government app | Product is marketplace/community | — | No |

## C. Owner input classification

| Item | Class |
|---|---|
| Privacy Policy public URL | OPTIONAL for product code (already live) |
| Account deletion public URL | REQUIRED_BEFORE_PLAY_SUBMISSION (implemented `/account/delete`) |
| 법인명 / 대표 / 사업자번호 / 주소 / 전화 / CPO | REQUIRED_BEFORE_PRODUCTION for full KR disclosure; Play Privacy URL can ship with email contact only — **LEGAL_REVIEW** for KR completeness |
| Fixed retention days | LEGAL_REVIEW_REQUIRED / OPTIONAL for Play if qualitative retention disclosed |
| Minors / target audience | OWNER + LEGAL_REVIEW_REQUIRED |
| Location Always string vs on-use collection | OPTIONAL product copy alignment; LEGAL_REVIEW if Always claimed |
| Ads Yes/No in Play Console | LEGAL_REVIEW_REQUIRED (first-party ads) |
| Financial Features Yes/No | LEGAL_REVIEW_REQUIRED |

## D. Authority (product)

| Concern | SSOT |
|---|---|
| Policy TEXT | `app_legal_documents` published |
| Consent VERSION | Published ko CMS `version` via `resolveRequiredConsentVersions` (STORE_* fallback) |
| Consent EVIDENCE | `profiles.terms_*` / `privacy_*` via `PATCH /api/me/legal-consent` |
| Account deletion request | `account_deletion_requests` + leave UI |
| FALLBACK privacy copy | `lib/legal/dibay-privacy-policy-content.ts` (not Production writer when CMS present) |
