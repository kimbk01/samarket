import type { SupabaseClient } from "@supabase/supabase-js";
import { rowToUserAddressDTO } from "@/lib/addresses/user-address-mapper";
import { toCheckoutDeliveryPayload } from "@/lib/addresses/user-address-format";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { resolveCheckoutDeliveryGeoFromUserAddress } from "@/lib/addresses/resolve-checkout-delivery-geo";
import { normalizeStoreAddressPh } from "@/lib/stores/normalize-store-address-ph";
import { computeStoreOrderCheckoutEtaSnapshot } from "@/lib/stores/compute-store-order-checkout-eta-snapshot";

const USER_ADDRESS_SEL =
  "id,user_id,label_type,linked_store_id,nickname,recipient_name,phone_number,country_code,country_name,province,city_municipality,barangay,district,street_address,building_name,unit_floor_room,landmark,latitude,longitude,place_id,formatted_address,road_address,detail_address,delivery_note,full_address,neighborhood_name,app_region_id,app_city_id,use_for_life,use_for_trade,use_for_delivery,is_default_master,is_default_life,is_default_trade,is_default_delivery,is_active,sort_order,last_used_at,created_at,updated_at";

/** 진행 중 배달 주문만 — 완료·취소 건은 스냅샷 유지 */
const ACTIVE_DELIVERY_ORDER_STATUSES = [
  "pending",
  "accepted",
  "preparing",
  "ready_for_pickup",
  "delivering",
  "arrived",
] as const;

function deliveryAddressPatchFromUserAddressDto(addr: UserAddressDTO) {
  const resolved = resolveCheckoutDeliveryGeoFromUserAddress(addr);
  if (resolved) {
    return {
      delivery_region: resolved.regionId,
      delivery_city: resolved.cityId,
      delivery_address_summary: resolved.summaryLine,
      delivery_address_detail: resolved.detailLine || null,
    };
  }
  const p = toCheckoutDeliveryPayload(addr);
  const norm = normalizeStoreAddressPh({
    region: p.app_region_id,
    city: p.app_city_id,
    address1: p.summary_line,
    address2: p.address_detail,
  });
  return {
    delivery_region: norm.region,
    delivery_city: norm.city,
    delivery_address_summary: norm.address1,
    delivery_address_detail: norm.address2,
  };
}

type NormalizedDeliverySnapshot = ReturnType<typeof deliveryAddressPatchFromUserAddressDto>;

function deliverySnapshotFromStoreOrderRow(row: {
  delivery_region?: unknown;
  delivery_city?: unknown;
  delivery_address_summary?: unknown;
  delivery_address_detail?: unknown;
}): NormalizedDeliverySnapshot {
  const norm = normalizeStoreAddressPh({
    region: row.delivery_region != null ? String(row.delivery_region).trim() : null,
    city: row.delivery_city != null ? String(row.delivery_city).trim() : null,
    address1: row.delivery_address_summary != null ? String(row.delivery_address_summary).trim() : null,
    address2: row.delivery_address_detail != null ? String(row.delivery_address_detail).trim() : null,
  });
  return {
    delivery_region: norm.region,
    delivery_city: norm.city,
    delivery_address_summary: norm.address1,
    delivery_address_detail: norm.address2,
  };
}

function deliverySnapshotsEqual(a: NormalizedDeliverySnapshot, b: NormalizedDeliverySnapshot): boolean {
  return (
    a.delivery_region === b.delivery_region &&
    a.delivery_city === b.delivery_city &&
    a.delivery_address_summary === b.delivery_address_summary &&
    a.delivery_address_detail === b.delivery_address_detail
  );
}

export async function loadUserAddressDtoForBuyer(
  sb: SupabaseClient<any>,
  buyerUserId: string,
  addressId: string
): Promise<UserAddressDTO | null> {
  const { data, error } = await sb
    .from("user_addresses")
    .select(USER_ADDRESS_SEL)
    .eq("id", addressId)
    .maybeSingle();
  if (error || !data) return null;
  const dto = rowToUserAddressDTO(data as Record<string, unknown>);
  if (dto.userId !== buyerUserId) return null;
  return dto;
}

async function buildLocalDeliveryGeoPatchFromUserAddressDto(
  sb: SupabaseClient<any>,
  storeId: string,
  buyerUserId: string,
  addr: UserAddressDTO
): Promise<Record<string, unknown> | null> {
  if (String(addr.userId).trim() !== buyerUserId.trim()) return null;
  const deliveryUserAddressId = addr.id.trim();
  if (!deliveryUserAddressId) return null;

  const { data: store, error: sErr } = await sb
    .from("stores")
    .select("lat,lng,business_hours_json")
    .eq("id", storeId)
    .maybeSingle();
  if (sErr || !store) return null;

  const lat = store.lat != null && Number.isFinite(Number(store.lat)) ? Number(store.lat) : null;
  const lng = store.lng != null && Number.isFinite(Number(store.lng)) ? Number(store.lng) : null;

  const eta = await computeStoreOrderCheckoutEtaSnapshot({
    sb,
    buyerUserId,
    fulfillment: "local_delivery",
    deliveryUserAddressId,
    storeLat: lat,
    storeLng: lng,
    business_hours_json: store.business_hours_json,
    skipGoogleRoutes: true,
  });

  return {
    ...deliveryAddressPatchFromUserAddressDto(addr),
    ...eta,
  };
}

async function buildLocalDeliveryGeoPatch(
  sb: SupabaseClient<any>,
  storeId: string,
  buyerUserId: string,
  deliveryUserAddressId: string
): Promise<Record<string, unknown> | null> {
  const addr = await loadUserAddressDtoForBuyer(sb, buyerUserId, deliveryUserAddressId);
  if (!addr) return null;
  return buildLocalDeliveryGeoPatchFromUserAddressDto(sb, storeId, buyerUserId, addr);
}

async function applyLocalDeliveryGeoPatchToOrderIds(
  sb: SupabaseClient<any>,
  storeId: string,
  buyerUserId: string,
  addr: UserAddressDTO,
  orderIds: string[],
  opts?: { setDeliveryUserAddressId?: boolean }
): Promise<{ ok: boolean; error?: string }> {
  const base = await buildLocalDeliveryGeoPatchFromUserAddressDto(sb, storeId, buyerUserId, addr);
  if (!base || orderIds.length === 0) return { ok: false, error: "no_patch" };
  const patch =
    opts?.setDeliveryUserAddressId === true
      ? { ...base, delivery_user_address_id: addr.id }
      : base;
  const { error: uErr } = await sb.from("store_orders").update(patch).in("id", orderIds);
  if (uErr) return { ok: false, error: uErr.message };
  return { ok: true };
}

export type StoreOrdersCheckoutGeoAfterAddressSyncResult = {
  /** `delivery_user_address_id`가 이번에 수정한 주소 id와 일치하는 주문 */
  linked_orders_updated: number;
  /**
   * `delivery_user_address_id`가 비었던 주문 중, (1) 수정 전 주소 스냅샷과 주문 배달지가 일치하거나
   * (2) 수정 전 스냅샷을 알 수 없을 때 해당 구매자의 null-FK 진행 주문이 1건뿐인 경우 —
   * 수정 후 주소·ETA·거리를 반영하고 FK를 채운다.
   */
  orphan_orders_updated: number;
  errors: string[];
};

/**
 * 구매자가 `user_addresses` 행을 수정한 뒤 — 해당 주소로 체크아웃한 진행 중 배달 주문의
 * 배달지 문구·체크아웃 ETA·경로 거리를 다시 계산해 `store_orders`에 반영한다 (Realtime → 목록/상세).
 *
 * @param addrBefore 수정 전 DTO(권장). 있으면 `delivery_user_address_id`가 null인 주문도
 *   “수정 전과 동일한 정규화 배달지 스냅샷”이면 같은 saved row로 간주해 갱신한다.
 */
export async function refreshStoreOrdersCheckoutGeoAfterUserAddressUpdated(
  sb: SupabaseClient<any>,
  buyerUserId: string,
  addr: UserAddressDTO,
  addrBefore?: UserAddressDTO | null
): Promise<StoreOrdersCheckoutGeoAfterAddressSyncResult> {
  const result: StoreOrdersCheckoutGeoAfterAddressSyncResult = {
    linked_orders_updated: 0,
    orphan_orders_updated: 0,
    errors: [],
  };
  const aid = addr.id.trim();
  const bid = buyerUserId.trim();
  if (!aid || !bid) return result;

  const { data: orders, error } = await sb
    .from("store_orders")
    .select("id, store_id")
    .eq("buyer_user_id", bid)
    .eq("delivery_user_address_id", aid)
    .eq("fulfillment_type", "local_delivery")
    .in("order_status", [...ACTIVE_DELIVERY_ORDER_STATUSES]);

  if (error) {
    const msg = error.message;
    result.errors.push(msg);
    console.error("[refreshStoreOrdersCheckoutGeoAfterUserAddressUpdated] select linked", msg);
    return result;
  }

  const byStore = new Map<string, string[]>();
  for (const r of orders as { id?: unknown; store_id?: unknown }[]) {
    const sid = String(r.store_id ?? "").trim();
    const oid = String(r.id ?? "").trim();
    if (!sid || !oid) continue;
    const arr = byStore.get(sid) ?? [];
    arr.push(oid);
    byStore.set(sid, arr);
  }

  for (const [storeId, orderIds] of byStore) {
    try {
      const applied = await applyLocalDeliveryGeoPatchToOrderIds(sb, storeId, bid, addr, orderIds);
      if (applied.ok) result.linked_orders_updated += orderIds.length;
      else if (applied.error) {
        result.errors.push(applied.error);
        console.error("[refreshStoreOrdersCheckoutGeoAfterUserAddressUpdated] update linked", applied.error);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      result.errors.push(msg);
      console.error("[refreshStoreOrdersCheckoutGeoAfterUserAddressUpdated]", e);
    }
  }

  const { data: orphans, error: oErr } = await sb
    .from("store_orders")
    .select(
      "id, store_id, delivery_region, delivery_city, delivery_address_summary, delivery_address_detail"
    )
    .eq("buyer_user_id", bid)
    .eq("fulfillment_type", "local_delivery")
    .in("order_status", [...ACTIVE_DELIVERY_ORDER_STATUSES])
    .is("delivery_user_address_id", null);

  if (oErr) {
    result.errors.push(oErr.message);
    console.error("[refreshStoreOrdersCheckoutGeoAfterUserAddressUpdated] select orphans", oErr.message);
    return result;
  }

  const list = (orphans ?? []) as {
    id?: unknown;
    store_id?: unknown;
    delivery_region?: unknown;
    delivery_city?: unknown;
    delivery_address_summary?: unknown;
    delivery_address_detail?: unknown;
  }[];

  const beforeSnap =
    addrBefore && String(addrBefore.id).trim() === aid ? deliveryAddressPatchFromUserAddressDto(addrBefore) : null;

  const eligible: { store_id: string; order_id: string }[] = [];
  for (const r of list) {
    const sid = String(r.store_id ?? "").trim();
    const oid = String(r.id ?? "").trim();
    if (!sid || !oid) continue;
    const orderSnap = deliverySnapshotFromStoreOrderRow(r);
    if (beforeSnap && deliverySnapshotsEqual(orderSnap, beforeSnap)) {
      eligible.push({ store_id: sid, order_id: oid });
    } else if (!beforeSnap && list.length === 1) {
      eligible.push({ store_id: sid, order_id: oid });
    }
  }

  const orphanByStore = new Map<string, string[]>();
  for (const e of eligible) {
    const arr = orphanByStore.get(e.store_id) ?? [];
    arr.push(e.order_id);
    orphanByStore.set(e.store_id, arr);
  }

  for (const [storeId, orderIds] of orphanByStore) {
    try {
      const applied = await applyLocalDeliveryGeoPatchToOrderIds(sb, storeId, bid, addr, orderIds, {
        setDeliveryUserAddressId: true,
      });
      if (applied.ok) result.orphan_orders_updated += orderIds.length;
      else if (applied.error) {
        result.errors.push(applied.error);
        console.error("[refreshStoreOrdersCheckoutGeoAfterUserAddressUpdated] orphan", applied.error);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      result.errors.push(msg);
      console.error("[refreshStoreOrdersCheckoutGeoAfterUserAddressUpdated] orphan", e);
    }
  }

  return result;
}

export type StoreOrdersCheckoutGeoAfterStoreLocationSyncResult = {
  /** `store_orders` 행 기준으로 성공적으로 `update`가 적용된 주문 수(그룹당 1회 카운트 아님, 주문 id 수) */
  orders_updated: number;
  errors: string[];
};

/**
 * 매장 좌표(lat/lng) 변경 후 — 해당 매장의 진행 중 배달 주문(저장된 배달 주소 id가 있는 건만) ETA·거리·배달지 갱신.
 */
export async function refreshStoreOrdersCheckoutGeoAfterStoreLocationChanged(
  sb: SupabaseClient<any>,
  storeId: string
): Promise<StoreOrdersCheckoutGeoAfterStoreLocationSyncResult> {
  const result: StoreOrdersCheckoutGeoAfterStoreLocationSyncResult = { orders_updated: 0, errors: [] };
  const sid = storeId.trim();
  if (!sid) return result;

  const { data: orders, error } = await sb
    .from("store_orders")
    .select("id, buyer_user_id, delivery_user_address_id")
    .eq("store_id", sid)
    .eq("fulfillment_type", "local_delivery")
    .in("order_status", [...ACTIVE_DELIVERY_ORDER_STATUSES])
    .not("delivery_user_address_id", "is", null);

  if (error) {
    result.errors.push(error.message);
    console.error("[refreshStoreOrdersCheckoutGeoAfterStoreLocationChanged] select", error.message);
    return result;
  }
  if (!orders?.length) return result;

  type Row = { id?: unknown; buyer_user_id?: unknown; delivery_user_address_id?: unknown };
  const groups = new Map<
    string,
    { buyerId: string; addrId: string; orderIds: string[] }
  >();

  for (const r of orders as Row[]) {
    const buyerId = String(r.buyer_user_id ?? "").trim();
    const addrId = String(r.delivery_user_address_id ?? "").trim();
    const oid = String(r.id ?? "").trim();
    if (!buyerId || !addrId || !oid) continue;
    const key = `${buyerId}\0${addrId}`;
    const g = groups.get(key) ?? { buyerId, addrId, orderIds: [] };
    g.orderIds.push(oid);
    groups.set(key, g);
  }

  for (const g of groups.values()) {
    try {
      const patch = await buildLocalDeliveryGeoPatch(sb, sid, g.buyerId, g.addrId);
      if (!patch || g.orderIds.length === 0) continue;
      const { error: uErr } = await sb.from("store_orders").update(patch).in("id", g.orderIds);
      if (uErr) {
        result.errors.push(uErr.message);
        console.error("[refreshStoreOrdersCheckoutGeoAfterStoreLocationChanged] update", uErr.message);
      } else {
        result.orders_updated += g.orderIds.length;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      result.errors.push(msg);
      console.error("[refreshStoreOrdersCheckoutGeoAfterStoreLocationChanged]", e);
    }
  }

  return result;
}
