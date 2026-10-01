/**
 * DIBAY Intro — first vertical slice contract guards (pure + static).
 * Runtime PASS is decided on devices, not here.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  emptyLaunchIntroDocument,
  inspectLaunchIntroAsset,
  isLaunchIntroInternalPath,
  LAUNCH_INTRO_VIDEO_MAX_BYTES,
  launchIntroDocumentVideoRefs,
  launchIntroDocumentAssets,
  normalizeLaunchIntroHex,
  sniffLaunchIntroImage,
  sniffLaunchIntroVideo,
  toPublicationDocument,
  validateLaunchIntroDocument,
} from "../document";
import { launchIntroCanReactivate, launchIntroCanTransition, launchIntroDraftStatus } from "../lifecycle";
import {
  claimLaunchOsReleaseForIntro,
  getLaunchOsReleaseOwner,
  handLaunchOsReleaseToCommunity,
  isLaunchOsReleased,
  noteLaunchOsReleased,
  onLaunchOsReleased,
} from "../os-release-owner";

const src = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
const SHA = "a".repeat(64);

function pngHeader(w: number, h: number): Uint8Array {
  const b = new Uint8Array(32);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 0);
  b.set([w >>> 24, (w >>> 16) & 255, (w >>> 8) & 255, w & 255, h >>> 24, (h >>> 16) & 255, (h >>> 8) & 255, h & 255], 16);
  return b;
}

/** Minimal ISO BMFF: ftyp + moov(mvhd, trak(tkhd, mdia(hdlr, minf(stbl(stsd))))) — structure only. */
function box(type: string, ...parts: Uint8Array[]): Uint8Array {
  const len = 8 + parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  new DataView(out.buffer).setUint32(0, len);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  let o = 8;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
function u32s(...v: number[]): Uint8Array {
  const b = new Uint8Array(v.length * 4);
  v.forEach((x, i) => new DataView(b.buffer).setUint32(i * 4, x >>> 0));
  return b;
}
function mp4(opts: { w: number; h: number; ms: number; codec?: string; rotate90?: boolean; pad?: number }): Uint8Array {
  const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
  // mvhd v0: version/flags, ctime, mtime, timescale, duration, …
  const mvhd = box("mvhd", u32s(0, 0, 0, 1000, opts.ms), new Uint8Array(80));
  // tkhd v0: version/flags, ctime, mtime, trackId, reserved, duration, reserved×2, layer/alt, vol/res, matrix(9), w, h
  const matrix = opts.rotate90 ? [0, 0x10000, 0, -0x10000, 0, 0, 0, 0, 0x40000000] : [0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000];
  const tkhd = box("tkhd", u32s(0, 0, 0, 1, 0, opts.ms, 0, 0, 0, 0, ...matrix, opts.w << 16, opts.h << 16));
  const hdlr = box("hdlr", u32s(0, 0), ascii("vide"), new Uint8Array(12));
  const stsd = box("stsd", u32s(0, 1), box(opts.codec ?? "avc1", new Uint8Array(78)));
  const trak = box("trak", tkhd, box("mdia", hdlr, box("minf", box("stbl", stsd))));
  const parts = [box("ftyp", ascii("isom"), u32s(0x200), ascii("isomavc1")), box("moov", mvhd, trak)];
  if (opts.pad) parts.push(box("mdat", new Uint8Array(opts.pad)));
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
function gifHeader(w: number, h: number): Uint8Array {
  return Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, w & 255, w >> 8, h & 255, h >> 8, 0, 0, 0]);
}

describe("launch intro document", () => {
  const textStyle = (value: string) => ({ value, size: "L" as const, weight: "bold" as const, color: "#ffffff" });

  it("accepts the empty draft and rejects it as a publication", () => {
    const doc = emptyLaunchIntroDocument();
    expect(doc.schemaVersion).toBe(2);
    expect(validateLaunchIntroDocument(doc, "draft").ok).toBe(true);
    expect(validateLaunchIntroDocument(doc, "publication")).toEqual({ ok: false, error: "scene_empty" });
  });

  it("multi-scene: count limits, unique ids, internal route paths, next not on the last scene", () => {
    const base = emptyLaunchIntroDocument();
    const scene = base.scenes[0];
    const withText = { ...scene, text: { headline: textStyle("Hello"), supporting: null, align: "center" as const } };
    const ok = validateLaunchIntroDocument({ ...base, scenes: [withText] }, "publication");
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.document.scenes[0].text?.headline?.color).toBe("#FFFFFF");

    const nine = Array.from({ length: 9 }, (_, i) => ({ ...scene, id: `scene-${i + 1}` }));
    expect(validateLaunchIntroDocument({ ...base, scenes: nine }, "draft")).toEqual({ ok: false, error: "scenes_count_invalid" });
    expect(validateLaunchIntroDocument({ ...base, scenes: [] }, "draft")).toEqual({ ok: false, error: "scenes_count_invalid" });
    expect(validateLaunchIntroDocument({ ...base, scenes: [scene, scene] }, "draft")).toEqual({ ok: false, error: "scene_id_duplicate" });

    const route = (path: string) => ({ ...scene, cta: { label: "Go", action: { type: "route", path } } });
    expect(validateLaunchIntroDocument({ ...base, scenes: [route("https://evil.example")] }, "draft")).toEqual({ ok: false, error: "cta_path_invalid" });
    expect(validateLaunchIntroDocument({ ...base, scenes: [route("/stores")] }, "draft").ok).toBe(true);

    const next = { ...scene, cta: { label: "Next", action: { type: "next" } } };
    expect(validateLaunchIntroDocument({ ...base, scenes: [next] }, "draft")).toEqual({ ok: false, error: "cta_next_on_last_scene" });
    expect(validateLaunchIntroDocument({ ...base, scenes: [next, { ...scene, id: "scene-2" }] }, "draft").ok).toBe(true);

    expect(validateLaunchIntroDocument({ ...base, scenes: [{ ...scene, durationMs: 50 }] }, "draft")).toEqual({ ok: false, error: "duration_invalid" });
    expect(validateLaunchIntroDocument({ ...base, settings: {} }, "draft")).toEqual({ ok: false, error: "settings_invalid" });
    expect(validateLaunchIntroDocument({ ...base, schemaVersion: 3 }, "draft")).toEqual({ ok: false, error: "schema_version_unknown" });
  });

  it("v1 (first slice) documents upgrade losslessly: text → headline L bold, image → media, path → route, Skip on", () => {
    const v1 = {
      schemaVersion: 1,
      scenes: [
        {
          id: "scene-1",
          background: "#075740",
          image: { sha256: SHA, mime: "image/png", bytes: 1000, width: 400, height: 300 },
          text: { value: "dibaY", color: "#ffffff" },
          cta: { label: "Go", path: "/stores" },
          durationMs: 4000,
        },
      ],
    };
    const v = validateLaunchIntroDocument(v1, "publication");
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.document).toEqual({
      schemaVersion: 2,
      settings: { skip: { enabled: true } },
      scenes: [
        {
          id: "scene-1",
          layout: "stack",
          background: { color: "#075740", media: null },
          media: { asset: { sha256: SHA, mime: "image/png", bytes: 1000, width: 400, height: 300 }, fit: "contain", video: null },
          logo: null,
          decorations: [],
          text: { headline: { value: "dibaY", size: "L", weight: "bold", color: "#FFFFFF" }, supporting: null, align: "center" },
          cta: { label: "Go", action: { type: "route", path: "/stores" } },
          motion: { enter: "none", float: false },
          transition: "none",
          durationMs: 4000,
        },
      ],
    });
  });

  it("P2 compositions: preset layouts only, logo layout needs a logo, explicit cover, unique decoration slots", () => {
    const base = emptyLaunchIntroDocument();
    const scene = base.scenes[0];
    const img = (sha: string) => ({ sha256: sha, mime: "image/png", bytes: 10, width: 64, height: 64 });
    const text = { headline: textStyle("Hi"), supporting: null, align: "center" as const };
    const pub = (sc: Record<string, unknown>) => validateLaunchIntroDocument({ ...base, scenes: [{ ...scene, text, ...sc }] }, "publication");
    expect(pub({ layout: "canvas" })).toEqual({ ok: false, error: "layout_invalid" });
    expect(pub({ layout: "logo" })).toEqual({ ok: false, error: "layout_logo_requires_logo" });
    expect(pub({ layout: "logo", logo: { asset: img(SHA) } }).ok).toBe(true);
    expect(pub({ media: { asset: img(SHA), fit: "stretch" } })).toEqual({ ok: false, error: "media_fit_invalid" });
    expect(pub({ media: { asset: img(SHA), fit: "cover" } }).ok).toBe(true);
    const deco = (slot: string) => ({ asset: img(SHA), slot, size: "M" });
    expect(pub({ decorations: [deco("top-left"), deco("top-left")] })).toEqual({ ok: false, error: "decoration_slot_invalid" });
    expect(pub({ decorations: [deco("top-left"), deco("top-right"), deco("bottom-left"), deco("bottom-right")] })).toEqual({ ok: false, error: "decorations_invalid" });
    expect(pub({ motion: { enter: "spin", float: false } })).toEqual({ ok: false, error: "motion_invalid" });
    expect(pub({ transition: "zoom" })).toEqual({ ok: false, error: "transition_invalid" });

    const shaB = "b".repeat(64);
    const shaC = "c".repeat(64);
    const draftImg = (sha: string) => ({ ...img(sha), draftPath: "draft/00000000-0000-0000-0000-000000000000.png" });
    const draft = {
      ...base,
      scenes: [
        {
          ...scene,
          text,
          background: { color: "#075740", media: { asset: draftImg(shaB), fit: "cover" } },
          logo: { asset: draftImg(shaC) },
          decorations: [{ asset: draftImg(SHA), slot: "top-left", size: "S" }],
        },
      ],
    };
    const v = validateLaunchIntroDocument(draft, "draft");
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const p = toPublicationDocument(v.document);
    expect(JSON.stringify(p)).not.toContain("draftPath");
    expect(launchIntroDocumentAssets(p).map((a) => a.sha256).sort()).toEqual([SHA, shaB, shaC].sort());
  });

  it("P3 GIF + MP4: poster required and same aspect, ≤5MB / ≤30s, H.264 only, server authority on bytes", () => {
    expect(sniffLaunchIntroImage(gifHeader(320, 200))).toEqual({ mime: "image/gif", width: 320, height: 200 });
    expect(sniffLaunchIntroVideo(mp4({ w: 640, h: 360, ms: 4000 }))).toMatchObject({ mime: "video/mp4", width: 640, height: 360, durationMs: 4000, codec: "avc1" });
    expect(sniffLaunchIntroVideo(mp4({ w: 640, h: 360, ms: 4000, rotate90: true }))).toMatchObject({ width: 360, height: 640 });
    expect(sniffLaunchIntroVideo(mp4({ w: 640, h: 360, ms: 4000, codec: "hvc1" }))).toBeNull();

    // Server authority (finalize + publish): the bytes decide, not the Admin UI.
    expect(inspectLaunchIntroAsset(mp4({ w: 640, h: 360, ms: 4000 }))).toMatchObject({ ok: true, kind: "video" });
    expect(inspectLaunchIntroAsset(mp4({ w: 640, h: 360, ms: 4000, pad: LAUNCH_INTRO_VIDEO_MAX_BYTES }))).toEqual({ ok: false, error: "video_too_big" });
    expect(inspectLaunchIntroAsset(mp4({ w: 640, h: 360, ms: 30_001 }))).toEqual({ ok: false, error: "video_duration_invalid" });
    expect(inspectLaunchIntroAsset(mp4({ w: 640, h: 360, ms: 4000, codec: "hvc1" }))).toEqual({ ok: false, error: "unsupported_media" });
    expect(inspectLaunchIntroAsset(gifHeader(320, 200))).toMatchObject({ ok: true, kind: "image", mime: "image/gif" });

    const base = emptyLaunchIntroDocument();
    const scene = base.scenes[0];
    const text = { headline: textStyle("Hi"), supporting: null, align: "center" as const };
    const poster = (w: number, h: number) => ({ sha256: SHA, mime: "image/jpeg", bytes: 10, width: w, height: h });
    const video = (extra: Record<string, unknown> = {}) => ({ sha256: "d".repeat(64), mime: "video/mp4", bytes: 1000, width: 640, height: 360, durationMs: 4000, ...extra });
    const pub = (media: unknown) => validateLaunchIntroDocument({ ...base, scenes: [{ ...scene, text, media }] }, "publication");
    expect(pub({ asset: poster(1280, 720), fit: "contain", video: video() }).ok).toBe(true);
    expect(pub({ asset: null, fit: "contain", video: video() })).toEqual({ ok: false, error: "video_poster_required" });
    expect(pub({ asset: poster(720, 720), fit: "contain", video: video() })).toEqual({ ok: false, error: "video_poster_aspect_mismatch" });
    expect(pub({ asset: poster(1280, 720), fit: "contain", video: video({ bytes: LAUNCH_INTRO_VIDEO_MAX_BYTES + 1 }) })).toEqual({ ok: false, error: "video_too_big" });
    expect(pub({ asset: poster(1280, 720), fit: "contain", video: video({ durationMs: 30_001 }) })).toEqual({ ok: false, error: "video_duration_invalid" });
    expect(pub({ asset: poster(1280, 720), fit: "contain", video: video({ mime: "video/webm" }) })).toEqual({ ok: false, error: "video_mime_invalid" });

    const v = pub({ asset: poster(1280, 720), fit: "cover", video: video() });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(launchIntroDocumentVideoRefs(v.document).map((r) => r.sha256)).toEqual(["d".repeat(64)]);
    expect(launchIntroDocumentAssets(v.document).map((a) => a.path).sort()).toEqual([`pub/${SHA}.jpg`, `pub/${"d".repeat(64)}.mp4`].sort());
  });

  it("internal path rule", () => {
    expect(isLaunchIntroInternalPath("/stores")).toBe(true);
    expect(isLaunchIntroInternalPath("/philife?tab=1")).toBe(true);
    for (const bad of ["//evil.example", "https://x", "stores", "/\\evil", "/a b", "/javascript:alert(1)", ""]) {
      expect(isLaunchIntroInternalPath(bad)).toBe(false);
    }
  });

  it("publication strips draft paths and manifests content-addressed assets once", () => {
    const base = emptyLaunchIntroDocument();
    const image = {
      sha256: SHA,
      mime: "image/png" as const,
      bytes: 1000,
      width: 400,
      height: 300,
      draftPath: "draft/00000000-0000-0000-0000-000000000000.png",
    };
    const s1 = { ...base.scenes[0], media: { asset: image, fit: "contain" as const } };
    const draft = { ...base, scenes: [s1, { ...s1, id: "scene-2" }] };
    expect(validateLaunchIntroDocument(draft, "draft").ok).toBe(true);
    const pub = toPublicationDocument(draft);
    expect("draftPath" in (pub.scenes[0].media?.asset ?? {})).toBe(false);
    expect(validateLaunchIntroDocument(pub, "publication").ok).toBe(true);
    expect(launchIntroDocumentAssets(pub)).toEqual([
      { sha256: SHA, mime: "image/png", bytes: 1000, path: `pub/${SHA}.png` },
    ]);
  });

  it("hex + image sniffing", () => {
    expect(normalizeLaunchIntroHex("abc")).toBe("#AABBCC");
    expect(normalizeLaunchIntroHex("red")).toBeNull();
    expect(sniffLaunchIntroImage(pngHeader(640, 480))).toEqual({ mime: "image/png", width: 640, height: 480 });
    expect(sniffLaunchIntroImage(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe("P4 Admin lifecycle mirrors the DB state machine", () => {
  it("buttons enable exactly the transitions launch_intro_set_state accepts", () => {
    const states = ["active", "paused", "unpublished"] as const;
    const expected = { pause: ["active"], resume: ["paused"], unpublish: ["active", "paused"] } as const;
    for (const action of ["pause", "resume", "unpublish"] as const) {
      for (const state of states) {
        const live = { state, publication_id: state === "unpublished" ? null : "p1" };
        expect(launchIntroCanTransition(live, action)).toBe((expected[action] as readonly string[]).includes(state));
      }
    }
    // The SQL authority says the same (pause ← active, resume ← paused, unpublish ← not unpublished).
    const sql = src("supabase/migrations/20270411120000_launch_intro_first_slice.sql");
    expect(sql).toMatch(/p_action = 'pause' then\s+if v_live.state <> 'active' then raise/);
    expect(sql).toMatch(/p_action = 'resume' then\s+if v_live.state <> 'paused' then raise/);
    expect(sql).toMatch(/p_action = 'unpublish' then\s+if v_live.state = 'unpublished' then raise/);

    expect(launchIntroCanReactivate({ state: "active", publication_id: "p1" }, "p1")).toBe(false);
    expect(launchIntroCanReactivate({ state: "paused", publication_id: "p1" }, "p1")).toBe(false);
    expect(launchIntroCanReactivate({ state: "active", publication_id: "p1" }, "p0")).toBe(true);
    expect(launchIntroCanReactivate({ state: "unpublished", publication_id: null }, "p1")).toBe(true);
  });

  it("status board: draft vs what devices get", () => {
    const draft = { id: "d1", version: 8 };
    const pub = { source_draft_id: "d1", source_draft_version: 8 };
    expect(launchIntroDraftStatus({ draft: null, dirty: false, livePublication: pub })).toBe("none");
    expect(launchIntroDraftStatus({ draft, dirty: true, livePublication: pub })).toBe("unsaved");
    expect(launchIntroDraftStatus({ draft, dirty: false, livePublication: pub })).toBe("published");
    expect(launchIntroDraftStatus({ draft: { id: "d1", version: 9 }, dirty: false, livePublication: pub })).toBe("changed");
    expect(launchIntroDraftStatus({ draft, dirty: false, livePublication: null })).toBe("not_live");
  });

  it("every Live change and every discard asks first; the Admin uses the mirror, not its own rules", () => {
    const admin = src("components/admin/launch-intro/LaunchIntroAdminPage.tsx");
    expect(admin).toContain("launchIntroCanTransition(live, \"pause\")");
    expect(admin).toContain("launchIntroCanTransition(live, \"resume\")");
    expect(admin).toContain("launchIntroCanTransition(live, \"unpublish\")");
    expect(admin).toContain("launchIntroCanReactivate(live, p.id)");
    expect(admin).not.toMatch(/disabled=\{[^}]*live\.state/);
    // confirm: publish, delete, cancel, and the shared state-change path
    expect(admin.match(/await dibayConfirm\(/g)?.length).toBeGreaterThanOrEqual(4);
  });
});

describe("OS release ownership (single destination owner)", () => {
  it("INTRO claim, one switch back, release notifies once", () => {
    expect(getLaunchOsReleaseOwner()).toBe("community");
    expect(claimLaunchOsReleaseForIntro()).toBe(true);
    expect(getLaunchOsReleaseOwner()).toBe("intro");
    expect(handLaunchOsReleaseToCommunity()).toBe(true);
    expect(getLaunchOsReleaseOwner()).toBe("community");
    expect(claimLaunchOsReleaseForIntro()).toBe(false);
    let n = 0;
    onLaunchOsReleased(() => n++);
    noteLaunchOsReleased();
    noteLaunchOsReleased();
    expect(isLaunchOsReleased()).toBe(true);
    expect(n).toBe(1);
    onLaunchOsReleased(() => n++);
    expect(n).toBe(2);
  });
});

describe("launch intro static contract", () => {
  it("Community release is gated by the owner; Intro releases through the same native path", () => {
    const m = src("lib/startup/startup-metrics.ts");
    const community = m.slice(m.indexOf("export function markInitialDestinationVisualReady"));
    expect(community).toContain('if (getLaunchOsReleaseOwner() !== "community") return;');
    const intro = m.slice(m.indexOf("export function releaseOsForLaunchIntro"));
    expect(intro).toContain('if (getLaunchOsReleaseOwner() !== "intro") return false;');
    expect(intro).toContain('tryDismissNativeSplash("launchIntroFirstFrame")');
  });

  it("route tree is deferred while the Intro owns the launch (DEFERRED MOUNT)", () => {
    const layout = src("app/layout.tsx");
    const gate = layout.slice(layout.indexOf("<LaunchIntroRoot>"), layout.indexOf("</LaunchIntroRoot>"));
    expect(gate).toContain("<InitialSurfaceBootstrap />");
    expect(gate).toContain("{children}");
    const root = src("components/launch-intro/LaunchIntroRoot.tsx");
    expect(root).toContain("<Suspense fallback={null}>");
    expect(root).toContain("if (pending) use(pending);");
    // Exit hands off: the overlay stays until the destination shell has painted.
    expect(root).toContain("onDestinationShellFrame(");
  });

  it("one timeline: device overlay and Admin preview render through LaunchIntroPlayer; it runs only after the OS release", () => {
    const root = src("components/launch-intro/LaunchIntroRoot.tsx");
    expect(root).toContain("<LaunchIntroPlayer");
    expect(root).toContain('running={phase === "showing" && released}');
    expect(root).toContain('onRoute = useCallback((path: string) => exitRef.current("cta", path)');
    const admin = src("components/admin/launch-intro/LaunchIntroAdminPage.tsx");
    expect(admin).toContain("<LaunchIntroPlayer");
    expect(admin).not.toMatch(/from "@\/lib\/device\//);
    const motion = src("components/launch-intro/LaunchIntroMotionStyles.tsx");
    expect(motion).toContain("prefers-reduced-motion");
    expect(src("components/launch-intro/LaunchIntroSceneView.tsx")).not.toMatch(/setTimeout|setInterval/);
    const player = src("components/launch-intro/LaunchIntroPlayer.tsx");
    expect(player).toContain("animateEnter={i > 0}");
    expect(player).toContain("if (!running) return;");
    expect(player).toContain('if (cta.action.type === "next")');
    expect(player).not.toMatch(/useRouter|next\/navigation|releaseOsForLaunchIntro|localStorage/);
  });

  it("P3 video renders only after the OS release, muted + inline, poster first, failure keeps the poster", () => {
    const view = src("components/launch-intro/LaunchIntroSceneView.tsx");
    for (const attr of ["autoPlay", "muted", "playsInline", "el.muted = true", "onError={() => setFailed(true)}"]) expect(view).toContain(attr);
    expect(view).toMatch(/media\.video && videoSrc && playVideo && !failed/);
    expect(src("components/launch-intro/LaunchIntroPlayer.tsx")).toContain("playVideo={running}");
    const root = src("components/launch-intro/LaunchIntroRoot.tsx");
    expect(root).toContain("launchIntroDocumentVideoRefs");
    expect(root).toContain('running={phase === "showing" && released}');
    const route = src("app/api/admin/launch-intro/upload/route.ts");
    expect(route).toContain("finalizeLaunchIntroDraftUpload");
    const server = src("lib/launch-intro/server.ts");
    expect(server.match(/inspectLaunchIntroAsset\(/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("every_launch authority is the native epoch, not sessionStorage / timestamps", () => {
    const dest = src("lib/launch-intro/startup-destination.ts");
    expect(dest).toContain("readLaunchEpoch()");
    expect(dest).toContain("readShownLaunchEpoch() === epoch");
    for (const f of ["lib/launch-intro/startup-destination.ts", "lib/launch-intro/launch-epoch.ts"]) {
      expect(src(f)).not.toContain("sessionStorage");
    }
    const android = src("android/app/src/main/java/com/dibay/app/MainActivity.java");
    expect(android).toContain("static final String LAUNCH_EPOCH = UUID.randomUUID().toString();");
    expect(android).toContain("WebViewCompat.addDocumentStartJavaScript");
    const ios = src("ios/App/App/DibayRootBridgeViewController.swift");
    expect(ios).toContain("static let launchEpoch = UUID().uuidString");
    expect(ios).toContain("injectionTime: .atDocumentStart");
  });

  it("live manifest is no-store and never on the startup path", () => {
    const route = src("app/api/launch-intro/live/route.ts");
    expect(route).toContain('"Cache-Control": "no-store, max-age=0"');
    expect(route).toContain('export const dynamic = "force-dynamic"');
    const discovery = src("lib/launch-intro/discovery.ts");
    expect(discovery).toContain('cache: "no-store"');
    expect(discovery).toContain("onLaunchOsReleased(");
    expect(discovery).not.toMatch(/setInterval|setTimeout/);
  });

  it("live state machine and immutability live in the DB", () => {
    const sql = src("supabase/migrations/20270411120000_launch_intro_first_slice.sql");
    expect(sql).toContain("check ((state = 'unpublished') = (publication_id is null))");
    expect(sql).toContain("before update or delete on public.launch_intro_publications");
    expect(sql).toMatch(/p_action = 'resume' then\s+if v_live.state <> 'paused'/);
  });

  it("names avoid R15 purge patterns and historical intro objects", () => {
    for (const f of ["lib/launch-intro/cache.ts", "lib/launch-intro/launch-epoch.ts"]) {
      expect(/r15|startup-presentation|startup_presentation/i.test(src(f).replace(/R15 purge patterns \(r15 \/ startup-presentation\)/, ""))).toBe(false);
    }
  });
});
