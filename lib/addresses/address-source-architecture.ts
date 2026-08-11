/**
 * DIBAY ADDRESS PLATFORM — object types + authority.
 * Full lock: `docs/dibay-address-platform-hard-lock.md`
 *
 * CURRENT ADDRESS ≠ PUBLIC REGION ≠ ORDER SNAPSHOT ≠ STORE ADDRESS
 *
 * ## A. MEMBER MASTER ADDRESS (canonical current)
 * Table: `user_addresses` · flag: `is_default_master`
 * ADDRESS_COMPLETE = active row AND is_default_master === true
 * Writers: `createUserAddress` / `updateUserAddress` / `deleteUserAddress` / `setUserAddressAsDefault`
 * GET `listUserAddresses` and `GET /api/me/address-defaults` are READ ONLY.
 *
 * ## B. REGION / EXPLORATION (public presentation)
 * Authority: `buildExplorationRegionSubtitleLine`
 * Trade street-level derived: `buildTradePublicLine` (no unit/floor/room)
 * MUST NOT include detail_address / unit_floor_room.
 *
 * ## C. DELIVERY ADDRESS
 * BASE (`formatted_address` / road) + DETAIL (`detail_address`)
 * Checkout copies into `store_orders` snapshot columns. After order create the snapshot is frozen.
 *
 * ## D. STORE ADDRESS
 * Table: `stores` (`address_line1`, `formatted_address`, `detail_address`, `place_id`, `lat`, `lng`)
 * Not a `user_addresses` row. Shop-linked user_addresses is a member book copy, not store authority.
 *
 * ## BRIDGE (write/complete authority = NO)
 * `profiles.full_address` / `profiles.region_name` / profile geo
 * `syncProfileRegionFromLifeDefault` may copy region label onto profiles after a writer. Not ADDRESS_COMPLETE.
 */

export const ADDRESS_SOURCE_ARCHITECTURE = "profiles | user_addresses | stores | store_orders.snapshot" as const;

export const ADDRESS_OBJECT_TYPES = [
  "MEMBER_MASTER",
  "REGION_PUBLIC",
  "DELIVERY",
  "STORE",
  "ORDER_SNAPSHOT",
] as const;
