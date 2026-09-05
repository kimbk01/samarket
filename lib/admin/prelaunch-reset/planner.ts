/**
 * CUT H — canonical Pre-launch Reset planner.
 * Dry-run and execute MUST call buildPrelaunchResetPlan (same selection logic).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { PRELAUNCH_RESET_PRESETS } from "@/lib/admin/prelaunch-reset/presets";
import { loadProtectedAdminUserIds } from "@/lib/admin/prelaunch-reset/protection";
import { resolvePrelaunchResetEnvGate } from "@/lib/admin/prelaunch-reset/environment";
import {
  defaultScopesForPreset,
  normalizeSelectedScopes,
  scopeAllowsAuth,
  scopeAllowsCommunityPosts,
  scopeAllowsDeliveryAds,
  scopeAllowsMembers,
  scopeAllowsStorage,
  scopeAllowsStores,
  scopeAllowsTradeContent,
  type PrelaunchResetSelectiveScope,
} from "@/lib/admin/prelaunch-reset/selective-scopes";
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
import {
  planPrelaunchResetAuthTargets,
  planPrelaunchResetStorageObjects,
} from "@/lib/admin/prelaunch-reset/storage-auth-plan";

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
  /** ARO-RST-001 — when empty/omitted, inferred from preset (legacy CUT H clients). */
  selectedScopes?: readonly string[] | null;
  /** Stable planId for revalidate; omit to mint new. */
  planId?: string;
};

export async function buildPrelaunchResetPlan(
  input: BuildPrelaunchResetPlanInput
): Promise<PrelaunchResetPlan> {
  const envGate = resolvePrelaunchResetEnvGate();
  const preset = PRELAUNCH_RESET_PRESETS[input.preset];
  const selector = normalizeSelector(input.selector);
  const normalizedScopes = normalizeSelectedScopes(input.selectedScopes, { allowEmpty: true });
  const selectedScopes: PrelaunchResetSelectiveScope[] =
    normalizedScopes.length > 0
      ? normalizedScopes
      : defaultScopesForPreset(preset.includes);
  const blockers: string[] = [];
  const warnings: string[] = [];
  const financialGuards: string[] = [];
  const externalReferences: string[] = [];
  const resolved: PrelaunchResetEntityRef[] = [];
  const blockedEntities: PrelaunchResetEntityRef[] = [];
  const counts = emptyCounts();
  const deleteSteps: PrelaunchResetDeleteStep[] = [];
  const storageSteps: PrelaunchResetDeleteStep[] = [];
  const scopeImpact: PrelaunchResetPlan["scopeImpact"] = [];

  if (selectedScopes.length === 0) {
    blockers.push("selected_scopes_empty");
  }

  const needsMemberIds =
    scopeAllowsMembers(selectedScopes) ||
    scopeAllowsAuth(selectedScopes) ||
    ((scopeAllowsTradeContent(selectedScopes) || scopeAllowsCommunityPosts(selectedScopes)) &&
      selector.contentIds.length === 0);
  const needsStoreIds =
    scopeAllowsStores(selectedScopes) ||
    (scopeAllowsDeliveryAds(selectedScopes) && selector.deliveryAdCampaignIds.length === 0);

  if (preset.requiresExplicitMember && selector.memberIds.length === 0 && needsMemberIds) {
    blockers.push("preset_requires_explicit_memberIds");
  }
  if (preset.requiresExplicitStore && selector.storeIds.length === 0 && needsStoreIds) {
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

  // --- Content counts (trade vs community split by ARO-RST-001 scopes) ---
  let tradeRows = 0;
  let communityRows = 0;
  if (scopeAllowsTradeContent(selectedScopes)) {
    if (selector.contentIds.length) {
      const trade = await countIn(input.sb, "posts", "id", selector.contentIds);
      tradeRows += trade.n;
      if (trade.error) warnings.push(trade.error);
    }
    if (safeMemberIds.length && (scopeAllowsMembers(selectedScopes) || selector.contentIds.length === 0)) {
      const byAuthor = await countIn(input.sb, "posts", "user_id", safeMemberIds);
      tradeRows += byAuthor.n;
      if (byAuthor.error) warnings.push(byAuthor.error);
    }
    if (tradeRows > 0) {
      deleteSteps.push({
        id: "db_trade_posts",
        domain: "TRADE",
        table: "posts",
        filterDescription: "explicit contentIds and/or author memberIds (trade_content scope)",
        estimatedRows: tradeRows,
        phase: "DB",
        executableInCutH:
          preset.id === "TEST_CONTENT_ONLY" ||
          preset.id === "TEST_MEMBER_DATA" ||
          preset.id === "FULL_PRELAUNCH_TEST_DATA",
      });
    }
    scopeImpact.push({
      scope: "trade_content",
      estimatedDbRows: tradeRows,
      storageObjects: 0,
      authDelete: 0,
      status: tradeRows > 0 ? "active" : "idle",
      detail: "posts",
    });
  }

  if (scopeAllowsCommunityPosts(selectedScopes)) {
    if (selector.contentIds.length) {
      const byId = await countIn(input.sb, "community_posts", "id", selector.contentIds);
      communityRows += byId.n;
      if (byId.error) warnings.push(byId.error);
    }
    if (safeMemberIds.length && (scopeAllowsMembers(selectedScopes) || selector.contentIds.length === 0)) {
      const community = await countIn(input.sb, "community_posts", "user_id", safeMemberIds);
      communityRows += community.n;
      if (community.error) warnings.push(community.error);
    }
    if (communityRows > 0) {
      deleteSteps.push({
        id: "db_community_posts",
        domain: "COMMUNITY",
        table: "community_posts",
        filterDescription: "explicit contentIds and/or author memberIds (community_posts scope)",
        estimatedRows: communityRows,
        phase: "DB",
        executableInCutH:
          preset.id === "TEST_CONTENT_ONLY" ||
          preset.id === "TEST_MEMBER_DATA" ||
          preset.id === "FULL_PRELAUNCH_TEST_DATA",
      });
    }
    scopeImpact.push({
      scope: "community_posts",
      estimatedDbRows: communityRows,
      storageObjects: 0,
      authDelete: 0,
      status: communityRows > 0 ? "active" : "idle",
      detail: "community_posts",
    });
  }

  counts.content = tradeRows + communityRows;

  // --- Ads (Delivery only — Feed/Popup NOT_SUPPORTED) ---
  let ads = 0;
  if (scopeAllowsDeliveryAds(selectedScopes)) {
    if (selector.deliveryAdCampaignIds.length) {
      const c = await countIn(input.sb, "delivery_ad_campaigns", "id", selector.deliveryAdCampaignIds);
      ads += c.n;
      if (c.error) warnings.push(c.error);
    }
    if (storeIds.length && scopeAllowsStores(selectedScopes)) {
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
        filterDescription: "explicit campaignIds and/or storeIds (delivery_ads scope)",
        estimatedRows: ads,
        phase: "DB",
        executableInCutH: preset.id === "TEST_ADS_DATA" || preset.id === "TEST_STORE_DATA",
      });
    }
    scopeImpact.push({
      scope: "delivery_ads",
      estimatedDbRows: ads,
      storageObjects: 0,
      authDelete: 0,
      status: ads > 0 ? "active" : "idle",
      detail: "delivery_ad_campaigns",
    });
  }

  // --- Stores / members ---
  if (scopeAllowsStores(selectedScopes)) {
    counts.stores = storeIds.length;
    scopeImpact.push({
      scope: "stores",
      estimatedDbRows: 0,
      storageObjects: 0,
      authDelete: 0,
      status: storeIds.length > 0 ? "active" : "idle",
      detail: "store row delete NOT_SUPPORTED; selector gates ads/storage",
    });
  }
  if (scopeAllowsMembers(selectedScopes)) {
    counts.members = safeMemberIds.length;
    scopeImpact.push({
      scope: "members",
      estimatedDbRows: 0,
      storageObjects: 0,
      authDelete: 0,
      status: safeMemberIds.length > 0 ? "active" : "idle",
      detail: "profiles row delete NOT_SUPPORTED; selector gates content/auth/storage",
    });
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

  // --- STORAGE (CUT I-P0-11): explicit entity-referenced objects only ---
  let storageObjects: Awaited<ReturnType<typeof planPrelaunchResetStorageObjects>>["objects"] = [];
  if (scopeAllowsStorage(selectedScopes)) {
    const storagePlan = await planPrelaunchResetStorageObjects(input.sb, {
      safeMemberIds: scopeAllowsMembers(selectedScopes) ? safeMemberIds : [],
      storeIds: scopeAllowsStores(selectedScopes) ? storeIds : [],
      contentIds:
        scopeAllowsTradeContent(selectedScopes) || scopeAllowsCommunityPosts(selectedScopes)
          ? selector.contentIds
          : [],
      deliveryAdCampaignIds: scopeAllowsDeliveryAds(selectedScopes)
        ? selector.deliveryAdCampaignIds
        : [],
    });
    warnings.push(...storagePlan.warnings);
    storageObjects = storagePlan.objects;
    counts.storage = storageObjects.length;
    if (storageObjects.length > 0) {
      storageSteps.push({
        id: "storage_explicit_objects",
        domain: "STORAGE",
        table: "storage.objects",
        filterDescription: `${storageObjects.length} explicit bucket/path refs from selected entities`,
        estimatedRows: storageObjects.length,
        phase: "STORAGE",
        executableInCutH: true,
      });
    }
    scopeImpact.push({
      scope: "storage",
      estimatedDbRows: 0,
      storageObjects: storageObjects.length,
      authDelete: 0,
      status: storageObjects.length > 0 ? "active" : "idle",
      detail: "entity-referenced objects only",
    });
  } else {
    warnings.push("storage_scope_not_selected");
  }

  // --- AUTH (CUT I-P0-11): explicit safe members only; else PRESERVE/BLOCKED ---
  let authTargets: Awaited<ReturnType<typeof planPrelaunchResetAuthTargets>> = [];
  if (scopeAllowsAuth(selectedScopes) && scopeAllowsMembers(selectedScopes)) {
    authTargets = await planPrelaunchResetAuthTargets(input.sb, {
      safeMemberIds,
      protectedIds,
      preset: preset.id,
      presetSpec: preset,
    });
  } else if (scopeAllowsAuth(selectedScopes) && !scopeAllowsMembers(selectedScopes)) {
    warnings.push("auth_scope_requires_members_scope");
  } else {
    warnings.push("auth_scope_not_selected");
  }
  const authDeleteCount = authTargets.filter((t) => t.action === "DELETE").length;
  const authBlockedCount = authTargets.filter((t) => t.action === "BLOCKED").length;
  if (safeMemberIds.length > 0 && preset.executeAuthPhase === "FORBIDDEN" && scopeAllowsAuth(selectedScopes)) {
    warnings.push("auth_user_delete_forbidden_by_preset");
  }
  if (authBlockedCount > 0) {
    warnings.push(`auth_blocked_targets=${authBlockedCount}`);
  }
  if (scopeAllowsAuth(selectedScopes)) {
    scopeImpact.push({
      scope: "auth",
      estimatedDbRows: 0,
      storageObjects: 0,
      authDelete: authDeleteCount,
      status: authDeleteCount > 0 ? "active" : authBlockedCount > 0 ? "blocked" : "idle",
      detail: "DELETE only for non-protected @manual.local",
    });
  }

  const planId =
    input.planId?.trim() ||
    `pr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  const hashBody = {
    preset: preset.id,
    selectedScopes,
    selector,
    counts,
    deleteSteps: deleteSteps.map((s) => ({ id: s.id, table: s.table, n: s.estimatedRows })),
    storageObjects: storageObjects.map((o) => ({
      bucket: o.bucket,
      path: o.path,
      sourceKind: o.sourceKind,
      sourceId: o.sourceId,
    })),
    authTargets: authTargets.map((t) => ({
      userId: t.userId,
      action: t.action,
      reason: t.reason,
    })),
    blockers: [...blockers].sort(),
  };
  const planHash = hashPlanPayload(hashBody);
  const typedConfirmationPhrase = typedConfirmationForPlan(counts, planHash);

  const executeAllowed =
    envGate.executeAllowed &&
    blockers.length === 0 &&
    (deleteSteps.some((s) => s.executableInCutH && s.estimatedRows > 0) ||
      storageObjects.length > 0 ||
      authDeleteCount > 0);

  if (!envGate.executeAllowed) {
    blockers.push(...envGate.reasons.filter((r) => r.includes("execute") || r.includes("ENABLED")));
  }

  return {
    planId,
    preset: preset.id,
    selector,
    selectedScopes,
    scopeImpact,
    resolved,
    protectedEntities,
    blockedEntities,
    warnings,
    blockers: [...new Set(blockers)],
    counts,
    deleteSteps,
    storageSteps,
    storageObjects,
    authTargets,
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
