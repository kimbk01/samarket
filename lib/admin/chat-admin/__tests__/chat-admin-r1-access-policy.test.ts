import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  CHAT_ROOM_HARD_DELETE_CONFIRM_TEXT,
  cmReportTransitionAllowed,
  cmRoomActionAlreadyApplied,
  decideChatContentAccess,
  resolveCmRoomContentDomain,
} from "@/lib/admin/chat-admin/chat-content-access-policy";
import {
  parseChatHardDeleteRequest,
  planChatHardDelete,
} from "@/lib/admin/chat-admin/chat-room-hard-delete-plan";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  const abs = join(ROOT, dir);
  for (const name of readdirSync(abs)) {
    if (name === "__tests__") continue;
    const p = join(abs, name);
    if (statSync(p).isDirectory()) out.push(...routeFiles(join(dir, name)));
    else if (name === "route.ts") out.push(join(dir, name));
  }
  return out;
}

describe("R1-A chat content access decision (ghost)", () => {
  const base = { hasOpenReport: false, linkedStoreOrder: false, isSuperAdmin: false, reason: "" };

  it("unlinked general_direct / group requires super admin", () => {
    for (const domain of ["general_direct", "group"] as const) {
      expect(decideChatContentAccess({ ...base, domain })).toEqual({
        granted: false,
        denial: "super_admin_only",
        ghost: true,
      });
    }
  });

  it("super admin still needs a reason of 10+ characters", () => {
    expect(decideChatContentAccess({ ...base, domain: "general_direct", isSuperAdmin: true, reason: "짧은사유" })).toEqual({
      granted: false,
      denial: "ghost_reason_required",
      ghost: true,
    });
    expect(
      decideChatContentAccess({
        ...base,
        domain: "general_direct",
        isSuperAdmin: true,
        reason: "법적 요청 2026-123 확인 목적",
      })
    ).toEqual({ granted: true, basis: "ghost", ghost: true });
  });

  it("linked report / trade / store order open with chats (no ghost)", () => {
    expect(decideChatContentAccess({ ...base, domain: "group", hasOpenReport: true })).toMatchObject({
      granted: true,
      basis: "linked_report",
      ghost: false,
    });
    expect(decideChatContentAccess({ ...base, domain: "trade" })).toMatchObject({ granted: true, basis: "linked_trade" });
    expect(decideChatContentAccess({ ...base, domain: "store_order" })).toMatchObject({
      granted: true,
      basis: "linked_store_order",
    });
    expect(decideChatContentAccess({ ...base, domain: "general_direct", linkedStoreOrder: true })).toMatchObject({
      granted: true,
      basis: "linked_store_order",
    });
  });

  it("domain resolution prefers chat_domain and falls back conservatively", () => {
    expect(resolveCmRoomContentDomain({ chat_domain: "trade" })).toBe("trade");
    expect(resolveCmRoomContentDomain({ room_type: "direct", direct_key: "store_order:abc" })).toBe("store_order");
    expect(resolveCmRoomContentDomain({ room_type: "direct", direct_key: "trade_item:abc" })).toBe("trade");
    expect(resolveCmRoomContentDomain({ room_type: "private_group" })).toBe("group");
    expect(resolveCmRoomContentDomain({ room_type: "direct", direct_key: "u1:u2" })).toBe("general_direct");
    expect(resolveCmRoomContentDomain({})).toBe("general_direct");
  });
});

describe("R1-A state-conditional moderation rules", () => {
  it("report transitions: closed reports reject every action; reviewing only from received", () => {
    expect(cmReportTransitionAllowed("received", "reviewing")).toBe(true);
    expect(cmReportTransitionAllowed("reviewing", "reviewing")).toBe(false);
    expect(cmReportTransitionAllowed("reviewing", "rejected")).toBe(true);
    for (const closed of ["resolved", "rejected", "sanctioned"]) {
      expect(cmReportTransitionAllowed(closed, "resolved")).toBe(false);
      expect(cmReportTransitionAllowed(closed, "sanction_room_block")).toBe(false);
    }
  });

  it("room action already applied → stale", () => {
    expect(cmRoomActionAlreadyApplied({ room_status: "blocked" }, "block_room")).toBe(true);
    expect(cmRoomActionAlreadyApplied({ room_status: "active" }, "block_room")).toBe(false);
    expect(cmRoomActionAlreadyApplied({ is_readonly: true }, "readonly_on")).toBe(true);
    expect(cmRoomActionAlreadyApplied({ is_readonly: false }, "readonly_off")).toBe(true);
  });
});

describe("R1-A hard delete plan keeps evidence", () => {
  const items = [
    { id: "r1", storage: "chat_rooms" },
    { id: "r2", storage: "chat_rooms" },
    { id: "p1", storage: "product_chats" },
  ];

  it("requires reason (10+) and typed confirmation", () => {
    expect(parseChatHardDeleteRequest({ items })).toEqual({ ok: false, error: "reason_required" });
    expect(parseChatHardDeleteRequest({ items, reason: "법원 명령 2026-1 처리 요청" })).toEqual({
      ok: false,
      error: "confirm_mismatch",
    });
    const ok = parseChatHardDeleteRequest({
      items,
      reason: "법원 명령 2026-1 처리 요청",
      confirmText: CHAT_ROOM_HARD_DELETE_CONFIRM_TEXT,
    });
    expect(ok.ok).toBe(true);
  });

  it("rooms with linked report evidence are skipped, never deleted", () => {
    const plan = planChatHardDelete(items as never, new Set(["r2", "p1"]));
    expect(plan.deleteChatRoomIds).toEqual(["r1"]);
    expect(plan.deleteProductChatIds).toEqual([]);
    expect(plan.skipped.map((s) => s.id)).toEqual(["r2", "p1"]);
  });
});

describe("R1-A permission gate per chat admin route group (source contract)", () => {
  const groups = [
    "app/api/admin/chat",
    "app/api/admin/chats",
    "app/api/admin/community-messenger",
    "app/api/admin/order-chats",
  ];

  it("no chat admin route uses requireAdminApiUser / isRouteAdmin", () => {
    for (const g of groups) {
      const files = routeFiles(g);
      expect(files.length).toBeGreaterThan(0);
      for (const f of files) {
        const src = read(f);
        expect(src, f).not.toContain("requireAdminApiUser");
        expect(src, f).not.toContain("isRouteAdmin");
        expect(
          // 설계 v2 §2-2: 방 유형 게이트(requireChatRoomAdmin*) · 거래 키(TRADE_CHAT_ADMIN_PERMISSION_KEYS) 도 허용.
          // 거래 Admin 설계 v2 O-2: 거래(레거시 chat_rooms·product_chats) 방 라우트는 requireTradeChatAdmin().
          /requireChatAdmin\(\)|requireTradeChatAdmin\(\)|requireAnyAdminPermission\(\["chats", "business"\]\)|requireSuperAdmin\(\)|requireChatRoomAdmin(?:ForRow)?\(|requireAnyAdminPermission\((?:TRADE_CHAT_ADMIN_PERMISSION_KEYS|chatRoomAdminPermissionKeys)/.test(src),
          f
        ).toBe(true);
      }
    }
  });

  it("order chats allow chats OR business; hard delete is super admin only", () => {
    for (const f of routeFiles("app/api/admin/order-chats")) {
      expect(read(f)).toContain('requireAnyAdminPermission(["chats", "business"])');
    }
    const del = read("app/api/admin/chat/rooms/bulk-delete/route.ts");
    expect(del).toContain("requireSuperAdmin()");
    expect(del).not.toMatch(/from\("(reports|moderation_actions|chat_reports)"\)\s*\.delete\(/);
    expect(del).toContain("CHAT_ADMIN_AUDIT_HARD_DELETE");
  });

  it("content GETs audit server-side (not via client ghost calls)", () => {
    for (const f of [
      "app/api/admin/community-messenger/rooms/[id]/route.ts",
      "app/api/admin/chat/rooms/[id]/route.ts",
      "app/api/admin/order-chats/[orderId]/route.ts",
    ]) {
      expect(read(f), f).toContain("appendChatContentViewAudit");
    }
    expect(read("app/api/admin/community-messenger/rooms/[id]/route.ts")).toContain("decideChatContentAccess");
  });

  it("client chat admin components never import server-only chat guards", () => {
    for (const f of [
      "components/admin/community-messenger/AdminCommunityMessengerDetailPage.tsx",
      "components/admin/community-messenger/AdminCommunityMessengerPage.tsx",
      "components/admin/chats/AdminChatActionPanel.tsx",
      "components/admin/chats/AdminChatListPage.tsx",
      "components/admin/chats/AdminChatDetailPage.tsx",
      "components/admin/community/AdminCommunityEngineMeetingsClient.tsx",
    ]) {
      const src = read(f);
      expect(src, f).not.toContain("chat-admin-guards");
      expect(src, f).not.toContain("admin-chat-moderation-cas");
      expect(src, f).not.toContain("lib/audit");
    }
    const policy = read("lib/admin/chat-admin/chat-content-access-policy.ts");
    expect(policy).not.toMatch(/^import /m);
  });
});
