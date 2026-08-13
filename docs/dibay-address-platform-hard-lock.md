# DIBAY Address Platform HARD LOCK

**STATUS: CODE CLOSED / RUNTIME OPEN — HARD LOCK NOT DECLARED (2026-08-11).**

Do not declare HARD LOCK until current-tree Xiaomi **Google search UI** works (Maps Autocomplete currently `gm-err-autocomplete` on `http://127.0.0.1` referrer) and the runtime matrix in this file is all PASS.

## Object types

| Type | Authority | Not |
|---|---|---|
| MEMBER MASTER | `user_addresses` + `is_default_master` | region_name / profile geo / life·trade·delivery flags |
| REGION PUBLIC | `buildExplorationRegionSubtitleLine` | detail / unit / floor / room |
| DELIVERY | base + `detail_address` | public feed copy |
| STORE | `stores` address + geo columns | member master fallback |
| ORDER SNAPSHOT | `store_orders.delivery_*` at create | live member pointer |

## FULL STORAGE / CONTEXTUAL DISPLAY (SSOT)

```
ONE ADDRESS BOOK → ONE user_addresses SSOT → ONE FULL ADDRESS STORAGE → MANY DISPLAY FORMATTERS
```

- **STORAGE ≠ DISPLAY.** Do not truncate DB for PUBLIC. Do not duplicate rows for Trade / Community / Delivery / Public.
- **FULL display** (My Page, Address Book, Delivery, Checkout, Orders, authorized Store/Admin): full row via full formatters.
- **PUBLIC display** (Trade, Community, Header region, Neighborhood): **same** `user_addresses` row → `formatPublicAddress` (city / policy region only — no unit/floor/street/landmark detail).
- Trade write selects a member row and applies region/city snapshot to the post — **not** a second address SSOT.
- Delivery order create may copy an **order delivery snapshot** for immutability — not a second member address book.
- Store address authority remains `stores` when that is the product owner — do not force-merge into `user_addresses`.
- Google Place identity (name, placeId, components, lat/lng) is an **input** to the FULL member row, not caller-scoped storage.
- **`place_display_name` migration:** NOT APPROVED from R1 code audit alone. **MIGRATION REQUIRED: NOT PROVEN** until R2 save/list runtime shows CASE B loss that mapping cannot fix.

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
| `AddressFineTuneMapClient` | KEEP — embedded in `AddressEditorSheet` same-page pin adjust (R1). Standalone `/mypage/addresses/fine-tune` product path = 0 (files may remain until R5) |
| `AddressFineTuneSheet` / FineTune page | LEGACY — product navigate cut in R1; file delete deferred to R5 |
| Member add/edit entry | KEEP — `/mypage/addresses` → `/edit` page stack only (`navigateToMemberAddress*`); management 모달 에디터 금지 |
| `refreshStoreOrdersCheckoutGeoAfterUserAddressUpdated` | DELETED (caller=0) |
| community `region_label` client body | REMOVED — `resolveCommunityPublicRegionLabelForUser` |
| shop Korean throw | REMOVED — `shop_store_required` / `shop_owner_required` / `shop_place_required` / `shop_address_duplicate` |

## Invariants

ADDR-001 … ADDR-015 — see `.cursor/rules/dibay-address-platform-hard-lock.mdc` and `lib/addresses/__tests__/address-platform-hard-lock-contract.test.ts`.
