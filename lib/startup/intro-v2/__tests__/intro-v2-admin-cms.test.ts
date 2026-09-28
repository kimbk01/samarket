/**
 * @vitest-environment node
 * Phase 2 Intro Admin CMS contract — Admin only, not Native runtime.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { adminMenu } from "@/components/admin/admin-menu";
import { findAdminMenuByKey } from "@/lib/admin/find-admin-menu-item";
import {
  INTRO_ADMIN_DEFAULT_MAX_HOLD_MS,
  INTRO_ADMIN_DEFAULT_TIMEZONE,
  INTRO_ADMIN_INTERACTION_UI,
  INTRO_INTERACTION_UI_TO_MODE,
  introAdvanceLabel,
  introFrequencyLabel,
} from "@/lib/startup/intro-v2/admin-labels";
import {
  INTRO_ADMIN_PLANNED_MEDIA,
  INTRO_ADMIN_UPLOADABLE_MEDIA,
  introMediaKindFromMime,
  introMediaPublishBlockReason,
  isIntroMediaUploadableNow,
} from "@/lib/startup/intro-v2/admin-media";
import {
  INTRO_ADMIN_PREVIEW_PRESETS,
  introAdminPreviewFrame,
  layerPreviewStyle,
} from "@/lib/startup/intro-v2/admin-preview";
import {
  buildAdminTargeting,
  deviceClassesFromChips,
  sanitizeAdminDeviceClasses,
  toggleAudience,
  togglePlatform,
} from "@/lib/startup/intro-v2/admin-targeting-ui";
import {
  defaultNewCampaignDraft,
  defaultNewScene,
  duplicateScene,
  isV1ImportedDraft,
  reorderLayers,
  reorderScenes,
  scenesHaveExplicitAdvance,
  v1DisplayDurationMs,
  type IntroAdminCampaign,
  type IntroAdminScene,
} from "@/lib/startup/intro-v2/admin-editor-model";
import {
  assertNoDeletedLayerReference,
  validateIntroAdvanceAdmin,
  validateIntroCampaignDraft,
  validateIntroCampaignForPublish,
  validateIntroExternalUrlAdmin,
  validateIntroScenesAgainstDbAdvanceGate,
} from "@/lib/startup/intro-v2/admin-validate";
import {
  INTRO_RESOLVER_PREVIEW_DEFAULT,
  previewIntroResolver,
} from "@/lib/startup/intro-v2/admin-resolver-preview";
import {
  createIntroAdminCampaign,
  getIntroAdminCampaign,
  listIntroAdminCampaigns,
  publishIntroAdminCampaign,
  saveIntroAdminDraft,
  transitionIntroAdminCampaign,
} from "@/lib/startup/intro-v2/admin-service";
import { introDocumentStateLabel, resolveIntroDocumentState } from "@/lib/startup/intro-v2/admin-document-state";
import { deriveIntroLiveFlags } from "@/lib/startup/intro-v2/live-status";
import { resolveIntroCampaign } from "@/lib/startup/intro-v2/resolver";
import { targetingMatches } from "@/lib/startup/intro-v2/targeting";
import { validateIntroDeviceOverrideFamily } from "@/lib/startup/intro-v2/admin-write-contract";
import {
  INTRO_FREQUENCY_MODES,
  type IntroLayer,
  type IntroResolverCandidate,
} from "@/lib/startup/intro-v2/types";

const ROOT = process.cwd();

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function listApiRoutes(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const next = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listApiRoutes(next));
    else if (entry.name === "route.ts") out.push(next);
  }
  return out;
}

function validLayer(id = "hero"): IntroLayer {
  return {
    id,
    type: "IMAGE",
    zIndex: 1,
    anchor: "center",
    xPct: 50,
    yPct: 50,
    widthPct: 80,
    safeArea: true,
    aspectPolicy: "contain",
    assetId: "asset-1",
  };
}

function validScene(partial: Partial<IntroAdminScene> = {}): IntroAdminScene {
  return {
    ...defaultNewScene("scene-1", 0, "Scene 1"),
    layers: [validLayer()],
    ...partial,
  };
}

function operatorReadyScene(partial: Partial<IntroAdminScene> = {}): IntroAdminScene {
  return validScene({
    id: "tmp-scene",
    advanceMode: "timer",
    durationMs: 4000,
    maxHoldMs: 4000,
    skipPolicy: "allow",
    ...partial,
  });
}

function seedReadyImage(db: { tables: Record<string, Row[]> }, id = "asset-1") {
  db.tables.intro_assets.push({
    id,
    kind: "image",
    storage_path: "intro/a.webp",
    public_url: "https://ckdosyydvgzqwpbwuhon.supabase.co/storage/v1/object/public/intro/a.webp",
    mime: "image/webp",
    decode_status: "ready",
    width: 1080,
    height: 1350,
  });
}

function campaign(partial: Partial<IntroAdminCampaign> = {}): IntroAdminCampaign {
  const draft = defaultNewCampaignDraft("Grand Open");
  return {
    id: "camp-1",
    updatedAt: "2026-09-27T00:00:00.000Z",
    updatedBy: "admin-1",
    ...draft,
    scenes: [validScene()],
    assets: [
      {
        id: "asset-1",
        kind: "image",
        storagePath: "intro/a.webp",
        publicUrl: "https://ckdosyydvgzqwpbwuhon.supabase.co/storage/v1/object/public/intro/a.webp",
        mime: "image/webp",
        bytes: 12,
        sha256: null,
        width: 100,
        height: 200,
        durationMs: null,
        loop: false,
        decodeStatus: "ready",
      },
    ],
    ...partial,
  };
}

type Row = Record<string, unknown>;

function createMemoryIntroDb(seed?: Partial<Record<string, Row[]>>) {
  const tables: Record<string, Row[]> = {
    intro_campaigns: [...(seed?.intro_campaigns ?? [])],
    intro_scenes: [...(seed?.intro_scenes ?? [])],
    intro_publications: [...(seed?.intro_publications ?? [])],
    intro_device_overrides: [...(seed?.intro_device_overrides ?? [])],
    intro_assets: [...(seed?.intro_assets ?? [])],
    admin_settings: [...(seed?.admin_settings ?? [])],
  };
  const writes: Array<{ table: string; op: string }> = [];
  let seq = 1;

  function match(row: Row, filters: Array<{ col: string; op: "eq" | "in"; val: unknown }>) {
    return filters.every((f) =>
      f.op === "in" ? Array.isArray(f.val) && f.val.includes(row[f.col]) : row[f.col] === f.val
    );
  }

  class Query {
    table: string;
    filters: Array<{ col: string; op: "eq" | "in"; val: unknown }> = [];
    orderCol: string | null = null;
    orderAsc = true;
    limitN: number | null = null;
    pendingInsert: Row[] | null = null;
    pendingUpdate: Row | null = null;
    pendingDelete = false;
    lastInserted: Row[] = [];

    constructor(table: string) {
      this.table = table;
    }
    select() {
      return this;
    }
    eq(col: string, val: unknown) {
      this.filters.push({ col, op: "eq", val });
      return this;
    }
    in(col: string, val: unknown) {
      this.filters.push({ col, op: "in", val });
      return this;
    }
    order(col: string, opts?: { ascending?: boolean }) {
      this.orderCol = col;
      this.orderAsc = opts?.ascending !== false;
      return this;
    }
    limit(n: number) {
      this.limitN = n;
      return this;
    }
    insert(row: Row | Row[]) {
      writes.push({ table: this.table, op: "insert" });
      this.pendingInsert = Array.isArray(row) ? row : [row];
      return this;
    }
    update(row: Row) {
      writes.push({ table: this.table, op: "update" });
      this.pendingUpdate = row;
      return this;
    }
    upsert(row: Row | Row[]) {
      writes.push({ table: this.table, op: "upsert" });
      const incoming = Array.isArray(row) ? row : [row];
      const rows = (tables[this.table] ??= []);
      for (const next of incoming) {
        const existing = rows.find(
          (current) =>
            (next.key != null && current.key === next.key) || (next.id != null && current.id === next.id)
        );
        if (existing) Object.assign(existing, next);
        else rows.push({ id: next.id ?? `id-${seq++}`, ...next });
      }
      return this;
    }
    delete() {
      writes.push({ table: this.table, op: "delete" });
      this.pendingDelete = true;
      return this;
    }
    rows(): Row[] {
      let rows = (tables[this.table] ??= []).filter((r) => match(r, this.filters));
      if (this.orderCol) {
        const col = this.orderCol;
        const asc = this.orderAsc;
        rows = [...rows].sort((a, b) => {
          const av = a[col];
          const bv = b[col];
          if (av === bv) return 0;
          return (av as number) > (bv as number) === asc ? 1 : -1;
        });
      }
      if (this.limitN != null) rows = rows.slice(0, this.limitN);
      return rows;
    }
    apply() {
      const rows = (tables[this.table] ??= []);
      if (this.pendingInsert) {
        this.lastInserted = this.pendingInsert.map((r) => {
          const row = {
            id: r.id ?? `id-${seq++}`,
            draft_revision: r.draft_revision ?? 1,
            updated_at: r.updated_at ?? new Date().toISOString(),
            published_at: r.published_at ?? new Date().toISOString(),
            ...r,
          };
          rows.push(row);
          return row;
        });
        this.pendingInsert = null;
      }
      if (this.pendingUpdate) {
        for (const row of rows) {
          if (match(row, this.filters)) Object.assign(row, this.pendingUpdate);
        }
        this.pendingUpdate = null;
      }
      if (this.pendingDelete) {
        tables[this.table] = rows.filter((r) => !match(r, this.filters));
        this.pendingDelete = false;
      }
    }
    async maybeSingle() {
      this.apply();
      return { data: this.rows()[0] ?? null, error: null };
    }
    async single() {
      this.apply();
      const data = this.lastInserted[0] ?? this.rows()[0] ?? null;
      return { data, error: data ? null : { message: "not_found" } };
    }
    then<T>(resolve: (v: { data: Row[]; error: null }) => T, reject?: (e: unknown) => T) {
      return Promise.resolve()
        .then(() => {
          this.apply();
          return { data: this.rows(), error: null };
        })
        .then(resolve, reject);
    }
  }

  return {
    tables,
    writes,
    from(table: string) {
      return new Query(table);
    },
  };
}

function fixture(now = "2026-10-01T01:00:00.000Z") {
  return {
    now,
    audience: "guest" as const,
    platform: "android" as const,
    deviceClass: "PHONE_ANDROID" as const,
    frequencyEligible: true,
  };
}

function liveCandidate(
  partial: Partial<IntroResolverCandidate> & Pick<IntroResolverCandidate, "id"> & { name?: string }
): IntroResolverCandidate & { name: string } {
  return {
    name: "Grand Open",
    publicationId: `pub-${partial.id}`,
    revision: 1,
    status: "active",
    startsAt: "2026-01-01T00:00:00.000Z",
    endsAt: null,
    priority: 10,
    targeting: { audiences: [], platforms: [], deviceClasses: [] },
    ...partial,
  };
}

describe("intro admin auth / routes", () => {
  it("gates every Intro Admin API with requireIntroAdminContext", () => {
    const routes = listApiRoutes(join(ROOT, "app/api/admin/intro-campaigns"));
    expect(routes.length).toBeGreaterThanOrEqual(8);
    for (const file of routes) {
      const src = readFileSync(file, "utf8");
      expect(src).toContain("requireIntroAdminContext");
    }
    const ctx = read("lib/startup/intro-v2/admin-api-context.ts");
    expect(ctx).toContain("requireAdminApiUser");
    expect(ctx).toContain("tryCreateSupabaseServiceClient");
  });

  it("exposes Intro under existing Promotion admin IA", () => {
    const promo = findAdminMenuByKey(adminMenu, "promotion");
    expect((promo?.children ?? []).some((c) => c.key === "promotion-intro")).toBe(true);
    const intro = findAdminMenuByKey(adminMenu, "promotion-intro");
    expect(intro?.path).toBe("/admin/intro");
  });
});

describe("intro destination entity search", () => {
  it("searches live store_products.title, not a non-existent name column", () => {
    const src = read("lib/startup/intro-v2/admin-entity-search.ts");
    expect(src).toContain('.from("store_products")');
    expect(src).toContain(".ilike(\"title\"");
    expect(src).toContain("select(\"id, title, store_id\")");
    expect(src).not.toMatch(/store_products[\s\S]*ilike\("name"/);
    expect(src).not.toContain("r.name ??");
  });
});

describe("intro list / empty / live flags", () => {
  it("lists empty campaigns without inventing rows", async () => {
    const db = createMemoryIntroDb();
    const listed = await listIntroAdminCampaigns(db);
    expect(listed.ok).toBe(true);
    if (listed.ok) expect(listed.items).toEqual([]);
  });

  it("surfaces V1 imported draft on the list", async () => {
    const db = createMemoryIntroDb({
      intro_campaigns: [
        {
          id: "v1-draft",
          name: "QA_FE_MAGENTA_CYAN",
          status: "draft",
          timezone: "Asia/Manila",
          priority: 0,
          targeting: { audiences: [], platforms: [], deviceClasses: [] },
          frequency_mode: "every_launch",
          deep_link_policy: "honor",
          draft_revision: 1,
          requires_admin_confirmation: true,
          source: { v1_key: "startup_product_intro_v1", v1_display_duration_ms: 0 },
          updated_at: "2026-09-27T00:00:00.000Z",
        },
      ],
    });
    const listed = await listIntroAdminCampaigns(db);
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.items[0]?.name).toBe("QA_FE_MAGENTA_CYAN");
    expect(listed.items[0]?.requiresAdminConfirmation).toBe(true);
    expect(listed.items[0]?.v1Imported).toBe(true);
    expect(listed.items[0]?.v1DisplayDurationMs).toBe(0);
  });

  it("derives LIVE NOW / SCHEDULED / TARGET LIMITED / DEVICE LIMITED / FREQUENCY CONTROLLED", () => {
    const winner = deriveIntroLiveFlags({
      status: "active",
      startsAt: "2026-01-01T00:00:00.000Z",
      endsAt: null,
      targeting: { audiences: ["guest"], platforms: ["android"], deviceClasses: ["PHONE_ANDROID"] },
      frequencyMode: "once_per_day",
      nowIso: "2026-10-01T01:00:00.000Z",
      winnerId: "camp-1",
      campaignId: "camp-1",
    });
    expect(winner.liveNow).toBe(true);
    expect(winner.derived).toBe("LIVE_NOW");
    expect(winner.targetLimited).toBe(true);
    expect(winner.deviceLimited).toBe(true);
    expect(winner.frequencyControlled).toBe(true);

    const scheduled = deriveIntroLiveFlags({
      status: "active",
      startsAt: "2026-12-01T00:00:00.000Z",
      endsAt: null,
      targeting: { audiences: [], platforms: [], deviceClasses: [] },
      frequencyMode: "every_launch",
      nowIso: "2026-10-01T01:00:00.000Z",
      winnerId: null,
      campaignId: "camp-2",
    });
    expect(scheduled.derived).toBe("SCHEDULED");
    expect(scheduled.liveNow).toBe(false);
  });
});

describe("create / edit / draft isolation", () => {
  it("seeds Scene 1 on campaign create so a campaign is never scene-empty", async () => {
    const db = createMemoryIntroDb();
    const created = await createIntroAdminCampaign(db, { adminUserId: "admin-1", name: "New intro" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const loaded = await getIntroAdminCampaign(db, created.id);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.campaign.scenes).toHaveLength(1);
    expect(loaded.campaign.scenes[0]?.sortOrder).toBe(0);
    expect(loaded.campaign.scenes[0]?.id).not.toMatch(/^tmp-/);
    expect(loaded.campaign.scenes[0]?.advanceMode).toBe("manual");
  });

  it("creates a draft campaign and edits without touching publications", async () => {
    const db = createMemoryIntroDb();
    const created = await createIntroAdminCampaign(db, { adminUserId: "admin-1", name: "New intro" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    db.tables.intro_publications.push({
      id: "pub-keep",
      campaign_id: created.id,
      revision: 3,
      is_live: true,
      manifest: { frozen: true },
    });
    const before = structuredClone(db.tables.intro_publications);

    const saved = await saveIntroAdminDraft(db, created.id, "admin-1", {
      name: "Edited intro",
      scenes: [validScene({ id: "tmp-s1", name: "First" })],
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.campaign.name).toBe("Edited intro");
    expect(saved.campaign.scenes[0]?.name).toBe("First");
    expect(saved.campaign.scenes[0]?.sortOrder).toBe(0);
    expect(db.tables.intro_publications).toEqual(before);
    expect(db.writes.filter((w) => w.table === "intro_publications")).toEqual([]);
  });

  it("blocks TIMER duration 0 on draft save with scene-specific copy and does not write the scene", async () => {
    const db = createMemoryIntroDb();
    const created = await createIntroAdminCampaign(db, { adminUserId: "admin-1", name: "Timer gate" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const seededScenes = structuredClone(
      db.tables.intro_scenes.filter((r) => r.campaign_id === created.id)
    );
    expect(seededScenes).toHaveLength(1);
    const saved = await saveIntroAdminDraft(db, created.id, "admin-1", {
      scenes: [validScene({ id: "tmp-s1", name: "Hold", advanceMode: "timer", durationMs: 0 })],
    });
    expect(saved.ok).toBe(false);
    if (saved.ok) return;
    expect(saved.httpStatus).toBe(400);
    expect(saved.error).toBe("timer_duration_required");
    expect(saved.issues?.some((i) => i.code === "timer_duration_required")).toBe(true);
    expect(saved.issues?.[0]?.path).toBe("scenes[0].durationMs");
    expect(saved.issues?.[0]?.messageKo).toMatch(/Hold: 지정 시간은 1ms 이상/);
    expect(saved.issues?.[0]?.messageEn).toMatch(/at least 1ms/);
    expect(db.tables.intro_scenes.filter((r) => r.campaign_id === created.id)).toEqual(seededScenes);
  });

  it("lets V1 unconfirmed drafts keep a null TIMER duration without hitting persist gate", () => {
    const imported = campaign({
      name: "QA_FE_MAGENTA_CYAN",
      requiresAdminConfirmation: true,
      source: { v1_key: "startup_product_intro_v1", v1_display_duration_ms: 0 },
      scenes: [validScene({ name: "Imported", advanceMode: "timer", durationMs: null })],
    });
    const persist = validateIntroScenesAgainstDbAdvanceGate(imported);
    expect(persist.ok).toBe(true);
    const zero = validateIntroScenesAgainstDbAdvanceGate(
      campaign({
        scenes: [validScene({ name: "Hold", advanceMode: "timer", durationMs: 0 })],
      })
    );
    expect(zero.ok).toBe(false);
    expect(zero.issues[0]?.code).toBe("timer_duration_required");
  });
});

describe("targeting / schedule / frequency", () => {
  it("stores independent multi-select dimensions and empty as ALL", () => {
    const guestAuth = buildAdminTargeting({
      audiences: toggleAudience(toggleAudience([], "guest"), "authenticated"),
      platforms: [],
      deviceChips: [],
    });
    expect(guestAuth.audiences).toEqual(["guest", "authenticated"]);
    expect(targetingMatches(guestAuth, { audience: "guest", platform: "android", deviceClass: "PHONE_ANDROID" })).toBe(true);

    const returningAndroid = buildAdminTargeting({
      audiences: ["returning"],
      platforms: togglePlatform([], "android"),
      deviceChips: [],
    });
    expect(returningAndroid.platforms).toEqual(["android"]);

    const allAudienceIos = buildAdminTargeting({
      audiences: [],
      platforms: ["ios"],
      deviceChips: [],
    });
    expect(allAudienceIos.audiences).toEqual([]);
    expect(targetingMatches(allAudienceIos, { audience: "guest", platform: "ios", deviceClass: "PHONE_IOS" })).toBe(true);
  });

  it("never writes UNKNOWN from Admin chips", () => {
    expect(deviceClassesFromChips(["Phone", "Tablet"]).includes("UNKNOWN")).toBe(false);
    expect(sanitizeAdminDeviceClasses(["UNKNOWN", "PHONE_ANDROID"])).toEqual(["PHONE_ANDROID"]);
  });

  it("manages all Phase 1 frequency modes with human labels", () => {
    expect([...INTRO_FREQUENCY_MODES]).toEqual([
      "every_launch",
      "once_ever",
      "once_per_day",
      "once_per_session",
    ]);
    expect(introFrequencyLabel("every_launch", "ko")).toBe("앱을 새로 실행할 때마다");
    expect(introFrequencyLabel("once_per_day", "ko")).toBe("하루 한 번");
    expect(introFrequencyLabel("once_ever", "ko")).toBe("캠페인당 한 번");
  });
});

describe("scene manager / advance", () => {
  it("adds, duplicates, deletes, and reorders scenes without duplicate sort_order", () => {
    const a = defaultNewScene("a", 0, "A");
    const b = defaultNewScene("b", 1, "B");
    const c = defaultNewScene("c", 2, "C");
    const reordered = reorderScenes([a, b, c], 2, 0);
    expect(reordered.map((s) => s.id)).toEqual(["c", "a", "b"]);
    expect(reordered.map((s) => s.sortOrder)).toEqual([0, 1, 2]);

    const dup = duplicateScene(validScene({ interactionLayerId: "hero" }), "copy-1", 1);
    expect(dup.id).toBe("copy-1");
    expect(dup.layers[0]?.id).not.toBe("hero");
    expect(dup.interactionLayerId).toBe(dup.layers[0]?.id);

    const deleted = reordered.filter((s) => s.id !== "a").map((s, i) => ({ ...s, sortOrder: i }));
    expect(deleted.map((s) => s.sortOrder)).toEqual([0, 1]);
  });

  it("rejects timer duration 0 and does not reuse 0 as another meaning", () => {
    expect(validateIntroAdvanceAdmin("timer", 0, null).ok).toBe(false);
    expect(validateIntroAdvanceAdmin("timer", 2500, null).ok).toBe(true);
    expect(validateIntroAdvanceAdmin("manual", null, INTRO_ADMIN_DEFAULT_MAX_HOLD_MS).ok).toBe(true);
    expect(validateIntroAdvanceAdmin("media_end", null, null).ok).toBe(false);
    expect(introAdvanceLabel("timer", "ko")).toBe("지정 시간 후 다음 화면");
    expect(introAdvanceLabel("media_end", "ko")).toBe("미디어 재생 후 다음 화면");
    expect(introAdvanceLabel("cta_only", "ko")).toBe("사용자가 선택할 때까지");
    expect(defaultNewScene("x", 0, "X").advanceMode).toBe("manual");
    expect(defaultNewScene("x", 0, "X").durationMs).toBeNull();
  });
});

describe("layers / interaction / CTA", () => {
  it("adds, edits, deletes, and reorders layers with Phase 1 percent coords", () => {
    const layers = [
      validLayer("a"),
      { ...validLayer("b"), zIndex: 2, xPct: 10, yPct: 20 },
    ];
    const moved = reorderLayers(layers, 1, 0);
    expect(moved.map((l) => l.id)).toEqual(["b", "a"]);
    expect(moved.map((l) => l.zIndex)).toEqual([1, 2]);
    const style = layerPreviewStyle(moved[0]!);
    expect(style.left).toBe("10%");
    expect(style.top).toBe("20%");
    expect(JSON.stringify(style).includes("px")).toBe(false);
  });

  it("supports the four interaction kinds and blocks deleted layer refs", () => {
    expect(INTRO_ADMIN_INTERACTION_UI).toEqual(["NONE", "BUTTON", "FULL_SCENE", "LAYER"]);
    expect(INTRO_INTERACTION_UI_TO_MODE.NONE).toBe("none");
    expect(INTRO_INTERACTION_UI_TO_MODE.BUTTON).toBe("tap_cta");
    expect(INTRO_INTERACTION_UI_TO_MODE.FULL_SCENE).toBe("tap_advance");
    expect(INTRO_INTERACTION_UI_TO_MODE.LAYER).toBe("tap_layer");
    expect(assertNoDeletedLayerReference([validLayer("keep")], "keep")).toBe(true);
    expect(assertNoDeletedLayerReference([validLayer("keep")], "gone")).toBe(false);

    const bad = campaign({
      scenes: [validScene({ interactionMode: "tap_layer", interactionLayerId: "gone" })],
    });
    const result = validateIntroCampaignForPublish(bad);
    expect(result.issues.some((i) => i.code === "interaction_layer_missing")).toBe(true);
    expect(result.issues[0]?.path).toContain("scenes[0]");
  });

  it("validates typed CTA destinations and https allowlist before save", () => {
    expect(validateIntroExternalUrlAdmin("http://dibay.app")?.code).toBe("https_required");
    expect(validateIntroExternalUrlAdmin("https://evil.example")?.code).toBe("external_host_not_allowed");
    expect(validateIntroExternalUrlAdmin("https://dibay.app/promo")).toBeNull();
    expect(validateIntroExternalUrlAdmin("https://www.dibay.app")).toBeNull();
    expect(validateIntroExternalUrlAdmin("https://samarket.vercel.app")).toBeNull();

    const badCta = campaign({
      scenes: [
        validScene({
          cta: { enabled: true, destination: { type: "EXTERNAL_URL", url: "http://example.com" } },
        }),
      ],
    });
    expect(validateIntroCampaignDraft(badCta).issues.some((i) => i.code === "https_required")).toBe(true);
  });
});

describe("device override / preview / safe-area guide", () => {
  it("accepts Phase 1 device families and keeps COMMON when empty", () => {
    expect(validateIntroDeviceOverrideFamily("PHONE").ok).toBe(true);
    expect(validateIntroDeviceOverrideFamily("TABLET").ok).toBe(true);
    expect(validateIntroDeviceOverrideFamily("DESKTOP").ok).toBe(true);
    expect(validateIntroDeviceOverrideFamily("phone").ok).toBe(false);
    expect(campaign().deviceOverrides).toEqual([]);
  });

  it("exposes Admin preview presets as ADMIN_PREVIEW, not native truth", () => {
    expect([...INTRO_ADMIN_PREVIEW_PRESETS]).toEqual([
      "samsung_phone",
      "iphone_14_pro_max",
      "android_tablet",
      "ipad",
    ]);
    for (const preset of INTRO_ADMIN_PREVIEW_PRESETS) {
      const frame = introAdminPreviewFrame(preset);
      expect(frame.contract).toBe("ADMIN_PREVIEW");
      expect(frame.safeAreaGuide.top).toBeGreaterThan(0);
    }
  });
});

describe("V1 imported draft / publish revision", () => {
  it("blocks V1 displayDurationMs=0 until operator sets advance, and never auto-converts to TIMER", () => {
    const imported = campaign({
      name: "QA_FE_MAGENTA_CYAN",
      requiresAdminConfirmation: true,
      source: { v1_key: "startup_product_intro_v1", v1_display_duration_ms: 0 },
      scenes: [validScene({ advanceMode: "manual", durationMs: null, maxHoldMs: null })],
    });
    expect(isV1ImportedDraft(imported)).toBe(true);
    expect(v1DisplayDurationMs(imported.source)).toBe(0);
    expect(scenesHaveExplicitAdvance(imported.scenes)).toBe(false);
    const blocked = validateIntroCampaignForPublish(imported);
    expect(blocked.ok).toBe(false);
    expect(blocked.issues.some((i) => i.code === "requires_admin_confirmation")).toBe(true);
    expect(blocked.issues.some((i) => i.messageKo.includes("자동으로 타이머"))).toBe(true);
    expect(imported.scenes[0]?.advanceMode).not.toBe("timer");

    const confirmed = campaign({
      requiresAdminConfirmation: true,
      source: { v1_key: "startup_product_intro_v1", v1_display_duration_ms: 0 },
      scenes: [validScene({ advanceMode: "manual", maxHoldMs: 8000 })],
    });
    expect(validateIntroCampaignForPublish(confirmed).ok).toBe(true);
  });

  it("publishes an immutable new revision and later draft edits do not mutate it", async () => {
    const db = createMemoryIntroDb();
    const created = await createIntroAdminCampaign(db, { adminUserId: "admin-1", name: "Grand Open" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    seedReadyImage(db);
    await saveIntroAdminDraft(db, created.id, "admin-1", {
      scenes: [operatorReadyScene()],
    });

    const first = await publishIntroAdminCampaign(db, created.id, "admin-1");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.revision).toBe(1);
    const firstManifest = structuredClone(
      db.tables.intro_publications.find((p) => p.id === first.publicationId)?.manifest
    );

    const second = await publishIntroAdminCampaign(db, created.id, "admin-1");
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.revision).toBe(2);
    expect(db.tables.intro_publications.find((p) => p.id === first.publicationId)?.manifest).toEqual(firstManifest);
    expect(db.tables.intro_publications.find((p) => p.id === first.publicationId)?.is_live).toBe(false);
    expect(db.tables.intro_publications.find((p) => p.id === second.publicationId)?.is_live).toBe(true);

    const afterPublish = await getIntroAdminCampaign(db, created.id);
    expect(afterPublish.ok && afterPublish.campaign.draftDivergedFromPublication).toBe(false);

    await saveIntroAdminDraft(db, created.id, "admin-1", { name: "Draft after publish" });
    const kept = db.tables.intro_publications.find((p) => p.id === second.publicationId);
    expect(kept?.revision).toBe(2);
    expect((kept?.manifest as { campaign?: { name?: string } } | undefined)?.campaign?.name).toBe("Grand Open");
    const afterDraft = await getIntroAdminCampaign(db, created.id);
    expect(afterDraft.ok && afterDraft.campaign.draftDivergedFromPublication).toBe(true);
    expect(afterDraft.ok && afterDraft.campaign.name).toBe("Draft after publish");
  });

  it("pauses and archives through status transitions, not publication mutation", async () => {
    const db = createMemoryIntroDb();
    const created = await createIntroAdminCampaign(db, { adminUserId: "admin-1", name: "Ops" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    seedReadyImage(db);
    await saveIntroAdminDraft(db, created.id, "admin-1", {
      scenes: [operatorReadyScene()],
    });
    const published = await publishIntroAdminCampaign(db, created.id, "admin-1");
    expect(published.ok).toBe(true);
    if (!published.ok) return;
    const liveManifest = structuredClone(
      db.tables.intro_publications.find((p) => p.id === published.publicationId)?.manifest
    );
    const paused = await transitionIntroAdminCampaign(db, created.id, "admin-1", "pause");
    expect(paused.ok).toBe(true);
    if (paused.ok) expect(paused.campaign.status).toBe("paused");
    const resumed = await transitionIntroAdminCampaign(db, created.id, "admin-1", "resume");
    expect(resumed.ok).toBe(true);
    if (resumed.ok) expect(["active", "scheduled"]).toContain(resumed.campaign.status);
    const archived = await transitionIntroAdminCampaign(db, created.id, "admin-1", "archive");
    expect(archived.ok).toBe(true);
    if (archived.ok) expect(archived.campaign.status).toBe("archived");
    expect(db.tables.intro_publications.find((p) => p.id === published.publicationId)?.manifest).toEqual(liveManifest);
  });
});

describe("resolver preview / ZERO INTRO / media boundary", () => {
  it("uses the same Phase 1 resolver and reports ZERO INTRO", () => {
    const candidates = [
      liveCandidate({ id: "low", priority: 1, name: "Low" }),
      liveCandidate({ id: "grand", priority: 50, name: "Grand Open" }),
    ];
    const preview = previewIntroResolver(candidates, fixture());
    const runtime = resolveIntroCampaign(candidates, fixture());
    expect(preview.winner?.id).toBe(runtime?.id);
    expect(preview.winner?.name).toBe("Grand Open");
    expect(preview.reasonCodes).toEqual(["ACTIVE", "schedule_matched", "target_matched", "priority_winner"]);

    const zero = previewIntroResolver([], fixture());
    expect(zero.zeroIntro).toBe(true);
    expect(zero.winner).toBeNull();
    expect(INTRO_RESOLVER_PREVIEW_DEFAULT.deviceClass).toBe("PHONE_ANDROID");
    expect(INTRO_ADMIN_DEFAULT_TIMEZONE).toBe("Asia/Manila");
  });

  it("keeps GIF/MP4 planned but not uploadable, and blocks unready media on publish", () => {
    expect([...INTRO_ADMIN_PLANNED_MEDIA]).toEqual(["PNG", "JPG", "WebP", "GIF", "MP4"]);
    expect([...INTRO_ADMIN_UPLOADABLE_MEDIA]).toEqual(["PNG", "JPG", "WebP"]);
    expect(isIntroMediaUploadableNow("image", "image/png")).toBe(true);
    expect(isIntroMediaUploadableNow("gif", "image/gif")).toBe(false);
    expect(introMediaKindFromMime("image/gif")).toBe("gif");
    expect(introMediaPublishBlockReason({ kind: "gif", decodeStatus: "pending" })).toBe(
      "media_pipeline_not_ready"
    );
    const blocked = validateIntroCampaignForPublish(
      campaign({
        assets: [
          {
            id: "gif-1",
            kind: "gif",
            storagePath: "intro/a.gif",
            publicUrl: "https://example.com/a.gif",
            mime: "image/gif",
            bytes: 1,
            sha256: null,
            width: 1,
            height: 1,
            durationMs: null,
            loop: true,
            decodeStatus: "pending",
          },
        ],
        scenes: [validScene({ layers: [{ ...validLayer(), assetId: "gif-1" }] })],
      })
    );
    expect(blocked.ok).toBe(false);
    expect(blocked.issues.some((i) => i.code === "media_pipeline_not_ready")).toBe(true);
  });
});

describe("composer reconstruction contract", () => {
  it("uses document states instead of UUID / ISO as primary operator state", () => {
    const draft = campaign({ status: "draft", published: null, updatedAt: "" });
    expect(resolveIntroDocumentState({ campaign: draft, dirty: false, saving: false, issues: [] })).toBe("DRAFT");
    expect(resolveIntroDocumentState({ campaign: draft, dirty: true, saving: false, issues: [] })).toBe("UNSAVED_CHANGES");
    const published = campaign({
      status: "active",
      published: {
        id: "pub-1",
        revision: 2,
        publishedAt: "2026-09-01T00:00:00.000Z",
        publishedBy: "admin-1",
        isLive: true,
      },
    });
    expect(resolveIntroDocumentState({ campaign: published, dirty: false, saving: false, issues: [] })).toBe("PUBLISHED");
    expect(resolveIntroDocumentState({ campaign: published, dirty: true, saving: false, issues: [] })).toBe("DIRTY_AFTER_PUBLISH");
    expect(
      resolveIntroDocumentState({
        campaign: { ...published, draftDivergedFromPublication: true },
        dirty: false,
        saving: false,
        issues: [],
      })
    ).toBe("DIRTY_AFTER_PUBLISH");
    expect(introDocumentStateLabel("PUBLISHED", "ko", 2)).toBe("게시됨 · Revision 2");
    expect(introDocumentStateLabel("DIRTY_AFTER_PUBLISH", "ko")).toBe("게시 후 변경사항 있음");
  });

  it("leads validation with human CTA language, not schema paths", () => {
    const blocked = validateIntroCampaignForPublish(
      campaign({
        scenes: [
          validScene({
            name: "오프닝",
            interactionMode: "tap_cta",
            cta: { enabled: true, destination: { type: "PRODUCT" } },
          }),
        ],
      })
    );
    expect(blocked.ok).toBe(false);
    const dest = blocked.issues.find((i) => i.code === "cta_destination_id_required" || i.code === "cta_destination_required");
    expect(dest?.messageKo).toMatch(/오프닝/);
    expect(dest?.messageKo).toMatch(/이동할 화면을 선택하세요/);
    expect(dest?.messageKo.startsWith("scenes[")).toBe(false);
    expect(dest?.sceneIndex).toBe(0);
  });

  it("emits heightPct in preview style and keeps Admin preview as ADMIN_PREVIEW", () => {
    const style = layerPreviewStyle({
      anchor: "center",
      xPct: 50,
      yPct: 50,
      widthPct: 80,
      heightPct: 60,
    });
    expect(style.height).toBe("60%");
    expect(style.width).toBe("80%");
    expect(style.left).toBe("50%");
    const frame = introAdminPreviewFrame("samsung_phone");
    expect(frame.contract).toBe("ADMIN_PREVIEW");
    expect(frame.width).toBe(360);
    expect(introAdminPreviewFrame("android_tablet").width).toBe(800);
  });

  it("routes the rebuild editor and keeps leftover Composer/Operator unrouted", () => {
    const route = read("app/admin/intro/[campaignId]/page.tsx");
    const gate = read("components/admin/intro/AdminIntroCampaignRoute.tsx");
    const dest = read("components/admin/intro/AdminIntroCmsCtaDestinationFields.tsx");
    const list = read("components/admin/intro/AdminIntroListPage.tsx");
    const catalog = read("lib/i18n/catalog/admin-intro.ts");
    const backend = read("lib/startup/intro-v2/compat-publish.ts");
    expect(route).toContain("AdminIntroCampaignRoute");
    expect(route).not.toContain("AdminIntroOperatorForm");
    expect(route).not.toContain("AdminIntroEditorPage");
    expect(gate).toContain("NewIntroEditor");
    expect(gate).not.toContain("AdminIntroCmsEditorPage");
    expect(gate).not.toContain("IntroV3OpenNotice");
    expect(gate).not.toContain("AdminIntroOperatorForm");
    expect(gate).not.toContain("AdminIntroEditorPage");
    expect(dest).toContain("INTRO_CTA_DESTINATION_TYPES");
    expect(existsSync(join(ROOT, "components/admin/intro/AdminIntroEditorPage.tsx"))).toBe(false);
    expect(existsSync(join(ROOT, "components/admin/intro/AdminIntroPreviewCanvas.tsx"))).toBe(false);
    expect(existsSync(join(ROOT, "components/admin/intro/AdminIntroOperatorForm.tsx"))).toBe(false);
    expect(existsSync(join(ROOT, "components/admin/intro/AdminIntroOperatorPreview.tsx"))).toBe(false);
    expect(existsSync(join(ROOT, "lib/startup/intro-v2/composer-visual.ts"))).toBe(false);
    expect(list).toContain("introCmsListStateLabel");
    expect(list).toContain('"published"');
    expect(list).not.toContain('"applied"');
    expect(list).not.toContain("현재 앱 적용");
    expect(list).toContain("introCmsDeviceReadinessLabel");
    expect(list).not.toContain('data-intro-list="composer"');
    expect(list).not.toContain("introDerivedStatusLabel");
    expect(catalog).not.toContain("새 Intro 런타임 게시 지원 준비 중");
    expect(backend).toContain('INTRO_RICH_PUBLISH_BLOCKED_CODE = "rich_runtime_not_ready"');
    expect(backend).toContain("새 Intro 런타임 게시 지원 준비 중");
    expect(read("lib/startup/intro-v2/live-status.ts")).toContain("현재 노출 중");
  });
});
