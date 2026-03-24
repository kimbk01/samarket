"use client";

import { getSupabaseClient } from "@/lib/supabase/client";

export interface AdminBoardRow {
  id: string;
  service_id: string;
  name: string;
  slug: string;
  description: string | null;
  skin_type: string;
  form_type: string;
  category_mode: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  service_name?: string;
  service_slug?: string;
}

/**
 * 어드민 게시판 목록 — boards 테이블 + services 조인
 */
export async function getBoardsFromDb(): Promise<AdminBoardRow[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  try {
    const { data: rows, error } = await (supabase as any)
      .from("boards")
      .select("id, service_id, name, slug, description, skin_type, form_type, category_mode, is_active, sort_order, created_at, updated_at")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (error || !Array.isArray(rows)) return [];

    const list = rows as any[];
    const serviceIds = [...new Set(list.map((r) => r.service_id).filter(Boolean))];
    const serviceById: Record<string, { name?: string; slug?: string }> = {};
    if (serviceIds.length > 0) {
      const { data: services } = await (supabase as any)
        .from("services")
        .select("id, name, slug")
        .in("id", serviceIds);
      if (Array.isArray(services)) {
        services.forEach((s: { id: string; name?: string; slug?: string }) => {
          serviceById[s.id] = { name: s.name, slug: s.slug };
        });
      }
    }

    return list.map((r) => {
      const svc = serviceById[r.service_id];
      return {
        id: r.id,
        service_id: r.service_id,
        name: r.name,
        slug: r.slug,
        description: r.description ?? null,
        skin_type: r.skin_type ?? "basic",
        form_type: r.form_type ?? "basic",
        category_mode: r.category_mode ?? "none",
        is_active: r.is_active ?? true,
        sort_order: r.sort_order ?? 0,
        created_at: r.created_at,
        updated_at: r.updated_at,
        service_name: svc?.name,
        service_slug: svc?.slug,
      };
    }) as AdminBoardRow[];
  } catch {
    return [];
  }
}
