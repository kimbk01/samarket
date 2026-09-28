/**
 * @vitest-environment node
 * Rebuild B: rejected product gone, foundation editor only.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { patchSceneBackgroundColor } from "@/lib/startup/intro/domain/patch-scene-background";
import {
  INTRO_DOCUMENT_WRITE_TABLE,
  isIntroSceneDualWriteTable,
} from "@/lib/startup/intro/domain/write-authority";
import { createIdleIntroRendererClock } from "@/lib/startup/intro/renderer/clock";
import { introSceneBackgroundCssColor } from "@/lib/startup/intro/renderer/scene-background";
import { backgroundIsNotALayer } from "@/lib/startup/intro-v3/layer-model";
import { createIntroV3SeedDocument } from "@/lib/startup/intro-v3/seed";

const ROOT = process.cwd();

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("intro rebuild B demolition", () => {
  it("removes rejected Admin product files from the product tree", () => {
    expect(existsSync(join(ROOT, "components/admin/intro/NewIntroEditor.tsx"))).toBe(false);
    expect(existsSync(join(ROOT, "components/admin/intro/IntroEditorCanvas.tsx"))).toBe(false);
    expect(existsSync(join(ROOT, "lib/startup/intro-v3/editor-canvas-fit.ts"))).toBe(false);
    expect(existsSync(join(ROOT, "lib/startup/intro-v3/editor-pointer-geometry.ts"))).toBe(false);
    expect(existsSync(join(ROOT, "components/admin/intro/AdminIntroCmsEditorPage.tsx"))).toBe(false);
    expect(existsSync(join(ROOT, "components/admin/intro/AdminIntroCompositionCanvas.tsx"))).toBe(false);
    expect(existsSync(join(ROOT, "components/admin/intro-v3/AdminIntroV3DraftPage.tsx"))).toBe(false);
    expect(existsSync(join(ROOT, "components/admin/intro-v3/IntroV3SceneSurface.tsx"))).toBe(false);
    expect(existsSync(join(ROOT, "components/admin/intro-v3/IntroV3MediaLibrary.tsx"))).toBe(false);
  });

  it("Owner /admin/intro/[id] mounts CUT 1 IMAGE editor, not rejected products", () => {
    const page = read("app/admin/intro/[campaignId]/page.tsx");
    const gate = read("components/admin/intro/AdminIntroCampaignRoute.tsx");
    const editor = read("components/admin/intro/IntroEditor/IntroEditor.tsx");
    const storyboard = read("components/admin/intro/IntroEditor/SceneStoryboard.tsx");
    const workspace = read("components/admin/intro/IntroEditor/SceneWorkspace.tsx");
    const properties = read("components/admin/intro/IntroEditor/ScenePropertiesPanel.tsx");
    const v3Page = read("app/admin/intro-v3/page.tsx");
    const v3Campaign = read("app/admin/intro-v3/[campaignId]/page.tsx");
    const writer = read("lib/startup/intro-v3/admin-service.ts");

    expect(page).toContain("AdminIntroCampaignRoute");
    expect(gate).toContain("IntroEditor");
    expect(gate).toContain("AdminIntroLegacyReadOnly");
    expect(gate).not.toContain("NewIntroEditor");
    expect(gate).not.toContain("AdminIntroCmsEditorPage");
    expect(editor).toContain('data-intro-editor="cut-1-image"');
    expect(editor).not.toContain('data-intro-editor="foundation-b"');
    expect(editor).toContain("SceneStoryboard");
    expect(editor).toContain("SceneWorkspace");
    expect(editor).toContain("ScenePropertiesPanel");
    expect(editor).toContain("IntroMediaLibrary");
    expect(storyboard).toContain("data-intro-storyboard");
    expect(workspace).toContain("data-intro-workspace");
    expect(workspace).toContain("data-intro-scene-surface");
    expect(workspace).toContain("data-intro-image-render");
    expect(properties).toContain("data-intro-scene-properties");
    expect(editor).not.toContain("fitIntroEditorCanvas");
    expect(editor).not.toContain("occupancy");
    expect(workspace).not.toContain("9 / 16");
    expect(v3Page).toContain('redirect("/admin/intro")');
    expect(v3Campaign).toContain("redirect(`/admin/intro/${campaignId}`)");
    expect(writer).toContain('.from("intro_campaigns")');
    expect(writer).not.toContain("intro_scenes");
  });
});

describe("intro rebuild B document", () => {
  it("seeds one Scene, COLOR background, zero layers, background is not a Layer", () => {
    const doc = createIntroV3SeedDocument({ sceneId: "scene-b" });
    expect(doc.scenes).toHaveLength(1);
    expect(doc.scenes[0]!.background.type).toBe("COLOR");
    expect(doc.scenes[0]!.layers).toEqual([]);
    expect(backgroundIsNotALayer(doc.scenes[0]!.layers)).toBe(true);
  });

  it("background color patch does not add layers or write CSS pixels", () => {
    const doc = createIntroV3SeedDocument({ sceneId: "scene-b" });
    const next = patchSceneBackgroundColor(doc, "scene-b", "#224466");
    expect(next?.scenes[0]?.background).toEqual({ type: "COLOR", color: "#224466" });
    expect(next?.scenes[0]?.layers).toEqual([]);
    expect(introSceneBackgroundCssColor(next?.scenes[0]?.background ?? null)).toBe("#224466");
  });

  it("renderer clock exists idle and dual scene-table write is forbidden", () => {
    expect(createIdleIntroRendererClock().phase).toBe("idle");
    expect(INTRO_DOCUMENT_WRITE_TABLE).toBe("intro_campaigns");
    expect(isIntroSceneDualWriteTable("intro_scenes")).toBe(true);
    expect(isIntroSceneDualWriteTable("intro_campaigns")).toBe(false);
  });
});
