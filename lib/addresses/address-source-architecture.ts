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
 * MASTER SSOT: `user-address-master-ssot.ts` (row selection / missing / app region-city)
 * DISPLAY SSOT: `user-address-display-ssot.ts` (SHORT / FULL / PUBLIC)
 * PICK UI row: `AddressListRowBody` → canonical display lines
 * PUBLIC: `formatUserAddressPublic` → `formatPublicAddress` (City/Municipality only)
 * DELIVERY: `formatDeliveryAddress` (PH multi-line / full detail)
 * ADDRESS BOOK: `formatAddressBookLine` (compact continuous flow, country excluded, detail boldable, natural wrap)
 *
 * ## Surface inventory (usage SSOT)
 *
 * | Surface | Input | Storage | Picker | Formatter | Snapshot |
 * |---|---|---|---|---|---|
 * | /mypage/addresses | AddressPlatformSearchClient → AddressPlatformDetailClient | user_addresses | list (mgmt) | canonical FULL / SHORT | address-defaults.master |
 * | /onboarding/address | AddressManagementClient embedded (setup only) | user_addresses | — | canonical FULL / SHORT | address-defaults.master |
 * | Philife Header | — | user_addresses | /mypage/addresses | canonical SHORT | address-defaults.master |
 * | /stores header | — | user_addresses | /mypage/addresses | canonical SHORT | address-defaults.master |
 * | Cart / Checkout | — | user_addresses | cart radio + same row text | formatAddressBookLine (select) · formatDeliveryAddress (order) | store_orders.delivery_* |
 * | Order Detail | — | — | — | order snapshot | store_orders frozen |
 * | Community Feed/Write | — | user_addresses master → public label | — | canonical PUBLIC | posts.region_label |
 * | Trade Write | — | user_addresses master → taxonomy ids + submit meta | /mypage/addresses | canonical SHORT | address-defaults.master + posts.region/city/meta.trade_meet_spot |
 * | Trade Detail | — | posts snapshot | — | post region/city label | posts.region/city |
 * | Trade Meet Spot | legacy map snapshot only | posts.meta.trade_meet_spot | — | place label | post meta |
 * | Store Application Initial Fill | user master allowed once | stores draft | — | canonical transform | stores row after save |
 * | Store Owner Address | owner store form | stores | — | store formatters | stores row |
 * | Admin Member Address | admin tools | user_addresses | — | canonical FULL | user_addresses + legacy profile section |
 *
 * ## B. REGION / EXPLORATION (public presentation)
 * Authority: `formatPublicAddress` → City/Municipality ONLY
 * Aliases: `buildExplorationRegionSubtitleLine` / `buildTradePublicLine` (same city-only contract)
 * MUST NOT include detail_address / unit_floor_room.
 * Taxonomy: `mapUserAddressToAppLocation` (ONE mapper)
 *
 * ## C. DELIVERY ADDRESS
 * `formatDeliveryAddress` — PH full deliverable lines. Checkout copies into `store_orders` snapshot.
 * `isDefaultDelivery` is checkout default selection only; it is not current-address display authority.
 *
 * ## D. STORE ADDRESS
 * Table: `stores` — Not a `user_addresses` row. Shop-linked user_addresses is a member book copy, not store authority.
 * User master may seed store application fields, then `stores` becomes authority after save.
 *
 * ## D2. ADDRESS MUTATION CONSISTENCY HARD LOCK
 * server mutation success → address list reconcile → defaults cache invalidate → generation increment
 * → `samarket:addresses-updated`.
 * Every address consumer fetch must be generation-aware. A request started before a mutation must not
 * overwrite state after a newer request has resolved.
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
