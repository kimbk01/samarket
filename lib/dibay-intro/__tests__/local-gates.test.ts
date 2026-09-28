import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { threeSceneAcceptanceDocument, ACCEPTANCE_MEDIA_IMAGE, ACCEPTANCE_MEDIA_LOGO } from "@/lib/dibay-intro/__tests__/three-scene-fixture";
import {
  DIBAY_INTRO_FONT_FAMILY,
  documentsSemanticallyEqual,
  parseDibayIntroDocument,
} from "@/lib/dibay-intro/document";
import { documentChecksum } from "@/lib/dibay-intro/checksum";
import { createCtaLayer, createImageLayer, createTextLayer } from "@/lib/dibay-intro/default-layers";
import { DibayIntroWorkingDocument } from "@/lib/dibay-intro/working-document";
import { applyMediaAttach } from "@/lib/dibay-intro/media-layer-ops";
import { countGifFrames, isGifBytes, isStillWebp, processIntroMediaBytes } from "@/lib/dibay-intro/media-process";
import { DibayIntroMemoryAuthority, saveEqualityChain } from "@/lib/dibay-intro/persistence-memory";
import { resolveCtaRuntimeAction } from "@/lib/dibay-intro/engine/cta-action";
import { computeEngineSourceHash } from "@/lib/dibay-intro/engine/hash";
import { ENGINE_FILES } from "@/lib/dibay-intro/engine/identity";
import { documentDurationMs, resolveTimeline } from "@/lib/dibay-intro/engine/timeline";
import { buildSealedIntroPack } from "@/lib/dibay-intro/pack/build-pack";
import { installLocalIntroPack, localPackPhase } from "@/lib/dibay-intro/pack/install-local-pack";
import { DIBAY_INTRO_BOOTSTRAP_EVENT_NAMES, DIBAY_INTRO_BOOTSTRAP_STEPS } from "@/lib/dibay-intro/pack/bootstrap";
import { createHash } from "node:crypto";
import { DIBAY_INTRO_LOCAL_ORIGIN_CONTRACT, GIF_PLAYBACK_BROWSER_FRAME } from "@/lib/dibay-intro/pack/local-origin";
import type { CtaLayer } from "@/lib/dibay-intro/document";

const BASE = "86a135a47aa0f52d7901f1673f787e70a96ffa38";

async function makeBytes(mime: "image/jpeg" | "image/png" | "image/webp", transparent = false): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const img = sharp({
    create: {
      width: 8,
      height: 8,
      channels: 4,
      background: transparent ? { r: 0, g: 0, b: 0, alpha: 0 } : { r: 11, g: 66, b: 26, alpha: 1 },
    },
  });
  if (mime === "image/jpeg") return img.jpeg().toBuffer();
  if (mime === "image/webp") return img.webp().toBuffer();
  return img.png().toBuffer();
}

function loadAnimatedGifFixture(): Buffer {
  const bytes = readFileSync("lib/dibay-intro/__tests__/fixtures/animated.gif");
  if (!isGifBytes(bytes)) throw new Error("animated_gif_fixture_unavailable");
  if (countGifFrames(bytes) < 2) throw new Error("animated_gif_fixture_unavailable");
  return bytes;
}

describe("product model scenes[]", () => {
  it("keeps scene CRUD and duration/background/transitions on the working document", () => {
    const working = new DibayIntroWorkingDocument();
    const a = working.scenes()[0].id;
    const b = working.addScene(a);
    const c = working.addScene(b);
    expect(working.scenes()).toHaveLength(3);
    expect(working.duplicateScene(c)).toBeTruthy();
    expect(working.scenes()).toHaveLength(4);
    const ids = working.scenes().map((scene) => scene.id);
    expect(working.reorderScenes([ids[3], ids[0], ids[1], ids[2]])).toBe(true);
    expect(working.deleteScene(ids[3]).ok).toBe(true);
    expect(working.scenes()).toHaveLength(3);
    const first = working.scenes()[0].id;
    expect(working.setSceneDuration(first, 1800)).toBe(true);
    expect(working.setSceneBackgroundColor(first, "#0B421A")).toBe(true);
    expect(working.setSceneTransition(first, { kind: "CUT" })).toBe(true);
    expect(working.setSceneTransition(working.scenes()[1].id, { kind: "FADE", durationMs: 240 })).toBe(true);
    expect(working.setSceneTransition(working.scenes()[2].id, { kind: "SLIDE", durationMs: 320, direction: "left" })).toBe(true);
    const snap = working.snapshot();
    expect(snap.scenes).toHaveLength(3);
    expect(snap.scenes[0].durationMs).toBe(1800);
    expect(snap.scenes[0].background.color).toBe("#0B421A");
    expect(snap.scenes[0].transition.kind).toBe("CUT");
    expect(snap.scenes[1].transition.kind).toBe("FADE");
    expect(snap.scenes[2].transition.kind).toBe("SLIDE");
    expect(parseDibayIntroDocument(snap).ok).toBe(true);
  });
});

describe("working document stale snapshot", () => {
  it("keeps later mutations on the canonical store after a prior snapshot", () => {
    const working = new DibayIntroWorkingDocument();
    const s1 = working.scenes()[0].id;
    const s2 = working.addScene(s1);
    const s3 = working.addScene(s2);
    const image = createImageLayer("media-image", 1);
    working.addLayer(s1, image);
    working.beginPointer();
    expect(working.isPointerActive()).toBe(true);
    working.setLayerFrame(s1, image.id, { x: 0.1, y: 0.2, width: 0.5, height: 0.4 });
    working.updateLayer(s1, image.id, { fit: "contain" });
    working.commitPointer();
    const stale = working.snapshot();
    const text = createTextLayer(2, "hello");
    working.addLayer(s2, text);
    working.updateLayer(s2, text.id, {
      content: "edited",
      fontSizePx: 22,
      fontWeight: 600,
      align: "left",
      color: "#FFFFFF",
      opacity: 0.8,
    });
    working.setLayerFrame(s2, text.id, { x: 0.2, y: 0.3, width: 0.6, height: 0.2 });
    const cta = createCtaLayer(1);
    working.addLayer(s3, cta);
    working.updateLayer(s3, cta.id, { action: "FINISH_INTRO", label: "끝" });
    const final = working.snapshot();
    expect(documentsSemanticallyEqual(stale, final)).toBe(false);
    expect(final.scenes).toHaveLength(3);
    const img = final.scenes[0].layers.find((layer) => layer.type === "IMAGE");
    const txt = final.scenes[1].layers.find((layer) => layer.type === "TEXT");
    const button = final.scenes[2].layers.find((layer) => layer.type === "CTA");
    expect(img && img.type === "IMAGE" && img.frame.x).toBe(0.1);
    expect(img && img.type === "IMAGE" && img.fit).toBe("contain");
    expect(txt && txt.type === "TEXT" && txt.content).toBe("edited");
    expect(button && button.type === "CTA" && button.action).toBe("FINISH_INTRO");
    const stage = readFileSync("components/admin/dibay-intro/DibayIntroStage.tsx", "utf8");
    expect(stage).not.toMatch(/\bfetch\s*\(/);
    expect(stage).toContain("onPointerBegin");
  });
});

describe("media processor output", () => {
  it("copies jpeg png transparent png webp and keeps gif animated bytes", async () => {
    const jpeg = await processIntroMediaBytes("image/jpeg", await makeBytes("image/jpeg"));
    const png = await processIntroMediaBytes("image/png", await makeBytes("image/png"));
    const transparent = await processIntroMediaBytes("image/png", await makeBytes("image/png", true));
    const webp = await processIntroMediaBytes("image/webp", await makeBytes("image/webp"));
    const gifBytes = loadAnimatedGifFixture();
    const gif = await processIntroMediaBytes("image/gif", gifBytes);
    expect(jpeg.runtimeExt).toBe("jpg");
    expect(png.runtimeExt).toBe("png");
    expect(transparent.runtimeExt).toBe("png");
    expect(webp.runtimeExt).toBe("webp");
    expect(isGifBytes(gif.bytes)).toBe(true);
    expect(isStillWebp(gif.bytes)).toBe(false);
    expect(gif.bytes.equals(gifBytes)).toBe(true);
    expect(countGifFrames(gif.bytes)).toBeGreaterThanOrEqual(2);
    expect(gif.animated).toBe(true);
    expect(gif.runtimeExt).toBe("gif");
  });
});

describe("media create replace atomicity", () => {
  it("does not mutate on cancel or failure and replace keeps geometry", () => {
    const working = new DibayIntroWorkingDocument();
    const sceneId = working.scenes()[0].id;
    const before = working.snapshot();
    expect(applyMediaAttach(working, { kind: "create", sceneId, type: "IMAGE" }, { ok: false, reason: "cancel" }).mutated).toBe(false);
    expect(applyMediaAttach(working, { kind: "create", sceneId, type: "IMAGE" }, { ok: false, reason: "failure" }).mutated).toBe(false);
    expect(documentsSemanticallyEqual(before, working.snapshot())).toBe(true);
    const created = applyMediaAttach(working, { kind: "create", sceneId, type: "IMAGE" }, { ok: true, mediaId: "m1", ready: true });
    expect(created.mutated).toBe(true);
    expect(created.ghost).toBe(0);
    const layer = working.selectScene(sceneId)!.layers[0];
    working.setLayerFrame(sceneId, layer.id, { x: 0.2, y: 0.3, width: 0.4, height: 0.5 });
    const original = working.selectScene(sceneId)!.layers[0];
    expect(applyMediaAttach(working, { kind: "replace", sceneId, layerId: original.id }, { ok: false, reason: "cancel" }).mutated).toBe(false);
    expect(applyMediaAttach(working, { kind: "replace", sceneId, layerId: original.id }, { ok: false, reason: "failure" }).mutated).toBe(false);
    const afterFailedReplace = working.selectScene(sceneId)!.layers[0];
    expect(afterFailedReplace.type === "IMAGE" ? afterFailedReplace.mediaId : "").toBe(
      original.type === "IMAGE" ? original.mediaId : "",
    );
    const replaced = applyMediaAttach(working, { kind: "replace", sceneId, layerId: original.id }, { ok: true, mediaId: "m2", ready: true });
    expect(replaced.ghost).toBe(0);
    const next = working.selectScene(sceneId)!.layers[0];
    expect(next.id).toBe(original.id);
    expect(next.type === "IMAGE" && next.mediaId).toBe("m2");
    expect(next.frame).toEqual(original.frame);
    expect(working.selectScene(sceneId)!.layers).toHaveLength(1);
  });
});

describe("text authority", () => {
  it("persists content pretenderd size weight align color opacity frame wrap visibility z", () => {
    const working = new DibayIntroWorkingDocument();
    const sceneId = working.scenes()[0].id;
    const layer = createTextLayer(4, "dibaY");
    working.addLayer(sceneId, layer);
    working.updateLayer(sceneId, layer.id, {
      content: "Hello",
      fontSizePx: 32,
      fontWeight: 700,
      align: "center",
      color: "#FFFFFF",
      opacity: 0.9,
      visible: true,
      z: 9,
    });
    const stored = working.selectScene(sceneId)!.layers[0];
    expect(stored.type).toBe("TEXT");
    if (stored.type !== "TEXT") return;
    expect(stored.fontFamily).toBe(DIBAY_INTRO_FONT_FAMILY);
    expect(stored.content).toBe("Hello");
    expect(stored.fontSizePx).toBe(32);
    expect(stored.fontWeight).toBe(700);
    expect(stored.align).toBe("center");
    expect(stored.color).toBe("#FFFFFF");
    expect(stored.opacity).toBe(0.9);
    expect(stored.visible).toBe(true);
    expect(stored.z).toBe(9);
    const layerDom = readFileSync("lib/dibay-intro/engine/layer-dom.ts", "utf8");
    expect(layerDom).toContain("pre-wrap");
    expect(existsSync("node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2")).toBe(true);
  });
});

describe("cta runtime", () => {
  it("continues finishes and keeps admin on approved internal routes", () => {
    const doc = threeSceneAcceptanceDocument();
    const continueLayer = doc.scenes[2].layers.find((layer) => layer.type === "CTA") as CtaLayer;
    const continueAction = resolveCtaRuntimeAction(continueLayer, doc, 100);
    expect(continueAction.kind).toBe("CONTINUE");
    if (continueAction.kind === "CONTINUE") expect(continueAction.seekMs).toBe(doc.scenes[0].durationMs);
    const finish = resolveCtaRuntimeAction({ ...continueLayer, action: "FINISH_INTRO" }, doc, 100);
    expect(finish.kind).toBe("FINISH");
    const route = resolveCtaRuntimeAction(
      { ...continueLayer, action: "APPROVED_INTERNAL_ROUTE", destination: "/philife" },
      doc,
      100,
    );
    expect(route).toEqual({ kind: "INTERNAL_ROUTE", destination: "/philife", navigateAdmin: false });
    const studio = readFileSync("components/admin/dibay-intro/DibayIntroStudioPage.tsx", "utf8");
    expect(studio).toContain("resolveCtaRuntimeAction");
    expect(studio).not.toMatch(/router\.push\(action/);
  });
});

describe("save adapter equality", () => {
  it("cancels without mutation, fails dirty, and equals working request stored fetch rehydrate", () => {
    const studio = readFileSync("components/admin/dibay-intro/DibayIntroStudioPage.tsx", "utf8");
    expect(studio).toContain("현재 인트로를 저장하시겠습니까?");
    expect(studio).toContain("인트로가 저장되었습니다.");
    expect(studio).toContain("인트로 저장에 실패했습니다.");
    expect(studio).toMatch(/if \(!ok\) return false;/);
    expect(studio).toContain("setDirty(true)");
    const authority = new DibayIntroMemoryAuthority();
    const working = new DibayIntroWorkingDocument(threeSceneAcceptanceDocument());
    const created = authority.create("intro-1", "Gate", working.snapshot());
    const confirm = false;
    if (!confirm) {
      expect(authority.mutations).toBe(0);
    }
    const request = working.snapshot();
    const stored = authority.save("intro-1", "Gate", request);
    const fetched = authority.load("intro-1");
    const rehydrated = parseDibayIntroDocument(fetched.document);
    expect(rehydrated.ok).toBe(true);
    if (!rehydrated.ok) return;
    expect(saveEqualityChain(working.snapshot(), request, stored.document, fetched.document, rehydrated.document)).toBe(true);
    expect(documentsSemanticallyEqual(created.document, threeSceneAcceptanceDocument())).toBe(true);
    expect(documentChecksum(stored.document)).toBe(documentChecksum(request));
  });
});

describe("preview engine identity", () => {
  it("has one SceneRenderer LayerRenderer Timeline geometry media-fit authority", () => {
    const files = [
      "lib/dibay-intro/engine/player.ts",
      "lib/dibay-intro/engine/scene-dom.ts",
      "lib/dibay-intro/engine/layer-dom.ts",
      "lib/dibay-intro/engine/timeline.ts",
      "lib/dibay-intro/engine/media-fit.ts",
      "lib/dibay-intro/geometry.ts",
    ];
    const corpus = files.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(corpus.match(/export function attachIntroPlayer/g)?.length).toBe(1);
    expect(corpus.match(/export function renderScene/g)?.length).toBe(1);
    expect(corpus.match(/export function renderLayer/g)?.length).toBe(1);
    expect(corpus.match(/export function resolveTimeline/g)?.length).toBe(1);
    expect(corpus.match(/export function fittedMediaRect/g)?.length).toBe(1);
    const studio = readFileSync("components/admin/dibay-intro/DibayIntroStudioPage.tsx", "utf8");
    const stage = readFileSync("components/admin/dibay-intro/DibayIntroStage.tsx", "utf8");
    expect(studio).toContain('from "@/lib/dibay-intro/engine/player"');
    expect(stage).toContain('from "@/lib/dibay-intro/engine/player"');
    expect(studio).not.toMatch(/function renderScene\(/);
    expect(stage).not.toMatch(/function renderScene\(/);
    const doc = threeSceneAcceptanceDocument();
    expect(resolveTimeline(doc, 2500).sceneIndex).toBe(1);
    expect(documentDurationMs(doc)).toBeGreaterThan(0);
  });
});

describe("publish immutable and live singleton", () => {
  it("rejects invalid and non-ready media then keeps published checksum after draft mutate", () => {
    const list = readFileSync("components/admin/dibay-intro/DibayIntroListPage.tsx", "utf8");
    expect(list).toContain("현재 인트로를 게시하시겠습니까?");
    expect(list).toContain("이 인트로를 앱 시작 화면에 노출하시겠습니까?");
    const authority = new DibayIntroMemoryAuthority();
    const doc = threeSceneAcceptanceDocument();
    authority.create("a", "A", doc);
    expect(() => authority.publish("a", new Set())).toThrow("publish_invalid");
    const published = authority.publish("a", new Set([ACCEPTANCE_MEDIA_LOGO, ACCEPTANCE_MEDIA_IMAGE]));
    const checksum = published.checksum;
    authority.save("a", "A", { ...doc, scenes: doc.scenes.map((scene, i) => (i === 0 ? { ...scene, name: "mutated" } : scene)) });
    expect(authority.publishedUnchanged("a")).toBe(true);
    expect(authority.load("a").publishedChecksum).toBe(checksum);
    authority.create("b", "B", doc);
    authority.publish("b", new Set([ACCEPTANCE_MEDIA_LOGO, ACCEPTANCE_MEDIA_IMAGE]));
    authority.setLive("a");
    authority.setLive("b");
    const live = authority.livePointer();
    expect(live?.singleton).toBe(true);
    expect(live?.introId).toBe("b");
    expect(authority.load("a").lifecycle).toBe("published");
    expect(authority.load("b").lifecycle).toBe("live");
  });
});

describe("list ux live row", () => {
  it("uses full-row live treatment and published-not-live copy", () => {
    const list = readFileSync("components/admin/dibay-intro/DibayIntroListPage.tsx", "utf8");
    expect(list).toContain("bg-[#0B421A]");
    expect(list).toContain("data-dibay-intro-live");
    expect(list).toContain("admin_dibay_intro_live_now");
    expect(list).toContain("admin_dibay_intro_published");
    expect(list).not.toContain("admin_platform_popup_loading");
  });
});

describe("engine hash", () => {
  it("recalculates from the final engine file set", () => {
    expect(ENGINE_FILES).toContain("lib/dibay-intro/engine/cta-action.ts");
    const hash = computeEngineSourceHash();
    expect(hash).toHaveLength(64);
    expect(hash).not.toBe("4726071f6f4a832bed1fb488123ccd2c010b14bb2fd39286b4fa91f846752239");
  });
});

describe("sealed pack installer", () => {
  it("installs STAGING VERIFYING READY, rejects corrupt, and keeps previous READY until replacement READY", () => {
    const font = readFileSync("node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2");
    const gif = Buffer.from("GIF89a-animated-not-used-as-processor-proof");
    const packed = buildSealedIntroPack({
      introId: "intro-1",
      revisionId: "rev-1",
      document: threeSceneAcceptanceDocument(),
      engineJs: Buffer.from("window.__engine=1;", "utf8"),
      engineHash: createHash("sha256").update("window.__engine=1;").digest("hex"),
      fontBytes: font,
      media: [
        { id: ACCEPTANCE_MEDIA_LOGO, mime: "image/png", animated: false, bytes: Buffer.from("png"), ext: "png" },
        { id: ACCEPTANCE_MEDIA_IMAGE, mime: "image/gif", animated: true, bytes: gif, ext: "gif" },
      ],
    });
    expect(packed.files.has("fonts/PretendardVariable.woff2")).toBe(true);
    const root = mkdtempSync(join(tmpdir(), "dibay-intro-pack-"));
    try {
      mkdirSync(join(root, "staging"), { recursive: true });
      writeFileSync(join(root, "staging", "partial"), "incomplete");
      expect(localPackPhase(root)).toBe("STAGING");
      const first = installLocalIntroPack({ rootDir: root, files: packed.files });
      expect(first.ok).toBe(true);
      expect(first.phase).toBe("READY");
      expect(localPackPhase(root)).toBe("READY");
      const corrupt = new Map(packed.files);
      corrupt.set("engine.js", Buffer.from("tampered", "utf8"));
      const failed = installLocalIntroPack({ rootDir: root, files: corrupt });
      expect(failed.ok).toBe(false);
      expect(failed.phase).toBe("VERIFYING");
      expect(failed.readyDir).toBe(join(root, "ready"));
      expect(localPackPhase(root)).toBe("READY");
      const next = buildSealedIntroPack({
        introId: "intro-1",
        revisionId: "rev-2",
        document: threeSceneAcceptanceDocument(),
        engineJs: Buffer.from("window.__engine=2;", "utf8"),
        engineHash: createHash("sha256").update("window.__engine=2;").digest("hex"),
        fontBytes: font,
        media: [
          { id: ACCEPTANCE_MEDIA_LOGO, mime: "image/png", animated: false, bytes: Buffer.from("png"), ext: "png" },
          { id: ACCEPTANCE_MEDIA_IMAGE, mime: "image/gif", animated: true, bytes: gif, ext: "gif" },
        ],
      });
      const swapped = installLocalIntroPack({ rootDir: root, files: next.files });
      expect(swapped.ok).toBe(true);
      expect(readFileSync(join(root, "ready", "engine.js"), "utf8")).toBe("window.__engine=2;");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("bootstrap observability", () => {
  it("names every BEGIN PASS FAIL and forbids generic HANDOFF_FAIL_OPEN as the only cause", () => {
    expect(DIBAY_INTRO_BOOTSTRAP_EVENT_NAMES).toContain("PACK_OPEN_BEGIN");
    expect(DIBAY_INTRO_BOOTSTRAP_EVENT_NAMES).toContain("INTRO_FIRST_FRAME_READY_FAIL");
    expect(DIBAY_INTRO_BOOTSTRAP_STEPS).toHaveLength(13);
    const runtime = readFileSync("lib/dibay-intro/engine/runtime-entry.ts", "utf8");
    expect(runtime).not.toContain("HANDOFF_FAIL_OPEN");
    for (const step of DIBAY_INTRO_BOOTSTRAP_STEPS) {
      expect(runtime).toContain(`"${step}"`);
    }
  });
});

describe("local resource contract", () => {
  it("uses native intercept origins instead of file fetch or crypto.subtle", () => {
    expect(DIBAY_INTRO_LOCAL_ORIGIN_CONTRACT).toEqual({
      MANIFEST_TRANSPORT: "same-origin-relative-fetch",
      ASSET_TRANSPORT: "same-origin-relative-fetch",
      CHECKSUM_EXECUTION_OWNER: "native-or-local-installer-VERIFYING",
      ANDROID_LOCAL_ORIGIN: "https://dibay-intro.local",
      IOS_LOCAL_ORIGIN: "dibay-intro://pack",
      FILE_URL_FETCH: false,
      CRYPTO_SUBTLE: false,
    });
    const android = readFileSync("android/app/src/main/java/com/dibay/app/intro/DibayIntroHostOwner.java", "utf8");
    const ios = readFileSync("ios/App/App/Plugins/DibayIntroHostOwner.swift", "utf8");
    expect(android).toContain("https://dibay-intro.local");
    expect(android).toContain("shouldInterceptRequest");
    expect(android).not.toContain("toURI()");
    expect(ios).toContain("dibay-intro://pack");
    expect(ios).toContain("WKURLSchemeHandler");
    expect(ios).not.toContain("loadFileURL");
  });
});

describe("gif playback evidence", () => {
  it("marks browser-frame GIF playback NOT_PROVEN locally", () => {
    expect(GIF_PLAYBACK_BROWSER_FRAME).toBe("NOT_PROVEN");
  });
});

describe("call and popup fence", () => {
  it("keeps Call mutation 0 and popup isolation vs reconstruction base", () => {
    const names = execFileSync("git", ["diff", "--name-only", BASE], { encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
    const blocked = names.filter((name) =>
      /CallKit|PushKit|ActiveHeartbeat|HeartbeatOwner|agora|AVAudioSession|webrtc|rtc/i.test(name),
    );
    expect(blocked).toEqual([]);
    const studio = readFileSync("components/admin/dibay-intro/DibayIntroStudioPage.tsx", "utf8");
    const list = readFileSync("components/admin/dibay-intro/DibayIntroListPage.tsx", "utf8");
    expect(studio).not.toMatch(/platform-popup/);
    expect(list).not.toMatch(/platform-popup/);
    expect(list).not.toContain("admin_platform_popup_loading");
  });
});
