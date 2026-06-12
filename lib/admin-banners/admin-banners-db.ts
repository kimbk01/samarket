import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminBanner, BannerChangeLog, BannerStatus, BannerPlacement } from "@/lib/types/admin-banner";

function mapBannerRow(row: Record<string, unknown>): AdminBanner {
  return {
    id: String(row.id ?? ""),
    title: String(row.title ?? ""),
    description: String(row.description ?? ""),
    imageUrl: String(row.image_url ?? ""),
    mobileImageUrl: String(row.mobile_image_url ?? ""),
    targetUrl: String(row.link_url ?? ""),
    placement: (String(row.placement ?? "home_top") as BannerPlacement),
    status: (String(row.status ?? "active") as BannerStatus),
    priority: Number(row.priority ?? row.sort_order ?? 0),
    startAt: row.start_at ? String(row.start_at) : "",
    endAt: row.end_at ? String(row.end_at) : "",
    clickCount: Number(row.click_count ?? 0),
    impressionCount: Number(row.impression_count ?? 0),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
    createdBy: String(row.created_by ?? ""),
    adminMemo: row.admin_memo != null ? String(row.admin_memo) : undefined,
  };
}

function mapLogRow(row: Record<string, unknown>): BannerChangeLog {
  return {
    id: String(row.id ?? ""),
    bannerId: String(row.banner_id ?? ""),
    actionType: String(row.action_type ?? "update") as BannerChangeLog["actionType"],
    adminId: String(row.admin_id ?? ""),
    adminNickname: String(row.admin_nickname ?? ""),
    note: String(row.note ?? ""),
    createdAt: String(row.created_at ?? ""),
  };
}

export async function listAdminBanners(sb: SupabaseClient): Promise<AdminBanner[]> {
  const { data, error } = await sb
    .from("my_page_banners")
    .select("*")
    .order("priority", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapBannerRow(r as Record<string, unknown>));
}

export async function getAdminBannerById(sb: SupabaseClient, id: string): Promise<AdminBanner | null> {
  const { data, error } = await sb.from("my_page_banners").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapBannerRow(data as Record<string, unknown>);
}

export async function insertAdminBanner(
  sb: SupabaseClient,
  input: Partial<AdminBanner> & { createdBy: string }
): Promise<AdminBanner> {
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("my_page_banners")
    .insert({
      title: input.title ?? "",
      description: input.description ?? "",
      image_url: input.imageUrl ?? "",
      mobile_image_url: input.mobileImageUrl ?? "",
      link_url: input.targetUrl ?? "",
      placement: input.placement ?? "home_top",
      status: input.status ?? "draft",
      priority: input.priority ?? 0,
      sort_order: input.priority ?? 0,
      is_active: input.status === "active",
      start_at: input.startAt || null,
      end_at: input.endAt || null,
      admin_memo: input.adminMemo ?? null,
      created_by: input.createdBy || null,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapBannerRow(data as Record<string, unknown>);
}

export async function updateAdminBanner(
  sb: SupabaseClient,
  id: string,
  patch: Partial<AdminBanner>
): Promise<AdminBanner> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title != null) payload.title = patch.title;
  if (patch.description != null) payload.description = patch.description;
  if (patch.imageUrl != null) payload.image_url = patch.imageUrl;
  if (patch.mobileImageUrl != null) payload.mobile_image_url = patch.mobileImageUrl;
  if (patch.targetUrl != null) payload.link_url = patch.targetUrl;
  if (patch.placement != null) payload.placement = patch.placement;
  if (patch.status != null) {
    payload.status = patch.status;
    payload.is_active = patch.status === "active";
  }
  if (patch.priority != null) {
    payload.priority = patch.priority;
    payload.sort_order = patch.priority;
  }
  if (patch.startAt != null) payload.start_at = patch.startAt || null;
  if (patch.endAt != null) payload.end_at = patch.endAt || null;
  if (patch.adminMemo != null) payload.admin_memo = patch.adminMemo;

  const { data, error } = await sb.from("my_page_banners").update(payload).eq("id", id).select("*").single();
  if (error) throw new Error(error.message);
  return mapBannerRow(data as Record<string, unknown>);
}

export async function listBannerChangeLogs(
  sb: SupabaseClient,
  bannerId?: string,
  limit = 100
): Promise<BannerChangeLog[]> {
  let q = sb.from("admin_banner_change_logs").select("*").order("created_at", { ascending: false }).limit(limit);
  if (bannerId?.trim()) q = q.eq("banner_id", bannerId.trim());
  const { data, error } = await q;
  if (error) {
    if (error.message?.includes("admin_banner_change_logs")) return [];
    throw new Error(error.message);
  }
  return (data ?? []).map((r) => mapLogRow(r as Record<string, unknown>));
}

export async function insertBannerChangeLog(
  sb: SupabaseClient,
  input: Omit<BannerChangeLog, "id" | "createdAt">
): Promise<void> {
  const { error } = await sb.from("admin_banner_change_logs").insert({
    banner_id: input.bannerId,
    action_type: input.actionType,
    admin_id: input.adminId || null,
    admin_nickname: input.adminNickname,
    note: input.note,
  });
  if (error && !error.message?.includes("admin_banner_change_logs")) {
    throw new Error(error.message);
  }
}
