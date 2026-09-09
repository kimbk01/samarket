/**
 * DIBAY DATA RESET — BLOCKER CLOSE (B1/B2/B4/B5) targeted contract proofs.
 * No Production delete. Schema/source/policy evidence only.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CHAT_DOMAIN_RESET_POLICY,
  chatDataResetIsDetachOnly,
  chatDataResetUsesSoftTombstone,
  CHAT_HARD_RESET_REQUIRES_EXPLICIT_MODE,
} from "@/lib/admin/data-reset/chat-reset-policy";
import {
  DELIVERY_LAYER_RESET_POLICY,
  DOMAIN_RESET_BOUNDARY,
} from "@/lib/admin/data-reset/domain-reset-boundary";
import {
  FRIEND_LEGACY_TABLE_POLICY,
  FRIEND_RESET_EXECUTE_IMPLEMENTED,
  FRIEND_RESET_PLAN,
  FRIEND_WRITE_SSOT_TABLE,
} from "@/lib/admin/data-reset/friend-reset-policy";
import {
  isOrderHardDeleteAllowed,
  ORDER_HARD_DELETE_BLOCKED,
  ORDER_HARD_DELETE_BY_STATUS,
  orderHardDeleteDisposition,
} from "@/lib/admin/data-reset/order-hard-delete-policy";
import {
  STORE_FK_BOUNDARY_AFTER_B1,
  STORE_ROW_DELETE_WHEN_FINANCE_PRESENT,
} from "@/lib/admin/data-reset/store-finance-fk-boundary";
import { PRELAUNCH_RESET_DOMAIN_INVENTORY } from "@/lib/admin/prelaunch-reset/domain-inventory";
import { PRELAUNCH_RESET_SELECTIVE_MATRIX } from "@/lib/admin/prelaunch-reset/selective-scopes";
import { canHardDelete, ORDER_ENTITY_ACTION_POLICY } from "@/lib/admin/management";
import { STORE_ORDER_STATUS_LIST } from "@/lib/stores/order-status-transitions";

const root = process.cwd();
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

describe("DATA RESET BLOCKER CLOSE B1 store→finance", () => {
  it("migration rewrites finance/gift/order FKs to RESTRICT", () => {
    const sql = read(
      "supabase/migrations/20261213120000_data_reset_blocker_close_b1_b2_fk.sql"
    );
    expect(sql).toContain("gift_certificate_instances");
    expect(sql).toContain("store_cash_ledger");
    expect(sql).toContain("store_economic_point_ledger");
    expect(sql).toContain("business_cash_ledger");
    expect(sql).toContain("sale_fee_obligations");
    expect(sql).toContain("store_orders");
    expect(sql).toContain("'RESTRICT'");
    expect(sql).not.toContain("DROP TRIGGER");
    expect(sql).not.toMatch(/BEFORE DELETE.*DISABLE/i);
  });

  it("boundary contract: finance preserve · store row delete forbidden", () => {
    expect(STORE_ROW_DELETE_WHEN_FINANCE_PRESENT).toBe("FORBIDDEN");
    expect(DELIVERY_LAYER_RESET_POLICY.finance).toBe("PRESERVE");
    expect(DELIVERY_LAYER_RESET_POLICY.gift).toBe("PRESERVE");
    expect(DELIVERY_LAYER_RESET_POLICY.historical).toBe("PRESERVE");
    expect(DELIVERY_LAYER_RESET_POLICY.operating).toBe("DELETE");
    const financeRows = STORE_FK_BOUNDARY_AFTER_B1.filter((r) => r.layer === "finance_gift");
    expect(financeRows.length).toBeGreaterThan(5);
    expect(financeRows.every((r) => r.onDelete === "RESTRICT")).toBe(true);
    expect(DOMAIN_RESET_BOUNDARY.FINANCE.deleteMode).toBe("PRESERVE");
    expect(DOMAIN_RESET_BOUNDARY.DELIVERY.preserve.join(" ")).toMatch(/gift|cash|economic/i);
  });
});

describe("DATA RESET BLOCKER CLOSE B2 order→gift/finance", () => {
  it("order hard delete blocked for every known status", () => {
    expect(ORDER_HARD_DELETE_BLOCKED).toBe(true);
    expect(isOrderHardDeleteAllowed("cancelled")).toBe(false);
    expect(isOrderHardDeleteAllowed("completed")).toBe(false);
    expect(isOrderHardDeleteAllowed("pending")).toBe(false);
    for (const s of STORE_ORDER_STATUS_LIST) {
      expect(ORDER_HARD_DELETE_BY_STATUS[s]).toBe("PRESERVE");
      expect(orderHardDeleteDisposition(s)).toBe("PRESERVE");
    }
    expect(ORDER_ENTITY_ACTION_POLICY.hardDeleteAvailable).toBe(false);
    expect(canHardDelete(ORDER_ENTITY_ACTION_POLICY)).toBe(false);
  });

  it("bulk-delete API returns 410 block · UI gated by policy", () => {
    const api = read("app/api/admin/store-orders/bulk-delete/route.ts");
    expect(api).toContain("ORDER_HARD_DELETE_BLOCKED");
    expect(api).toContain("410");
    expect(api).not.toMatch(/\.from\("store_orders"\)[\s\S]*\.delete\(/);
    expect(api).not.toMatch(/\.from\("store_payments"\)[\s\S]*\.delete\(/);

    const storesUi = read("components/admin/stores/AdminStoreOrdersPage.tsx");
    const deliveryUi = read(
      "components/admin/delivery-orders/DeliveryOrdersDashboardClient.tsx"
    );
    expect(storesUi).toContain("canHardDelete(ORDER_ENTITY_ACTION_POLICY)");
    expect(deliveryUi).toContain("canHardDelete(ORDER_ENTITY_ACTION_POLICY)");

    const sql = read(
      "supabase/migrations/20261213120000_data_reset_blocker_close_b1_b2_fk.sql"
    );
    expect(sql).toContain(
      "__drbc_set_fk_on_delete('gift_certificate_redemptions', 'order_id', 'store_orders', 'RESTRICT')"
    );
    expect(sql).toContain(
      "__drbc_set_fk_on_delete('sale_fee_obligations', 'order_id', 'store_orders', 'RESTRICT')"
    );
  });
});

describe("DATA RESET BLOCKER CLOSE B4 chat policy", () => {
  it("canonical per-type policy: soft / detach / hard-reset-only flag", () => {
    expect(CHAT_DOMAIN_RESET_POLICY.general_direct.productDelete).toBe("soft");
    expect(CHAT_DOMAIN_RESET_POLICY.group.productDelete).toBe("soft");
    expect(CHAT_DOMAIN_RESET_POLICY.group.dataResetDefault).toBe("soft");
    expect(CHAT_DOMAIN_RESET_POLICY.trade.dataResetDefault).toBe("detach");
    expect(CHAT_DOMAIN_RESET_POLICY.store_order.dataResetDefault).toBe("detach");
    expect(CHAT_DOMAIN_RESET_POLICY.trade.listingOrOrderDeleteImpliesRoomDelete).toBe(false);
    expect(CHAT_DOMAIN_RESET_POLICY.store_order.listingOrOrderDeleteImpliesRoomDelete).toBe(
      false
    );
    expect(chatDataResetUsesSoftTombstone("group")).toBe(true);
    expect(chatDataResetUsesSoftTombstone("general_direct")).toBe(true);
    expect(chatDataResetIsDetachOnly("trade")).toBe(true);
    expect(chatDataResetIsDetachOnly("store_order")).toBe(true);
    expect(CHAT_HARD_RESET_REQUIRES_EXPLICIT_MODE).toBe(true);
  });

  it("product group delete stays soft RPC · Prelaunch execute uses soft tombstone", () => {
    const groupSvc = read(
      "lib/community-messenger/group/group-room-delete-service.ts"
    );
    expect(groupSvc).toContain("community_messenger_delete_private_group");

    const exec = read("lib/admin/prelaunch-reset/execute.ts");
    expect(exec).toContain("chatDataResetUsesSoftTombstone");
    expect(exec).toContain("deleted_at");
    expect(exec).not.toMatch(
      /from\("community_messenger_rooms"\)[\s\S]{0,240}\.delete\(/
    );

    const chatScope = PRELAUNCH_RESET_SELECTIVE_MATRIX.find((r) => r.key === "chat")!;
    expect(chatScope.executionSupport).toMatch(/soft tombstone/i);
  });
});

describe("DATA RESET BLOCKER CLOSE B5 friend Reset SSOT", () => {
  it("write SSOT + reset scopes · chat/member preserved", () => {
    expect(FRIEND_WRITE_SSOT_TABLE).toBe("user_social_relations");
    expect(FRIEND_RESET_EXECUTE_IMPLEMENTED).toBe(true);
    expect(FRIEND_RESET_PLAN["friend:user"].matchMode).toBe("either_endpoint");
    expect(FRIEND_RESET_PLAN["friend:all"].matchMode).toBe("all_rows");
    expect(FRIEND_RESET_PLAN["friend:user"].preserve).toContain(
      "community_messenger_rooms"
    );
    expect(FRIEND_RESET_PLAN["friend:user"].preserve).toContain("profiles");
    expect(FRIEND_RESET_PLAN["friend:all"].preserve).toContain("profiles");
    expect(FRIEND_LEGACY_TABLE_POLICY.every((r) => r.runtimeWriter === false)).toBe(true);

    const inv = PRELAUNCH_RESET_DOMAIN_INVENTORY.find((r) => r.id === "FRIEND");
    expect(inv?.tablesHint).toContain("user_social_relations");
    expect(inv?.resetEligibleDefault).toBe(true);

    const friendScope = PRELAUNCH_RESET_SELECTIVE_MATRIX.find((r) => r.key === "friend")!;
    expect(friendScope.support).toBe("NOT_SUPPORTED");
    expect(friendScope.dbOwner).toBe("user_social_relations");

    expect(DOMAIN_RESET_BOUNDARY.FRIEND.root).toBe("user_social_relations");
    expect(DOMAIN_RESET_BOUNDARY.FRIEND.preserve).toContain("community_messenger_rooms");
  });
});

describe("DATA RESET BLOCKER CLOSE — wipe-all still forbidden", () => {
  it("does not wire wipe-all-app-data.sql", () => {
    const inv = read("lib/admin/prelaunch-reset/domain-inventory.ts");
    expect(inv).toContain("wipe-all-app-data.sql");
    expect(inv).toContain("PRELAUNCH_RESET_FORBIDDEN_OPS");
    expect(read("lib/admin/admin-real-operation-cut-h-prelaunch-reset-hard-lock.ts")).toContain(
      "wipeAllAppDataSqlForbiddenInUi"
    );
  });
});
