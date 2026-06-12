import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdProduct, AdType } from "@/lib/ads/types";

type AdProductRow = {
  id: string;
  name: string;
  description: string;
  board_key: string | null;
  ad_type: string;
  duration_days: number;
  point_cost: number;
  priority_default: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

function isMissingAdProductsTable(err: { code?: string; message?: string }): boolean {
  const m = (err.message ?? "").toLowerCase();
  return (
    err.code === "42P01" ||
    m.includes("does not exist") ||
    (m.includes("relation") && m.includes("ad_products"))
  );
}

export function mapAdProductRow(row: AdProductRow): AdProduct {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    boardKey: row.board_key,
    adType: row.ad_type as AdType,
    durationDays: Number(row.duration_days) || 0,
    pointCost: Number(row.point_cost) || 0,
    priorityDefault: Number(row.priority_default) || 0,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const AD_PRODUCTS_SELECT =
  "id, name, description, board_key, ad_type, duration_days, point_cost, priority_default, is_active, created_at, updated_at";

export async function fetchAllAdProductsFromDb(
  sb: SupabaseClient
): Promise<
  { ok: true; products: AdProduct[] } | { ok: false; reason: "missing_table" | "error"; message?: string }
> {
  const { data, error } = await sb
    .from("ad_products")
    .select(AD_PRODUCTS_SELECT)
    .order("created_at", { ascending: true });

  if (error) {
    if (isMissingAdProductsTable(error)) {
      return { ok: false, reason: "missing_table" };
    }
    return { ok: false, reason: "error", message: error.message };
  }

  return { ok: true, products: (data ?? []).map((r) => mapAdProductRow(r as AdProductRow)) };
}

export async function fetchActiveAdProductsFromDb(
  sb: SupabaseClient,
  boardKey?: string | null
): Promise<
  { ok: true; products: AdProduct[] } | { ok: false; reason: "missing_table" | "error"; message?: string }
> {
  const { data, error } = await sb
    .from("ad_products")
    .select(AD_PRODUCTS_SELECT)
    .eq("is_active", true)
    .order("priority_default", { ascending: true });

  if (error) {
    if (isMissingAdProductsTable(error)) {
      return { ok: false, reason: "missing_table" };
    }
    return { ok: false, reason: "error", message: error.message };
  }

  const bk = boardKey?.trim();
  const products = (data ?? [])
    .map((r) => mapAdProductRow(r as AdProductRow))
    .filter((p) => !bk || p.boardKey === bk || p.boardKey === null);

  return { ok: true, products };
}

export async function fetchAdProductByIdFromDb(
  sb: SupabaseClient,
  id: string
): Promise<
  { ok: true; product: AdProduct } | { ok: false; notFound: true } | { ok: false; reason: "error"; message?: string }
> {
  const { data, error } = await sb
    .from("ad_products")
    .select(AD_PRODUCTS_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    if (isMissingAdProductsTable(error)) {
      return { ok: false, notFound: true };
    }
    return { ok: false, reason: "error", message: error.message };
  }
  if (!data) {
    return { ok: false, notFound: true };
  }
  return { ok: true, product: mapAdProductRow(data as AdProductRow) };
}

export type AdProductPatchInput = Partial<
  Pick<
    AdProduct,
    | "name"
    | "description"
    | "boardKey"
    | "adType"
    | "durationDays"
    | "pointCost"
    | "priorityDefault"
    | "isActive"
  >
>;

export async function updateAdProductInDb(
  sb: SupabaseClient,
  id: string,
  patch: AdProductPatchInput
): Promise<{ ok: true; product: AdProduct } | { ok: false; notFound?: boolean; error?: string }> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) payload.name = patch.name;
  if (patch.description !== undefined) payload.description = patch.description;
  if (patch.boardKey !== undefined) payload.board_key = patch.boardKey;
  if (patch.adType !== undefined) payload.ad_type = patch.adType;
  if (patch.durationDays !== undefined) payload.duration_days = patch.durationDays;
  if (patch.pointCost !== undefined) payload.point_cost = patch.pointCost;
  if (patch.priorityDefault !== undefined) payload.priority_default = patch.priorityDefault;
  if (patch.isActive !== undefined) payload.is_active = patch.isActive;

  const { data, error } = await sb
    .from("ad_products")
    .update(payload)
    .eq("id", id)
    .select(AD_PRODUCTS_SELECT)
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data) {
    return { ok: false, notFound: true };
  }
  return { ok: true, product: mapAdProductRow(data as AdProductRow) };
}
