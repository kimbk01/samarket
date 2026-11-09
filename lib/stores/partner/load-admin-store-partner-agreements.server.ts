import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { labelFromDisplayAndUsername } from "@/lib/users/user-label";
import { normalizeFreeUntil } from "@/lib/delivery/launch/delivery-launch-contract";
import {
  normalizeStorePartnerAgreementRow,
  STORE_LAUNCH_FREE_POLICY_MEMO,
  STORE_PARTNER_AGREEMENT_SELECT,
  type StorePartnerAgreementRow,
} from "@/lib/stores/partner/store-partner-agreement-contract";
import {
  adminPartnerAgreementRowMatches,
  buildAdminPartnerAgreementRow,
  type AdminPartnerAgreementFilter,
  type AdminPartnerAgreementListRow,
} from "@/lib/stores/partner/admin-store-partner-agreements-model";
import { loadCurrentStorePartnerTerms } from "@/lib/stores/partner/store-partner-agreement.server";

/**
 * 어드민 「입점 계약」 목록 — 실매장(store_kind='real')만, 최근 신청 순 상한 ADMIN_PARTNER_LIST_MAX 건을 읽어
 * 매장별 동의 기록·어드민 무료 종료일·현재 launch_free 정책을 붙인 뒤 필터한다 (조회 전용).
 */

type AnySb = SupabaseClient<any>;

export const ADMIN_PARTNER_LIST_MAX = 500;

type TaxRel = { name?: string | null; name_en?: string | null } | { name?: string | null; name_en?: string | null }[] | null;

function relName(v: TaxRel, en: boolean): string {
  const r = Array.isArray(v) ? v[0] : v;
  if (!r) return "";
  const ko = String(r.name ?? "").trim();
  const e = String(r.name_en ?? "").trim();
  return en ? e || ko : ko;
}

export async function loadAdminStorePartnerAgreementList(
  sb: AnySb,
  input: { filter: AdminPartnerAgreementFilter; en: boolean }
): Promise<
  | { ok: true; rows: AdminPartnerAgreementListRow[]; currentVersion: string | null; truncated: boolean }
  | { ok: false; error: string }
> {
  const { data: storesRaw, error: storesErr } = await sb
    .from("stores")
    .select(
      "id, store_name, owner_user_id, approval_status, created_at, store_categories ( name, name_en ), store_topics ( name, name_en )"
    )
    .eq("store_kind", "real")
    .order("created_at", { ascending: false })
    .limit(ADMIN_PARTNER_LIST_MAX);
  if (storesErr) return { ok: false, error: "stores_load_failed" };
  const stores = (storesRaw ?? []) as Record<string, unknown>[];
  const ids = stores.map((s) => String(s.id ?? "")).filter(Boolean);
  const ownerIds = [...new Set(stores.map((s) => String(s.owner_user_id ?? "")).filter(Boolean))];

  const terms = await loadCurrentStorePartnerTerms(sb, "ko");
  if (!terms.ok) return { ok: false, error: terms.error };
  const currentVersion = terms.terms?.version ?? null;

  const [agRes, ovRes, polRes, profRes] = await Promise.all([
    ids.length
      ? sb.from("store_partner_agreements").select(STORE_PARTNER_AGREEMENT_SELECT).in("store_id", ids)
      : Promise.resolve({ data: [], error: null }),
    ids.length
      ? sb.from("store_launch_free_overrides").select("store_id, free_until").in("store_id", ids)
      : Promise.resolve({ data: [], error: null }),
    ids.length
      ? sb
          .from("store_fee_policies")
          .select("store_id, ends_at, created_at")
          .in("store_id", ids)
          .eq("memo", STORE_LAUNCH_FREE_POLICY_MEMO)
          .eq("is_archived", false)
      : Promise.resolve({ data: [], error: null }),
    ownerIds.length
      ? sb.from("profiles").select("id, display_name, nickname, username").in("id", ownerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (agRes.error) {
    const m = String(agRes.error.message ?? "");
    if (!(m.includes("store_partner_agreements") && /(does not exist|schema cache)/i.test(m))) {
      return { ok: false, error: "agreements_load_failed" };
    }
  }

  const agreementsByStore = new Map<string, StorePartnerAgreementRow[]>();
  for (const raw of (agRes.error ? [] : agRes.data) ?? []) {
    const row = normalizeStorePartnerAgreementRow(raw as Record<string, unknown>);
    if (!row) continue;
    const list = agreementsByStore.get(row.storeId) ?? [];
    list.push(row);
    agreementsByStore.set(row.storeId, list);
  }
  const overrideByStore = new Map<string, string>();
  for (const raw of (ovRes.error ? [] : ovRes.data) ?? []) {
    const r = raw as Record<string, unknown>;
    const fu = normalizeFreeUntil(r.free_until);
    if (fu) overrideByStore.set(String(r.store_id ?? ""), fu);
  }
  const policyByStore = new Map<string, { endsAt: string | null; createdAt: string }>();
  for (const raw of (polRes.error ? [] : polRes.data) ?? []) {
    const r = raw as Record<string, unknown>;
    const sid = String(r.store_id ?? "");
    const createdAt = String(r.created_at ?? "");
    const prev = policyByStore.get(sid);
    if (!prev || prev.createdAt < createdAt) {
      policyByStore.set(sid, { endsAt: typeof r.ends_at === "string" ? r.ends_at : null, createdAt });
    }
  }
  const ownerLabel = new Map<string, string>();
  for (const raw of (profRes.error ? [] : profRes.data) ?? []) {
    const p = raw as Record<string, unknown>;
    const display = String(p.display_name ?? "").trim() || String(p.nickname ?? "").trim();
    ownerLabel.set(String(p.id ?? ""), labelFromDisplayAndUsername(display, String(p.username ?? "").trim()).trim());
  }

  const rows = stores
    .map((s) => {
      const id = String(s.id ?? "");
      return buildAdminPartnerAgreementRow({
        store: {
          id,
          storeName: String(s.store_name ?? "").trim(),
          ownerLabel: ownerLabel.get(String(s.owner_user_id ?? "")) ?? "",
          approvalStatus: String(s.approval_status ?? "").trim(),
          categoryName: relName(s.store_categories as TaxRel, input.en),
          topicName: relName(s.store_topics as TaxRel, input.en),
        },
        agreements: agreementsByStore.get(id) ?? [],
        overrideFreeUntil: overrideByStore.get(id) ?? null,
        launchPolicy: policyByStore.get(id) ?? null,
        currentVersion,
      });
    })
    .filter((r) => adminPartnerAgreementRowMatches(r, input.filter));

  return { ok: true, rows, currentVersion, truncated: stores.length >= ADMIN_PARTNER_LIST_MAX };
}
