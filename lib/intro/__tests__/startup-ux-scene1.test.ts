import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CANONICAL_INTRO_FIXTURE_DOCUMENT } from "@/lib/intro/fixtures/canonical-document";
import {
  clearSceneBackgroundImage,
  setSceneBackgroundImage,
  setSceneDuration,
  deleteScene,
} from "@/lib/intro/document/mutations";
import {
  emptySceneBannerText,
  findBackgroundImageLayer,
  formatTotalIntroSeconds,
  isEmptyScene,
  listEmptySceneWarnings,
} from "@/lib/intro/document/scene-truth";
import { computeIntroDurationMs } from "@/lib/intro/timeline/compute-duration";
import { createEmptyScene } from "@/lib/intro/document/factory";
import type { IntroDocumentV1, SceneV1 } from "@/lib/intro/contracts/document";

function cloneDoc(): IntroDocumentV1 {
  return JSON.parse(
    JSON.stringify(CANONICAL_INTRO_FIXTURE_DOCUMENT),
  ) as IntroDocumentV1;
}

describe("startup UX — Scene1 Startup Cover + empty truth", () => {
  it("Studio labels Scene1 with Vertical B terminology and shows total in seconds", () => {
    const studio = readFileSync(
      "components/admin/intro/IntroStudio.tsx",
      "utf8",
    );
    // Rejected operator terms must stay purged (Vertical B).
    expect(studio).not.toContain("첫 화면 / 시작 화면");
    expect(studio).not.toContain("Startup Cover");
    expect(studio).toContain("장면 ${");
    expect(studio).toContain("앱 실행 순서");
    expect(studio).toContain(
      "앱 실행 시 가장 먼저 표시되는 인트로 화면입니다.",
    );
    expect(studio).toContain("총 인트로 시간:");
    expect(studio).toContain("data-intro-total-duration");
    expect(studio).toContain("data-intro-bg-image-pick");
    expect(studio).toContain("data-intro-publish-empty-warning");
    expect(studio).toContain("EMPTY SCENE");
    expect(studio).not.toContain("startupCoverDuration");
    expect(studio).not.toContain("StartupCover");
  });

  it("empty scene detection ignores background-only IMAGE", () => {
    let doc = cloneDoc();
    const scene0 = doc.scenes[0]!;
    // Strip meaningful layers → empty
    doc = {
      ...doc,
      scenes: [
        { ...scene0, layers: [] },
        ...doc.scenes.slice(1),
      ],
    };
    expect(isEmptyScene(doc.scenes[0]!)).toBe(true);
    const { document: withBg } = setSceneBackgroundImage(
      doc,
      doc.scenes[0]!.sceneId,
      "media-bg-1",
    );
    expect(findBackgroundImageLayer(withBg.scenes[0]!)).not.toBeNull();
    // Background image alone does not make scene non-empty (foreground content).
    expect(isEmptyScene(withBg.scenes[0]!)).toBe(true);
    const banner = emptySceneBannerText(withBg.scenes[0]!, true);
    expect(banner).toContain("EMPTY SCENE");
    expect(banner).toContain("초");
  });

  it("publish empty warnings list Scene index + duration", () => {
    const empty = createEmptyScene({ name: "Black", durationMs: 2500 });
    const doc: IntroDocumentV1 = {
      ...cloneDoc(),
      scenes: [cloneDoc().scenes[0]!, empty],
    };
    const warns = listEmptySceneWarnings(doc, true);
    expect(warns.some((w) => w.durationMs === 2500)).toBe(true);
    expect(warns[0]!.backgroundLabel).toMatch(/검정|black/i);
  });

  it("background image set/clear uses VIEWPORT full-frame IMAGE — no SceneBackground reopen", () => {
    const doc = cloneDoc();
    const sceneId = doc.scenes[0]!.sceneId;
    const { document: next } = setSceneBackgroundImage(
      doc,
      sceneId,
      "media-xyz",
    );
    const layer = findBackgroundImageLayer(next.scenes[0]!);
    expect(layer).not.toBeNull();
    if (layer?.type === "IMAGE") {
      expect(layer.surface).toBe("VIEWPORT");
      expect(layer.fit).toBe("COVER");
      expect(layer.frame).toEqual({ x: 0, y: 0, w: 1, h: 1 });
      expect(layer.mediaRefId).toBe("media-xyz");
    }
    const cleared = clearSceneBackgroundImage(next, sceneId);
    expect(findBackgroundImageLayer(cleared.scenes[0]!)).toBeNull();
  });

  it("deleting empty Scene2/Scene3 reduces authored black duration", () => {
    // Simulate Owner QA pack shape: Scene0 content + Scene1 empty 2500 + Scene2 empty 3000
    // CUT.durationMs is literal 0 — do not widen to number (CI tsc fails).
    const s0: SceneV1 = {
      ...createEmptyScene({ name: "Scene1", durationMs: 2000 }),
      layers: cloneDoc().scenes[0]!.layers,
      background: {
        type: "SOLID",
        color: { r: 1, g: 1, b: 1, a: 1 },
      },
      transitionAfter: { type: "CUT", durationMs: 0 },
    };
    const s1 = createEmptyScene({
      name: "Scene2",
      durationMs: 2500,
      transitionAfter: { type: "FADE", durationMs: 300 },
    });
    const s2 = createEmptyScene({
      name: "Scene3",
      durationMs: 3000,
      transitionAfter: null,
    });
    let doc: IntroDocumentV1 = {
      ...cloneDoc(),
      scenes: [s0, s1, s2],
    };
    expect(computeIntroDurationMs(doc)).toBe(2000 + 0 + 2500 + 300 + 3000);
    doc = deleteScene(doc, s1.sceneId);
    doc = deleteScene(doc, s2.sceneId);
    expect(doc.scenes).toHaveLength(1);
    expect(computeIntroDurationMs(doc)).toBe(2000);
    expect(formatTotalIntroSeconds(2000)).toBe("2.0초");
  });

  it("duration edits remain ms-canonical under seconds UI", () => {
    const doc = cloneDoc();
    const id = doc.scenes[0]!.sceneId;
    const next = setSceneDuration(doc, id, 3500);
    expect(next.scenes[0]!.durationMs).toBe(3500);
  });

  it("native handoff holds last frame — no remove on complete alone", () => {
    const android = readFileSync(
      "android/app/src/main/java/com/dibay/app/intro/DibayIntroRuntimeController.java",
      "utf8",
    );
    expect(android).toContain("releaseToHome");
    expect(android).toContain("HOLD last authored frame");
    const main = readFileSync(
      "android/app/src/main/java/com/dibay/app/MainActivity.java",
      "utf8",
    );
    expect(main).not.toContain("intro_completed_v3_temp");
    expect(main).toContain("handoff_hold_last_frame");
    const iosRt = readFileSync(
      "ios/App/App/Plugins/DibayIntroRuntimeController.swift",
      "utf8",
    );
    expect(iosRt).toContain("releaseToHome");
  });
});
