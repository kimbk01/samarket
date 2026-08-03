/**
 * Gate 3 Step 10 — Legacy Cutover contract tests.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  assertBackfillIdempotent,
  dryRunLegacyNotificationsBackfill,
  legacyNotificationsDedupeKey,
  planLegacyNotificationsBackfill,
  type LegacyNotificationsBackfillRow,
} from "@/lib/notifications/badge-authority-rebuild/legacy-cutover-backfill";
import {
  LEGACY_ADAPTER_REMOVAL,
  adapterDoesNotContributeToAuthorityDigit,
  selectLegacyRowsForTemporaryAdapter,
} from "@/lib/notifications/badge-authority-rebuild/legacy-temporary-read-adapter";
import { resolveMemberNotificationAuthorityFromRows } from "@/lib/notifications/badge-authority-rebuild/member-notification-a-authority";

const root = process.cwd();

function row(
  partial: Partial<LegacyNotificationsBackfillRow> & Pick<LegacyNotificationsBackfillRow, "id">
): LegacyNotificationsBackfillRow {
  return {
    user_id: "u1",
    notification_type: "admin_notice",
    is_read: false,
    created_at: "2026-01-01T00:00:00.000Z",
    title: "t",
    body: "b",
    link_url: "/notifications/x",
    meta: {},
    ...partial,
  };
}

const FIXTURE: LegacyNotificationsBackfillRow[] = [
  row({ id: "L1", notification_type: "admin_notice", is_read: false }),
  row({
    id: "L2",
    notification_type: "admin_notice",
    is_read: true,
    created_at: "2026-01-02T00:00:00.000Z",
  }),
  row({
    id: "L3",
    notification_type: "chat",
    push_kind: "chat",
    meta: { kind: "community_chat", room_id: "r1" },
  }),
  row({
    id: "L4",
    notification_type: "commerce",
    meta: { kind: "store_order_created", order_id: "o1", store_id: "s1" },
  }),
  row({
    id: "L5",
    notification_type: "admin_marketing_banner",
    push_kind: "marketing",
  }),
  row({
    id: "L6",
    notification_type: "admin_notice",
    deleted_at: "2026-01-03T00:00:00.000Z",
  }),
  row({ id: "L7", notification_type: "weird_unknown_type_xyz" }),
];

describe("Gate3 Step10 Legacy Cutover", () => {
  it("backfill is idempotent", () => {
    expect(assertBackfillIdempotent(FIXTURE.filter((r) => r.id !== "L7"))).toEqual({
      ok: true,
      secondInserts: 0,
    });
  });

  it("legacy + canonical duplicate counted once", () => {
    const key = legacyNotificationsDedupeKey("L1");
    const plan = planLegacyNotificationsBackfill([row({ id: "L1" })], {
      canonicalDedupeKeys: new Set([key]),
    });
    expect(plan[0]?.disposition).toBe("already_canonical");
  });

  it("read legacy item remains read after backfill plan", () => {
    const plan = planLegacyNotificationsBackfill([
      row({ id: "R1", is_read: true, created_at: "2026-02-01T00:00:00.000Z" }),
    ]);
    expect(plan[0]?.disposition).toBe("backfill_a");
    expect(plan[0]?.proposed?.unread).toBe(false);
    expect(plan[0]?.proposed?.read_at).toBe("2026-02-01T00:00:00.000Z");
  });

  it("deleted legacy item remains excluded", () => {
    expect(
      planLegacyNotificationsBackfill([
        row({ id: "D1", deleted_at: "2026-01-01T00:00:00.000Z" }),
      ])[0]?.disposition
    ).toBe("exclude_deleted");
  });

  it("chat / owner / push-only excluded from A; notice included", () => {
    const dry = dryRunLegacyNotificationsBackfill(FIXTURE);
    expect(dry.eligibleForB).toBeGreaterThanOrEqual(1);
    expect(dry.eligibleForC).toBeGreaterThanOrEqual(1);
    expect(dry.pushOnlyExcluded).toBeGreaterThanOrEqual(1);
    expect(dry.eligibleForA).toBe(2); // L1 unread + L2 read
    expect(dry.unknownClassification).toBe(1); // L7 still truly unknown
    expect(dry.cutoverReady).toBe(false);
  });

  it("fixture without unknown is LEGACY CUTOVER READY (quarantine allowed)", () => {
    const readyRows = FIXTURE.filter((r) => r.id !== "L7");
    const dry = dryRunLegacyNotificationsBackfill(readyRows);
    expect(dry.unknownClassification).toBe(0);
    expect(dry.identityContamination).toBe(0);
    expect(dry.cutoverReady).toBe(true);
  });

  it("same user multiple stores remain isolated (owner rows → C, not A)", () => {
    const a = planLegacyNotificationsBackfill([
      row({
        id: "O1",
        meta: { kind: "store_order_created", store_id: "s1", order_id: "o1" },
        notification_type: "commerce",
      }),
      row({
        id: "O2",
        meta: { kind: "store_order_created", store_id: "s2", order_id: "o2" },
        notification_type: "commerce",
      }),
    ]);
    expect(a.every((p) => p.disposition === "exclude_owner_c")).toBe(true);
  });

  it("temporary adapter exposes only non-backfilled A rows; does not add second count", () => {
    const { adapterRows, remainingLegacyCount } = selectLegacyRowsForTemporaryAdapter(
      FIXTURE.filter((r) => r.id !== "L7"),
      new Set([legacyNotificationsDedupeKey("L1")])
    );
    expect(adapterRows.map((r) => r.id)).toEqual(["L2"]);
    expect(remainingLegacyCount).toBe(1);
    expect(adapterDoesNotContributeToAuthorityDigit(3, adapterRows.filter((r) => !r.is_read).length)).toBe(
      3
    );
    expect(LEGACY_ADAPTER_REMOVAL.role).toBe("read_only_compatibility");
  });

  it("A authority ignores adapter — events only", () => {
    const auth = resolveMemberNotificationAuthorityFromRows(
      [
        {
          id: "e1",
          type: "admin_notice",
          category: "admin_notice",
          unread: true,
          read_at: null,
          dedupe_key: "k",
          display_payload: {},
        },
      ],
      "u1"
    );
    expect(auth.unreadCount).toBe(1);
    expect(adapterDoesNotContributeToAuthorityDigit(auth.unreadCount, 99)).toBe(1);
  });

  it("new writes / mark-all / delete paths are canonical-only (static)", () => {
    const route = fs.readFileSync(
      path.join(root, "app/api/me/notifications/route.ts"),
      "utf8"
    );
    expect(route).toContain("markMemberANotificationsAllRead");
    expect(route).toContain("markAllOwnerStoreCommerceNotificationEventsRead");
    expect(route).toContain("legacyUpdated: 0");
    // Dual-write mark_all_read block removed
    expect(route).not.toMatch(
      /mark_all_read === true[\s\S]{0,200}\.from\(\s*["']notifications["']\s*\)\s*\.update/
    );

    const bridge = fs.readFileSync(
      path.join(root, "lib/notifications/inbox-read-bridge.ts"),
      "utf8"
    );
    expect(bridge).toContain("Canonical-only write");
    expect(bridge).toContain("Legacy table hard-delete FORBIDDEN");
    expect(bridge).not.toMatch(
      /legacyNotificationsSelect\(sb\)\s*\.update\(\{\s*is_read:\s*true/
    );
    expect(bridge).not.toMatch(/legacyNotificationsSelect\(sb\)\s*\.delete\(/);

    const commerce = fs.readFileSync(
      path.join(root, "lib/notifications/notify-store-commerce.ts"),
      "utf8"
    );
    expect(commerce).toContain("Do not dual-write legacy");
    expect(commerce).not.toMatch(
      /\.from\(\s*["']notifications["']\s*\)\s*\.update\(\{\s*is_read:\s*true/
    );

    const dispatcher = fs.readFileSync(
      path.join(root, "lib/notifications/pipeline/notify-push-dispatcher.ts"),
      "utf8"
    );
    expect(dispatcher).not.toMatch(/\.from\(\s*["']notifications["']\s*\)\s*\.insert/);
  });

  it("App Icon / Push remain canonical (static non-regression hooks)", () => {
    const appIcon = fs.readFileSync(
      path.join(root, "lib/notifications/badge-authority-rebuild/member-app-icon-authority.ts"),
      "utf8"
    );
    expect(appIcon).toContain("appIconTotal");
    const push = fs.readFileSync(
      path.join(root, "lib/notifications/badge-authority-rebuild/push-routing-transport.ts"),
      "utf8"
    );
    expect(push).toContain("absolute_echo");
  });
});
