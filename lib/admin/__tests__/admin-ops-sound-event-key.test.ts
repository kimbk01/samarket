/**
 * Admin Ops per-source sound event_key mapping (FINAL FIX).
 * T1–T10 matrix — mapping + mute gate + isolation + registry parity.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ADMIN_OPS_SOUND_EVENT_FALLBACK,
  ADMIN_OPS_SOUND_FALLBACK_SOURCES,
  resolveAdminOpsSoundEventKey,
} from "@/lib/admin/admin-ops-sound-event-key";
import {
  allowAdminOpsSoundAfterPreference,
  preferencesFromAdminOpsStorageRow,
} from "@/lib/admin/admin-ops-sound-preference-gate";
import { shouldPlayAdminOpsSound } from "@/lib/admin/admin-ops-sound-decision";
import {
  resolveAdminStoreApplicationHref,
  resolveAdminTradeReportHref,
} from "@/lib/admin/admin-ops-deeplink";
import { getRegistryEvent } from "@/lib/notifications/notification-sound-registry";

vi.mock("@/lib/notifications/notification-sound-engine", () => ({
  playEventNotificationSound: vi.fn(() => Promise.resolve()),
  resetNotificationSoundEngineForAuthEpoch: vi.fn(),
}));

import { playEventNotificationSound } from "@/lib/notifications/notification-sound-engine";
import {
  __resetNotificationSoundDecisionForTests,
  ingestAdminRowSound,
} from "@/lib/notifications/notification-sound-decision";

const RECIPIENT = "admin-ops-sound-map";

function prefs(soundEnabled?: boolean) {
  if (soundEnabled === undefined) {
    return preferencesFromAdminOpsStorageRow(null);
  }
  return preferencesFromAdminOpsStorageRow({ sound_enabled: soundEnabled });
}

describe("Admin Ops per-type sound event_key SSOT", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetNotificationSoundDecisionForTests({
      recipientId: RECIPIENT,
      isLeader: true,
      visibility: "visible",
      windowFocused: true,
      sessionStartedAt: Date.now() - 500,
      callActive: false,
    });
  });

  it("T1 report source → admin_report_received", () => {
    expect(resolveAdminOpsSoundEventKey("reports")).toBe("admin_report_received");
    expect(resolveAdminOpsSoundEventKey("store_reports")).toBe("admin_report_received");
    expect(resolveAdminOpsSoundEventKey("community_reports")).toBe("admin_report_received");
    const d = ingestAdminRowSound({
      sourceTable: "reports",
      rowId: "rep-1",
      recipientId: RECIPIENT,
      createdAt: new Date().toISOString(),
    });
    expect(d.action).toBe("PLAY");
    expect(playEventNotificationSound).toHaveBeenCalledWith("admin_report_received");
  });

  it("T2 settlement / point charge request → settlement_charge_requested", () => {
    expect(resolveAdminOpsSoundEventKey("point_charge_requests")).toBe(
      "settlement_charge_requested"
    );
    expect(resolveAdminOpsSoundEventKey("store_point_charge_requests")).toBe(
      "settlement_charge_requested"
    );
    const d = ingestAdminRowSound({
      sourceTable: "point_charge_requests",
      rowId: "pcr-map-1",
      recipientId: RECIPIENT,
      createdAt: new Date().toISOString(),
    });
    expect(d.action).toBe("PLAY");
    expect(playEventNotificationSound).toHaveBeenCalledWith("settlement_charge_requested");
  });

  it("T3 admin notice fallback / notice identity → admin_notice_received", () => {
    expect(resolveAdminOpsSoundEventKey("feed_ad_requests")).toBe("admin_notice_received");
    expect(ADMIN_OPS_SOUND_EVENT_FALLBACK).toBe("admin_notice_received");
    const d = ingestAdminRowSound({
      sourceTable: "feed_ad_requests",
      rowId: "ad-notice-1",
      recipientId: RECIPIENT,
      createdAt: new Date().toISOString(),
    });
    expect(d.action).toBe("PLAY");
    expect(playEventNotificationSound).toHaveBeenCalledWith("admin_notice_received");
  });

  it("T4 two distinct sources → two distinct event_keys (not both notice)", () => {
    const reportKey = resolveAdminOpsSoundEventKey("reports");
    const chargeKey = resolveAdminOpsSoundEventKey("store_point_charge_requests");
    expect(reportKey).toBe("admin_report_received");
    expect(chargeKey).toBe("settlement_charge_requested");
    expect(reportKey).not.toBe(chargeKey);
    expect(reportKey).not.toBe("admin_notice_received");
    expect(chargeKey).not.toBe("admin_notice_received");

    ingestAdminRowSound({
      sourceTable: "reports",
      rowId: "rep-t4",
      recipientId: RECIPIENT,
      createdAt: new Date().toISOString(),
    });
    expect(playEventNotificationSound).toHaveBeenCalledWith("admin_report_received");

    // Reset burst clock so second source can play (coalesce is eligibility, not mapping).
    __resetNotificationSoundDecisionForTests({
      recipientId: RECIPIENT,
      isLeader: true,
      visibility: "visible",
      windowFocused: true,
      sessionStartedAt: Date.now() - 500,
      callActive: false,
    });
    vi.mocked(playEventNotificationSound).mockClear();

    ingestAdminRowSound({
      sourceTable: "store_point_charge_requests",
      rowId: "spcr-t4",
      recipientId: RECIPIENT,
      createdAt: new Date().toISOString(),
    });
    expect(playEventNotificationSound).toHaveBeenCalledWith("settlement_charge_requested");
  });

  it("T5 P2-A8 sound OFF → key still resolves; play path suppressed by preference gate", () => {
    const key = resolveAdminOpsSoundEventKey("reports");
    expect(key).toBe("admin_report_received");
    const semantic = shouldPlayAdminOpsSound({
      eventType: "INSERT",
      sourceTable: "reports",
      newRow: { id: "r1", status: "pending" },
    });
    expect(semantic).toBe(true);
    expect(allowAdminOpsSoundAfterPreference(semantic, prefs(false))).toBe(false);
    // Gate blocks before ingest — play not invoked when preference denies.
    expect(playEventNotificationSound).not.toHaveBeenCalled();
  });

  it("T6 P2-A8 sound ON → resolved event key passed to player", () => {
    const semantic = shouldPlayAdminOpsSound({
      eventType: "INSERT",
      sourceTable: "reports",
      newRow: { id: "r1", status: "pending" },
    });
    expect(allowAdminOpsSoundAfterPreference(semantic, prefs(true))).toBe(true);
    const d = ingestAdminRowSound({
      sourceTable: "reports",
      rowId: "rep-t6",
      recipientId: RECIPIENT,
      createdAt: new Date().toISOString(),
    });
    expect(d.action).toBe("PLAY");
    expect(playEventNotificationSound).toHaveBeenCalledWith("admin_report_received");
  });

  it("T7 unknown/unmapped Admin Ops source → documented fallback, no crash", () => {
    expect(resolveAdminOpsSoundEventKey("totally_unknown_admin_table_xyz")).toBe(
      ADMIN_OPS_SOUND_EVENT_FALLBACK
    );
    for (const table of ADMIN_OPS_SOUND_FALLBACK_SOURCES) {
      expect(resolveAdminOpsSoundEventKey(table)).toBe(ADMIN_OPS_SOUND_EVENT_FALLBACK);
    }
    const d = ingestAdminRowSound({
      sourceTable: "totally_unknown_admin_table_xyz",
      rowId: "unk-1",
      recipientId: RECIPIENT,
      createdAt: new Date().toISOString(),
    });
    // Unknown tables are INFORMATIONAL → SKIP_ADMIN_INFORMATIONAL (eligibility preserved).
    expect(d.reason).toBe("SKIP_ADMIN_INFORMATIONAL");
    expect(playEventNotificationSound).not.toHaveBeenCalled();
  });

  it("T8 Member path unchanged (static isolation)", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/notifications/web-push-user-settings-gate.ts"),
      "utf8"
    );
    expect(src).not.toContain("resolveAdminOpsSoundEventKey");
    expect(src).not.toContain("admin-ops-sound-event-key");
  });

  it("T9 Owner path unchanged (static isolation)", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/notifications/notification-sound-owner-preference-gate.ts"),
      "utf8"
    );
    expect(src).not.toContain("resolveAdminOpsSoundEventKey");
    expect(src).not.toContain("admin-ops-sound-event-key");
  });

  it("T10 ADMIN_Q / deeplink mapping unchanged", () => {
    expect(resolveAdminTradeReportHref("r1")).toBe("/admin/reports/r1");
    expect(resolveAdminStoreApplicationHref("s1")).toBe("/admin/business/s1");
    const deeplink = readFileSync(join(process.cwd(), "lib/admin/admin-ops-deeplink.ts"), "utf8");
    const queue = readFileSync(join(process.cwd(), "lib/admin/admin-action-queue.ts"), "utf8");
    const mapper = readFileSync(join(process.cwd(), "lib/admin/admin-ops-sound-event-key.ts"), "utf8");
    expect(deeplink).not.toContain("resolveAdminOpsSoundEventKey");
    expect(queue).not.toContain("resolveAdminOpsSoundEventKey");
    expect(mapper).not.toContain("setAdminBellCount");
    expect(mapper).not.toContain("admin-action-queue");
  });

  it("GATE9 UI/registry key parity for every mapped Admin Ops key", () => {
    const keys = [
      resolveAdminOpsSoundEventKey("reports"),
      resolveAdminOpsSoundEventKey("point_charge_requests"),
      resolveAdminOpsSoundEventKey("feed_ad_requests"),
      ADMIN_OPS_SOUND_EVENT_FALLBACK,
    ];
    for (const key of keys) {
      expect(getRegistryEvent(key), `missing registry event: ${key}`).toBeTruthy();
    }
  });

  it("GATE4 hardcode catch-all removed from ingestAdminRowSound", () => {
    const decision = readFileSync(
      join(process.cwd(), "lib/notifications/notification-sound-decision.ts"),
      "utf8"
    );
    expect(decision).toContain("resolveAdminOpsSoundEventKey");
    expect(decision).not.toMatch(
      /ingestAdminRowSound[\s\S]{0,400}eventType:\s*"admin_notice_received"/
    );
  });

  it("GATE10 static connection: resolve → playEventNotificationSound(same key)", () => {
    const key = resolveAdminOpsSoundEventKey("community_reports");
    expect(key).toBe("admin_report_received");
    expect(getRegistryEvent(key)?.event_key).toBe(key);
    ingestAdminRowSound({
      sourceTable: "community_reports",
      rowId: "cr-conn",
      recipientId: RECIPIENT,
      createdAt: new Date().toISOString(),
    });
    expect(playEventNotificationSound).toHaveBeenCalledWith(key);
  });
});
