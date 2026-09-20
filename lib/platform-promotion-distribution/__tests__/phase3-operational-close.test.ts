import { beforeEach, describe, expect, it, vi } from "vitest";
import { validateCampaignImageFile } from "@/lib/admin/notification-campaigns/validate-campaign-image";
import { PLATFORM_EVENT_MEDIA_MAX_BYTES } from "@/lib/platform-events/media";
import { allChannelsSucceeded } from "@/lib/platform-promotion-distribution/channel-results";

const createPopup = vi.fn();
const updatePopup = vi.fn();
const createNotify = vi.fn();

vi.mock("@/lib/platform-popup/admin-campaign-writer", () => ({
  createPlatformPopupAdminCampaign: (...args: unknown[]) => createPopup(...args),
  updatePlatformPopupAdminCampaign: (...args: unknown[]) => updatePopup(...args),
  replacePlatformPopupReadyCreative: async () => ({
    ok: true as const,
    creativeId: "creative-mock",
    revertedToReview: false,
  }),
}));

vi.mock("@/lib/admin/notification-campaigns/campaign-create-service", () => ({
  createAdminNotificationCampaign: (...args: unknown[]) => createNotify(...args),
}));

import { saveEventDistribution } from "@/lib/platform-promotion-distribution/save-event-distribution";

type Row = Record<string, unknown>;

function makeMemorySb() {
  const tables: Record<string, Row[]> = {
    platform_promotion_distributions: [],
    feed_ad_campaigns: [],
    feed_ad_creatives: [],
    platform_popup_campaigns: [],
    admin_notification_campaigns: [],
  };
  let idSeq = 1;
  const nextId = () => `id-${idSeq++}`;

  function from(table: string) {
    const rows = () => tables[table] ?? (tables[table] = []);
    const api: Record<string, unknown> = {};
    const filters: Array<(r: Row) => boolean> = [];
    let pendingInsert: Row | null = null;
    let pendingUpdate: Row | null = null;
    let mode: "select" | "insert" | "update" = "select";

    const runSelect = () => {
      const out = rows().filter((r) => filters.every((f) => f(r)));
      return out;
    };

    api.select = () => api;
    api.insert = (payload: Row | Row[]) => {
      mode = "insert";
      const list = Array.isArray(payload) ? payload : [payload];
      pendingInsert = list[0] ?? null;
      for (const p of list) {
        const withId = { id: nextId(), ...p };
        rows().push(withId);
        pendingInsert = withId;
      }
      return api;
    };
    api.update = (payload: Row) => {
      mode = "update";
      pendingUpdate = payload;
      return api;
    };
    api.eq = (col: string, val: unknown) => {
      filters.push((r) => r[col] === val);
      if (mode === "update" && pendingUpdate) {
        for (const r of rows()) {
          if (filters.every((f) => f(r))) Object.assign(r, pendingUpdate);
        }
      }
      return api;
    };
    api.order = () => api;
    api.maybeSingle = async () => {
      const out = runSelect();
      return { data: out[0] ?? null, error: null };
    };
    api.single = async () => {
      if (mode === "insert") {
        return { data: pendingInsert, error: null };
      }
      const out = runSelect();
      return { data: out[0] ?? null, error: out[0] ? null : { message: "not_found" } };
    };
    // terminal for select chains used by listDistributionsForEvent
    const thenable = {
      then(onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        try {
          const result =
            mode === "update"
              ? { error: null }
              : { data: runSelect(), error: null };
          const next = onFulfilled ? onFulfilled(result) : result;
          return Promise.resolve(next);
        } catch (e) {
          if (onRejected) return Promise.resolve(onRejected(e));
          return Promise.reject(e);
        }
      },
    };
    Object.assign(api, thenable);
    return api;
  }

  return {
    from,
    _tables: tables,
    reset() {
      for (const k of Object.keys(tables)) tables[k] = [];
      idSeq = 1;
    },
  };
}

describe("Phase 3 operational close — media validation", () => {
  it("rejects invalid mime and oversize using existing validator + Event bucket limit", () => {
    const bad = new File([new Uint8Array(10)], "x.gif", { type: "image/gif" });
    expect(validateCampaignImageFile(bad).ok).toBe(false);

    const huge = new File(
      [new Uint8Array(PLATFORM_EVENT_MEDIA_MAX_BYTES + 1)],
      "x.jpg",
      { type: "image/jpeg" }
    );
    expect(
      validateCampaignImageFile(huge, { maxBytes: PLATFORM_EVENT_MEDIA_MAX_BYTES }).ok
    ).toBe(false);

    const ok = new File([new Uint8Array(100)], "x.png", { type: "image/png" });
    expect(
      validateCampaignImageFile(ok, { maxBytes: PLATFORM_EVENT_MEDIA_MAX_BYTES }).ok
    ).toBe(true);
  });

  it("upload route reuses shared validator and reserved bucket (no new engine)", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const route = readFileSync(
      join(process.cwd(), "app/api/admin/platform-events/upload-image/route.ts"),
      "utf8"
    );
    const media = readFileSync(join(process.cwd(), "lib/platform-events/media.ts"), "utf8");
    expect(route).toContain("validateCampaignImageFile");
    expect(route).toContain("PLATFORM_EVENT_MEDIA_BUCKET");
    expect(route).toContain("requireAdminApiUser");
    expect(media).toContain("platform-event-media");
    expect(route).not.toMatch(/base64|Buffer\.from\(.*data:/);
  });
});

describe("Phase 3 operational close — writer materialization", () => {
  const sb = makeMemorySb();

  beforeEach(() => {
    sb.reset();
    createPopup.mockReset();
    updatePopup.mockReset();
    createNotify.mockReset();
    createPopup.mockResolvedValue({ ok: true, id: "popup-1" });
    updatePopup.mockResolvedValue({ ok: true, id: "popup-1", revertedToReview: false });
    createNotify.mockImplementation(
      async (
        _svc: unknown,
        _admin: string,
        input: { channel: string; create_request_id: string; save_as_draft?: boolean }
      ) => {
        const existing = sb._tables.admin_notification_campaigns.find(
          (r) => r.create_request_id === input.create_request_id
        );
        if (existing) {
          return { ok: true, campaignId: String(existing.id), occurrenceId: null, replay: true };
        }
        const id = `camp-${sb._tables.admin_notification_campaigns.length + 1}`;
        sb._tables.admin_notification_campaigns.push({
          id,
          channel: input.channel,
          create_request_id: input.create_request_id,
          status: input.save_as_draft ? "draft" : "sending",
        });
        return { ok: true, campaignId: id, occurrenceId: null, replay: false };
      }
    );
  });

  const base = {
    eventId: "evt-a",
    eventTitle: "Event A",
    adminUserId: "admin-1",
    eventPublication: { status: "published", startsAt: null, endsAt: null },
  };

  it("Popup only materializes popup writer with event_detail CTA; others none", async () => {
    const r = await saveEventDistribution(sb as never, {
      ...base,
      toggles: { popup: true, banner: false, push: false, bell: false },
    });
    expect(r.ok).toBe(true);
    expect(r.pushDispatchCount).toBe(0);
    expect(createPopup).toHaveBeenCalledTimes(1);
    expect(updatePopup).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        patch: expect.objectContaining({
          ctaType: "event_detail",
          ctaTarget: "evt-a",
        }),
      })
    );
    expect(createNotify).not.toHaveBeenCalled();
    expect(sb._tables.feed_ad_campaigns).toHaveLength(0);
    expect(r.channels.popup.ok && r.channels.popup.channelRefId).toBe("popup-1");
  });

  it("Banner only creates ADMIN_DIRECT feed_ad; no paid request side effect; no push/bell", async () => {
    const r = await saveEventDistribution(sb as never, {
      ...base,
      toggles: { popup: false, banner: true, push: false, bell: false },
      banner: { placement: "TRADE_HOME", imageUrl: "https://cdn.example/b.png" },
    });
    expect(r.ok).toBe(true);
    expect(createPopup).not.toHaveBeenCalled();
    expect(createNotify).not.toHaveBeenCalled();
    expect(sb._tables.feed_ad_campaigns).toHaveLength(1);
    expect(sb._tables.feed_ad_campaigns[0].source).toBe("ADMIN_DIRECT");
    expect(sb._tables.feed_ad_campaigns[0].destination_url).toBe("/events/evt-a");
    expect(sb._tables.feed_ad_campaigns[0].placement).toBe("TRADE_HOME");
  });

  it("Push only creates draft push_only campaign with dispatch 0", async () => {
    const r = await saveEventDistribution(sb as never, {
      ...base,
      toggles: { popup: false, banner: false, push: true, bell: false },
      push: { title: "T", body: "B" },
    });
    expect(r.ok).toBe(true);
    expect(r.pushDispatchCount).toBe(0);
    expect(createNotify).toHaveBeenCalledWith(
      expect.anything(),
      "admin-1",
      expect.objectContaining({
        channel: "push_only",
        save_as_draft: true,
        create_request_id: "event-dist-push:evt-a",
      })
    );
    expect(sb._tables.admin_notification_campaigns[0].status).toBe("draft");
    expect(sb._tables.admin_notification_campaigns[0].channel).toBe("push_only");
  });

  it("Bell only creates in_app_only draft; push dispatch 0", async () => {
    const r = await saveEventDistribution(sb as never, {
      ...base,
      toggles: { popup: false, banner: false, push: false, bell: true },
      bell: { title: "Bell", body: "In app" },
    });
    expect(r.ok).toBe(true);
    expect(r.pushDispatchCount).toBe(0);
    expect(createNotify).toHaveBeenCalledWith(
      expect.anything(),
      "admin-1",
      expect.objectContaining({ channel: "in_app_only", save_as_draft: true })
    );
  });

  it("ALL OFF is noop materialization with zero active writers", async () => {
    const r = await saveEventDistribution(sb as never, {
      ...base,
      toggles: { popup: false, banner: false, push: false, bell: false },
    });
    expect(r.ok).toBe(true);
    expect(createPopup).not.toHaveBeenCalled();
    expect(createNotify).not.toHaveBeenCalled();
    expect(sb._tables.feed_ad_campaigns).toHaveLength(0);
  });

  it("Popup ON→OFF pauses existing popup record", async () => {
    await saveEventDistribution(sb as never, {
      ...base,
      toggles: { popup: true, banner: false, push: false, bell: false },
    });
    // Seed a popup campaign row so pause update can target it.
    sb._tables.platform_popup_campaigns.push({ id: "popup-1", status: "active" });
    const off = await saveEventDistribution(sb as never, {
      ...base,
      toggles: { popup: false, banner: false, push: false, bell: false },
    });
    expect(off.ok).toBe(true);
    expect(off.channels.popup.ok && off.channels.popup.action).toBe("paused");
    expect(sb._tables.platform_popup_campaigns[0].status).toBe("paused");
  });

  it("Banner ON→OFF pauses feed ad; OFF→ON updates same ref without duplicate", async () => {
    const on1 = await saveEventDistribution(sb as never, {
      ...base,
      toggles: { popup: false, banner: true, push: false, bell: false },
      banner: { placement: "COMMUNITY_HOME", imageUrl: "https://cdn.example/a.png" },
    });
    expect(sb._tables.feed_ad_campaigns).toHaveLength(1);
    const ref = on1.channels.banner.ok ? on1.channels.banner.channelRefId : null;
    const off = await saveEventDistribution(sb as never, {
      ...base,
      toggles: { popup: false, banner: false, push: false, bell: false },
    });
    expect(off.channels.banner.ok && off.channels.banner.action).toBe("paused");
    expect(sb._tables.feed_ad_campaigns[0].status).toBe("paused");
    const on2 = await saveEventDistribution(sb as never, {
      ...base,
      toggles: { popup: false, banner: true, push: false, bell: false },
      banner: { placement: "COMMUNITY_HOME", imageUrl: "https://cdn.example/a.png" },
    });
    expect(sb._tables.feed_ad_campaigns).toHaveLength(1);
    expect(on2.channels.banner.ok && on2.channels.banner.channelRefId).toBe(ref);
  });

  it("Push ON→OFF before send keeps draft; no dispatch; repeat save idempotent", async () => {
    const a = await saveEventDistribution(sb as never, {
      ...base,
      toggles: { popup: false, banner: false, push: true, bell: false },
      push: { title: "T", body: "B" },
    });
    const b = await saveEventDistribution(sb as never, {
      ...base,
      toggles: { popup: false, banner: false, push: true, bell: false },
      push: { title: "T", body: "B" },
    });
    expect(a.pushDispatchCount).toBe(0);
    expect(b.pushDispatchCount).toBe(0);
    expect(sb._tables.admin_notification_campaigns).toHaveLength(1);
    expect(a.channels.push.ok && a.channels.push.channelRefId).toBe(
      b.channels.push.ok ? b.channels.push.channelRefId : null
    );
    const off = await saveEventDistribution(sb as never, {
      ...base,
      toggles: { popup: false, banner: false, push: false, bell: false },
    });
    expect(off.pushDispatchCount).toBe(0);
    expect(sb._tables.admin_notification_campaigns).toHaveLength(1);
  });

  it("partial failure does not report full success", async () => {
    createPopup.mockResolvedValueOnce({ ok: false, error: "popup_writer_boom" });
    const r = await saveEventDistribution(sb as never, {
      ...base,
      toggles: { popup: true, banner: true, push: false, bell: false },
      banner: { placement: "TRADE_HOME", imageUrl: "https://cdn.example/b.png" },
    });
    expect(r.ok).toBe(false);
    expect(allChannelsSucceeded(r.channels)).toBe(false);
    expect(r.channels.popup.ok).toBe(false);
    // Banner may still succeed — must still return ok:false overall.
    expect(r.error).toBeTruthy();
  });

  it("draft Event publication guard pauses popup/banner delivery status", async () => {
    const r = await saveEventDistribution(sb as never, {
      ...base,
      eventPublication: { status: "draft" },
      toggles: { popup: true, banner: true, push: false, bell: false },
      banner: { placement: "TRADE_HOME", imageUrl: "https://cdn.example/b.png" },
    });
    expect(r.ok).toBe(true);
    expect(createPopup).toHaveBeenCalled();
    // Banner created as draft when Event not publicly active.
    expect(sb._tables.feed_ad_campaigns[0].status).toBe("draft");
  });
});
