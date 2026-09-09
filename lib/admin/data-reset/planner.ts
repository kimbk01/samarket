/**
 * buildDomainResetPlan — single authority for PREVIEW and EXECUTE.
 */

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  chatDataResetIsDetachOnly,
  chatDataResetUsesSoftTombstone,
  CHAT_DOMAINS,
  type ChatDomain,
} from "@/lib/admin/data-reset/chat-reset-policy";
import { DELIVERY_LAYER_RESET_POLICY } from "@/lib/admin/data-reset/domain-reset-boundary";
import { FRIEND_RESET_PLAN } from "@/lib/admin/data-reset/friend-reset-policy";
import { ORDER_HARD_DELETE_BLOCKED } from "@/lib/admin/data-reset/order-hard-delete-policy";
import { STORE_ROW_DELETE_WHEN_FINANCE_PRESENT } from "@/lib/admin/data-reset/store-finance-fk-boundary";
import {
  countFriendEitherEndpoint,
  countTable,
} from "@/lib/admin/data-reset/count-helpers";
import { resolveDataResetEnvGate } from "@/lib/admin/data-reset/environment";
import {
  DATA_RESET_B1B2_MIGRATION,
  DATA_RESET_DOMAINS,
  DATA_RESET_PLAN_TTL_MS,
  DATA_RESET_SCOPES,
  hashDataResetPayload,
  type DataResetDomain,
  type DataResetMode,
  type DataResetPlan,
  type DataResetRequest,
  type DataResetRiskLevel,
  type DataResetScope,
  type DataResetTableAction,
} from "@/lib/admin/data-reset/types";
import { loadProtectedAdminUserIds } from "@/lib/admin/prelaunch-reset/protection";

function phraseFor(domain: DataResetDomain, risk: DataResetRiskLevel, hash: string): string {
  if (risk === "CRITICAL") return `FULL SERVICE RESET ${hash.slice(0, 8)}`;
  if (domain === "finance") return `FINANCE HARD RESET ${hash.slice(0, 8)}`;
  return `${domain.toUpperCase()} RESET ${hash.slice(0, 8)}`;
}

function riskFor(domain: DataResetDomain, scope: DataResetScope): DataResetRiskLevel {
  if (domain === "full" || domain === "finance") return "CRITICAL";
  if (domain === "member" && (scope === "all" || scope === "user")) return "HIGH";
  if (scope === "all") return "HIGH";
  if (scope === "type" || scope === "user") return "MEDIUM";
  return "LOW";
}

function confirmLevel(risk: DataResetRiskLevel): 1 | 2 | 3 {
  if (risk === "CRITICAL" || risk === "HIGH") return 3;
  if (risk === "MEDIUM") return 2;
  return 1;
}

function emptyPlanBase(
  input: {
    actorUserId: string;
    domain: DataResetDomain;
    scope: DataResetScope;
    entityId: string | null;
    subtype: string | null;
  },
  env: ReturnType<typeof resolveDataResetEnvGate>
): Omit<DataResetPlan, "planHash" | "typedConfirmationPhrase"> & {
  planHash?: string;
  typedConfirmationPhrase?: string;
} {
  const createdAt = new Date().toISOString();
  return {
    planId: randomUUID(),
    domain: input.domain,
    scope: input.scope,
    entityId: input.entityId,
    subtype: input.subtype,
    targetLabel: `${input.domain}/${input.scope}${input.entityId ? `:${input.entityId}` : ""}${
      input.subtype ? `:${input.subtype}` : ""
    }`,
    delete: [],
    softDelete: [],
    detach: [],
    resetState: [],
    preserve: [],
    blocked: [],
    storage: [],
    derivedState: [],
    estimatedCounts: {},
    deleteCounts: {},
    softDeleteCounts: {},
    detachCounts: {},
    storageCount: 0,
    preserveSummary: [],
    warnings: [],
    blockers: [],
    blockedReason: null,
    riskLevel: riskFor(input.domain, input.scope),
    confirmationLevel: 1,
    executeAllowed: false,
    environment: env.tier,
    createdAt,
    createdBy: input.actorUserId,
    expiresAt: new Date(Date.parse(createdAt) + DATA_RESET_PLAN_TTL_MS).toISOString(),
    clientSessionInvalidationRequired: true,
    schemaGuard: {
      b1b2MigrationFile: DATA_RESET_B1B2_MIGRATION,
      productionFkAssumeRestrict: false,
      note: "Do not assume Production FK RESTRICT until migration applied; never open store/order hard wipe on Production.",
    },
  };
}

function finalizePlan(
  draft: ReturnType<typeof emptyPlanBase>,
  env: ReturnType<typeof resolveDataResetEnvGate>
): DataResetPlan {
  draft.riskLevel = riskFor(draft.domain, draft.scope);
  if (draft.blockers.length) {
    draft.riskLevel = draft.domain === "full" || draft.domain === "finance" ? "CRITICAL" : draft.riskLevel;
  }
  draft.confirmationLevel = confirmLevel(draft.riskLevel);

  const hashPayload = {
    domain: draft.domain,
    scope: draft.scope,
    entityId: draft.entityId,
    subtype: draft.subtype,
    delete: draft.delete,
    softDelete: draft.softDelete,
    detach: draft.detach,
    resetState: draft.resetState,
    storage: draft.storage,
    estimatedCounts: draft.estimatedCounts,
    blockers: draft.blockers,
    preserve: draft.preserve,
  };
  const planHash = hashDataResetPayload(hashPayload);
  const typedConfirmationPhrase = phraseFor(draft.domain, draft.riskLevel, planHash);

  const executeAllowed =
    env.executeAllowed &&
    draft.blockers.length === 0 &&
    (draft.delete.length > 0 || draft.softDelete.length > 0 || draft.detach.length > 0);

  return {
    ...(draft as Omit<DataResetPlan, "planHash" | "typedConfirmationPhrase" | "executeAllowed">),
    planHash,
    typedConfirmationPhrase,
    executeAllowed,
    confirmationLevel: draft.confirmationLevel,
    riskLevel: draft.riskLevel,
  };
}

function pushCount(
  draft: ReturnType<typeof emptyPlanBase>,
  key: string,
  n: number,
  bucket: "delete" | "soft" | "detach" = "delete"
) {
  draft.estimatedCounts[key] = (draft.estimatedCounts[key] ?? 0) + n;
  if (bucket === "delete") draft.deleteCounts[key] = (draft.deleteCounts[key] ?? 0) + n;
  if (bucket === "soft") draft.softDeleteCounts[key] = (draft.softDeleteCounts[key] ?? 0) + n;
  if (bucket === "detach") draft.detachCounts[key] = (draft.detachCounts[key] ?? 0) + n;
}

function act(
  table: string,
  action: DataResetTableAction["action"],
  filterDescription: string,
  estimatedRows: number,
  phase: DataResetTableAction["phase"] = "DB"
): DataResetTableAction {
  return { table, action, filterDescription, estimatedRows, phase };
}

async function planCommunity(
  sb: SupabaseClient,
  draft: ReturnType<typeof emptyPlanBase>
): Promise<void> {
  draft.preserve = [
    "profiles",
    "auth.users",
    "posts",
    "community_messenger_rooms",
    "user_social_relations",
    "stores",
    "store_orders",
    "finance ledgers",
  ];
  draft.preserveSummary = draft.preserve;
  draft.derivedState = ["community like/comment counters (via cascade/delete)"];

  if (draft.scope === "single") {
    if (!draft.entityId) {
      draft.blockers.push("community_single_requires_entityId");
      return;
    }
    const post = await countTable(sb, "community_posts", {
      column: "id",
      value: draft.entityId,
    });
    const comments = await countTable(sb, "community_comments", {
      column: "post_id",
      value: draft.entityId,
    });
    const likes = await countTable(sb, "community_post_likes", {
      column: "post_id",
      value: draft.entityId,
    });
    const saves = await countTable(sb, "community_post_saves", {
      column: "post_id",
      value: draft.entityId,
    });
    for (const w of [post.warning, comments.warning, likes.warning, saves.warning]) {
      if (w) draft.warnings.push(w);
    }
    pushCount(draft, "community_posts", post.n);
    pushCount(draft, "community_comments", comments.n);
    pushCount(draft, "community_post_likes", likes.n);
    pushCount(draft, "community_post_saves", saves.n);
    draft.delete.push(
      act("community_posts", "DELETE", `id=${draft.entityId}`, post.n)
    );
    draft.storage.push(
      act(
        "storage.objects",
        "DELETE",
        `entity-owned post-images for community_posts:${draft.entityId} (path-derived; shared bucket)`,
        0,
        "STORAGE"
      )
    );
    draft.warnings.push("storage_cleanup_partial_shared_post_images_bucket");
    return;
  }

  if (draft.scope !== "all") {
    draft.blockers.push("community_scope_unsupported");
    return;
  }

  const posts = await countTable(sb, "community_posts");
  const comments = await countTable(sb, "community_comments");
  const likes = await countTable(sb, "community_post_likes");
  const saves = await countTable(sb, "community_post_saves");
  for (const w of [posts.warning, comments.warning, likes.warning, saves.warning]) {
    if (w) draft.warnings.push(w);
  }
  pushCount(draft, "community_posts", posts.n);
  pushCount(draft, "community_comments", comments.n);
  pushCount(draft, "community_post_likes", likes.n);
  pushCount(draft, "community_post_saves", saves.n);
  draft.delete.push(act("community_posts", "DELETE", "all rows (children CASCADE)", posts.n));
  draft.warnings.push("storage_cleanup_partial_shared_post_images_bucket");
}

async function planMarket(
  sb: SupabaseClient,
  draft: ReturnType<typeof emptyPlanBase>
): Promise<void> {
  draft.preserve = [
    "profiles",
    "community_posts",
    "community_messenger_rooms",
    "user_social_relations",
    "finance ledgers",
  ];
  draft.preserveSummary = [
    ...draft.preserve,
    "trade rooms DETACH only (B4 — listing delete ≠ room delete)",
  ];
  draft.derivedState = ["trade listing counters"];

  if (draft.scope === "single") {
    if (!draft.entityId) {
      draft.blockers.push("market_single_requires_entityId");
      return;
    }
    const posts = await countTable(sb, "posts", { column: "id", value: draft.entityId });
    if (posts.warning) draft.warnings.push(posts.warning);
    pushCount(draft, "posts", posts.n);
    draft.delete.push(act("posts", "DELETE", `id=${draft.entityId}`, posts.n));
    draft.detach.push(
      act(
        "community_messenger_rooms",
        "DETACH",
        "trade rooms preserved; bridge SET NULL if present",
        0
      )
    );
    draft.warnings.push("storage_cleanup_partial_shared_post_images_bucket");
    return;
  }

  if (draft.scope !== "all") {
    draft.blockers.push("market_scope_unsupported");
    return;
  }

  const posts = await countTable(sb, "posts");
  if (posts.warning) draft.warnings.push(posts.warning);
  pushCount(draft, "posts", posts.n);
  draft.delete.push(act("posts", "DELETE", "all market listings", posts.n));
  draft.detach.push(
    act("community_messenger_rooms", "DETACH", "trade chat_domain rooms preserved", 0)
  );
  draft.warnings.push("storage_cleanup_partial_shared_post_images_bucket");
}

async function planDelivery(
  sb: SupabaseClient,
  draft: ReturnType<typeof emptyPlanBase>
): Promise<void> {
  draft.preserve = [
    "stores (identity)",
    "store_orders",
    "store_settlements",
    "store_payments",
    "gift_certificate_*",
    "business_cash_*",
    "store_economic_point_*",
    "store_cash_*",
    "sale_fee_obligations",
  ];
  draft.preserveSummary = [
    `operating=${DELIVERY_LAYER_RESET_POLICY.operating}`,
    `historical=${DELIVERY_LAYER_RESET_POLICY.historical}`,
    `finance=${DELIVERY_LAYER_RESET_POLICY.finance}`,
    `gift=${DELIVERY_LAYER_RESET_POLICY.gift}`,
    `store_row_delete=${STORE_ROW_DELETE_WHEN_FINANCE_PRESENT}`,
    `order_hard_delete_blocked=${ORDER_HARD_DELETE_BLOCKED}`,
  ];

  const subtype = (draft.subtype ?? "operating").trim();

  if (draft.scope === "single" && subtype === "product") {
    if (!draft.entityId) {
      draft.blockers.push("delivery_product_requires_entityId");
      return;
    }
    const products = await countTable(sb, "store_products", {
      column: "id",
      value: draft.entityId,
    });
    if (products.warning) draft.warnings.push(products.warning);
    pushCount(draft, "store_products", products.n);
    draft.delete.push(act("store_products", "DELETE", `id=${draft.entityId}`, products.n));
    return;
  }

  if (draft.scope === "single" && subtype === "store") {
    draft.blocked.push("stores_row_hard_delete");
    draft.blockers.push("store_row_delete_forbidden_use_operating_reset");
    draft.blockedReason = "STORE_ROW_DELETE_FORBIDDEN_WHEN_FINANCE_OR_ORDERS";
    const products = draft.entityId
      ? await countTable(sb, "store_products", { column: "store_id", value: draft.entityId })
      : { n: 0, warning: "store_id_required" };
    if (products.warning) draft.warnings.push(products.warning);
    pushCount(draft, "store_products", products.n);
    if (draft.entityId) {
      draft.delete.push(
        act("store_products", "DELETE", `store_id=${draft.entityId} operating only`, products.n)
      );
      draft.blockers.length = 0; // operating wipe under store id is allowed
      draft.blockedReason = null;
      draft.warnings.push("stores_row_not_deleted_identity_preserved");
    }
    return;
  }

  if (draft.scope === "all" || (draft.scope === "type" && subtype === "operating")) {
    const products = await countTable(sb, "store_products");
    if (products.warning) draft.warnings.push(products.warning);
    pushCount(draft, "store_products", products.n);
    draft.delete.push(act("store_products", "DELETE", "all operating products", products.n));
    draft.warnings.push("stores_row_not_deleted");
    draft.warnings.push("orders_finance_gift_preserved");
    return;
  }

  draft.blockers.push("delivery_scope_unsupported");
}

async function planChat(
  sb: SupabaseClient,
  draft: ReturnType<typeof emptyPlanBase>
): Promise<void> {
  draft.preserve = [
    "profiles",
    "posts",
    "community_posts",
    "stores",
    "store_orders",
    "user_social_relations",
    "finance",
  ];
  draft.preserveSummary = draft.preserve;
  draft.derivedState = ["hub_badge_user_unread_counters", "room last_message (soft)"];

  if (draft.scope === "single") {
    if (!draft.entityId) {
      draft.blockers.push("chat_room_requires_entityId");
      return;
    }
    const { data, error } = await sb
      .from("community_messenger_rooms")
      .select("id, chat_domain, deleted_at")
      .eq("id", draft.entityId)
      .maybeSingle();
    if (error) draft.warnings.push(error.message);
    const domain = String((data as { chat_domain?: string } | null)?.chat_domain ?? "");
    const deletedAt = (data as { deleted_at?: string | null } | null)?.deleted_at;
    if (!data) {
      draft.blockers.push("chat_room_not_found");
      return;
    }
    if (chatDataResetIsDetachOnly(domain)) {
      draft.detach.push(
        act(
          "community_messenger_rooms",
          "DETACH",
          `${domain} room preserved (B4 detach-only)`,
          1
        )
      );
      pushCount(draft, "community_messenger_rooms_detach", 1, "detach");
      draft.warnings.push("trade_or_store_order_room_not_hard_deleted");
      return;
    }
    if (chatDataResetUsesSoftTombstone(domain)) {
      const n = deletedAt ? 0 : 1;
      draft.softDelete.push(
        act("community_messenger_rooms", "SOFT", `deleted_at tombstone id=${draft.entityId}`, n)
      );
      pushCount(draft, "community_messenger_rooms_soft", n, "soft");
      return;
    }
    draft.blockers.push("chat_domain_unsupported");
    return;
  }

  if (draft.scope === "type") {
    const subtype = String(draft.subtype ?? "").trim() as ChatDomain;
    if (!(CHAT_DOMAINS as readonly string[]).includes(subtype)) {
      draft.blockers.push("chat_type_requires_subtype");
      return;
    }
    if (chatDataResetIsDetachOnly(subtype)) {
      const rooms = await countTable(sb, "community_messenger_rooms", {
        column: "chat_domain",
        value: subtype,
      });
      if (rooms.warning) draft.warnings.push(rooms.warning);
      draft.detach.push(
        act("community_messenger_rooms", "DETACH", `${subtype} preserved (detach-only)`, rooms.n)
      );
      pushCount(draft, `rooms_${subtype}_detach`, rooms.n, "detach");
      return;
    }
    const rooms = await countTable(sb, "community_messenger_rooms", {
      column: "chat_domain",
      value: subtype,
    });
    if (rooms.warning) draft.warnings.push(rooms.warning);
    // approximate active (not already soft-deleted) — count all then warn
    draft.softDelete.push(
      act(
        "community_messenger_rooms",
        "SOFT",
        `chat_domain=${subtype} AND deleted_at IS NULL`,
        rooms.n
      )
    );
    pushCount(draft, `rooms_${subtype}_soft`, rooms.n, "soft");
    return;
  }

  if (draft.scope === "all") {
    for (const d of ["general_direct", "group"] as const) {
      const rooms = await countTable(sb, "community_messenger_rooms", {
        column: "chat_domain",
        value: d,
      });
      if (rooms.warning) draft.warnings.push(rooms.warning);
      draft.softDelete.push(
        act("community_messenger_rooms", "SOFT", `chat_domain=${d} soft tombstone`, rooms.n)
      );
      pushCount(draft, `rooms_${d}_soft`, rooms.n, "soft");
    }
    for (const d of ["trade", "store_order"] as const) {
      const rooms = await countTable(sb, "community_messenger_rooms", {
        column: "chat_domain",
        value: d,
      });
      if (rooms.warning) draft.warnings.push(rooms.warning);
      draft.detach.push(
        act("community_messenger_rooms", "DETACH", `${d} preserved`, rooms.n)
      );
      pushCount(draft, `rooms_${d}_detach`, rooms.n, "detach");
    }
    return;
  }

  draft.blockers.push("chat_scope_unsupported");
}

async function planFriend(
  sb: SupabaseClient,
  draft: ReturnType<typeof emptyPlanBase>
): Promise<void> {
  const preserve = FRIEND_RESET_PLAN["friend:user"].preserve;
  draft.preserve = [...preserve];
  draft.preserveSummary = [...preserve];

  if (draft.scope === "user") {
    if (!draft.entityId) {
      draft.blockers.push("friend_user_requires_entityId");
      return;
    }
    const rel = await countFriendEitherEndpoint(sb, draft.entityId);
    if (rel.warning) draft.warnings.push(rel.warning);
    pushCount(draft, "user_social_relations", rel.n);
    draft.delete.push(
      act(
        "user_social_relations",
        "DELETE",
        `either_endpoint user=${draft.entityId}`,
        rel.n
      )
    );
    return;
  }

  if (draft.scope === "all") {
    const rel = await countTable(sb, "user_social_relations");
    if (rel.warning) draft.warnings.push(rel.warning);
    pushCount(draft, "user_social_relations", rel.n);
    draft.delete.push(act("user_social_relations", "DELETE", "all friend/block rows", rel.n));
    return;
  }

  draft.blockers.push("friend_scope_unsupported");
}

async function planMember(
  sb: SupabaseClient,
  draft: ReturnType<typeof emptyPlanBase>,
  protectedIds: Set<string>
): Promise<void> {
  const subtype = (draft.subtype ?? "app_data").trim();
  draft.preserve = ["admin_memberships", "audit_logs", "finance ledgers", "gift value"];
  draft.preserveSummary = draft.preserve;

  if (subtype === "auth_delete" || subtype === "full_user") {
    draft.blocked.push("auth_account_delete");
    draft.blockers.push("member_auth_delete_blocked_this_cut");
    draft.blockedReason = "AUTH_ACCOUNT_DELETE_BLOCKED";
    draft.warnings.push("use_existing_admin_user_deletion_queue_not_data_reset");
    return;
  }

  if (draft.scope === "user" || draft.scope === "single") {
    if (!draft.entityId) {
      draft.blockers.push("member_requires_entityId");
      return;
    }
    if (protectedIds.has(draft.entityId)) {
      draft.blockers.push("member_is_protected_admin");
      draft.blockedReason = "ROOT_ADMIN_PRESERVE";
      return;
    }
    const community = await countTable(sb, "community_posts", {
      column: "user_id",
      value: draft.entityId,
    });
    const market = await countTable(sb, "posts", {
      column: "user_id",
      value: draft.entityId,
    });
    const friends = await countFriendEitherEndpoint(sb, draft.entityId);
    for (const w of [community.warning, market.warning, friends.warning]) {
      if (w) draft.warnings.push(w);
    }
    pushCount(draft, "community_posts", community.n);
    pushCount(draft, "posts", market.n);
    pushCount(draft, "user_social_relations", friends.n);
    draft.delete.push(
      act("community_posts", "DELETE", `user_id=${draft.entityId}`, community.n),
      act("posts", "DELETE", `user_id=${draft.entityId}`, market.n),
      act("user_social_relations", "DELETE", `either_endpoint=${draft.entityId}`, friends.n)
    );
    draft.warnings.push("auth_users_and_profiles_row_preserved");
    draft.warnings.push("orders_finance_chat_rooms_preserved");
    return;
  }

  if (draft.scope === "all") {
    draft.blockers.push("member_all_requires_explicit_per_user_or_future_cut");
    draft.blockedReason = "MEMBER_ALL_BLOCKED_SAFETY";
    const profiles = await countTable(sb, "profiles");
    if (profiles.warning) draft.warnings.push(profiles.warning);
    pushCount(draft, "profiles_observed", profiles.n);
    draft.preserveSummary.push("profiles counted only — not deleted");
    return;
  }

  draft.blockers.push("member_scope_unsupported");
}

async function planFinance(sb: SupabaseClient, draft: ReturnType<typeof emptyPlanBase>): Promise<void> {
  draft.blocked.push("financial_hard_reset");
  draft.blockers.push("finance_execute_blocked_default");
  draft.blockedReason = "FINANCIAL_HARD_RESET_PREVIEW_ONLY";
  draft.preserve = [
    "point_ledger",
    "business_cash_ledger",
    "store_economic_point_ledger",
    "store_cash_ledger",
    "gift_certificate_instances",
    "store_settlements",
  ];
  draft.preserveSummary = ["FINANCE PRESERVE — immutable ledger locks retained"];
  const point = await countTable(sb, "point_ledger");
  const cash = await countTable(sb, "business_cash_ledger");
  const coin = await countTable(sb, "store_economic_point_ledger");
  const gift = await countTable(sb, "gift_certificate_instances");
  for (const w of [point.warning, cash.warning, coin.warning, gift.warning]) {
    if (w) draft.warnings.push(w);
  }
  draft.estimatedCounts.point_ledger = point.n;
  draft.estimatedCounts.business_cash_ledger = cash.n;
  draft.estimatedCounts.store_economic_point_ledger = coin.n;
  draft.estimatedCounts.gift_certificate_instances = gift.n;
}

async function planFull(
  sb: SupabaseClient,
  draft: ReturnType<typeof emptyPlanBase>,
  actorUserId: string
): Promise<void> {
  draft.preserve = [
    "finance ledgers",
    "settlements",
    "payments",
    "gift value",
    "root admin / admin_memberships",
    "audit_logs",
    "system seeds",
    "stores identity rows",
  ];
  draft.preserveSummary = [
    "FULL ≠ FINANCIAL HARD RESET",
    "FULL ≠ AUTH WIPE",
    "FULL ≠ TRUNCATE",
    ...draft.preserve,
  ];

  // Compose operational domains into one plan (counts additive).
  const parts: Array<{ domain: DataResetDomain; scope: DataResetScope; subtype?: string }> = [
    { domain: "community", scope: "all" },
    { domain: "market", scope: "all" },
    { domain: "delivery", scope: "all", subtype: "operating" },
    { domain: "chat", scope: "all" },
    { domain: "friend", scope: "all" },
  ];

  for (const part of parts) {
    const child = await buildDomainResetPlan({
      sb,
      actorUserId,
      request: {
        domain: part.domain,
        scope: part.scope,
        subtype: part.subtype,
        mode: "preview",
      },
    });
    draft.delete.push(...child.delete);
    draft.softDelete.push(...child.softDelete);
    draft.detach.push(...child.detach);
    draft.resetState.push(...child.resetState);
    draft.storage.push(...child.storage);
    draft.warnings.push(...child.warnings.map((w) => `${part.domain}:${w}`));
    for (const [k, v] of Object.entries(child.estimatedCounts)) {
      draft.estimatedCounts[`${part.domain}.${k}`] = v;
    }
    for (const [k, v] of Object.entries(child.deleteCounts)) {
      draft.deleteCounts[`${part.domain}.${k}`] = v;
    }
    for (const [k, v] of Object.entries(child.softDeleteCounts)) {
      draft.softDeleteCounts[`${part.domain}.${k}`] = v;
    }
    for (const [k, v] of Object.entries(child.detachCounts)) {
      draft.detachCounts[`${part.domain}.${k}`] = v;
    }
  }

  draft.blocked.push("finance_hard_reset");
  draft.blocked.push("auth_users_wipe");
  draft.blocked.push("wipe_all_app_data_sql");
  draft.warnings.push("member_auth_not_included");
  draft.clientSessionInvalidationRequired = true;
}

export type BuildDomainResetPlanInput = {
  sb: SupabaseClient;
  actorUserId: string;
  request: Omit<DataResetRequest, "mode"> & { mode?: DataResetMode };
  planId?: string;
};

export async function buildDomainResetPlan(
  input: BuildDomainResetPlanInput
): Promise<DataResetPlan> {
  const env = resolveDataResetEnvGate();
  const domain = String(input.request.domain ?? "").trim() as DataResetDomain;
  const scope = String(input.request.scope ?? "").trim() as DataResetScope;

  const draft = emptyPlanBase(
    {
      actorUserId: input.actorUserId,
      domain: (DATA_RESET_DOMAINS as readonly string[]).includes(domain) ? domain : "community",
      scope: (DATA_RESET_SCOPES as readonly string[]).includes(scope) ? scope : "all",
      entityId: input.request.entityId?.trim() || null,
      subtype: input.request.subtype?.trim() || null,
    },
    env
  );
  if (input.planId) draft.planId = input.planId;

  if (!(DATA_RESET_DOMAINS as readonly string[]).includes(domain)) {
    draft.blockers.push("invalid_domain");
    return finalizePlan(draft, env);
  }
  if (!(DATA_RESET_SCOPES as readonly string[]).includes(scope)) {
    draft.blockers.push("invalid_scope");
    return finalizePlan(draft, env);
  }

  if (!env.previewAllowed && input.request.mode === "preview") {
    draft.blockers.push(...env.reasons);
    draft.blockedReason = "PREVIEW_FORBIDDEN";
  }

  const { protectedIds } = await loadProtectedAdminUserIds(input.sb, input.actorUserId);

  switch (domain) {
    case "community":
      await planCommunity(input.sb, draft);
      break;
    case "market":
      await planMarket(input.sb, draft);
      break;
    case "delivery":
      await planDelivery(input.sb, draft);
      break;
    case "chat":
      await planChat(input.sb, draft);
      break;
    case "friend":
      await planFriend(input.sb, draft);
      break;
    case "member":
      await planMember(input.sb, draft, protectedIds);
      break;
    case "finance":
      await planFinance(input.sb, draft);
      break;
    case "full":
      await planFull(input.sb, draft, input.actorUserId);
      break;
    default:
      draft.blockers.push("domain_unhandled");
  }

  // Storage aggregate
  draft.storageCount = draft.storage.reduce((a, s) => a + s.estimatedRows, 0);

  // Production: never execute
  if (env.tier === "production") {
    draft.warnings.push("production_execute_forbidden");
  }

  return finalizePlan(draft, env);
}

export async function revalidateDomainResetPlan(input: {
  sb: SupabaseClient;
  actorUserId: string;
  request: Omit<DataResetRequest, "mode">;
  planId: string;
  expectedHash: string;
}): Promise<{ ok: true; plan: DataResetPlan } | { ok: false; reason: string; plan: DataResetPlan }> {
  const plan = await buildDomainResetPlan({
    sb: input.sb,
    actorUserId: input.actorUserId,
    request: input.request,
    planId: input.planId,
  });
  if (plan.planHash !== input.expectedHash) {
    return { ok: false, reason: "plan_hash_mismatch_preview_required_again", plan };
  }
  const exp = Date.parse(plan.expiresAt);
  if (Number.isFinite(exp) && Date.now() > exp) {
    return { ok: false, reason: "plan_expired_preview_required_again", plan };
  }
  return { ok: true, plan };
}

export function confirmationMatchesPlan(plan: DataResetPlan, typed: string): boolean {
  return typed.trim() === plan.typedConfirmationPhrase;
}
