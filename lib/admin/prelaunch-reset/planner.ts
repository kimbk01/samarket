/**
 * CUT H — canonical Pre-launch Reset planner.
 * Dry-run and execute MUST call buildPrelaunchResetPlan (same selection logic).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { PRELAUNCH_RESET_PRESETS } from "@/lib/admin/prelaunch-reset/presets";
import { loadProtectedAdminUserIds } from "@/lib/admin/prelaunch-reset/protection";
import { resolvePrelaunchResetEnvGate } from "@/lib/admin/prelaunch-reset/environment";
import {
  emptyCounts,
  hashPlanPayload,
  normalizeSelector,
  typedConfirmationForPlan,
  type PrelaunchResetPlan,
  type PrelaunchResetPreset,
  type PrelaunchResetSelector,
  type PrelaunchResetDeleteStep,
  type PrelaunchResetEntityRef,
} from "@/lib/admin/prelaunch-reset/types";

async function countEq(
  sb: SupabaseClient,
  table: string,
  column: string,
  ids: string[]
): Promise<number> {
  if (ids.length === 0) return 0;
  const { count, error } = await sb
    .from(table)
    .select("*", { count: "exact", head: true })
    .in(column, ids);
  if (error) return 0;
  return count ?? 0;
}

async function countIn(
  sb: SupabaseClient,
  table: string,
  column: string,
  ids: string[]
): Promise<{ n: number; error?: string }> {
  if (ids.length === 0) return { n: 0 };
  const { count, error } = await sb
    .from(table)
    .select("*", { count: "exact", head: true })
    .in(column, ids);
  if (error) return { n: 0, error: `${table}:${error.message}` };
  return { n: count ?? 0 };
}

export type BuildPrelaunchResetPlanInput = {
  sb: SupabaseClient;
  actorUserId: string;
  preset: PrelaunchResetPreset;
  selector: Partial<PrelaunchResetSelector>;
  /** Stable planId for revalidate; omit to mint new. */
  planId?: string;
};

export async function buildPrelaunchResetPlan(
  input: BuildPrelaunchResetPlanInput
): Promise<PrelaunchResetPlan> {
  const envGate = resolvePrelaunchResetEnvGate();
  const preset = PRELAUNCH_RESET_PRESETS[input.preset];
  const selector = normalizeSelector(input.selector);
  const blockers: string[] = [];
  const warnings: string[] = [];
  const financialGuards: string[] = [];
  const externalReferences: string[] = [];
  const resolved: PrelaunchResetEntityRef[] = [];
  const blockedEntities: PrelaunchResetEntityRef[] = [];
  const counts = emptyCounts();
  const deleteSteps: PrelaunchResetDeleteStep[] = [];
  const storageSteps: PrelaunchResetDeleteStep[] = [];

  if (preset.requiresExplicitMember && selector.memberIds.length === 0) {
    blockers.push("preset_requires_explicit_memberIds");
  }
  if (preset.requiresExplicitStore && selector.storeIds.length === 0) {
    blockers.push("preset_requires_explicit_storeIds");
  }
  if (
    selector.memberIds.length === 0 &&
    selector.storeIds.length === 0 &&
    selector.contentIds.length === 0 &&
    selector.deliveryAdCampaignIds.length === 0
  ) {
    blockers.push("selector_empty_explicit_ids_required");
  }

  const { protectedIds, refs: protectedEntities } = await loadProtectedAdminUserIds(
    input.sb,
    input.actorUserId
  );

  // Protect selected members that are admins
  for (const mid of selector.memberIds) {
    if (protectedIds.has(mid)) {
      blockedEntities.push({
        kind: "blocked",
        id: mid,
        label: "member",
        reason: "protected_admin_or_current_user",
      });
      blockers.push(`member_protected:${mid}`);
    } else {
      resolved.push({ kind: "member", id: mid, label: "member" });
    }
  }

  const safeMemberIds = selector.memberIds.filter((id) => !protectedIds.has(id));
  const storeIds = selector.storeIds;
  for (const sid of storeIds) {
    resolved.push({ kind: "store", id: sid, label: "store" });
  }
  for (const cid of selector.contentIds) {
    resolved.push({ kind: "content", id: cid, label: "content" });
  }
  for (const aid of selector.deliveryAdCampaignIds) {
    resolved.push({ kind: "delivery_ad", id: aid, label: "delivery_ad_campaign" });
  }

  // --- Content counts ---
  if (preset.includes.includes("TRADE") || preset.includes.includes("COMMUNITY")) {
    let content = 0;
    if (selector.contentIds.length) {
      const trade = await countIn(input.sb, "posts", "id", selector.contentIds);
      content += trade.n;
      if (trade.error) warnings.push(trade.error);
    }
    if (safeMemberIds.length) {
      const byAuthor = await countIn(input.sb, "posts", "user_id", safeMemberIds);
      content += byAuthor.n;
      if (byAuthor.error) warnings.push(byAuthor.error);
      const community = await countIn(input.sb, "community_posts", "user_id", safeMemberIds);
      content += community.n;
      if (community.error) warnings.push(community.error);
    }
    counts.content = content;
    if (content > 0) {
      deleteSteps.push({
        id: "db_content_posts",
        domain: "TRADE",
        table: "posts",
        filterDescription: "explicit contentIds and/or author memberIds",
        estimatedRows: content,
        phase: "DB",
        executableInCutH: preset.id === "TEST_CONTENT_ONLY" || preset.id === "TEST_MEMBER_DATA" || preset.id === "FULL_PRELAUNCH_TEST_DATA",
      });
    }
  }

  // --- Ads ---
  if (
    preset.includes.includes("ADS_DELIVERY") ||
    preset.includes.includes("ADS_FEED") ||
    preset.includes.includes("POPUP")
  ) {
    let ads = 0;
    if (selector.deliveryAdCampaignIds.length) {
      const c = await countIn(input.sb, "delivery_ad_campaigns", "id", selector.deliveryAdCampaignIds);
      ads += c.n;
      if (c.error) warnings.push(c.error);
    }
    if (storeIds.length) {
      const c = await countIn(input.sb, "delivery_ad_campaigns", "store_id", storeIds);
      ads += c.n;
      if (c.error) warnings.push(c.error);
    }
    counts.ads = ads;
    if (ads > 0) {
      deleteSteps.push({
        id: "db_delivery_ads",
        domain: "ADS_DELIVERY",
        table: "delivery_ad_campaigns",
        filterDescription: "explicit campaignIds and/or storeIds",
        estimatedRows: ads,
        phase: "DB",
        executableInCutH: preset.id === "TEST_ADS_DATA" || preset.id === "TEST_STORE_DATA",
      });
    }
  }

  // --- Stores / members ---
  if (preset.includes.includes("STORE")) {
    counts.stores = storeIds.length;
  }
  if (preset.includes.includes("MEMBER")) {
    counts.members = safeMemberIds.length;
  }

  // --- Finance / gift / orders gates (count only; default BLOCK on non-zero) ---
  let finance = 0;
  let gift = 0;
  let orders = 0;

  if (storeIds.length) {
    const cashLedger = await countIn(input.sb, "business_cash_ledger", "store_id", storeIds);
    finance += cashLedger.n;
    if (cashLedger.error) warnings.push(cashLedger.error);
    const cashReq = await countIn(input.sb, "business_cash_charge_requests", "store_id", storeIds);
    finance += cashReq.n;
    const coinLedger = await countIn(input.sb, "business_coin_ledger", "store_id", storeIds);
    finance += coinLedger.n;
    if (coinLedger.error) warnings.push(coinLedger.error);
    const ord = await countIn(input.sb, "store_orders", "store_id", storeIds);
    orders += ord.n;
    if (ord.error) warnings.push(ord.error);
  }
  if (safeMemberIds.length) {
    const point = await countIn(input.sb, "point_charge_requests", "user_id", safeMemberIds);
    finance += point.n;
    if (point.error) warnings.push(point.error);
  }

  // Gift — try common table names; missing table → warning only
  if (storeIds.length || safeMemberIds.length) {
    const giftStore = storeIds.length
      ? await countIn(input.sb, "gift_certificate_instances", "store_id", storeIds)
      : { n: 0 };
    gift += giftStore.n;
    if (giftStore.error) warnings.push(`gift_optional:${giftStore.error}`);
  }

  counts.finance = finance;
  counts.gift = gift;
  counts.orders = orders;

  if (finance > 0) {
    financialGuards.push(`finance_rows=${finance}`);
    blockers.push("finance_rows_present_block");
  }
  if (gift > 0) {
    financialGuards.push(`gift_rows=${gift}`);
    blockers.push("gift_value_present_block");
  }
  if (orders > 0 && (preset.id === "TEST_STORE_DATA" || preset.id === "TEST_COMMERCE_DATA" || preset.id === "FULL_PRELAUNCH_TEST_DATA")) {
    blockers.push("orders_present_require_explicit_commerce_review");
  }
  if (preset.id === "TEST_COMMERCE_DATA") {
    blockers.push("commerce_preset_execute_blocked_in_cut_h");
  }

  // Storage steps are planned as NOT executable listing only in CUT H
  if (counts.content + counts.ads > 0) {
    storageSteps.push({
      id: "storage_entity_derived",
      domain: "STORAGE",
      table: "storage.objects",
      filterDescription: "entity-derived prefixes only (CUT H: NOT_IMPLEMENTED phase)",
      estimatedRows: 0,
      phase: "STORAGE",
      executableInCutH: false,
    });
    counts.storage = 0;
    warnings.push("storage_phase_not_implemented_in_cut_h");
  }

  // Auth never auto-planned for delete
  warnings.push("auth_user_delete_forbidden_in_cut_h_execute");

  const planId =
    input.planId?.trim() ||
    `pr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  const hashBody = {
    preset: preset.id,
    selector,
    counts,
    deleteSteps: deleteSteps.map((s) => ({ id: s.id, table: s.table, n: s.estimatedRows })),
    blockers: [...blockers].sort(),
  };
  const planHash = hashPlanPayload(hashBody);
  const typedConfirmationPhrase = typedConfirmationForPlan(counts, planHash);

  const executeAllowed =
    envGate.executeAllowed &&
    blockers.length === 0 &&
    deleteSteps.some((s) => s.executableInCutH && s.estimatedRows > 0);

  if (!envGate.executeAllowed) {
    blockers.push(...envGate.reasons.filter((r) => r.includes("execute") || r.includes("ENABLED")));
  }

  return {
    planId,
    preset: preset.id,
    selector,
    resolved,
    protectedEntities,
    blockedEntities,
    warnings,
    blockers: [...new Set(blockers)],
    counts,
    deleteSteps,
    storageSteps,
    financialGuards,
    externalReferences,
    planHash,
    createdAt: new Date().toISOString(),
    createdBy: input.actorUserId,
    environment: envGate.tier,
    executeAllowed,
    typedConfirmationPhrase,
  };
}

/** Re-build and compare hash — TOCTOU / staleness. */
export async function revalidatePrelaunchResetPlan(
  input: BuildPrelaunchResetPlanInput & { expectedHash: string }
): Promise<{ ok: true; plan: PrelaunchResetPlan } | { ok: false; reason: "stale" | "blocked"; plan: PrelaunchResetPlan }> {
  const plan = await buildPrelaunchResetPlan(input);
  if (plan.planHash !== input.expectedHash) {
    return { ok: false, reason: "stale", plan };
  }
  if (plan.blockers.length > 0 || !plan.executeAllowed) {
    return { ok: false, reason: "blocked", plan };
  }
  return { ok: true, plan };
}

export function confirmationMatches(plan: PrelaunchResetPlan, typed: string): boolean {
  return typed.trim() === plan.typedConfirmationPhrase;
}

/** Exported for tests — unused import guard */
export const _countEq = countEq;
