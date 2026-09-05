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
  scopeAllowsChat,
  scopeAllowsCommunityComments,
  scopeAllowsCommunityPosts,
  scopeAllowsCoupons,
  scopeAllowsDeliveryAds,
  scopeAllowsFeedAds,
  scopeAllowsMembers,
  scopeAllowsNotifications,
  scopeAllowsPopup,
  scopeAllowsStorage,
  scopeAllowsStores,
  scopeAllowsSupport,
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
    scopeAllowsNotifications(selectedScopes) ||
    ((scopeAllowsTradeContent(selectedScopes) ||
      scopeAllowsCommunityPosts(selectedScopes) ||
      scopeAllowsCommunityComments(selectedScopes)) &&
      selector.contentIds.length === 0 &&
      selector.commentIds.length === 0);
  const needsStoreIds =
    scopeAllowsStores(selectedScopes) ||
    (scopeAllowsDeliveryAds(selectedScopes) && selector.deliveryAdCampaignIds.length === 0) ||
    (scopeAllowsCoupons(selectedScopes) && selector.couponCampaignIds.length === 0);

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
    selector.deliveryAdCampaignIds.length === 0 &&
    selector.commentIds.length === 0 &&
    selector.supportCaseIds.length === 0 &&
    selector.feedAdCampaignIds.length === 0 &&
    selector.feedAdRequestIds.length === 0 &&
    selector.popupCampaignIds.length === 0 &&
    selector.popupRequestIds.length === 0 &&
    selector.couponCampaignIds.length === 0 &&
    selector.chatRoomIds.length === 0
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

  // --- ARO-RST-COV-001: community_comments (parent posts preserved) ---
  let commentRows = 0;
  if (scopeAllowsCommunityComments(selectedScopes)) {
    const commentIds = selector.commentIds.length
      ? selector.commentIds
      : scopeAllowsCommunityPosts(selectedScopes)
        ? []
        : selector.contentIds;
    if (commentIds.length) {
      const byId = await countIn(input.sb, "community_comments", "id", commentIds);
      commentRows += byId.n;
      if (byId.error) warnings.push(byId.error);
    }
    if (safeMemberIds.length && (scopeAllowsMembers(selectedScopes) || commentIds.length === 0)) {
      const byAuthor = await countIn(input.sb, "community_comments", "user_id", safeMemberIds);
      commentRows += byAuthor.n;
      if (byAuthor.error) warnings.push(byAuthor.error);
    }
    if (commentRows > 0) {
      deleteSteps.push({
        id: "db_community_comments",
        domain: "COMMUNITY",
        table: "community_comments",
        filterDescription: "explicit commentIds and/or author memberIds (posts preserved)",
        estimatedRows: commentRows,
        phase: "DB",
        executableInCutH: true,
      });
    }
    counts.content += commentRows;
    scopeImpact.push({
      scope: "community_comments",
      estimatedDbRows: commentRows,
      storageObjects: 0,
      authDelete: 0,
      status: commentRows > 0 ? "active" : "idle",
      detail: "community_comments; parent posts preserved",
    });
  }

  // --- Ads (Delivery) ---
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

  // --- ARO-RST-COV-001: feed_ads (Point ledger preserved) ---
  let feedAds = 0;
  if (scopeAllowsFeedAds(selectedScopes)) {
    if (selector.feedAdCampaignIds.length) {
      const c = await countIn(input.sb, "feed_ad_campaigns", "id", selector.feedAdCampaignIds);
      feedAds += c.n;
      if (c.error) warnings.push(c.error);
      if (c.n > 0) {
        deleteSteps.push({
          id: "db_feed_ad_campaigns",
          domain: "ADS_FEED",
          table: "feed_ad_campaigns",
          filterDescription: "explicit feedAdCampaignIds; point_ledger preserved",
          estimatedRows: c.n,
          phase: "DB",
          executableInCutH: true,
        });
      }
    }
    if (selector.feedAdRequestIds.length) {
      const c = await countIn(input.sb, "feed_ad_requests", "id", selector.feedAdRequestIds);
      feedAds += c.n;
      if (c.error) warnings.push(c.error);
      if (c.n > 0) {
        deleteSteps.push({
          id: "db_feed_ad_requests",
          domain: "ADS_FEED",
          table: "feed_ad_requests",
          filterDescription: "explicit feedAdRequestIds; holds may CASCADE; point_ledger preserved",
          estimatedRows: c.n,
          phase: "DB",
          executableInCutH: true,
        });
      }
    }
    if (safeMemberIds.length && scopeAllowsMembers(selectedScopes) && selector.feedAdRequestIds.length === 0) {
      const c = await countIn(input.sb, "feed_ad_requests", "user_id", safeMemberIds);
      feedAds += c.n;
      if (c.error) warnings.push(c.error);
      if (c.n > 0) {
        deleteSteps.push({
          id: "db_feed_ad_requests_by_member",
          domain: "ADS_FEED",
          table: "feed_ad_requests",
          filterDescription: "feed_ad_requests by memberIds; point_ledger preserved",
          estimatedRows: c.n,
          phase: "DB",
          executableInCutH: true,
        });
      }
    }
    counts.ads += feedAds;
    scopeImpact.push({
      scope: "feed_ads",
      estimatedDbRows: feedAds,
      storageObjects: 0,
      authDelete: 0,
      status: feedAds > 0 ? "active" : "idle",
      detail: "feed ops rows; Point ledger preserved",
    });
  }

  // --- ARO-RST-COV-001: popup (Cash ledger preserved) ---
  let popupRows = 0;
  if (scopeAllowsPopup(selectedScopes)) {
    if (selector.popupCampaignIds.length) {
      const c = await countIn(input.sb, "platform_popup_campaigns", "id", selector.popupCampaignIds);
      popupRows += c.n;
      if (c.error) warnings.push(c.error);
      if (c.n > 0) {
        deleteSteps.push({
          id: "db_popup_campaigns",
          domain: "POPUP",
          table: "platform_popup_campaigns",
          filterDescription: "explicit popupCampaignIds; business_cash_* preserved",
          estimatedRows: c.n,
          phase: "DB",
          executableInCutH: true,
        });
      }
    }
    if (selector.popupRequestIds.length) {
      const c = await countIn(
        input.sb,
        "platform_popup_owner_requests",
        "id",
        selector.popupRequestIds
      );
      popupRows += c.n;
      if (c.error) warnings.push(c.error);
      if (c.n > 0) {
        deleteSteps.push({
          id: "db_popup_requests",
          domain: "POPUP",
          table: "platform_popup_owner_requests",
          filterDescription: "explicit popupRequestIds; Cash ledger preserved",
          estimatedRows: c.n,
          phase: "DB",
          executableInCutH: true,
        });
      }
    }
    if (storeIds.length && scopeAllowsStores(selectedScopes) && selector.popupRequestIds.length === 0) {
      const c = await countIn(input.sb, "platform_popup_owner_requests", "store_id", storeIds);
      popupRows += c.n;
      if (c.error) warnings.push(c.error);
      if (c.n > 0) {
        deleteSteps.push({
          id: "db_popup_requests_by_store",
          domain: "POPUP",
          table: "platform_popup_owner_requests",
          filterDescription: "popup requests by storeIds; Cash ledger preserved",
          estimatedRows: c.n,
          phase: "DB",
          executableInCutH: true,
        });
      }
    }
    counts.ads += popupRows;
    scopeImpact.push({
      scope: "popup",
      estimatedDbRows: popupRows,
      storageObjects: 0,
      authDelete: 0,
      status: popupRows > 0 ? "active" : "idle",
      detail: "popup ops rows; Cash ledger preserved",
    });
  }

  // --- ARO-RST-COV-001: coupons (unused only) ---
  let couponRows = 0;
  if (scopeAllowsCoupons(selectedScopes)) {
    const couponIds =
      selector.couponCampaignIds.length > 0
        ? selector.couponCampaignIds
        : storeIds.length && scopeAllowsStores(selectedScopes)
          ? []
          : [];
    let candidateIds = [...couponIds];
    if (!candidateIds.length && storeIds.length && scopeAllowsStores(selectedScopes)) {
      const { data: rows, error } = await input.sb
        .from("store_coupon_campaigns")
        .select("id")
        .in("store_id", storeIds);
      if (error) warnings.push(`store_coupon_campaigns:${error.message}`);
      candidateIds = (rows ?? []).map((r) => String((r as { id?: string }).id ?? "")).filter(Boolean);
    }
    if (candidateIds.length) {
      const redeem = await countIn(input.sb, "store_coupon_redemptions", "campaign_id", candidateIds);
      if (redeem.error) warnings.push(redeem.error);
      if (redeem.n > 0) {
        warnings.push(`coupon_redemptions_present=${redeem.n}_blocked_from_delete`);
        financialGuards.push(`coupon_redemptions=${redeem.n}`);
        // Still allow deleting campaigns with zero redemptions — filter by checking each is heavy;
        // block entire coupon step when any redemption exists among candidates (honest PARTIAL).
        scopeImpact.push({
          scope: "coupons",
          estimatedDbRows: 0,
          storageObjects: 0,
          authDelete: 0,
          status: "blocked",
          detail: "redemptions present — unused-only policy blocked this selection",
        });
      } else {
        couponRows = candidateIds.length;
        deleteSteps.push({
          id: "db_coupon_entitlements",
          domain: "COUPON",
          table: "coupon_user_entitlements",
          filterDescription: "entitlements for unused coupon campaigns",
          estimatedRows: await countEq(input.sb, "coupon_user_entitlements", "campaign_id", candidateIds),
          phase: "DB",
          executableInCutH: true,
        });
        deleteSteps.push({
          id: "db_coupon_campaigns",
          domain: "COUPON",
          table: "store_coupon_campaigns",
          filterDescription: "unused store_coupon_campaigns (0 redemptions)",
          estimatedRows: couponRows,
          phase: "DB",
          executableInCutH: true,
        });
        counts.other += couponRows;
        scopeImpact.push({
          scope: "coupons",
          estimatedDbRows: couponRows,
          storageObjects: 0,
          authDelete: 0,
          status: couponRows > 0 ? "active" : "idle",
          detail: "unused coupon campaigns only",
        });
      }
    } else {
      scopeImpact.push({
        scope: "coupons",
        estimatedDbRows: 0,
        storageObjects: 0,
        authDelete: 0,
        status: "idle",
        detail: "no couponCampaignIds / storeIds",
      });
    }
  }

  // --- ARO-RST-COV-001: support ---
  let supportRows = 0;
  if (scopeAllowsSupport(selectedScopes)) {
    if (selector.supportCaseIds.length) {
      const c = await countIn(input.sb, "support_cases", "id", selector.supportCaseIds);
      supportRows += c.n;
      if (c.error) warnings.push(c.error);
    }
    if (safeMemberIds.length && scopeAllowsMembers(selectedScopes)) {
      const c = await countIn(input.sb, "support_cases", "requester_user_id", safeMemberIds);
      supportRows += c.n;
      if (c.error) warnings.push(c.error);
    }
    if (storeIds.length && scopeAllowsStores(selectedScopes)) {
      const c = await countIn(input.sb, "support_cases", "owner_store_id", storeIds);
      supportRows += c.n;
      if (c.error) warnings.push(c.error);
    }
    if (supportRows > 0) {
      deleteSteps.push({
        id: "db_support_cases",
        domain: "SUPPORT",
        table: "support_cases",
        filterDescription: "explicit supportCaseIds and/or member/store scoped cases",
        estimatedRows: supportRows,
        phase: "DB",
        executableInCutH: true,
      });
    }
    counts.messages += supportRows;
    scopeImpact.push({
      scope: "support",
      estimatedDbRows: supportRows,
      storageObjects: 0,
      authDelete: 0,
      status: supportRows > 0 ? "active" : "idle",
      detail: "support_cases (+ messages CASCADE)",
    });
  }

  // --- ARO-RST-COV-001: notifications (member events only) ---
  let notifRows = 0;
  if (scopeAllowsNotifications(selectedScopes)) {
    if (safeMemberIds.length) {
      const c = await countIn(input.sb, "notification_events", "user_id", safeMemberIds);
      notifRows = c.n;
      if (c.error) warnings.push(c.error);
      if (notifRows > 0) {
        deleteSteps.push({
          id: "db_notification_events",
          domain: "NOTIFICATIONS",
          table: "notification_events",
          filterDescription: "notification_events for explicit memberIds; devices preserved",
          estimatedRows: notifRows,
          phase: "DB",
          executableInCutH: true,
        });
      }
    } else {
      warnings.push("notifications_scope_requires_memberIds");
    }
    counts.notifications = notifRows;
    scopeImpact.push({
      scope: "notifications",
      estimatedDbRows: notifRows,
      storageObjects: 0,
      authDelete: 0,
      status: notifRows > 0 ? "active" : "idle",
      detail: "member notification_events only",
    });
  }

  // --- ARO-RST-COV-001: chat PARTIAL (general_direct|group only) ---
  let chatRows = 0;
  if (scopeAllowsChat(selectedScopes)) {
    if (selector.chatRoomIds.length) {
      const { data: rooms, error } = await input.sb
        .from("community_messenger_rooms")
        .select("id, chat_domain, domain_identity_key")
        .in("id", selector.chatRoomIds);
      if (error) warnings.push(`community_messenger_rooms:${error.message}`);
      const safeIds: string[] = [];
      for (const row of rooms ?? []) {
        const r = row as {
          id?: string;
          chat_domain?: string;
          domain_identity_key?: string | null;
        };
        const domain = String(r.chat_domain ?? "");
        const identity = String(r.domain_identity_key ?? "");
        const protectedChat =
          domain === "trade" ||
          domain === "store_order" ||
          identity.startsWith("trade_") ||
          identity.startsWith("store_order:");
        if (protectedChat) {
          blockedEntities.push({
            kind: "blocked",
            id: String(r.id ?? ""),
            label: "chat_room",
            reason: "protected_transaction_or_order_chat",
          });
          warnings.push(`chat_room_protected:${r.id}`);
          continue;
        }
        if (domain === "general_direct" || domain === "group") {
          safeIds.push(String(r.id));
        } else {
          warnings.push(`chat_room_unknown_domain_skipped:${r.id}:${domain}`);
        }
      }
      chatRows = safeIds.length;
      if (chatRows > 0) {
        deleteSteps.push({
          id: "db_safe_chat_rooms",
          domain: "MESSENGER",
          table: "community_messenger_rooms",
          filterDescription: `safe chat rooms (${safeIds.length}); trade/order preserved`,
          estimatedRows: chatRows,
          phase: "DB",
          executableInCutH: true,
        });
        // Bind safe ids into selector for executor via resolved refs
        for (const id of safeIds) {
          resolved.push({ kind: "content", id, label: "safe_chat_room" });
        }
      }
    } else {
      warnings.push("chat_scope_requires_explicit_chatRoomIds");
    }
    counts.messages += chatRows;
    scopeImpact.push({
      scope: "chat",
      estimatedDbRows: chatRows,
      storageObjects: 0,
      authDelete: 0,
      status: chatRows > 0 ? "active" : "idle",
      detail: "general_direct|group only; trade/order protected",
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
      detail: "store row delete NOT_SUPPORTED; selector gates ads/coupons/support/storage",
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
      detail: "profiles row delete NOT_SUPPORTED; selector gates content/auth/notifications/support",
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
