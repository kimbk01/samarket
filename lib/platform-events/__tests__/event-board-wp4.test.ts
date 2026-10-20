/**
 * @vitest-environment node
 *
 * Scope B WP4 — event board list contract, EVT-02 ended view, availability helper, admin validation.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  classifyPlatformEventBoardState,
  computePlatformEventDday,
  decodePlatformEventBoardCursor,
  paginatePlatformEventBoard,
  parsePlatformEventBoardState,
} from "@/lib/platform-events/board";
import {
  computePlatformEventAvailabilityFlags,
  isPlatformEventPromotable,
} from "@/lib/platform-events/availability";
import {
  parsePlatformEventBoardFields,
  platformEventLifecyclePatch,
  validatePlatformEventCtaDestination,
  validatePlatformEventSchedule,
  validatePlatformEventSectionCtas,
} from "@/lib/platform-events/admin-validation";
import {
  isMissingBoardColumnError,
  selectPlatformEventsWithBoardFallback,
  stripBoardColumns,
  writePlatformEventWithBoardFallback,
} from "@/lib/platform-events/board-columns-fallback";
import { mapPlatformEventDbRow } from "@/lib/platform-events/map-row";
import {
  platformEventUnavailableFallback,
  resolvePlatformEventPublicView,
} from "@/lib/platform-events/publication";
import {
  PLATFORM_EVENTS_SELECT,
  PLATFORM_EVENTS_SELECT_WITH_BOARD,
  type PlatformEventRow,
} from "@/lib/platform-events/types";
import { PHASE2_EVENT_A_ACTIVE } from "@/lib/platform-events/__tests__/phase2-fixtures";

const NOW = Date.parse("2026-10-19T04:00:00.000Z"); // 12:00 Asia/Manila
const DAY = 24 * 60 * 60 * 1000;
const iso = (t: number) => new Date(t).toISOString();

function ev(id: string, over: Partial<PlatformEventRow> = {}): PlatformEventRow {
  return {
    ...(PHASE2_EVENT_A_ACTIVE as unknown as PlatformEventRow),
    id,
    title: `Event ${id}`,
    status: "published",
    startsAt: iso(NOW - 10 * DAY),
    endsAt: iso(NOW + 10 * DAY),
    thumbnailUrl: null,
    sortOrder: 0,
    isPinned: false,
    category: null,
    archivedAt: null,
    ...over,
  };
}

describe("WP4 board state classification", () => {
  it("ongoing = published, started, not ended (open end allowed)", () => {
    expect(classifyPlatformEventBoardState(ev("a"), NOW)).toBe("ongoing");
    expect(classifyPlatformEventBoardState(ev("b", { endsAt: null }), NOW)).toBe("ongoing");
    expect(classifyPlatformEventBoardState(ev("c", { startsAt: null }), NOW)).toBe("ongoing");
  });

  it("ended = ended within 30 days only", () => {
    expect(
      classifyPlatformEventBoardState(ev("d", { startsAt: iso(NOW - 40 * DAY), endsAt: iso(NOW - DAY) }), NOW)
    ).toBe("ended");
    expect(
      classifyPlatformEventBoardState(ev("e", { startsAt: iso(NOW - 90 * DAY), endsAt: iso(NOW - 31 * DAY) }), NOW)
    ).toBeNull();
  });

  it("scheduled, private and archived are excluded", () => {
    expect(classifyPlatformEventBoardState(ev("f", { startsAt: iso(NOW + DAY) }), NOW)).toBeNull();
    expect(classifyPlatformEventBoardState(ev("g", { status: "draft" }), NOW)).toBeNull();
    expect(classifyPlatformEventBoardState(ev("h", { status: "unpublished" }), NOW)).toBeNull();
    expect(classifyPlatformEventBoardState(ev("i", { archivedAt: iso(NOW - DAY) }), NOW)).toBeNull();
  });

  it("state param defaults to ongoing", () => {
    expect(parsePlatformEventBoardState("ended")).toBe("ended");
    expect(parsePlatformEventBoardState("ENDED")).toBe("ended");
    expect(parsePlatformEventBoardState("scheduled")).toBe("ongoing");
    expect(parsePlatformEventBoardState(null)).toBe("ongoing");
  });
});

describe("WP4 board order + cursor pagination", () => {
  const rows = [
    ev("r1", { startsAt: iso(NOW - 1 * DAY) }),
    ev("r2", { startsAt: iso(NOW - 2 * DAY), isPinned: true }),
    ev("r3", { startsAt: iso(NOW - 3 * DAY), sortOrder: -5 }),
    ev("r4", { startsAt: iso(NOW - 4 * DAY), isPinned: true, sortOrder: 1 }),
    ev("r5", { startsAt: iso(NOW - 5 * DAY) }),
    ev("r6", { startsAt: iso(NOW - 1 * DAY) }),
    ev("x-scheduled", { startsAt: iso(NOW + DAY) }),
    ev("x-ended", { startsAt: iso(NOW - 9 * DAY), endsAt: iso(NOW - DAY) }),
  ];

  it("orders is_pinned desc → sort_order asc → start desc → id", () => {
    const { items, nextCursor } = paginatePlatformEventBoard(rows, { state: "ongoing", limit: 30, nowMs: NOW });
    expect(items.map((i) => i.id)).toEqual(["r2", "r4", "r3", "r1", "r6", "r5"]);
    expect(nextCursor).toBeNull();
  });

  it("cursor pages cover the list exactly once", () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 10; guard++) {
      const page = paginatePlatformEventBoard(rows, { state: "ongoing", cursor, limit: 2, nowMs: NOW });
      seen.push(...page.items.map((i) => i.id));
      cursor = page.nextCursor;
      if (!cursor) break;
    }
    expect(seen).toEqual(["r2", "r4", "r3", "r1", "r6", "r5"]);
  });

  it("ended tab only lists recently ended; invalid cursor restarts", () => {
    const ended = paginatePlatformEventBoard(rows, { state: "ended", cursor: "garbage", nowMs: NOW });
    expect(ended.items.map((i) => i.id)).toEqual(["x-ended"]);
    expect(ended.items[0].dday).toBeNull();
    expect(decodePlatformEventBoardCursor("garbage")).toBeNull();
  });

  it("card uses thumbnail, else hero; href is canonical /events/:id", () => {
    const [withThumb] = paginatePlatformEventBoard([ev("t1", { thumbnailUrl: "https://cdn/x.jpg" })], {
      state: "ongoing",
      nowMs: NOW,
    }).items;
    expect(withThumb.thumbnailUrl).toBe("https://cdn/x.jpg");
    expect(withThumb.href).toBe("/events/t1");
    const [hero] = paginatePlatformEventBoard([ev("t2")], { state: "ongoing", nowMs: NOW }).items;
    expect(hero.thumbnailUrl).toBe(PHASE2_EVENT_A_ACTIVE.heroImageUrl);
  });

  it("D-day counts Asia/Manila calendar days", () => {
    expect(computePlatformEventDday(iso(NOW + 3 * DAY), NOW)).toBe("D-3");
    // 23:00 Manila same day
    expect(computePlatformEventDday("2026-10-19T15:00:00.000Z", NOW)).toBe("D-DAY");
    // 01:00 Manila next day → D-1
    expect(computePlatformEventDday("2026-10-19T17:00:00.000Z", NOW)).toBe("D-1");
    expect(computePlatformEventDday(null, NOW)).toBeNull();
    expect(computePlatformEventDday(iso(NOW - DAY), NOW)).toBeNull();
  });
});

describe("WP4 EVT-02 public view contract (no 410)", () => {
  it("ended events are viewable with ended flag", () => {
    const v = resolvePlatformEventPublicView(
      { status: "published", startsAt: iso(NOW - 9 * DAY), endsAt: iso(NOW - DAY) },
      NOW
    );
    expect(v).toEqual({ kind: "view", ended: true, availability: "ended" });
    expect(resolvePlatformEventPublicView({ status: "published" }, NOW)).toEqual({
      kind: "view",
      ended: false,
      availability: "active",
    });
  });

  it("not started / missing → 404; private / archived → 403 「볼 수 없는 콘텐츠」", () => {
    expect(resolvePlatformEventPublicView({ status: "published", startsAt: iso(NOW + DAY) }, NOW).kind).toBe(
      "not_found"
    );
    expect(resolvePlatformEventPublicView(null, NOW)).toMatchObject({ kind: "not_found", httpStatus: 404 });
    for (const row of [
      { status: "draft" },
      { status: "unpublished" },
      { status: "published", archivedAt: iso(NOW - DAY) },
    ]) {
      expect(resolvePlatformEventPublicView(row, NOW)).toMatchObject({ kind: "forbidden", httpStatus: 403 });
    }
    expect(platformEventUnavailableFallback("archived", "ko").title).toBe("볼 수 없는 콘텐츠");
  });

  it("detail route + page use the view contract and never answer 410", () => {
    const root = process.cwd();
    const route = readFileSync(join(root, "app/api/platform-events/[eventId]/route.ts"), "utf8");
    expect(route).toContain("resolvePlatformEventPublicView");
    expect(route).not.toMatch(/\b410\b/);
    const content = readFileSync(join(root, "components/platform-events/PlatformEventDetailContent.tsx"), "utf8");
    expect(content).toContain("종료된 이벤트입니다");
    expect(content).toContain("openDestination");
    expect(content).not.toMatch(/<Link\b/);
    const board = readFileSync(join(root, "app/(main)/events/page.tsx"), "utf8");
    expect(board).toContain("PlatformEventBoardClient");
  });
});

describe("WP4 getPlatformEventAvailability flags", () => {
  it("maps rows to {exists, visible, started, ended}", () => {
    expect(computePlatformEventAvailabilityFlags(null, NOW)).toEqual({
      exists: false,
      visible: false,
      ended: false,
      started: false,
    });
    const active = computePlatformEventAvailabilityFlags(ev("a"), NOW);
    expect(active).toEqual({ exists: true, visible: true, ended: false, started: true });
    expect(isPlatformEventPromotable(active)).toBe(true);

    const scheduled = computePlatformEventAvailabilityFlags(ev("b", { startsAt: iso(NOW + DAY) }), NOW);
    expect(scheduled.started).toBe(false);
    expect(isPlatformEventPromotable(scheduled)).toBe(false);

    const ended = computePlatformEventAvailabilityFlags(ev("c", { endsAt: iso(NOW - DAY) }), NOW);
    expect(ended).toMatchObject({ visible: true, ended: true });
    expect(isPlatformEventPromotable(ended)).toBe(false);

    expect(computePlatformEventAvailabilityFlags(ev("d", { status: "draft" }), NOW).visible).toBe(false);
    expect(computePlatformEventAvailabilityFlags(ev("e", { archivedAt: iso(NOW) }), NOW).visible).toBe(false);
  });
});

describe("WP4 admin validation", () => {
  it("CTA must pass popup validator AND parseDestinationHref", () => {
    expect(validatePlatformEventCtaDestination({ ctaType: "internal_page", ctaTarget: "/market" })).toEqual({
      ok: true,
      href: "/market",
    });
    expect(validatePlatformEventCtaDestination({ ctaType: "store", ctaTarget: "s1" }).ok).toBe(true);
    expect(validatePlatformEventCtaDestination({ ctaType: "event_detail", ctaTarget: "e1" })).toEqual({
      ok: false,
      error: "event_detail_loop_forbidden",
    });
    expect(
      validatePlatformEventCtaDestination({ ctaType: "external_url", externalUrl: "http://x.com" }).ok
    ).toBe(false);
    expect(
      validatePlatformEventCtaDestination({ ctaType: "internal_page", ctaTarget: "/admin/users" }).ok
    ).toBe(false);
    expect(
      // The popup validator (kept API, rejects first) owns the error code for malformed paths.
      validatePlatformEventCtaDestination({ ctaType: "internal_page", ctaTarget: "/a\\b" }).ok
    ).toBe(false);
  });

  it("section CTAs are validated with their index", () => {
    expect(
      validatePlatformEventSectionCtas([
        { type: "text", body: "x" },
        { type: "cta", label: "Go", ctaType: "external_url", externalUrl: "https://ok.example" },
      ])
    ).toEqual({ ok: true });
    expect(
      validatePlatformEventSectionCtas([
        { type: "text", body: "x" },
        { type: "cta", label: "Bad", ctaType: "internal_page", ctaTarget: "/stores/owner/1" },
      ])
    ).toMatchObject({ ok: false, index: 1 });
  });

  it("board fields: https thumbnail, integer sort, boolean pin, short category", () => {
    expect(
      parsePlatformEventBoardFields({ thumbnailUrl: "https://c/x.png", sortOrder: 3, isPinned: true, category: "쿠폰" })
    ).toEqual({
      ok: true,
      patch: { thumbnail_url: "https://c/x.png", sort_order: 3, is_pinned: true, category: "쿠폰" },
    });
    expect(parsePlatformEventBoardFields({})).toEqual({ ok: true, patch: {} });
    expect(parsePlatformEventBoardFields({ thumbnailUrl: "http://c/x.png" }).ok).toBe(false);
    expect(parsePlatformEventBoardFields({ sortOrder: 1.5 }).ok).toBe(false);
    expect(parsePlatformEventBoardFields({ isPinned: "yes" }).ok).toBe(false);
    expect(parsePlatformEventBoardFields({ category: "x".repeat(41) }).ok).toBe(false);
    expect(parsePlatformEventBoardFields({ thumbnail_url: "" })).toEqual({
      ok: true,
      patch: { thumbnail_url: null },
    });
  });

  it("schedule must be start < end", () => {
    expect(validatePlatformEventSchedule(iso(NOW), iso(NOW + DAY)).ok).toBe(true);
    expect(validatePlatformEventSchedule(iso(NOW + DAY), iso(NOW)).ok).toBe(false);
    expect(validatePlatformEventSchedule(null, null).ok).toBe(true);
  });

  it("archive also unpublishes; publish unarchives", () => {
    const now = iso(NOW);
    expect(platformEventLifecyclePatch("archive", now)).toEqual({ status: "unpublished", archived_at: now });
    expect(platformEventLifecyclePatch("publish", now)).toEqual({
      status: "published",
      published_at: now,
      archived_at: null,
    });
    expect(platformEventLifecyclePatch("unpublish", now)).toEqual({ status: "unpublished" });
  });

  it("editor confirms publish / unpublish / archive", () => {
    const editor = readFileSync(
      join(process.cwd(), "components/admin/platform-events/AdminPlatformEventEditorClient.tsx"),
      "utf8"
    );
    // R2 — 확인 경로 단일화 (confirmAdminAction)
    expect(editor).toContain("confirmAdminAction");
    expect(editor).toContain('requestLifecycle("publish")');
    expect(editor).toContain('requestLifecycle("unpublish")');
    expect(editor).toContain('requestLifecycle("archive")');
    expect(editor).toContain("validatePlatformEventCtaDestination");
  });
});

describe("WP4 pre-migration column fallback", () => {
  it("detects missing-column errors only", () => {
    expect(isMissingBoardColumnError({ code: "42703", message: "column x does not exist" })).toBe(true);
    expect(isMissingBoardColumnError({ code: "PGRST204", message: "Could not find the 'is_pinned' column" })).toBe(
      true
    );
    expect(isMissingBoardColumnError({ code: "23514", message: "check violation" })).toBe(false);
    expect(isMissingBoardColumnError(null)).toBe(false);
  });

  it("select retries with the legacy column list", async () => {
    const calls: string[] = [];
    const res = await selectPlatformEventsWithBoardFallback(async (select) => {
      calls.push(select);
      return select === PLATFORM_EVENTS_SELECT_WITH_BOARD
        ? { data: null, error: { code: "42703", message: "column platform_events.archived_at does not exist" } }
        : { data: [{ id: "x" }], error: null };
    });
    expect(calls).toEqual([PLATFORM_EVENTS_SELECT_WITH_BOARD, PLATFORM_EVENTS_SELECT]);
    expect(res.boardColumns).toBe(false);
    expect(res.error).toBeNull();
  });

  it("write strips board columns on retry", async () => {
    const payloads: Record<string, unknown>[] = [];
    const res = await writePlatformEventWithBoardFallback(
      { title: "t", is_pinned: true, archived_at: null },
      async (payload) => {
        payloads.push(payload);
        return payloads.length === 1
          ? { data: null, error: { code: "PGRST204", message: "Could not find the 'is_pinned' column" } }
          : { data: { id: "x" }, error: null };
      }
    );
    expect(payloads[1]).toEqual({ title: "t" });
    expect(res.boardColumns).toBe(false);
    expect(stripBoardColumns({ a: 1, sort_order: 2 })).toEqual({ a: 1 });
  });

  it("legacy rows map to board defaults", () => {
    const row = mapPlatformEventDbRow({
      id: "1",
      title: "t",
      subtitle: null,
      hero_image_url: null,
      hero_image_path: null,
      sections: [],
      terms: null,
      status: "published",
      starts_at: null,
      ends_at: null,
      timezone: "Asia/Manila",
      cta_label: null,
      cta_type: null,
      cta_target: "",
      cta_external_url: null,
      published_at: null,
      created_by: null,
      updated_by: null,
      created_at: iso(NOW),
      updated_at: iso(NOW),
    });
    expect(row).toMatchObject({ thumbnailUrl: null, sortOrder: 0, isPinned: false, category: null, archivedAt: null });
  });
});
