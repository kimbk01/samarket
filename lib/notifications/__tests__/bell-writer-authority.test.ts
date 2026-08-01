/**
 * Phase 3-2 — Bell Writer Authority contracts.
 * DO NOT: Badge · RoomUnread · Event create-policy · Heal · Legacy delete · Inbox UI
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertBellExplainMatchesDigit,
  assertBellWriterAuthorityInventory,
  BELL_COMMIT_ENTRY,
  BELL_EVENT_INSERT_SSOT,
  BELL_WRITER_AUTHORITY,
  listBellSurfaceWriterInventory,
  listBellWriterTriggerInventory,
} from "@/lib/notifications/bell-writer-authority";
import { buildBellExplainMatrix } from "@/lib/notifications/bell-explain-matrix";

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

describe("Phase 3-2 Bell Writer Authority SSOT", () => {
  it("inventory authorityWriterCount === 1 + required triggers", () => {
    expect(assertBellWriterAuthorityInventory()).toEqual({ ok: true, errors: [] });
    expect(BELL_WRITER_AUTHORITY).toBe("bell_writer_ssot_v1");
    expect(BELL_COMMIT_ENTRY).toBe("applyBellBadgeProjection");
    expect(BELL_EVENT_INSERT_SSOT).toBe("createNotificationEvent");
    expect(listBellWriterTriggerInventory()).toHaveLength(9);
    expect(listBellSurfaceWriterInventory().every((r) => r.authorityWriterCount === 1)).toBe(true);
  });

  it("THE Bell commit is applyBellBadgeProjection; store funnels via applyBellFromStore/patch", () => {
    const proj = read("lib/chat-domain/projections/bell-badge-projection.ts");
    expect(proj).toContain("export function applyBellBadgeProjection");
    const store = read("lib/notifications/notification-badge-count-store.ts");
    expect(store).toContain("applyBellBadgeProjection");
    expect(store).toContain("patchNotificationBadgeCountSnapshot");
    const bridge = read("lib/messenger/contracts/domain-badge-authority-product-bridge.ts");
    expect(bridge).toContain("patchNotificationBadgeCountSnapshot(projection.bell");
  });

  it("product code: applyBellBadgeProjection only from bell projection + badge-count store", () => {
    const callers: string[] = [];
    for (const file of productTsFiles()) {
      const src = fs.readFileSync(file, "utf8");
      if (!src.includes("applyBellBadgeProjection(")) continue;
      const rel = path.relative(process.cwd(), file);
      if (rel.endsWith("bell-badge-projection.ts")) continue;
      if (rel.endsWith("notification-badge-count-store.ts")) continue;
      if (rel.endsWith("bell-writer-authority.ts")) continue; // inventory strings only
      callers.push(rel);
    }
    expect(callers).toEqual([]);
  });

  it("Header Bell digit reads badgeCountTotal only (no row/store invent)", () => {
    const sync = read("lib/notifications/tier1-header-inbox-sync.ts");
    expect(sync).toContain("resolveTier1HeaderBellBadgeTotal");
    expect(sync).toContain("badgeCountTotal");
    expect(sync).toMatch(/DO NOT:.*storeUnread/);
  });

  it("Projection Authority Apply still commits Bell via product bridge", () => {
    const auth = read("lib/notifications/projection-authority.ts");
    expect(auth).toContain("applyNotificationBadgeProjection");
    const bridge = read("lib/messenger/contracts/domain-badge-authority-product-bridge.ts");
    expect(bridge).toContain("if (opts?.applyBell !== false)");
  });

  it("Explain matches digit helper", () => {
    const matrix = buildBellExplainMatrix([
      { id: "a", type: "chat_message", category: "chat", unread: true, read_at: null },
      { id: "b", type: "admin_notice", category: "admin_notice", unread: true, read_at: null },
    ]);
    expect(assertBellExplainMatchesDigit({ bellExplainMatrix: matrix, bellTotal: 2 })).toEqual({
      ok: true,
      errors: [],
    });
  });
});
