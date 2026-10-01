/**
 * DIBAY Intro — first vertical slice contract guards (pure + static).
 * Runtime PASS is decided on devices, not here.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  emptyLaunchIntroDocument,
  isLaunchIntroInternalPath,
  launchIntroDocumentAssets,
  normalizeLaunchIntroHex,
  sniffLaunchIntroImage,
  toPublicationDocument,
  validateLaunchIntroDocument,
} from "../document";
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

describe("launch intro document", () => {
  it("accepts the empty draft and rejects it as a publication", () => {
    const doc = emptyLaunchIntroDocument();
    expect(validateLaunchIntroDocument(doc, "draft").ok).toBe(true);
    expect(validateLaunchIntroDocument(doc, "publication")).toEqual({ ok: false, error: "scene_empty" });
  });

  it("enforces one scene, internal CTA paths, durations and colors", () => {
    const base = emptyLaunchIntroDocument();
    const scene = base.scenes[0];
    const withText = { ...base, scenes: [{ ...scene, text: { value: "Hello", color: "#ffffff" } }] };
    const ok = validateLaunchIntroDocument(withText, "publication");
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.document.scenes[0].text?.color).toBe("#FFFFFF");
    expect(validateLaunchIntroDocument({ ...base, scenes: [scene, scene] }, "draft")).toEqual({
      ok: false,
      error: "scenes_count_invalid",
    });
    const badCta = { ...base, scenes: [{ ...scene, cta: { label: "Go", path: "https://evil.example" } }] };
    expect(validateLaunchIntroDocument(badCta, "draft")).toEqual({ ok: false, error: "cta_path_invalid" });
    const badDuration = { ...base, scenes: [{ ...scene, durationMs: 50 }] };
    expect(validateLaunchIntroDocument(badDuration, "draft")).toEqual({ ok: false, error: "duration_invalid" });
    expect(validateLaunchIntroDocument({ ...base, schemaVersion: 2 }, "draft")).toEqual({
      ok: false,
      error: "schema_version_unknown",
    });
  });

  it("internal path rule", () => {
    expect(isLaunchIntroInternalPath("/stores")).toBe(true);
    expect(isLaunchIntroInternalPath("/philife?tab=1")).toBe(true);
    for (const bad of ["//evil.example", "https://x", "stores", "/\\evil", "/a b", "/javascript:alert(1)", ""]) {
      expect(isLaunchIntroInternalPath(bad)).toBe(false);
    }
  });

  it("publication strips draft paths and manifests content-addressed assets", () => {
    const base = emptyLaunchIntroDocument();
    const image = {
      sha256: SHA,
      mime: "image/png" as const,
      bytes: 1000,
      width: 400,
      height: 300,
      draftPath: "draft/00000000-0000-0000-0000-000000000000.png",
    };
    const draft = { ...base, scenes: [{ ...base.scenes[0], image }] };
    expect(validateLaunchIntroDocument(draft, "draft").ok).toBe(true);
    const pub = toPublicationDocument(draft);
    expect("draftPath" in (pub.scenes[0].image ?? {})).toBe(false);
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
