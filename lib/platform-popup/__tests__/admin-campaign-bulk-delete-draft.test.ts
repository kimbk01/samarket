import { describe, expect, it, vi } from "vitest";
import {
  adminBulkDeletePlatformPopupDraftCampaigns,
  isPlatformPopupDeleteSafeDraftRow,
} from "@/lib/platform-popup/admin-campaign-delete-draft";

function makeSb(rows: Array<Record<string, unknown>>, eventCounts: Record<string, number> = {}) {
  const table = [...rows];
  return {
    from(name: string) {
      if (name === "platform_popup_campaign_events") {
        // §4-3: 삭제 전 노출 기록 수 (head count)
        return {
          select() {
            return {
              eq: async (_c: string, id: string) => ({ count: eventCounts[id] ?? 0, error: null }),
            };
          },
        };
      }
      if (name !== "platform_popup_campaigns") throw new Error(`unexpected ${name}`);
      return {
        select() {
          return {
            eq(_c: string, id: string) {
              return {
                maybeSingle: async () => ({
                  data: table.find((r) => r.id === id) ?? null,
                  error: null,
                }),
              };
            },
            in(_c: string, ids: string[]) {
              return Promise.resolve({
                data: table.filter((r) => ids.includes(String(r.id))),
                error: null,
              });
            },
          };
        },
        delete() {
          return {
            eq: async (_c: string, id: string) => {
              const idx = table.findIndex((r) => r.id === id);
              if (idx >= 0) table.splice(idx, 1);
              return { error: null };
            },
          };
        },
      };
    },
  };
}

vi.mock("@/lib/audit/append-audit-log", () => ({
  appendAuditLog: vi.fn(async () => undefined),
}));

describe("adminBulkDeletePlatformPopupDraftCampaigns", () => {
  it("isPlatformPopupDeleteSafeDraftRow gates active", () => {
    expect(
      isPlatformPopupDeleteSafeDraftRow({
        status: "draft",
        owner_store_id: null,
        owner_request_id: null,
      })
    ).toBe(true);
    expect(
      isPlatformPopupDeleteSafeDraftRow({
        status: "active",
        owner_store_id: null,
        owner_request_id: null,
      })
    ).toBe(false);
    expect(
      isPlatformPopupDeleteSafeDraftRow({
        status: "draft",
        owner_store_id: "store-1",
        owner_request_id: null,
      })
    ).toBe(false);
  });

  it("rejects entire bulk when any id is active — deletes none", async () => {
    const sb = makeSb([
      { id: "a", status: "draft", approval_status: "not_submitted", owner_store_id: null, owner_request_id: null },
      { id: "b", status: "active", approval_status: "approved", owner_store_id: null, owner_request_id: null },
    ]);
    const r = await adminBulkDeletePlatformPopupDraftCampaigns(sb as never, {
      campaignIds: ["a", "b"],
      adminUserId: "admin",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("not_draft");
      expect(r.rejectedId).toBe("b");
    }
    // draft a still present
    const check = await (sb.from("platform_popup_campaigns").select().eq("id", "a") as unknown as { maybeSingle: () => Promise<{ data: Record<string, unknown> | null }> }).maybeSingle();
    expect(check.data?.id).toBe("a");
  });

  it("rejects unknown id — deletes none", async () => {
    const sb = makeSb([
      { id: "a", status: "draft", approval_status: "not_submitted", owner_store_id: null, owner_request_id: null },
    ]);
    const r = await adminBulkDeletePlatformPopupDraftCampaigns(sb as never, {
      campaignIds: ["a", "missing"],
      adminUserId: "admin",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("not_found");
    const check = await (sb.from("platform_popup_campaigns").select().eq("id", "a") as unknown as { maybeSingle: () => Promise<{ data: Record<string, unknown> | null }> }).maybeSingle();
    expect(check.data?.id).toBe("a");
  });

  it("deletes all when every id is delete_safe_draft", async () => {
    const sb = makeSb([
      { id: "a", status: "draft", approval_status: "not_submitted", owner_store_id: null, owner_request_id: null },
      { id: "b", status: "pending_review", approval_status: "pending_review", owner_store_id: null, owner_request_id: null },
    ]);
    const r = await adminBulkDeletePlatformPopupDraftCampaigns(sb as never, {
      campaignIds: ["a", "b"],
      adminUserId: "admin",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.deletedIds).toEqual(["a", "b"]);
  });

  it("§4-3: 노출 기록이 있는 초안이 하나라도 있으면 하나도 지우지 않는다", async () => {
    const sb = makeSb(
      [
        { id: "a", status: "draft", approval_status: "not_submitted", owner_store_id: null, owner_request_id: null },
        { id: "b", status: "pending_review", approval_status: "pending_review", owner_store_id: null, owner_request_id: null },
      ],
      { b: 3 }
    );
    const r = await adminBulkDeletePlatformPopupDraftCampaigns(sb as never, { campaignIds: ["a", "b"], adminUserId: "admin" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("has_exposure_history");
      expect(r.rejectedId).toBe("b");
    }
    const check = await (sb.from("platform_popup_campaigns").select().eq("id", "a") as unknown as { maybeSingle: () => Promise<{ data: Record<string, unknown> | null }> }).maybeSingle();
    expect(check.data?.id).toBe("a");
  });
});
