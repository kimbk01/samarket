import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  COMMUNITY_ADMIN_PAGE_FILTERS,
  COMMUNITY_METRIC_DEFINITIONS,
  communityPeriodMetricHref,
  readCommunityStatsPath,
  resolveCommunityDirectMetric,
  resolveCommunityPeriodMetric,
  resolveCommunityQueueMetric,
  getCommunityMetricDefinition,
} from "@/lib/admin/metrics/community-metrics";
import { getAdminActionQueueCategoryDef } from "@/lib/admin/admin-action-queue-registry";
import {
  COMMUNITY_AUDIT_TARGET_TYPES,
  communityAuditTargetOrFilter,
  isCommunityAuditTargetType,
} from "@/lib/admin/community-admin/community-admin-read-contract";

const SAMPLE_STATS = {
  ok: true,
  posts: { total: 87, member: 5, imported: 82, admin: 0, active_now: 78, hidden_now: 1, deleted_now: 8 },
  comments: { total: 5, top_level: 4, replies: 1 },
  authors: { active: 2, new: 2 },
  reports: { received: 2, processed: 3, resolved: 3, dismissed: 0, meeting_received: 0, meeting_processed: 0 },
  admin_actions: { total: 14, by_action: {}, by_target_type: {} },
  charges: { approved_count: 3, approved_payment_amount: 0, approved_point_amount: 0, rejected_count: 3 },
  promotions: { new_count: 0, new_point_cost: 0, ended_count: 0 },
};

describe("community metric registry ↔ page filter contract (D)", () => {
  it("ids are unique and sections cover D-2/D-3/D-4", () => {
    const ids = COMMUNITY_METRIC_DEFINITIONS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of ["action", "risk", "state", "period"] as const) {
      expect(COMMUNITY_METRIC_DEFINITIONS.some((d) => d.section === s)).toBe(true);
    }
  });

  it("every href targets a contracted page and only uses the filters that page reads", () => {
    for (const d of COMMUNITY_METRIC_DEFINITIONS) {
      const url = new URL(d.href, "https://admin.local");
      const contract = COMMUNITY_ADMIN_PAGE_FILTERS[url.pathname];
      expect(contract, `${d.id} → ${url.pathname}`).toBeDefined();
      for (const [k, v] of url.searchParams) {
        expect(Object.keys(contract), `${d.id} param ${k}`).toContain(k);
        const allowed = contract[k];
        if (allowed) expect(allowed, `${d.id} ${k}=${v}`).toContain(v);
      }
    }
  });

  it("design D-2 links: pending reports, meeting reports ?status=pending, stale 24h, appeal", () => {
    expect(getCommunityMetricDefinition("community.reports_pending").href).toBe("/admin/community/reports?tab=pending");
    expect(getCommunityMetricDefinition("community.meeting_reports_pending").href).toBe(
      "/admin/philife/meeting-reports?status=pending"
    );
    expect(getCommunityMetricDefinition("community.reports_stale_24h").href).toContain("stale=24h");
    expect(getCommunityMetricDefinition("community.reports_stale_24h").section).toBe("risk");
    expect(getCommunityMetricDefinition("community.appeals_waiting").href).toContain("type=appeal");
    expect(getCommunityMetricDefinition("community.point_charges_pending").area).toBe("points");
  });

  it("queue categories exist and community queues require the reports permission", () => {
    for (const d of COMMUNITY_METRIC_DEFINITIONS) {
      if (d.source.kind === "queue") for (const c of d.source.categories) expect(getAdminActionQueueCategoryDef(c)).toBeTruthy();
    }
    expect(getAdminActionQueueCategoryDef("community_reports").requiredPermission).toBe("reports");
    expect(getAdminActionQueueCategoryDef("meeting_reports").requiredPermission).toBe("reports");
  });

  it("period metric paths resolve against the stats RPC shape", () => {
    for (const d of COMMUNITY_METRIC_DEFINITIONS) {
      if (d.source.kind !== "period_stats") continue;
      expect(readCommunityStatsPath(SAMPLE_STATS, d.source.path), d.id).not.toBeNull();
    }
    expect(readCommunityStatsPath(SAMPLE_STATS, "posts.nope")).toBeNull();
  });

  it("failure is null (확인 불가), never 0; forbidden hides", () => {
    const q = getCommunityMetricDefinition("community.reports_pending");
    expect(resolveCommunityQueueMetric(q, null).value).toBeNull();
    expect(
      resolveCommunityQueueMetric(q, [
        { key: "community_reports", count: null, status: "unavailable", inTotal: true, nextActor: "admin", listHref: "" },
      ] as never).value
    ).toBeNull();
    expect(
      resolveCommunityQueueMetric(q, [
        { key: "community_reports", count: 4, status: "ok", inTotal: true, nextActor: "admin", listHref: "" },
      ] as never).value
    ).toBe(4);
    const forbidden = resolveCommunityQueueMetric(
      q,
      [{ key: "community_reports", count: 4, status: "ok", inTotal: true, nextActor: "admin", listHref: "" }] as never,
      { isSuperAdmin: false, permissions: ["boards"] }
    );
    expect(forbidden.forbidden).toBe(true);
    expect(forbidden.value).toBeNull();

    const s = getCommunityMetricDefinition("community.posts_hidden");
    expect(resolveCommunityDirectMetric(s, null).value).toBeNull();
    expect(resolveCommunityDirectMetric(s, 0).value).toBe(0);
    expect(resolveCommunityDirectMetric(s, Number.NaN).value).toBeNull();

    const p = getCommunityMetricDefinition("community.period.posts_total");
    expect(resolveCommunityPeriodMetric(p, null, { period: "7d", from: null, to: null }).value).toBeNull();
  });

  it("period links carry the selected Manila period", () => {
    expect(communityPeriodMetricHref("/admin/community/stats", { period: "7d", from: "2026-10-13", to: "2026-10-19" })).toBe(
      "/admin/community/stats?period=7d"
    );
    expect(
      communityPeriodMetricHref("/admin/community/stats", { period: "custom", from: "2026-10-01", to: "2026-10-05" })
    ).toBe("/admin/community/stats?period=custom&from=2026-10-01&to=2026-10-05");
  });

  it("audit target list matches the SQL helper and excludes messenger", () => {
    const sql = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20270520121200_community_admin_read_rpcs.sql"),
      "utf8"
    );
    for (const t of COMMUNITY_AUDIT_TARGET_TYPES) expect(sql).toContain(`'${t}'`);
    expect(isCommunityAuditTargetType("community_import_job")).toBe(true);
    expect(isCommunityAuditTargetType("community_messenger_room")).toBe(false);
    expect(communityAuditTargetOrFilter()).toContain("target_type.like.community_import*");
    const code = sql.replace(/--.*$/gm, "");
    expect(code).not.toMatch(/\b(drop|delete from|truncate|update public\.|insert into)/i);
  });
});
