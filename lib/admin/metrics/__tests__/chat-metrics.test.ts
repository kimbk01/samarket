import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AdminActionQueueCategoryResult } from "@/lib/admin/admin-action-queue-registry";
import { CHAT_DOMAINS } from "@/lib/chat-domain/chat-domain";
import {
  CHAT_ACTION_CENTER_CARD_METRIC_IDS,
  CHAT_DASHBOARD_HREF,
  CHAT_METRIC_DEFINITIONS,
  chatActiveWindowFromIso,
  chatIdleCutoffIso,
  chatRiskWindowFromIso,
  chatStuckRingingBeforeIso,
  formatChatMetricValue,
  getChatMetricDefinition,
  resolveChatActionCenterCard,
  resolveChatDirectMetric,
  resolveChatQueueMetric,
} from "@/lib/admin/metrics/chat-metrics";

function read(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

function cat(
  key: AdminActionQueueCategoryResult["key"],
  count: number | null,
  status: AdminActionQueueCategoryResult["status"] = "ok"
): AdminActionQueueCategoryResult {
  return { key, count, status, inTotal: true, nextActor: "admin", listHref: null };
}

describe("chat metric definitions (§6)", () => {
  it("ids are unique and namespaced", () => {
    const ids = CHAT_METRIC_DEFINITIONS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.startsWith("chat.")).toBe(true);
  });

  it("every metric links to an admin list carrying its filter — or no link when no list reads it", () => {
    for (const d of CHAT_METRIC_DEFINITIONS) {
      if (d.href === "") {
        // 설계 §3-1: 같은 조건을 읽는 목록이 없으면 죽은 링크 대신 숫자만 (pending).
        expect(d.listFilter, d.id).toBe("pending");
        continue;
      }
      expect(d.href.startsWith("/admin/"), d.id).toBe(true);
      expect(d.href.includes("?"), d.id).toBe(true);
    }
  });

  it("call metrics open the calls list with the same filter", () => {
    for (const d of CHAT_METRIC_DEFINITIONS) {
      if (d.id.startsWith("chat.call")) {
        expect(d.href.startsWith("/admin/chats/calls?"), d.id).toBe(true);
        expect(d.listFilter, d.id).toBe("applied");
      }
    }
  });

  it("report queue links → /admin/chats/reported?status=open&type=…", () => {
    expect(getChatMetricDefinition("chat.reports_open.messenger").href).toBe(
      "/admin/chats/reported?status=open&type=messenger"
    );
    expect(getChatMetricDefinition("chat.reports_open.trade_chat").href).toBe(
      "/admin/chats/reported?status=open&type=trade_chat"
    );
    expect(getChatMetricDefinition("chat.support_waiting_admin").href).toBe("/admin/support?tab=ACTIONABLE");
  });

  it("room metrics cover every chat domain with agreed list params", () => {
    for (const d of CHAT_DOMAINS) {
      expect(getChatMetricDefinition(`chat.rooms.${d}.active_7d`).href).toContain(
        `domain=${d}&status=active&activity=7d`
      );
      expect(getChatMetricDefinition(`chat.rooms.${d}.blocked`).href).toContain(`domain=${d}&status=blocked`);
      expect(getChatMetricDefinition(`chat.rooms.${d}.archived`).href).toContain(`domain=${d}&status=archived`);
      expect(getChatMetricDefinition(`chat.rooms_idle_90d.${d}`).href).toContain(`domain=${d}&idle=90`);
    }
    expect(getChatMetricDefinition("chat.rooms.trade.active_7d").source).toMatchObject({ kind: "direct" });
    expect(
      (getChatMetricDefinition("chat.rooms.trade.active_7d").source as { description: string }).description
    ).toContain("community_messenger_rooms.chat_domain=trade");
  });

  it("current work and long-term risk use separate periods", () => {
    for (const d of CHAT_METRIC_DEFINITIONS) {
      if (d.section === "action") expect(d.period, d.id).toBe("now");
      if (d.section === "risk") expect(["last_24h", "stale"], d.id).toContain(d.period);
      if (d.section === "storage") expect(d.period, d.id).toBe("idle_90d");
    }
  });
});

describe("chat metric values — null = 확인 불가", () => {
  it("formats null as 확인 불가 / Unavailable, never 0", () => {
    expect(formatChatMetricValue(null, true)).toBe("확인 불가");
    expect(formatChatMetricValue(undefined, false)).toBe("Unavailable");
    expect(formatChatMetricValue(Number.NaN, true)).toBe("확인 불가");
    expect(formatChatMetricValue(0, true)).toBe("0");
  });

  it("direct metric: failed count (null / negative) stays null", () => {
    const def = getChatMetricDefinition("chat.call_failed_24h");
    expect(resolveChatDirectMetric(def, null).value).toBeNull();
    expect(resolveChatDirectMetric(def, -1).value).toBeNull();
    expect(resolveChatDirectMetric(def, 3).value).toBe(3);
  });

  it("queue metric: missing / unavailable category → null; forbidden flagged", () => {
    const def = getChatMetricDefinition("chat.reports_open.messenger");
    expect(resolveChatQueueMetric(def, null).value).toBeNull();
    expect(resolveChatQueueMetric(def, [cat("messenger_actionable", null, "unavailable")]).value).toBeNull();
    expect(resolveChatQueueMetric(def, [cat("messenger_actionable", 4)]).value).toBe(4);
    expect(resolveChatQueueMetric(def, [cat("messenger_actionable", null, "forbidden")]).forbidden).toBe(true);
  });

  it("Action Center chat card reuses dashboard metric ids and links to the chat dashboard", () => {
    for (const id of CHAT_ACTION_CENTER_CARD_METRIC_IDS) {
      expect(getChatMetricDefinition(id).source.kind).toBe("queue");
    }
    expect(resolveChatActionCenterCard([cat("messenger_actionable", 2)])).toEqual({
      href: CHAT_DASHBOARD_HREF,
      count: 2,
      unavailable: false,
    });
    expect(resolveChatActionCenterCard([cat("messenger_actionable", null, "unavailable")])).toMatchObject({
      count: null,
      unavailable: true,
    });
    expect(read("components/admin/dashboard/AdminActionCenter.tsx")).toContain("resolveChatActionCenterCard");
  });
});

describe("chat metric windows (Asia/Manila)", () => {
  const now = new Date("2026-10-19T03:00:00Z"); // Manila 2026-10-19 11:00

  it("7-day window starts at Manila midnight six days ago", () => {
    expect(chatActiveWindowFromIso(now)).toBe("2026-10-12T16:00:00.000Z");
  });

  it("idle cutoff = Manila today midnight − 90 days", () => {
    expect(chatIdleCutoffIso(now)).toBe("2026-07-20T16:00:00.000Z");
  });

  it("risk window is rolling 24h; stuck ringing past max ring timeout", () => {
    expect(chatRiskWindowFromIso(now)).toBe("2026-10-18T03:00:00.000Z");
    expect(chatStuckRingingBeforeIso(now)).toBe("2026-10-19T02:50:00.000Z");
  });
});

describe("chat dashboard wiring", () => {
  it("dashboard reads metrics from the single definition; metrics module stays client-safe", () => {
    const dash = read("lib/admin/domain-dashboard/load-messenger-domain-dashboard.ts");
    expect(dash).toContain("loadChatMetrics");
    expect(dash).toContain("CHAT_METRIC_DEFINITIONS");
    const defs = read("lib/admin/metrics/chat-metrics.ts");
    expect(defs).not.toMatch(/server-only|supabase-server|next\/server/);
    expect(read("lib/admin/metrics/load-chat-metrics.ts")).toContain('import "server-only"');
  });
});
