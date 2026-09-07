# DIBAY Address Platform HARD LOCK

**STATUS: CODE CLOSED / RUNTIME OPEN — HARD LOCK NOT DECLARED (2026-08-11).**

Do not declare HARD LOCK until current-tree Xiaomi **Google search UI** works (Maps Autocomplete currently `gm-err-autocomplete` on `http://127.0.0.1` referrer) and the runtime matrix in this file is all PASS.

## Object types

| Type | Authority | Not |
|---|---|---|
| MEMBER MASTER | `user_addresses` + `is_default_master` | region_name / profile geo / life·trade·delivery flags |
| REGION PUBLIC (Community / Philife / Market exploration) | `formatPublicAddress` / `resolveCommunityPublicRegionLabelForUser` — **CITY ONLY** | TITLE / street / building / detail / unit / floor / room |
| COMMUNITY LOCAL FILTER | `community-local-filter-ssot` — seed from master City; explicit independent session (user-scoped) | `RegionContext` / `profiles.region_*` as Local feed authority |
| DELIVERY | base + `detail_address` | public feed copy |
| STORE | `stores` address + geo columns | member master fallback |
| ORDER SNAPSHOT | `store_orders.delivery_*` at create | live member pointer |

## Writers (member)

| Op | Function | Route |
|---|---|---|
| CREATE | `createUserAddress` | `POST /api/me/addresses` |
| UPDATE | `updateUserAddress` | `PATCH /api/me/addresses/:id` |
| DELETE | `deleteUserAddress` | `DELETE /api/me/addresses/:id` |
| MASTER | `setUserAddressAsDefault` + PATCH `isDefaultMaster` | `POST .../set-default`, management PATCH |
| First create master | `ensureSomeoneDefaultIfFirst` when active count === 1 | inside create |
| Store-linked master repair | `repairStoreLinkedMasterAfterWrite` (POST-WRITE, not GET) | after create/update/delete |

## GET

`listUserAddresses` and `GET /api/me/address-defaults` are read-only.

## History

**MEMBER ADDRESS HISTORY: NOT_SUPPORTED BY DESIGN**

- Delivery/dispute evidence = `store_orders` snapshot (ADDR-006/007).
- Member current-address past reconstruction is not a product requirement.
- No `address_history` table. `updated_at` is not an audit ledger.
- Do not treat HISTORY=GAP as an open lock item after this policy.

## Order snapshot

Checkout `POST /api/me/store-orders` copies `delivery_formatted_address`, `delivery_detail_address`, lat/lng. Member address POST/PATCH do not resync orders. Dead `refreshStoreOrdersCheckoutGeoAfterUserAddressUpdated` removed. Store lat/lng change may refresh ETA only, using order snapshot coords.

## Store

Owner/Admin patch `stores` via `PATCH /api/me/stores/:id`. `deriveStoreAddressFieldsFromUserAddressMaster` is create/edit **prefill**, not runtime store display fallback.

**GEO CONSISTENCY:**
- **Policy A (place_id / Google identity):** `assertStoreLocationPatchConsistent` — place_id write requires formatted + lat/lng in the same PATCH; street/formatted/place identity change requires lat+lng in the same PATCH. `detail_address` may change alone.
- **Owner basic-info surface:** not Google Autocomplete. Street + lat/lng are **explicit fields on the same form** (Policy B overlay). Saving street without moving the visible pin keeps the pin by explicit coords, not a hidden geo write. API still rejects identity change with no lat/lng in the PATCH.
- Member shop-link write that includes a place snapshot updates store place/formatted/detail/lat/lng atomically.

## Last address delete

Last active member address **may be deleted**. Result: active master 0, `ADDRESS_COMPLETE` false. Next create is first-create (master 1). MandatoryAddressGate then requires a new master.

## Google

Canonical field mapper: `parsePhFromGooglePlaceResult` (+ `reverseGeocodeLatLngPh`). Map pin display string: `buildPhFriendlyAddress` (presentation, not a second member-row writer).

## Legacy

| Item | Class |
|---|---|
| `profiles.full_address` / `region_name` | BRIDGE, DROP LATER |
| `syncProfileRegionFromLifeDefault` | BRIDGE after writer |
| `promoteAsLastSavedPrimary` payload | REMOVED |
| `AddressFineTuneSheet` / `AddressFineTuneMapClient` | DELETED (importer=0) |
| `refreshStoreOrdersCheckoutGeoAfterUserAddressUpdated` | DELETED (caller=0) |
| community `region_label` client body | REMOVED — `resolveCommunityPublicRegionLabelForUser` |
| shop Korean throw | REMOVED — `shop_store_required` / `shop_owner_required` / `shop_place_required` / `shop_address_duplicate` |

## Invariants

ADDR-001 … ADDR-015 — see `.cursor/rules/dibay-address-platform-hard-lock.mdc` and `lib/addresses/__tests__/address-platform-hard-lock-contract.test.ts`.
