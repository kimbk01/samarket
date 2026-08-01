/**
 * Phase 2-2 — Badge Writer Authority contracts (static + inventory).
 * DO NOT: delete legacy · change Native Badge impl · Bell · RoomUnread
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertBadgeWriterAuthorityInventory,
  assertExplainMatchesProjection,
  BADGE_WRITER_AUTHORITY,
  listBadgeSurfaceWriterInventory,
} from "@/lib/notifications/badge-writer-authority";
import { buildBadgeExplainMatrix } from "@/lib/notifications/badge-explain-matrix";

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

function productTsFiles(): string[] {
  const roots = ["lib", "components", "app"];
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === "__tests__" || e.name === ".qa-logs") continue;
        walk(p);
      } else if (/\.(ts|tsx)$/.test(e.name) && !e.name.includes(".test.")) {
        out.push(p);
      }
    }
  };
  for (const r of roots) walk(path.join(process.cwd(), r));
  return out;
}

describe("Phase 2-2 Badge Writer Authority SSOT", () => {
  it("inventory has exactly one authority writer per required surface", () => {
    const inv = assertBadgeWriterAuthorityInventory();
    expect(inv).toEqual({ ok: true, errors: [] });
    expect(listBadgeSurfaceWriterInventory().every((r) => r.authorityWriterCount === 1)).toBe(true);
    expect(BADGE_WRITER_AUTHORITY).toBe("domain_badge_writer_ssot_v1");
  });

  it("THE client commit is applyNotificationBadgeProjection only (Projection Authority)", () => {
    const auth = read("lib/notifications/projection-authority.ts");
    expect(auth).toContain("applyNotificationBadgeProjection");
    const bridge = read("lib/messenger/contracts/domain-badge-authority-product-bridge.ts");
    expect(bridge).toContain("export function applyNotificationBadgeProjection");
    expect(bridge).toContain("publishDomainAppIconCompleteSnapshot");
    expect(bridge).toContain("applyDomainAuthorityHubBadgeOptimistic");
  });

  it("product code: applyDomainAuthorityHubBadgeOptimistic only from product bridge", () => {
    const callers: string[] = [];
    for (const file of productTsFiles()) {
      const src = fs.readFileSync(file, "utf8");
      if (!src.includes("applyDomainAuthorityHubBadgeOptimistic(")) continue;
      const rel = path.relative(process.cwd(), file);
      if (rel.endsWith("owner-hub-badge-store.ts")) continue; // definition
      if (rel.endsWith("domain-badge-authority-product-bridge.ts")) continue; // allowed
      callers.push(rel);
    }
    expect(callers).toEqual([]);
  });

  it("product code: applyMessengerBottomChatUnread only from hub optimistic apply", () => {
    const hub = read("lib/chats/owner-hub-badge-store.ts");
    expect((hub.match(/applyMessengerBottomChatUnread\(/g) ?? []).length).toBe(1);
    const callers: string[] = [];
    for (const file of productTsFiles()) {
      const src = fs.readFileSync(file, "utf8");
      if (!src.includes("applyMessengerBottomChatUnread(")) continue;
      const rel = path.relative(process.cwd(), file);
      if (rel.endsWith("messenger-bottom-chat-unread-projection.ts")) continue;
      if (rel.endsWith("owner-hub-badge-store.ts")) continue;
      callers.push(rel);
    }
    expect(callers).toEqual([]);
  });

  it("product code: publishDomainAppIconCompleteSnapshot only from surface-store + bridge", () => {
    const callers: string[] = [];
    for (const file of productTsFiles()) {
      const src = fs.readFileSync(file, "utf8");
      if (!src.includes("publishDomainAppIconCompleteSnapshot(")) continue;
      const rel = path.relative(process.cwd(), file);
      if (rel.endsWith("domain-badge-surface-store.ts")) continue;
      if (rel.endsWith("domain-badge-authority-product-bridge.ts")) continue;
      callers.push(rel);
    }
    expect(callers).toEqual([]);
  });

  it("product bridge forbids split App Icon publish (bypass ban)", () => {
    const bridge = read("lib/messenger/contracts/domain-badge-authority-product-bridge.ts");
    expect(bridge).not.toContain("publishDomainBadgeShellToSurfaceStore");
    expect(bridge).not.toContain("publishMissedCallToDomainBadgeSurface");
  });

  it("Hub non-optimistic path preserves Domain axes (P1-c — no Trade/Customer/Owner bypass)", () => {
    const hub = read("lib/chats/owner-hub-badge-store.ts");
    expect(hub).toContain("source.kind !== \"optimistic\"");
    expect(hub).toContain("communityMessengerUnread: cm");
    expect(hub).toContain("chatUnread: trade");
    expect(hub).toContain("storeOrderOwnerUnreadRooms: ownerRooms");
    expect(hub).toContain("buyerOrderAttention: buyer");
    expect(hub).toContain("Preserve store-scoped FAB");
  });

  it("NativeBadgeSync reads App Icon surface only (no Bell / no Hub invent)", () => {
    const native = read("components/push/NativeBadgeSync.tsx");
    expect(native).toContain("surface.appIconTotal");
    expect(native).toContain("syncNativeBadgeCount");
    expect(native).not.toContain("bellTotal");
    expect(native).not.toContain("getOwnerHubBadgeSnapshot");
  });

  it("FCM/APNS badge authority is Domain appIconTotal", () => {
    const push = read("lib/notifications/pipeline/notify-push-dispatcher.ts");
    expect(push).toContain("fetchDomainBadgeAuthorityPayload");
    expect(push).toContain("appIconTotal");
    expect(push).not.toMatch(/badge_count:\s*bell/i);
    const apns = read("lib/push/dispatch/apns-sender-impl.ts");
    expect(apns).toContain("aps.badge");
    expect(apns).toContain("badgeCount");
  });

  it("Explain Matrix matches Projection digits (Authority equality)", () => {
    const explainMatrix = buildBadgeExplainMatrix({
      generalDirectRoomIds: ["a", "b"],
      groupRoomIds: ["g"],
      tradeRoomIds: ["t"],
      customerOrderRoomIds: ["c1", "c2"],
      ownerOrderRoomIds: ["o1"],
      orphanMissedCallCount: 0,
    });
    const match = assertExplainMatchesProjection({
      explainMatrix,
      projection: { appIconTotal: 7, bottomChatTotal: 3 },
      domainAppIcon: { messenger: 3, trade: 1, storeOrder: 3, missedCall: 0 },
      storeOrderBuyerDeliveryUnread: 2,
      storeOrderOwnerChatUnread: 1,
      domainUnreadRooms: { trade: 1 },
    });
    expect(match).toEqual({ ok: true, errors: [] });
  });
});
