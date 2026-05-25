/**
 * OPS1 / PDS1 — resolve a store the signed-in user actually owns (prod sign-off safe).
 */
import { createClient } from "@supabase/supabase-js";

/** Prod linked DB: `qqqq@manual.local` owner store (order-counts 200 verified). */
export const OPS1_PROD_DEFAULT_STORE_ID = "076bffda-3048-4bfb-80ae-985a69105f4a";
export const OPS1_PROD_DEFAULT_STORE_SLUG = "맛업는식당-8db1803b";

/** Prefer accounts with an owned store on prod. */
export const OPS1_SIGNOFF_LOGIN_IDS = [
  process.env.OPS1_SIGNOFF_USERNAME,
  "qqqq",
  process.env.E2E_TEST_USERNAME,
  "aaaa",
].filter(Boolean);

export async function resolveOwnedStoreForUser(userId, baseUrl, cookie) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (url && sk && userId) {
    const sb = createClient(url, sk, { auth: { persistSession: false } });
    const { data } = await sb
      .from("stores")
      .select("id,slug,approval_status,is_visible")
      .eq("owner_user_id", userId)
      .eq("approval_status", "approved")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.id) {
      return { storeId: String(data.id), storeSlug: data.slug ? String(data.slug) : null };
    }
  }

  if (baseUrl && cookie) {
    const res = await fetch(`${baseUrl}/api/me/stores`, {
      headers: { cookie: `${cookie.name}=${cookie.value}` },
      cache: "no-store",
    });
    const json = await res.json().catch(() => null);
    const rows = json?.stores ?? json?.data ?? [];
    const first = Array.isArray(rows) ? rows[0] : null;
    if (first?.id) {
      return {
        storeId: String(first.id),
        storeSlug: first.slug ? String(first.slug) : null,
      };
    }
  }

  const envId = process.env.OPS1_STORE_ID ?? process.env.OWNER_DASHBOARD_STORE_ID;
  const envSlug = process.env.OPS1_STORE_SLUG;
  if (envId) {
    return { storeId: String(envId), storeSlug: envSlug ? String(envSlug) : null };
  }

  return { storeId: null, storeSlug: null };
}

export async function resolveOps1StoreId(cookie, baseUrl) {
  const owned = await resolveOwnedStoreForUser(cookie.userId, baseUrl, cookie);
  return owned.storeId;
}

export async function resolveOps1StoreSlug(cookie, storeId, baseUrl) {
  if (!storeId) return null;
  const owned = await resolveOwnedStoreForUser(cookie.userId, baseUrl, cookie);
  if (owned.storeId === String(storeId) && owned.storeSlug) return owned.storeSlug;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (url && sk) {
    const sb = createClient(url, sk, { auth: { persistSession: false } });
    const { data } = await sb.from("stores").select("slug,owner_user_id").eq("id", storeId).maybeSingle();
    if (data?.slug && data.owner_user_id === cookie.userId) return String(data.slug);
  }

  if (process.env.OPS1_STORE_SLUG) return String(process.env.OPS1_STORE_SLUG);
  return null;
}
