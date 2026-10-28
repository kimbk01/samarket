import "server-only";

/**
 * 매장 메뉴 구역(store_menu_sections) 생성·수정 코어 — 오너 라우트 본문 그대로 이동 (2026-10-28 배달 감사 §F S-5).
 * 응답 코드·메시지 불변. 게이트·캐시 세대 bump 는 호출 라우트 소유.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  catalogDbErrorOutcome,
  outcome,
  type CatalogOutcome,
} from "@/lib/stores/catalog/store-catalog-write-policy";

export type StoreMenuSectionWriteBody = {
  name?: string;
  sort_order?: number;
  description?: string | null;
  is_hidden?: boolean;
};

type MenuSectionInsertRow = {
  name: string;
  sort_order: number;
  description: string | null;
  is_hidden: boolean;
};

/** 생성 입력 검증 (오너 라우트는 DB 클라이언트·게이트 전에 호출 — 기존 순서) */
export function parseStoreMenuSectionCreateBody(
  body: StoreMenuSectionWriteBody
): { ok: true; row: MenuSectionInsertRow } | { ok: false; outcome: CatalogOutcome } {
  const name = String(body.name ?? "").trim();
  if (name.length < 1 || name.length > 80) {
    return { ok: false, outcome: outcome(400, { ok: false, error: "invalid_name" }) };
  }

  const sortRaw = Number(body.sort_order ?? 0);
  const sort_order = Number.isFinite(sortRaw) ? Math.max(0, Math.min(9999, Math.floor(sortRaw))) : 0;

  let description: string | null = null;
  if (body.description !== undefined && body.description !== null) {
    const d = String(body.description).trim();
    description = d.length > 0 ? d.slice(0, 2000) : null;
  }
  const is_hidden = body.is_hidden === true;
  return { ok: true, row: { name, sort_order, description, is_hidden } };
}

export async function insertStoreMenuSection(
  sb: SupabaseClient,
  sid: string,
  row: MenuSectionInsertRow
): Promise<CatalogOutcome> {
  const { data: created, error: insErr } = await sb
    .from("store_menu_sections")
    .insert({ store_id: sid, ...row })
    .select("id, name, sort_order, description, is_hidden")
    .maybeSingle();

  if (insErr) {
    if (/duplicate key|unique/i.test(String(insErr.message))) {
      return outcome(409, { ok: false, error: "duplicate_section_name" });
    }
    if (/column|does not exist|schema cache/i.test(String(insErr.message))) {
      return outcome(503, { ok: false, error: "migration_pending" });
    }
    return catalogDbErrorOutcome("[POST menu-sections]", insErr);
  }
  return outcome(200, { ok: true, section: created });
}

export async function updateStoreMenuSection(
  sb: SupabaseClient,
  sid: string,
  secId: string,
  body: StoreMenuSectionWriteBody
): Promise<CatalogOutcome> {
  const { data: existing, error: findErr } = await sb
    .from("store_menu_sections")
    .select("id")
    .eq("id", secId)
    .eq("store_id", sid)
    .maybeSingle();

  if (findErr && /column|does not exist|schema cache/i.test(String(findErr.message))) {
    return outcome(503, { ok: false, error: "migration_pending" });
  }
  if (!existing) {
    return outcome(404, { ok: false, error: "not_found" });
  }

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (name.length < 1 || name.length > 80) {
      return outcome(400, { ok: false, error: "invalid_name" });
    }
    patch.name = name;
  }
  if (body.sort_order !== undefined) {
    const sortRaw = Number(body.sort_order);
    const sort_order = Number.isFinite(sortRaw)
      ? Math.max(0, Math.min(9999, Math.floor(sortRaw)))
      : 0;
    patch.sort_order = sort_order;
  }
  if (body.description !== undefined) {
    if (body.description === null) {
      patch.description = null;
    } else {
      const d = String(body.description).trim();
      patch.description = d.length > 0 ? d.slice(0, 2000) : null;
    }
  }
  if (body.is_hidden !== undefined) {
    patch.is_hidden = !!body.is_hidden;
  }

  if (Object.keys(patch).length === 0) {
    return outcome(400, { ok: false, error: "empty_patch" });
  }

  const { data: updated, error: upErr } = await sb
    .from("store_menu_sections")
    .update(patch)
    .eq("id", secId)
    .eq("store_id", sid)
    .select("id, name, sort_order, description, is_hidden")
    .maybeSingle();

  if (upErr) {
    if (/duplicate key|unique/i.test(String(upErr.message))) {
      return outcome(409, { ok: false, error: "duplicate_section_name" });
    }
    return catalogDbErrorOutcome("[PATCH menu-section]", upErr);
  }
  return outcome(200, { ok: true, section: updated });
}
