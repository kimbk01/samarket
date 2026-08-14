/**
 * DIBAY ADDRESS PLATFORM — object types + authority.
 * Full lock: `docs/dibay-address-platform-hard-lock.md`
 *
 * CURRENT ADDRESS ≠ PUBLIC REGION ≠ ORDER SNAPSHOT ≠ STORE ADDRESS ≠ TRADE MEET SPOT
 *
 * ## Member pipeline (ONE each)
 * INPUT: `/mypage/addresses/search` → `/mypage/addresses/edit` (AutocompleteService)
 *   (`components/map/AddressSearch` same engine for `/address/select`)
 * STORAGE: `user_addresses` only (`createUserAddress` / `updateUserAddress` / …)
 * PICK DATA: `GET /api/me/addresses` + `fetchMeAddressesListSingleFlight` / address-defaults
 * PICK UI row: `AddressListRowBody` → `AddressUserRowLineText` → `formatAddressBookLine*`
 * PUBLIC: `formatPublicAddress` (City/Municipality only)
 * DELIVERY: `formatDeliveryAddress` (PH multi-line / full detail)
 * ADDRESS BOOK: `formatAddressBookLine` (compact continuous flow, country excluded, detail boldable, natural wrap)
 *
 * ## Surface inventory (usage SSOT)
 *
 * | Surface | Input | Storage | Picker | Formatter | Snapshot |
 * |---|---|---|---|---|---|
 * | /mypage/addresses | AddressPlatformSearchClient → AddressPlatformDetailClient | user_addresses | list (mgmt) | canonical FULL / SHORT | address-defaults.master |
 * | /onboarding/address | AddressManagementClient embedded (setup only) | user_addresses | — | formatAddressBookLine | — |
 * | Philife Header | — | user_addresses | /mypage/addresses | canonical SHORT | address-defaults.master |
 * | /stores header | — | user_addresses | /mypage/addresses | canonical SHORT | address-defaults.master |
 * | Cart / Checkout | — | user_addresses | cart radio + same row text | formatAddressBookLine (select) · formatDeliveryAddress (order) | store_orders.delivery_* |
 * | Order Detail | — | — | — | order snapshot | store_orders frozen |
 * | Community Feed/Write | — | user_addresses → region label | — | formatPublicAddress | posts.region_label |
 * | Trade Write | — | user_addresses master → taxonomy ids | /mypage/addresses | canonical SHORT | address-defaults.master + posts.region/city |
 * | Trade Detail | — | posts snapshot | — | post region/city label | posts.region/city |
 * | Trade Meet Spot | legacy map snapshot only | posts.meta.trade_meet_spot | — | place label | post meta |
 * | Store Owner Address | owner store form | stores | — | store formatters | stores row |
 * | Admin Member Address | admin tools | user_addresses | — | formatAddressBookLine | — |
 *
 * ## B. REGION / EXPLORATION (public presentation)
 * Authority: `formatPublicAddress` → City/Municipality ONLY
 * Aliases: `buildExplorationRegionSubtitleLine` / `buildTradePublicLine` (same city-only contract)
 * MUST NOT include detail_address / unit_floor_room.
 * Taxonomy: `mapUserAddressToAppLocation` (ONE mapper)
 *
 * ## C. DELIVERY ADDRESS
 * `formatDeliveryAddress` — PH full deliverable lines. Checkout copies into `store_orders` snapshot.
 *
 * ## D. STORE ADDRESS
 * Table: `stores` — Not a `user_addresses` row. Shop-linked user_addresses is a member book copy, not store authority.
 *
 * ## E. ADDRESS BOOK COMPACT FLOW
 * `formatAddressBookLine` / `formatAddressBookLineSegments` — continuous compact string, no country,
 * detail segment bold, natural responsive wrap (no nowrap / truncate / line-clamp on owner rows).
 * HARD LOCK phrase: COMPACT RESPONSIVE ADDRESS FLOW (not “ONE-LINE ADDRESS”).
 *
 * ## BRIDGE (write/complete authority = NO)
 * `profiles.full_address` / `profiles.region_name` / profile geo
 */

export const ADDRESS_SOURCE_ARCHITECTURE = "profiles | user_addresses | stores | store_orders.snapshot" as const;

export const ADDRESS_OBJECT_TYPES = [
  "MEMBER_MASTER",
  "REGION_PUBLIC",
  "DELIVERY",
  "STORE",
  "ORDER_SNAPSHOT",
  "ADDRESS_BOOK_COMPACT_FLOW",
  "TRADE_MEET_SPOT",
] as const;
