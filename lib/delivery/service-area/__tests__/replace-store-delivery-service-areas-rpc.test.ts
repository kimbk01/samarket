/**
 * LOC-006 — replaceStoreDeliveryServiceAreas is ONE atomic RPC call (no DELETE/INSERT/UPDATE from TS).
 */
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  StoreDeliveryServiceAreasVersionConflictError,
  findUnknownDeliveryServiceAreaLguIds,
  replaceStoreDeliveryServiceAreas,
} from "@/lib/delivery/service-area/store-delivery-service-areas";

function sbWithRpc(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async () => result);
  const from = vi.fn(() => {
    throw new Error("direct table access is not allowed");
  });
  return { sb: { rpc, from } as unknown as SupabaseClient, rpc, from };
}

describe("LOC-006 replaceStoreDeliveryServiceAreas → replace_store_delivery_service_areas RPC", () => {
  it("dedupes ids, sends display names / home / version check, never touches tables directly", async () => {
    const { sb, rpc, from } = sbWithRpc({
      data: { ok: true, authority: "v2_lgu", version: "2026-10-21T01:00:00.000001+00:00", count: 2 },
      error: null,
    });
    const r = await replaceStoreDeliveryServiceAreas(sb, {
      storeId: " s1 ",
      source: "owner",
      activateV2: true,
      storeHomeLguId: "lgu-b",
      areas: [{ geoIdentity: "lgu-a", displayName: "A City" }, { geoIdentity: "lgu-b" }, { geoIdentity: "lgu-a" }, { geoIdentity: " " }],
      expectedVersion: "2026-10-21T00:00:00+00:00",
    });
    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = rpc.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(fn).toBe("replace_store_delivery_service_areas");
    expect(args).toMatchObject({
      p_store_id: "s1",
      p_ids: ["lgu-a", "lgu-b"],
      p_home_id: "lgu-b",
      p_activate: true,
      p_source: "owner",
      p_expected_version: "2026-10-21T00:00:00+00:00",
      p_check_version: true,
    });
    expect((args.p_display_names as string[])[0]).toBe("A City");
    expect(r).toEqual({
      authority: "v2_lgu",
      geoIdentities: ["lgu-a", "lgu-b"],
      version: "2026-10-21T01:00:00.000001+00:00",
    });
  });

  it("expectedVersion omitted → p_check_version false", async () => {
    const { sb, rpc } = sbWithRpc({ data: { ok: true, authority: "legacy_radius", version: null }, error: null });
    await replaceStoreDeliveryServiceAreas(sb, { storeId: "s1", source: "admin", areas: [] });
    const args = (rpc.mock.calls[0] as unknown as [string, Record<string, unknown>])[1];
    expect(args.p_check_version).toBe(false);
    expect(args.p_expected_version).toBeNull();
  });

  it("version conflict → StoreDeliveryServiceAreasVersionConflictError", async () => {
    const { sb } = sbWithRpc({
      data: { ok: false, error: "service_areas_version_conflict", current_version: "2026-10-21T02:00:00+00:00" },
      error: null,
    });
    await expect(
      replaceStoreDeliveryServiceAreas(sb, { storeId: "s1", source: "owner", areas: [], expectedVersion: null })
    ).rejects.toBeInstanceOf(StoreDeliveryServiceAreasVersionConflictError);
  });

  it("RPC transport error → throws (route maps to save_failed)", async () => {
    const { sb } = sbWithRpc({ data: null, error: { message: "boom" } });
    await expect(
      replaceStoreDeliveryServiceAreas(sb, { storeId: "s1", source: "owner", areas: [] })
    ).rejects.toThrow("boom");
  });

  it("findUnknownDeliveryServiceAreaLguIds flags ids outside the platform catalog", () => {
    expect(findUnknownDeliveryServiceAreaLguIds(["definitely-not-an-lgu-id", ""])).toEqual([
      "definitely-not-an-lgu-id",
    ]);
  });
});
