/**
 * 광고 감사 (인트로) — ① 준비 단계 시간 제한 ② 게시본 1건 손상 시 목록 전체 500 금지.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyLaunchIntroDocument, LAUNCH_INTRO_TOTAL_MAX_MS } from "@/lib/launch-intro/document";
import { LAUNCH_INTRO_PREPARE_TIMEOUT_MS, startLaunchIntroPrepareDeadline } from "@/lib/launch-intro/prepare-deadline";
import { listLaunchIntroPublications, loadLaunchIntroPublicationForAdmin, type Sb } from "@/lib/launch-intro/server";
import { launchIntroAdminSnapshot } from "@/lib/launch-intro/admin-snapshot";

const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("① PREPARING deadline", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("bound = Owner 「인트로 최대 5초」 constant", () => {
    expect(LAUNCH_INTRO_PREPARE_TIMEOUT_MS).toBe(LAUNCH_INTRO_TOTAL_MAX_MS);
  });

  it("fires once after the bound when PREPARING never settles; settle afterwards is refused", () => {
    const onTimeout = vi.fn();
    const d = startLaunchIntroPrepareDeadline(onTimeout);
    vi.advanceTimersByTime(LAUNCH_INTRO_PREPARE_TIMEOUT_MS - 1);
    expect(onTimeout).not.toHaveBeenCalled();
    expect(d.expired).toBe(false);
    vi.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(d.expired).toBe(true);
    expect(d.settle()).toBe(false);
    vi.advanceTimersByTime(LAUNCH_INTRO_PREPARE_TIMEOUT_MS * 2);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("settle (success / own abort) clears the timer", () => {
    const onTimeout = vi.fn();
    const d = startLaunchIntroPrepareDeadline(onTimeout);
    vi.advanceTimersByTime(100);
    expect(d.settle()).toBe(true);
    vi.advanceTimersByTime(LAUNCH_INTRO_PREPARE_TIMEOUT_MS * 2);
    expect(onTimeout).not.toHaveBeenCalled();
    expect(d.expired).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancel (unmount) clears the timer without firing", () => {
    const onTimeout = vi.fn();
    const d = startLaunchIntroPrepareDeadline(onTimeout);
    d.cancel();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(LAUNCH_INTRO_PREPARE_TIMEOUT_MS * 2);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("LaunchIntroRoot PREPARING uses the deadline: timeout → COMMUNITY, settle before SHOWING, cancel on unmount", () => {
    const root = src("components/launch-intro/LaunchIntroRoot.tsx");
    const effect = root.slice(root.indexOf("// PREPARING:"), root.indexOf("}, [doc, snapshot]);"));
    expect(effect).toMatch(/startLaunchIntroPrepareDeadline\(\(\) => \{[\s\S]{0,300}abortLaunchIntroToCommunity\("prepare_timeout"\);\s+setPhase\("done"\);/);
    expect(effect).toMatch(/if \(stopped\(\) \|\| !deadline\.settle\(\)\) return;\s+committed = true;[\s\S]{0,80}setPhase\("showing"\);/);
    expect(effect).toMatch(/return \(\) => \{\s+cancelled = true;\s+deadline\.cancel\(\);/);
    // each await (intent · device class · image load · decode · video load) is followed by a stop check
    expect((effect.match(/if \(stopped\(\)\)/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });
});

type Row = Record<string, unknown>;

function fakeSb(tables: Record<string, { list?: Row[]; byId?: Record<string, Row | null>; single?: Row | null }>): Sb {
  const from = (table: string) => {
    const t = tables[table] ?? {};
    let id: string | null = null;
    const q: Record<string, unknown> = {
      select: () => q,
      order: () => q,
      eq: (col: string, v: string) => {
        if (col === "id") id = v;
        return q;
      },
      limit: () => q,
      maybeSingle: async () => ({
        data: id != null && t.byId ? (t.byId[id] ?? null) : (t.single ?? null),
        error: null,
      }),
      then: (resolve: (v: unknown) => void) =>
        resolve({ data: t.list ?? [], error: null, count: (t.list ?? []).length }),
    };
    return q;
  };
  const storage = {
    from: () => ({
      getPublicUrl: (p: string) => ({ data: { publicUrl: `https://x.test/pub/${p}` } }),
      createSignedUrl: async () => ({ data: null, error: null }),
    }),
  };
  return { from, storage } as unknown as Sb;
}

function validPublicationDoc() {
  const base = emptyLaunchIntroDocument();
  const scene = base.scenes[0];
  return {
    ...base,
    scenes: [
      {
        ...scene,
        text: {
          headline: { value: "Hello", size: "L", weight: "bold", color: "#ffffff" },
          supporting: null,
          align: "center",
        },
      },
    ],
  };
}

const goodRow = (id: string): Row => ({
  id,
  source_draft_id: "d1",
  source_draft_version: 3,
  document: validPublicationDoc(),
  assets: [],
  eligibility: { frequency: "every_launch" },
  created_at: "2026-11-01T00:00:00.000Z",
});
const badRow = (id: string): Row => ({
  id,
  source_draft_id: "d1",
  source_draft_version: 2,
  document: { schemaVersion: 99, scenes: "broken" },
  assets: [],
  eligibility: null,
  created_at: "2026-10-01T00:00:00.000Z",
});

describe("② one broken publication does not fail the list", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("list: good rows returned, broken row marked (not dropped) and logged", async () => {
    const sb = fakeSb({ launch_intro_publications: { list: [goodRow("p1"), badRow("p2"), goodRow("p3")] } });
    const res = await listLaunchIntroPublications(sb, 20);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.publications.map((p) => p.id)).toEqual(["p1", "p3"]);
    expect(res.invalidPublications).toHaveLength(1);
    expect(res.invalidPublications[0]).toMatchObject({ id: "p2", source_draft_version: 2, created_at: "2026-10-01T00:00:00.000Z" });
    expect(typeof res.invalidPublications[0].error).toBe("string");
    expect(res.total).toBe(3);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("launch_intro_publication_invalid"));
  });

  it("admin by id: broken document → marked, not an error", async () => {
    const sb = fakeSb({ launch_intro_publications: { byId: { p9: badRow("p9") } } });
    const res = await loadLaunchIntroPublicationForAdmin(sb, "p9");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.publication).toBeNull();
      expect(res.invalid?.id).toBe("p9");
    }
  });

  it("admin snapshot: Live pointing at a broken publication outside the list still returns ok", async () => {
    const sb = fakeSb({
      launch_intro_drafts: { single: null },
      launch_intro_live: { single: { publication_id: "p9", state: "active", revision: 7, updated_at: "2026-11-01T00:00:00Z" } },
      launch_intro_publications: { list: [goodRow("p1"), badRow("p2")], byId: { p9: badRow("p9") } },
    });
    const snap = await launchIntroAdminSnapshot(sb, 20);
    expect(snap.ok).toBe(true);
    if (!snap.ok || !("invalidPublications" in snap)) return;
    expect(snap.publications.map((p) => p.id)).toEqual(["p1"]);
    expect(snap.invalidPublications.map((p) => p.id)).toEqual(["p2", "p9"]);
  });

  it("admin page renders broken rows (marked, no reactivate) and counts them", () => {
    const page = src("components/admin/launch-intro/LaunchIntroAdminPage.tsx");
    const invalidBlock = page.slice(page.indexOf("{invalidPublications.map((p) => {"));
    expect(invalidBlock).toContain("data-launch-intro-publication-invalid");
    expect(invalidBlock.slice(0, invalidBlock.indexOf("</li>"))).not.toContain('setState("reactivate"');
    expect(page).toContain("shown: String(listedPublications)");
    expect(page).toContain('t("admin_launch_intro_status_devices_invalid"');
  });
});
