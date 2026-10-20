/**
 * 매장 허브 요약 카드 (§3 공통 연결표) — 읽기 전용 집계.
 * 사장님 회원 · 매장 광고 · 캐시·코인 · 수수료 · 문의 · 작업 기록 최근 5건.
 * 쓰기 권위는 각 공통 화면 API — 여기서는 요약만 만든다. 실패한 항목은 null (0 으로 위장하지 않음).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { labelFromDisplayAndUsername } from "@/lib/users/user-label";
import { manilaDateKey } from "@/lib/admin/metrics/manila-period";
import {
  BUSINESS_CASH_ACCOUNTS_TABLE,
  BUSINESS_CASH_CHARGE_REQUESTS_TABLE,
  STORE_ECONOMIC_POINT_ACCOUNTS_TABLE,
} from "@/lib/stores/advertising/canonical-business-cash-contract";
import { STORE_SPONSORED_CAMPAIGN_TABLE } from "@/lib/stores/advertising/delivery-ad-domain";

import type { StoreHubAuditEntry, StoreHubSummary } from "@/lib/admin-business/store-hub-summary-types";

export type { StoreHubAuditEntry, StoreHubSummary };

const PENDING_AD_STATUSES = ["SUBMITTED", "UNDER_REVIEW"] as const;

/** Asia/Manila 기준 이번 달 1일 00:00 (UTC ISO). */
export function manilaMonthStartIso(now: Date = new Date()): string {
  const ym = (manilaDateKey(now.toISOString()) ?? now.toISOString()).slice(0, 7);
  return new Date(`${ym}-01T00:00:00+08:00`).toISOString();
}

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? Math.trunc(x) : 0;
}

/** audit after_json 의 사유 (reason / action_memo / memo) — 운영자 표시용. */
export function auditReasonFromAfterJson(after: unknown): string | null {
  if (!after || typeof after !== "object" || Array.isArray(after)) return null;
  const o = after as Record<string, unknown>;
  for (const k of ["reason", "action_memo", "memo"]) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim().slice(0, 200);
  }
  return null;
}

/** 관리자·사용자 id → 표시 이름 (실패 시 빈 맵 — UUID 를 이름으로 쓰지 않는다). */
export async function loadActorLabels(
  sb: SupabaseClient,
  ids: readonly string[]
): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.map((x) => String(x ?? "").trim()).filter(Boolean))];
  const out = new Map<string, string>();
  if (uniq.length === 0) return out;
  const { data, error } = await sb
    .from("profiles")
    .select("id, display_name, nickname, username")
    .in("id", uniq.slice(0, 500));
  if (error || !data) return out;
  for (const p of data as Array<Record<string, unknown>>) {
    const display = String(p.display_name ?? p.nickname ?? "").trim();
    const username = String(p.username ?? "").trim();
    const label = labelFromDisplayAndUsername(display, username).trim();
    if (label) out.set(String(p.id), label);
  }
  return out;
}

export async function loadStoreHubSummary(
  sb: SupabaseClient,
  storeId: string,
  ownerUserId: string | null
): Promise<StoreHubSummary> {
  const sid = storeId.trim();
  const oid = String(ownerUserId ?? "").trim();
  const monthStart = manilaMonthStartIso();

  const [
    profRes,
    sanctionRes,
    adsActiveRes,
    adsPendingRes,
    cashRes,
    chargesRes,
    coinRes,
    monthFeeRes,
    outstandingRes,
    reviewReqRes,
    inqOpenRes,
    inqTotalRes,
    auditRes,
  ] = await Promise.all([
    oid
      ? sb.from("profiles").select("status, deleted_at").eq("id", oid).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    oid
      ? sb
          .from("user_moderation_events")
          .select("action, created_at", { count: "exact" })
          .eq("user_id", oid)
          .in("action", ["warn", "suspend", "ban"])
          .order("created_at", { ascending: false })
          .limit(1)
      : Promise.resolve({ data: [], error: null, count: 0 }),
    sb
      .from(STORE_SPONSORED_CAMPAIGN_TABLE)
      .select("id", { count: "exact", head: true })
      .eq("store_id", sid)
      .eq("lifecycle_status", "ACTIVE"),
    sb
      .from(STORE_SPONSORED_CAMPAIGN_TABLE)
      .select("id", { count: "exact", head: true })
      .eq("store_id", sid)
      .in("lifecycle_status", [...PENDING_AD_STATUSES]),
    sb.from(BUSINESS_CASH_ACCOUNTS_TABLE).select("balance_minor").eq("store_id", sid).maybeSingle(),
    sb
      .from(BUSINESS_CASH_CHARGE_REQUESTS_TABLE)
      .select("id", { count: "exact", head: true })
      .eq("store_id", sid)
      .eq("status", "PENDING"),
    sb.from(STORE_ECONOMIC_POINT_ACCOUNTS_TABLE).select("balance").eq("store_id", sid).maybeSingle(),
    sb
      .from("store_sale_fee_obligations")
      .select("fee_due_minor")
      .eq("store_id", sid)
      .gte("created_at", monthStart)
      .limit(5000),
    sb
      .from("store_sale_fee_obligations")
      .select("fee_outstanding_minor")
      .eq("store_id", sid)
      .gt("fee_outstanding_minor", 0)
      .limit(5000),
    sb
      .from("store_sale_fee_obligations")
      .select("id", { count: "exact", head: true })
      .eq("store_id", sid)
      .eq("adjustment_status", "review_required"),
    sb
      .from("store_inquiries")
      .select("id", { count: "exact", head: true })
      .eq("store_id", sid)
      .eq("status", "open"),
    sb.from("store_inquiries").select("id", { count: "exact", head: true }).eq("store_id", sid),
    sb
      .from("audit_logs")
      .select("id, action, actor_type, actor_id, after_json, created_at")
      .eq("target_type", "store")
      .eq("target_id", sid)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const owner: StoreHubSummary["owner"] = oid
    ? {
        status: profRes.error
          ? null
          : (profRes.data as { deleted_at?: string | null } | null)?.deleted_at
            ? "withdrawn"
            : String((profRes.data as { status?: string | null } | null)?.status ?? "").trim() || "active",
        sanctionCount: sanctionRes.error ? null : n((sanctionRes as { count?: number | null }).count),
        lastSanction: (() => {
          const row = (sanctionRes.data as Array<{ action?: string; created_at?: string }> | null)?.[0];
          return row?.action ? { action: row.action, createdAt: String(row.created_at ?? "") } : null;
        })(),
      }
    : null;

  const ads =
    adsActiveRes.error || adsPendingRes.error
      ? null
      : { active: n(adsActiveRes.count), pending: n(adsPendingRes.count) };

  const cash =
    cashRes.error && chargesRes.error
      ? null
      : {
          balanceMinor: cashRes.error
            ? null
            : n((cashRes.data as { balance_minor?: unknown } | null)?.balance_minor),
          pendingCharges: chargesRes.error ? null : n(chargesRes.count),
        };

  const coin = coinRes.error
    ? null
    : { balance: n((coinRes.data as { balance?: unknown } | null)?.balance) };

  const commission =
    monthFeeRes.error || outstandingRes.error || reviewReqRes.error
      ? null
      : {
          monthFeeDueMinor: (monthFeeRes.data ?? []).reduce(
            (sum, r) => sum + n((r as { fee_due_minor?: unknown }).fee_due_minor),
            0
          ),
          outstandingMinor: (outstandingRes.data ?? []).reduce(
            (sum, r) => sum + n((r as { fee_outstanding_minor?: unknown }).fee_outstanding_minor),
            0
          ),
          outstandingCount: (outstandingRes.data ?? []).length,
          reviewRequired: n(reviewReqRes.count),
        };

  const inquiries =
    inqOpenRes.error || inqTotalRes.error
      ? null
      : { open: n(inqOpenRes.count), total: n(inqTotalRes.count) };

  let recentAudit: StoreHubAuditEntry[] | null = null;
  if (!auditRes.error) {
    const rows = (auditRes.data ?? []) as Array<Record<string, unknown>>;
    const labels = await loadActorLabels(
      sb,
      rows.map((r) => String(r.actor_id ?? ""))
    );
    recentAudit = rows.map((r) => ({
      id: String(r.id ?? ""),
      action: String(r.action ?? ""),
      actorType: String(r.actor_type ?? ""),
      actorLabel: labels.get(String(r.actor_id ?? "")) ?? null,
      reason: auditReasonFromAfterJson(r.after_json),
      createdAt: String(r.created_at ?? ""),
    }));
  }

  return { owner, ads, cash, coin, commission, inquiries, recentAudit };
}
