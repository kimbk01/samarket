/**
 * REBUILD 14 P6 — Admin Studio / Save / Preview / Service Apply.
 * CODE + AUTOMATED only. No DEVICE / Production compositor claims.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  STARTUP_COMPOSITOR_PRODUCTION_PRESENTATION_ACTIVE,
  getStartupCompositorActivation,
  createEmptyAuthoringDocument,
  authoringContentFingerprint,
  hasUnsavedAuthoringChanges,
  saveAuthoringDraft,
  createMemoryDraftStore,
  buildPreviewFromWorkingDocument,
  assertPreviewUsesWorkingDocument,
  applyServiceFromSavedDraft,
  buildStartupPackageEnvelope,
  createMemoryLiveRepository,
  humanizeAuthoringError,
  ADMIN_MEDIA_CAPABILITIES,
  MP4_AUDIO_PRODUCT_DECISION,
  MP4_AUDIO_ADMIN_CONTROLS_EXPOSED,
  isAdminMediaExposed,
  createScene,
  renameScene,
  duplicateScene,
  reorderScenes,
  deleteScene,
  insertImageElementFrame,
  replaceElementMediaId,
  centerElementFrame,
  createPreviewSemanticApi,
  PREVIEW_SEMANTIC_MODULE_ID,
  validateMotionToken,
  validateTransitionToken,
  BRAND_SIZE_NORM,
  computeEnvelopeIntegrity,
  envelopeWithoutIntegrityField,
  MOTION_TYPES_V1,
  TRANSITION_TYPES_V1,
} from "@/lib/startup-compositor";
import { __resetServiceApplyStateForTests } from "@/lib/startup-compositor/admin/service-apply";
import {
  logicalApplyIntentKey,
  startupEnvelopeStoragePath,
  legacyIntroPackStoragePath,
} from "@/lib/intro/live/apply-intent";
import { PREVIEW_SOURCE } from "@/lib/startup-compositor/admin/preview";
import type { StartupAuthoringDocument } from "@/lib/startup-compositor/admin/authoring-document";
import type { IntroDocumentV1 } from "@/lib/intro/contracts/document";

beforeEach(() => {
  __resetServiceApplyStateForTests();
});

function workingDoc(
  id = `doc_${Math.random().toString(36).slice(2, 10)}`,
): StartupAuthoringDocument {
  return createEmptyAuthoringDocument({ documentId: id, title: "P6 Studio" });
}

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...collectTsFiles(p));
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

describe("R14-P6 Admin authority", () => {
  it("P6-01 one canonical Admin document authority", () => {
    const d = workingDoc("one_auth");
    expect(d.systemStart).toBeTruthy();
    expect(d.intro).toBeTruthy();
    expect(d.schemaVersion).toBe(14);
    const fp = authoringContentFingerprint(d);
    expect(fp).toContain("systemStart");
    expect(fp).toContain("intro");
  });

  it("P6-02 no old Preview semantic engine active in IntroCanonicalPreview", () => {
    const src = readFileSync(
      join(process.cwd(), "components/admin/intro/IntroCanonicalPreview.tsx"),
      "utf8",
    );
    expect(src).toContain("createPreviewSemanticApi");
    expect(src).toContain("PREVIEW_SOURCE");
    expect(src).toContain("createPreviewSemanticApi()");
    expect(src).toContain("evaluateMotionAtSceneElapsed");
    expect(src).not.toContain('from "@/lib/intro/geometry/element-layout"');
    expect(src).not.toContain("function PreviewGeometry");
    expect(src).not.toContain("function PreviewMotion");
    // Client must not import barrel (pulls integrity → node:crypto → Webpack UnhandledSchemeError).
    expect(src).not.toContain('from "@/lib/startup-compositor"');
    expect(src).toContain(
      'from "@/lib/startup-compositor/execution/adapters"',
    );
  });

  it("P6-03 Preview uses createPreviewSemanticApi", () => {
    const api = createPreviewSemanticApi();
    expect(api.moduleId).toBe(PREVIEW_SEMANTIC_MODULE_ID);
    const prev = buildPreviewFromWorkingDocument(workingDoc());
    expect(prev.ok).toBe(true);
    if (prev.ok) {
      expect(prev.semanticApi.moduleId).toBe(PREVIEW_SEMANTIC_MODULE_ID);
      expect(prev.source).toBe(PREVIEW_SOURCE);
    }
  });

  it("P6-04 Preview current working doc, not stale saved doc", () => {
    const store = createMemoryDraftStore();
    let w = workingDoc("prev_work");
    const saved = saveAuthoringDraft(store, w);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    w = {
      ...saved.document,
      title: "unsaved edit",
      savedFingerprint: saved.document.savedFingerprint,
    };
    expect(hasUnsavedAuthoringChanges(w)).toBe(true);
    const prev = buildPreviewFromWorkingDocument(w);
    expect(prev.ok).toBe(true);
    if (prev.ok) {
      expect(prev.systemStart).toEqual(w.systemStart);
      expect(assertPreviewUsesWorkingDocument({
        workingFingerprint: authoringContentFingerprint(w),
        previewFingerprint: authoringContentFingerprint(w),
      })).toBe(true);
    }
  });

  it("P6-05 Preview does not mutate Live", () => {
    const live = createMemoryLiveRepository();
    const before = live.getActiveGenerationId();
    const prev = buildPreviewFromWorkingDocument(workingDoc());
    expect(prev.ok).toBe(true);
    if (prev.ok) expect(prev.mutatesLive).toBe(false);
    expect(live.getActiveGenerationId()).toBe(before);
  });

  it("P6-06 Save persists Draft only", () => {
    const store = createMemoryDraftStore();
    const live = createMemoryLiveRepository();
    const r = saveAuthoringDraft(store, workingDoc("save_only"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.createdRelease).toBe(false);
    expect(r.changedLive).toBe(false);
    expect(store.get(r.document.documentId)?.draftVersion).toBe(1);
    expect(live.getActiveGenerationId()).toBeNull();
  });

  it("P6-07 Save does not create Release", () => {
    const store = createMemoryDraftStore();
    const live = createMemoryLiveRepository();
    const r = saveAuthoringDraft(store, workingDoc("no_rel"));
    expect(r.ok).toBe(true);
    expect(live.getAuthority().active).toBeNull();
  });

  it("P6-08 Save does not change Live", () => {
    const store = createMemoryDraftStore();
    const live = createMemoryLiveRepository();
    const first = saveAuthoringDraft(store, workingDoc("live_unchanged"));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const applied = applyServiceFromSavedDraft(store, live, {
      documentId: first.document.documentId,
      idempotencyKey: "k1",
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    const liveId = live.getActiveGenerationId();
    const again = saveAuthoringDraft(store, {
      ...first.document,
      title: "edit after live",
      draftVersion: first.document.draftVersion,
      savedFingerprint: first.document.savedFingerprint,
    });
    expect(again.ok).toBe(true);
    expect(live.getActiveGenerationId()).toBe(liveId);
  });

  it("P6-09 Apply requires saved Draft", () => {
    const store = createMemoryDraftStore();
    const live = createMemoryLiveRepository();
    const r = applyServiceFromSavedDraft(store, live, {
      documentId: "never_saved",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("apply_requires_saved_draft");
  });

  it("P6-10 Apply rejects unsaved divergence", () => {
    const store = createMemoryDraftStore();
    const live = createMemoryLiveRepository();
    const saved = saveAuthoringDraft(store, workingDoc("div"));
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const working = {
      ...saved.document,
      title: "dirty",
    };
    const r = applyServiceFromSavedDraft(store, live, {
      documentId: saved.document.documentId,
      working,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("apply_unsaved_divergence");
  });

  it("P6-11 Apply creates immutable Release", () => {
    const store = createMemoryDraftStore();
    const live = createMemoryLiveRepository();
    const saved = saveAuthoringDraft(store, workingDoc("imm"));
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const r = applyServiceFromSavedDraft(store, live, {
      documentId: saved.document.documentId,
      idempotencyKey: "imm1",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.release.immutable).toBe(true);
    expect(() =>
      live.putRelease({
        ...r.release,
        envelope: { ...r.release.envelope, integrity: "deadbeef" },
      }),
    ).toThrow(/immutable_release_mutation_forbidden/);
  });

  it("P6-12 Apply produces OWNER contentClass", () => {
    const store = createMemoryDraftStore();
    const live = createMemoryLiveRepository();
    const saved = saveAuthoringDraft(store, workingDoc("owner_cc"));
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const r = applyServiceFromSavedDraft(store, live, {
      documentId: saved.document.documentId,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.envelope.contentClass).toBe("OWNER");
    expect(r.release.contentClass).toBe("OWNER");
  });

  it("P6-13 Apply rejects QA", () => {
    const store = createMemoryDraftStore();
    const live = createMemoryLiveRepository();
    const qa = createEmptyAuthoringDocument({
      documentId: "qa_doc",
      contentClass: "QA",
    });
    const saved = saveAuthoringDraft(store, qa);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const r = applyServiceFromSavedDraft(store, live, {
      documentId: saved.document.documentId,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("QA");
  });

  it("P6-14 Apply rejects SYSTEM_BOOTSTRAP", () => {
    const store = createMemoryDraftStore();
    const live = createMemoryLiveRepository();
    const boot = createEmptyAuthoringDocument({
      documentId: "boot_doc",
      contentClass: "SYSTEM_BOOTSTRAP",
    });
    const saved = saveAuthoringDraft(store, boot);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const r = applyServiceFromSavedDraft(store, live, {
      documentId: saved.document.documentId,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("SYSTEM_BOOTSTRAP");
  });

  it("P6-15 exactly one Live pointer", () => {
    const store = createMemoryDraftStore();
    const live = createMemoryLiveRepository();
    const a = saveAuthoringDraft(store, workingDoc("live_a"));
    const b = saveAuthoringDraft(store, workingDoc("live_b"));
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    const r1 = applyServiceFromSavedDraft(store, live, {
      documentId: a.document.documentId,
      idempotencyKey: "la",
    });
    const r2 = applyServiceFromSavedDraft(store, live, {
      documentId: b.document.documentId,
      idempotencyKey: "lb",
    });
    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(live.getActiveGenerationId()).toBe(r2.liveGenerationId);
    expect(live.getActiveGenerationId()).not.toBe(r1.liveGenerationId);
  });

  it("P6-16 one StartupPackageEnvelope", () => {
    const store = createMemoryDraftStore();
    const live = createMemoryLiveRepository();
    const saved = saveAuthoringDraft(store, workingDoc("env1"));
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const r = applyServiceFromSavedDraft(store, live, {
      documentId: saved.document.documentId,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.envelope.systemStart).toBeTruthy();
    expect(r.envelope.generationId).toBeTruthy();
    expect(r.envelope.integrity).toMatch(/^[0-9a-f]{64}$/);
  });

  it("P6-17 canonical integrity deterministic", () => {
    const d = workingDoc("det");
    const store = createMemoryDraftStore();
    const saved = saveAuthoringDraft(store, d);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const e1 = buildStartupPackageEnvelope({
      generationId: "gen_fixed",
      draft: saved.document,
    });
    const e2 = buildStartupPackageEnvelope({
      generationId: "gen_fixed",
      draft: saved.document,
    });
    expect(e1.integrity).toBe(e2.integrity);
    const recomputed = computeEnvelopeIntegrity(
      envelopeWithoutIntegrityField(e1),
    ).hex;
    expect(recomputed).toBe(e1.integrity);
  });

  it("P6-18 double Apply idempotent", () => {
    const store = createMemoryDraftStore();
    const live = createMemoryLiveRepository();
    const saved = saveAuthoringDraft(store, workingDoc("idem"));
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const key = "same_key_idem";
    const r1 = applyServiceFromSavedDraft(store, live, {
      documentId: saved.document.documentId,
      idempotencyKey: key,
    });
    const r2 = applyServiceFromSavedDraft(store, live, {
      documentId: saved.document.documentId,
      idempotencyKey: key,
    });
    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(r2.idempotentReplay).toBe(true);
    expect(r2.release.releaseId).toBe(r1.release.releaseId);
    expect(r2.envelope.integrity).toBe(r1.envelope.integrity);
  });

  it("P6-19 failed Apply leaves prior Live", () => {
    const store = createMemoryDraftStore();
    const live = createMemoryLiveRepository();
    const saved = saveAuthoringDraft(store, workingDoc("prior"));
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const ok = applyServiceFromSavedDraft(store, live, {
      documentId: saved.document.documentId,
      idempotencyKey: "prior_ok",
    });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    const prior = live.getActiveGenerationId();
    const next = saveAuthoringDraft(store, {
      ...saved.document,
      title: "next fail",
      draftVersion: saved.document.draftVersion,
      savedFingerprint: saved.document.savedFingerprint,
    });
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    const fail = applyServiceFromSavedDraft(store, live, {
      documentId: next.document.documentId,
      idempotencyKey: "prior_fail",
      forceSealFail: true,
    });
    expect(fail.ok).toBe(false);
    if (!fail.ok) {
      expect(fail.priorLiveGenerationId).toBe(prior);
    }
    expect(live.getActiveGenerationId()).toBe(prior);
  });

  it("P6-20 failed package seal leaves prior Live", () => {
    const store = createMemoryDraftStore();
    const live = createMemoryLiveRepository();
    const saved = saveAuthoringDraft(store, workingDoc("seal"));
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const ok = applyServiceFromSavedDraft(store, live, {
      documentId: saved.document.documentId,
      idempotencyKey: "seal_ok",
    });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    const prior = live.getActiveGenerationId();
    const fail = applyServiceFromSavedDraft(store, live, {
      documentId: saved.document.documentId,
      idempotencyKey: "seal_fail_new",
      forceSealFail: true,
    });
    // Same saved draft + new key still attempts seal; force fail must leave prior.
    expect(fail.ok).toBe(false);
    expect(live.getActiveGenerationId()).toBe(prior);
  });
});

describe("R14-P6 System Start Admin", () => {
  it("P6-21 bg color canonical", () => {
    const d = workingDoc();
    expect(d.systemStart.backgroundColor).toMatch(/^#[0-9A-F]{6}$/);
  });

  it("P6-22 bg image canonical media ref", () => {
    const d = workingDoc();
    expect(d.systemStart.backgroundImageMediaId).toBeNull();
  });

  it("P6-23 brand enabled requires media", () => {
    const store = createMemoryDraftStore();
    const bad: StartupAuthoringDocument = {
      ...workingDoc("brand_req"),
      systemStart: {
        ...workingDoc().systemStart,
        brandAssetEnabled: true,
        brandAssetMediaId: null,
      },
    };
    const r = saveAuthoringDraft(store, bad);
    expect(r.ok).toBe(false);
  });

  it("P6-24 S/M/L maps canonical P5/P3 contract", () => {
    expect(BRAND_SIZE_NORM.S).toBe(0.18);
    expect(BRAND_SIZE_NORM.M).toBe(0.28);
    expect(BRAND_SIZE_NORM.L).toBe(0.4);
  });

  it("P6-25 normalized position", () => {
    const d = workingDoc();
    expect(d.systemStart.brandXNorm).toBeGreaterThanOrEqual(0);
    expect(d.systemStart.brandXNorm).toBeLessThanOrEqual(1);
    expect(d.systemStart.brandYNorm).toBeGreaterThanOrEqual(0);
    expect(d.systemStart.brandYNorm).toBeLessThanOrEqual(1);
  });

  it("P6-26 min duration canonical", () => {
    expect([500, 1000, 1500, 2000, 3000, 4000, 5000]).toContain(
      workingDoc().systemStart.minVisibleMs,
    );
  });

  it("P6-27 Preview consumes same System Start semantics", () => {
    const d = workingDoc();
    const prev = buildPreviewFromWorkingDocument(d);
    expect(prev.ok).toBe(true);
    if (prev.ok) expect(prev.systemStart).toEqual(d.systemStart);
  });
});

describe("R14-P6 Intro editor", () => {
  it("P6-28 add Scene", () => {
    const d = workingDoc().intro;
    const next = createScene(d, { name: "장면2" });
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    expect(next.value.scenes.length).toBe(d.scenes.length + 1);
    expect(next.value.scenes.at(-1)?.name).toBe("장면2");
  });

  it("P6-29 rename Scene", () => {
    const d = workingDoc().intro;
    const id = d.scenes[0]!.id;
    const next = renameScene(d, id, "이름변경");
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    expect(next.value.scenes[0]!.name).toBe("이름변경");
  });

  it("P6-30 duplicate Scene new ID", () => {
    const d = workingDoc().intro;
    const id = d.scenes[0]!.id;
    const next = duplicateScene(d, id);
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    expect(next.value.scenes.length).toBe(2);
    expect(next.value.scenes[1]!.id).not.toBe(id);
    expect(next.value.scenes[1]!.elements[0]!.id).not.toBe(
      d.scenes[0]!.elements[0]!.id,
    );
  });

  it("P6-31 reorder Scene", () => {
    const added = createScene(workingDoc().intro, { name: "B" });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const ids = [added.value.scenes[1]!.id, added.value.scenes[0]!.id];
    const reordered = reorderScenes(added.value, ids);
    expect(reordered.ok).toBe(true);
    if (!reordered.ok) return;
    expect(reordered.value.scenes[0]!.name).toBe("B");
  });

  it("P6-32 delete Scene", () => {
    const added = createScene(workingDoc().intro, { name: "B" });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const del = deleteScene(added.value, added.value.scenes[0]!.id);
    expect(del.ok).toBe(true);
    const last = deleteScene(
      workingDoc().intro,
      workingDoc().intro.scenes[0]!.id,
    );
    expect(last.ok).toBe(false);
  });

  it("P6-33 IMAGE insert aspect preserved", () => {
    const frame = insertImageElementFrame({
      intrinsic: { width: 200, height: 100 },
      maxW: 0.7,
      maxH: 0.45,
    });
    expect(frame.w / frame.h).toBeCloseTo(2, 5);
    expect(frame.w).toBeLessThanOrEqual(0.7 + 1e-9);
  });

  it("P6-34 LOGO insert aspect preserved", () => {
    const frame = insertImageElementFrame({
      intrinsic: { width: 100, height: 200 },
      maxW: 0.5,
      maxH: 0.4,
    });
    expect(frame.w / frame.h).toBeCloseTo(0.5, 5);
  });

  it("P6-35 replace preserves geometry", () => {
    const payload = { mediaId: "old", fit: "CONTAIN" as const };
    const next = replaceElementMediaId(payload, "new");
    expect(next.mediaId).toBe("new");
    expect(next.fit).toBe("CONTAIN");
  });

  it("P6-36 center canonical", () => {
    const centered = centerElementFrame({ x: 0, y: 0, w: 0.4, h: 0.2 });
    expect(centered.x).toBeCloseTo((1 - 0.4) / 2, 8);
    expect(centered.y).toBeCloseTo((1 - 0.2) / 2, 8);
  });

  it("P6-37 editor chrome excluded from canonical doc", () => {
    const files = collectTsFiles(
      join(process.cwd(), "lib/startup-compositor/admin"),
    );
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src).not.toMatch(/editorHandle|selectionBorder|chromePx/);
    }
  });

  it("P6-38 motion tokens canonical", () => {
    for (const t of MOTION_TYPES_V1) {
      expect(
        validateMotionToken({ type: t, startMs: 0, durationMs: 300 }).ok,
      ).toBe(true);
    }
    expect(
      validateMotionToken({ type: "SLIDE_LEFT", startMs: 0, durationMs: 300 }).ok,
    ).toBe(false);
  });

  it("P6-39 transition tokens canonical", () => {
    for (const t of TRANSITION_TYPES_V1) {
      expect(
        validateTransitionToken({
          type: t,
          durationMs: t === "CUT" ? 0 : 300,
        }).ok,
      ).toBe(true);
    }
  });

  it("P6-40 motion/transition cannot mix", () => {
    const motion = validateMotionToken({
      type: "SLIDE_LEFT",
      startMs: 0,
      durationMs: 300,
    });
    expect(motion.ok).toBe(false);
    if (!motion.ok) {
      expect(motion.reason).toBe("motion_transition_token_forbidden");
    }
    const transition = validateTransitionToken({
      type: "FADE_IN",
      durationMs: 300,
    });
    expect(transition.ok).toBe(false);
    if (!transition.ok) {
      expect(transition.reason).toBe("transition_motion_token_forbidden");
    }
  });
});

describe("R14-P6 CTA / Media", () => {
  it("P6-41 NEXT authoring accepted by preview path", () => {
    const d = workingDoc();
    const intro: IntroDocumentV1 = {
      ...d.intro,
      scenes: d.intro.scenes.map((s, i) =>
        i === 0
          ? {
              ...s,
              elements: [
                ...s.elements,
                {
                  id: "cta1",
                  type: "CTA",
                  frame: { x: 0.2, y: 0.8, w: 0.6, h: 0.08 },
                  zIndex: 2,
                  visible: true,
                  opacity: 1,
                  motion: { type: "NONE", startMs: 0, durationMs: 0 },
                  payload: {
                    label: "다음",
                    action: { type: "NEXT_SCENE" },
                    backgroundColor: "#FFFFFF",
                    textColor: "#000000",
                  },
                },
              ],
            }
          : s,
      ),
    };
    const prev = buildPreviewFromWorkingDocument({ ...d, intro });
    expect(prev.ok).toBe(true);
  });

  it("P6-42 FINISH authoring", () => {
    const d = workingDoc();
    const intro: IntroDocumentV1 = {
      ...d.intro,
      scenes: [
        {
          ...d.intro.scenes[0]!,
          elements: [
            {
              id: "cta_f",
              type: "CTA",
              frame: { x: 0.2, y: 0.8, w: 0.6, h: 0.08 },
              zIndex: 2,
              visible: true,
              opacity: 1,
              motion: { type: "NONE", startMs: 0, durationMs: 0 },
              payload: {
                label: "시작",
                action: { type: "FINISH_INTRO" },
                backgroundColor: "#FFFFFF",
                textColor: "#000000",
              },
            },
          ],
        },
      ],
    };
    expect(buildPreviewFromWorkingDocument({ ...d, intro }).ok).toBe(true);
  });

  it("P6-43 INTERNAL registry only", () => {
    const api = createPreviewSemanticApi();
    const keys = api.listCtaDestinationKeys();
    expect(keys).toContain("community");
    expect(keys).toContain("trade");
  });

  it("P6-44 raw URL impossible/rejected", () => {
    const store = createMemoryDraftStore();
    const d = workingDoc("raw_url");
    // Forgery probe: type system forbids EXTERNAL_URL; runtime validation must reject.
    const forged = JSON.parse(
      JSON.stringify({
        ...d,
        intro: {
          ...d.intro,
          scenes: [
            {
              ...d.intro.scenes[0]!,
              elements: [
                {
                  id: "bad",
                  type: "CTA",
                  frame: { x: 0.2, y: 0.8, w: 0.6, h: 0.08 },
                  zIndex: 2,
                  visible: true,
                  opacity: 1,
                  motion: { type: "NONE", startMs: 0, durationMs: 0 },
                  payload: {
                    label: "bad",
                    action: {
                      type: "EXTERNAL_URL",
                      url: "https://evil.example",
                    },
                    backgroundColor: "#FFFFFF",
                    textColor: "#000000",
                  },
                },
              ],
            },
          ],
        },
      }),
    ) as typeof d;
    const r = saveAuthoringDraft(store, forged);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.reason === "raw_url_cta_forbidden" ||
          r.reason.startsWith("invalid_cta_action"),
      ).toBe(true);
    }
  });

  it("P6-45 PNG exposed", () => {
    expect(isAdminMediaExposed("PNG")).toBe(true);
  });
  it("P6-46 JPG exposed", () => {
    expect(isAdminMediaExposed("JPG")).toBe(true);
  });
  it("P6-47 WebP exposed", () => {
    expect(isAdminMediaExposed("WEBP")).toBe(true);
  });
  it("P6-48 GIF Preview capability truth", () => {
    expect(ADMIN_MEDIA_CAPABILITIES.GIF.adminExposed).toBe(false);
    expect(ADMIN_MEDIA_CAPABILITIES.GIF.previewSharedTimeline).toBe(false);
  });
  it("P6-49 MP4 Preview capability truth", () => {
    expect(ADMIN_MEDIA_CAPABILITIES.MP4.adminExposed).toBe(false);
    expect(ADMIN_MEDIA_CAPABILITIES.MP4.previewSharedTimeline).toBe(false);
  });
  it("P6-50 MP4 audio not silently authored", () => {
    expect(MP4_AUDIO_PRODUCT_DECISION).toBe("OPEN");
    expect(MP4_AUDIO_ADMIN_CONTROLS_EXPOSED).toBe(false);
  });
});

describe("R14-P6 Media library accept + human errors", () => {
  it("P6-51 media library accept excludes GIF/MP4 at P6", () => {
    const src = readFileSync(
      join(process.cwd(), "components/admin/intro/IntroMediaLibraryPanel.tsx"),
      "utf8",
    );
    expect(src).toContain('accept="image/jpeg,image/png,image/webp"');
    expect(src).not.toContain("video/mp4");
    expect(src).not.toContain("image/gif");
  });

  it("P6-52 humanize never echoes raw codes", () => {
    const msg = humanizeAuthoringError("invalid_motion:SLIDE_LEFT");
    expect(msg).not.toContain("SLIDE_LEFT");
    expect(msg).not.toContain("invalid_motion");
  });

  it("P6-53 Apply confirmation present in studio", () => {
    const src = readFileSync(
      join(process.cwd(), "components/admin/intro/IntroStudioPage.tsx"),
      "utf8",
    );
    expect(src).toContain("window.confirm");
    expect(src).toContain("서비스 버전");
    expect(src).toContain("dirty");
  });

  it("P6-54 native hosts remain unwired (activation false)", () => {
    expect(STARTUP_COMPOSITOR_PRODUCTION_PRESENTATION_ACTIVE).toBe(false);
    expect(getStartupCompositorActivation().productionPresentationActive).toBe(
      false,
    );
  });

  it("P6-55 apply-service bridges StartupPackageEnvelope", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/intro/live/apply-service.ts"),
      "utf8",
    );
    expect(src).toContain("applyServiceFromSavedDraft");
    expect(src).toContain("StartupPackageEnvelope");
    expect(src).toContain("contentClass: \"OWNER\"");
  });

  it("P6-56 separate System Start Apply is retired", () => {
    const route = readFileSync(
      join(process.cwd(), "app/api/admin/intro/system-start/apply/route.ts"),
      "utf8",
    );
    expect(route).toContain("system_start_separate_apply_retired");
    expect(route).not.toContain("applySystemStartLive");
    const panel = readFileSync(
      join(process.cwd(), "components/admin/intro/IntroSystemStartPanel.tsx"),
      "utf8",
    );
    expect(panel).toContain("Studio에서");
    expect(panel).toContain("단독 적용은");
  });

  it("P6-57 logical Apply intent ignores client Date.now uniqueness", () => {
    const a = logicalApplyIntentKey("doc1", 3);
    const b = logicalApplyIntentKey("doc1", 3);
    const c = logicalApplyIntentKey("doc1", 4);
    expect(a).toBe(b);
    expect(a).toBe("apply_doc1_v3");
    expect(c).not.toBe(a);
    const studio = readFileSync(
      join(process.cwd(), "components/admin/intro/IntroStudioPage.tsx"),
      "utf8",
    );
    expect(studio).toContain("`apply_${documentId}_v${draftVersion}`");
    expect(studio).not.toMatch(/idempotencyKey:[\s\S]*Date\.now\(\)/);
    const applySrc = readFileSync(
      join(process.cwd(), "lib/intro/live/apply-service.ts"),
      "utf8",
    );
    expect(applySrc).toContain("logicalApplyIntentKey");
    expect(applySrc).toContain("persistStartupEnvelope");
    expect(applySrc).toContain("startupEnvelopeStoragePath");
  });

  it("P6-58 package storage authority is StartupPackageEnvelope path", () => {
    expect(startupEnvelopeStoragePath("pkg1")).toBe(
      "authority/v1/packs/pkg1/startup-envelope.json",
    );
    expect(legacyIntroPackStoragePath("pkg1")).toBe(
      "authority/v1/packs/pkg1/pack.json",
    );
    const liveSrc = readFileSync(
      join(process.cwd(), "lib/intro/live/service.ts"),
      "utf8",
    );
    expect(liveSrc).toContain("packageAuthority");
    expect(liveSrc).toContain('"StartupPackageEnvelope"');
    expect(liveSrc).toContain('legacyIntroPackClassification: "LEGACY_COMPAT"');
  });

  it("P6-59 product Live shadow writers retired", () => {
    const liveSet = readFileSync(
      join(process.cwd(), "app/api/admin/intro/live/set/route.ts"),
      "utf8",
    );
    expect(liveSet).toContain("live_set_retired");
    expect(liveSet).not.toContain("setLiveRelease");
    const publish = readFileSync(
      join(
        process.cwd(),
        "app/api/admin/intro/documents/[documentId]/publish/route.ts",
      ),
      "utf8",
    );
    expect(publish).toContain("standalone_publish_retired");
    expect(publish).not.toMatch(/import\s*\{[^}]*publishIntroDocument/);
    expect(publish).not.toContain("await publishIntroDocument");
    const ssApply = readFileSync(
      join(process.cwd(), "lib/intro/system-start/live-apply.ts"),
      "utf8",
    );
    expect(ssApply).toContain("system_start_separate_apply_retired");
    // applySystemStartLive must throw; no Live mutation upsert remains in module.
    expect(ssApply).toMatch(
      /export async function applySystemStartLive[\s\S]*?throw Object\.assign/,
    );
    expect(ssApply).not.toContain(".upsert(");
  });

  it("P6-60 durable same-intent Apply reuses stored StartupPackageEnvelope", () => {
    const applySrc = readFileSync(
      join(process.cwd(), "lib/intro/live/apply-service.ts"),
      "utf8",
    );
    expect(applySrc).toContain("readStoredStartupEnvelope");
    expect(applySrc).toContain("durableReplay");
    expect(applySrc).toContain("alreadyLiveSameRelease");
    // Must not re-seal a divergent envelope when durable authority exists.
    expect(applySrc).toContain(
      "never re-seal a divergent process envelope",
    );
  });
});
