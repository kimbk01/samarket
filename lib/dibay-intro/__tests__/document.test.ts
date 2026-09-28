import { describe, expect, it } from "vitest";
import { threeSceneAcceptanceDocument } from "@/lib/dibay-intro/__tests__/three-scene-fixture";
import {
  createDefaultDibayIntroDocument,
  DIBAY_GREEN,
  parseDibayIntroDocument,
  type DibayIntroDocument,
} from "@/lib/dibay-intro/document";
import { documentChecksum } from "@/lib/dibay-intro/checksum";
import { containRect, coverRect } from "@/lib/dibay-intro/geometry";
import { DibayIntroWorkingDocument } from "@/lib/dibay-intro/working-document";
import {
  introOperatorLabelKo,
  resolveIntroOperatorLifecycle,
} from "@/lib/dibay-intro/lifecycle";
import { isApprovedIntroCtaRoute } from "@/lib/dibay-intro/cta-routes";
import { validateDocumentForPublish } from "@/lib/dibay-intro/publish-validate";

function threeSceneDocument(): DibayIntroDocument {
  return threeSceneAcceptanceDocument();
}

describe("dibay intro document schema", () => {
  it("rejects singular scene as architecture", () => {
    const parsed = parseDibayIntroDocument({ version: 1, settings: { defaultBackgroundColor: DIBAY_GREEN }, scene: {} });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.issues.some((i) => i.message.includes("scenes[]"))).toBe(true);
    }
  });

  it("parses complete IMAGE+LOGO+TEXT+CTA multi-scene document", () => {
    const parsed = parseDibayIntroDocument(threeSceneDocument());
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.document.scenes).toHaveLength(3);
      const types = parsed.document.scenes.flatMap((s) => s.layers.map((l) => l.type)).sort();
      expect(types).toEqual(["CTA", "IMAGE", "LOGO", "TEXT", "TEXT", "TEXT"]);
    }
  });

  it("default content may be one scene but schema remains scenes[]", () => {
    const doc = createDefaultDibayIntroDocument();
    expect(Array.isArray(doc.scenes)).toBe(true);
    expect(doc.scenes).toHaveLength(1);
    expect(parseDibayIntroDocument(doc).ok).toBe(true);
  });

  it("keeps checksum stable for the same document", () => {
    const a = threeSceneDocument();
    const b = threeSceneDocument();
    expect(documentChecksum(a)).toBe(documentChecksum(b));
  });
});

describe("working document scene ops", () => {
  it("adds duplicates reorders and refuses deleting the last scene", () => {
    const working = new DibayIntroWorkingDocument();
    const first = working.scenes()[0].id;
    const second = working.addScene(first);
    const third = working.duplicateScene(second);
    expect(working.scenes()).toHaveLength(3);
    expect(working.reorderScenes([third as string, first, second])).toBe(true);
    expect(working.scenes().map((s) => s.order)).toEqual([0, 1, 2]);
    expect(working.deleteScene(first).ok).toBe(true);
    expect(working.deleteScene(working.scenes()[0].id).ok).toBe(true);
    expect(working.deleteScene(working.scenes()[0].id)).toEqual({ ok: false, reason: "last_scene" });
  });

  it("clamps duration into the canonical range", () => {
    const working = new DibayIntroWorkingDocument();
    const id = working.scenes()[0].id;
    expect(working.setSceneDuration(id, 10)).toBe(true);
    expect(working.scenes()[0].durationMs).toBe(400);
    expect(working.setSceneDuration(id, 99999)).toBe(true);
    expect(working.scenes()[0].durationMs).toBe(20_000);
  });
});

describe("lifecycle labels", () => {
  it("never labels published-not-live as draft", () => {
    const published = resolveIntroOperatorLifecycle({
      hasDraft: true,
      publishedRevisionId: "rev-1",
      liveRevisionId: "rev-other",
      liveIntroId: "intro-b",
      introId: "intro-a",
    });
    expect(published).toBe("published");
    expect(introOperatorLabelKo(published)).toBe("게시됨");
    const live = resolveIntroOperatorLifecycle({
      hasDraft: true,
      publishedRevisionId: "rev-1",
      liveRevisionId: "rev-1",
      liveIntroId: "intro-a",
      introId: "intro-a",
    });
    expect(introOperatorLabelKo(live)).toBe("앱 노출 중");
  });
});

describe("cta routes", () => {
  it("allows product tabs and rejects admin", () => {
    expect(isApprovedIntroCtaRoute("/philife")).toBe(true);
    expect(isApprovedIntroCtaRoute("/admin")).toBe(false);
    expect(isApprovedIntroCtaRoute("/stores/owner")).toBe(false);
  });
});

describe("publish validation", () => {
  it("rejects unpublished media and accepts READY media", () => {
    const doc = threeSceneDocument();
    expect(validateDocumentForPublish(doc, new Set()).ok).toBe(false);
    expect(
      validateDocumentForPublish(
        doc,
        new Set(["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"]),
      ).ok,
    ).toBe(true);
  });
});

describe("geometry", () => {
  it("contain and cover keep the source aspect", () => {
    const box = { x: 0, y: 0, width: 1, height: 1 };
    const contained = containRect(200, 100, box);
    expect(contained.height).toBeCloseTo(0.5);
    const covered = coverRect(200, 100, box);
    expect(covered.width).toBeGreaterThan(1);
  });
});
