/**
 * @vitest-environment node
 * Phase 1 Intro CMS editing foundation — original owner contract.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyIntroCmsSaveResult,
  cloneIntroAdminCampaign,
  discardIntroCmsEdits,
  introCmsCanDeleteScene,
  introCmsDeviceReadinessLabel,
  introCmsDraftSavePayload,
  introCmsIsDirty,
  introCmsListDeviceReadiness,
  introCmsListStateLabel,
  introCmsPreviewFrame,
  isIntroCmsFinalEditorAuthority,
  resolveIntroCmsUnsavedNavigation,
} from "@/lib/startup/intro-v2/admin-cms-phase1";
import { defaultNewCampaignDraft, defaultNewScene, type IntroAdminCampaign } from "@/lib/startup/intro-v2/admin-editor-model";
import { applyIntroCtaEntityLabels, collectUnresolvedIntroCtaEntityIds } from "@/lib/startup/intro-v2/admin-cta-entity-client";
import { deriveIntroOperatorAppState, introOperatorAppStateLabel } from "@/lib/startup/intro-operator-contract";

const ROOT = process.cwd();

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function campaign(partial?: Partial<IntroAdminCampaign>): IntroAdminCampaign {
  return {
    ...defaultNewCampaignDraft("Autumn intro"),
    id: "camp-1",
    updatedAt: "2026-09-28T00:00:00.000Z",
    updatedBy: "admin",
    scenes: [defaultNewScene("scene-1", 0, "Scene 1")],
    ...partial,
  };
}

describe("Phase 1 CMS editor route authority", () => {
  it("routes the final CMS shell, not Operator or Device Stage", () => {
    const route = read("app/admin/intro/[campaignId]/page.tsx");
    const cms = read("components/admin/intro/AdminIntroCmsEditorPage.tsx");
    expect(route).toContain("AdminIntroCmsEditorPage");
    expect(route).not.toContain("AdminIntroOperatorForm");
    expect(route).not.toContain("AdminIntroEditorPage");
    expect(cms).toContain('data-intro-editor="cms-v1"');
    expect(cms).not.toContain('data-intro-composer="v2"');
    expect(cms).not.toContain("이 기기군만 다름");
    expect(cms).toContain("data-intro-scene-navigator");
    expect(cms).toContain("data-intro-unsaved-guard");
    expect(cms).toContain("AdminIntroCmsCtaDestinationFields");
    expect(cms).toContain("INTRO_ADMIN_INTERACTION_UI");
    expect(cms).not.toContain("새 Intro 런타임 게시 지원 준비 중");
    expect(cms).not.toContain("not in this phase");
    expect(cms).not.toContain("이 단계에 없습니다");
    expect(existsSync(join(ROOT, "components/admin/intro/AdminIntroEditorPage.tsx"))).toBe(false);
    expect(existsSync(join(ROOT, "components/admin/intro/AdminIntroOperatorForm.tsx"))).toBe(false);
    expect(existsSync(join(ROOT, "components/admin/intro/AdminIntroPreviewCanvas.tsx"))).toBe(false);
    expect(existsSync(join(ROOT, "components/admin/intro/AdminIntroOperatorPreview.tsx"))).toBe(false);
    expect(existsSync(join(ROOT, "lib/startup/intro-v2/composer-visual.ts"))).toBe(false);
    expect(
      isIntroCmsFinalEditorAuthority({
        routedComponent: "AdminIntroCmsEditorPage",
        operatorRouted: false,
        deviceComposerRouted: false,
      })
    ).toBe(true);
    expect(
      isIntroCmsFinalEditorAuthority({
        routedComponent: "AdminIntroOperatorForm",
        operatorRouted: true,
        deviceComposerRouted: false,
      })
    ).toBe(false);
  });
});

describe("Phase 1 dirty / save / discard / guard", () => {
  it("starts clean, becomes dirty on change, and clears only after successful save", () => {
    const saved = campaign();
    const current = cloneIntroAdminCampaign(saved);
    expect(introCmsIsDirty(current, saved)).toBe(false);

    const edited = { ...current, name: "Changed" };
    expect(introCmsIsDirty(edited, saved)).toBe(true);

    const failed = applyIntroCmsSaveResult({ current: edited, ok: false, saved: null });
    expect(failed.persisted).toBe(false);
    expect(failed.campaign.name).toBe("Changed");
    expect(introCmsIsDirty(failed.campaign, saved)).toBe(true);

    const persistedCopy = campaign({ name: "Changed" });
    const ok = applyIntroCmsSaveResult({ current: edited, ok: true, saved: persistedCopy });
    expect(ok.persisted).toBe(true);
    expect(introCmsIsDirty(ok.campaign, persistedCopy)).toBe(false);
  });

  it("discard restores the last persisted snapshot", () => {
    const saved = campaign({ name: "Persisted" });
    const edited = { ...cloneIntroAdminCampaign(saved), name: "Unsaved" };
    const restored = discardIntroCmsEdits(saved);
    expect(restored.name).toBe("Persisted");
    expect(introCmsIsDirty(restored, saved)).toBe(false);
    expect(edited.name).toBe("Unsaved");
  });

  it("navigation guard stays or leaves without saving", () => {
    expect(resolveIntroCmsUnsavedNavigation({ dirty: false, decision: null })).toBe("allow");
    expect(resolveIntroCmsUnsavedNavigation({ dirty: true, decision: null })).toBe("block");
    expect(resolveIntroCmsUnsavedNavigation({ dirty: true, decision: "stay" })).toBe("block");
    expect(resolveIntroCmsUnsavedNavigation({ dirty: true, decision: "discard_leave" })).toBe(
      "leave_without_save"
    );
  });
});

describe("Phase 1 create / edit / scenes / no device copies", () => {
  it("loads an existing campaign cleanly and supports a new campaign draft", () => {
    const existing = campaign({ name: "Existing draft" });
    expect(introCmsIsDirty(existing, existing)).toBe(false);
    const created = campaign({
      ...defaultNewCampaignDraft("New intro"),
      id: "camp-new",
      updatedAt: "2026-09-28T00:00:00.000Z",
      updatedBy: "admin",
      scenes: [],
    });
    expect(created.status).toBe("draft");
    expect(created.deviceOverrides).toEqual([]);
  });

  it("supports 1..N scene navigator without deleting the last scene", () => {
    expect(introCmsCanDeleteScene(1)).toBe(false);
    expect(introCmsCanDeleteScene(2)).toBe(true);
    const payload = introCmsDraftSavePayload(campaign({ deviceOverrides: [] }));
    expect("deviceOverrides" in payload).toBe(false);
    expect(payload.scenes).toHaveLength(1);
  });

  it("preview viewport does not write device-specific creative data", () => {
    const phone = introCmsPreviewFrame("phone");
    const tablet = introCmsPreviewFrame("tablet");
    const wide = introCmsPreviewFrame("wide");
    expect(phone.writesCreative).toBe(false);
    expect(tablet.writesCreative).toBe(false);
    expect(wide.writesCreative).toBe(false);
    expect(wide.contract).toBe("ADMIN_VERIFICATION");
    expect(phone.width).toBe(360);
    expect(tablet.width).toBe(800);
    expect(tablet.height).toBe(1280);
    expect(wide.width).toBe(1280);
  });
});

describe("Phase 1 list application wording", () => {
  it("does not infer LOCAL_READY or APPLIED from admin_settings identity", () => {
    const list = read("components/admin/intro/AdminIntroListPage.tsx");
    const contract = read("lib/startup/intro-operator-contract.ts");
    expect(list).not.toContain("현재 앱 적용");
    expect(list).not.toContain('"applied"');
    expect(list).toContain("introCmsDeviceReadinessLabel");
    expect(list).toContain("introCmsListStateLabel");
    expect(list).not.toContain("introOperatorAppStateLabel");
    expect(contract).not.toContain("현재 앱 적용");
    expect(introOperatorAppStateLabel("published", "ko")).toBe("게시됨");
    expect(introCmsListStateLabel("published", "ko")).toBe("게시됨");
    expect(introCmsListStateLabel("scheduled", "ko")).toBe("예약됨");
    expect(introCmsListStateLabel("draft", "ko")).toBe("초안");
    expect(introCmsListStateLabel("paused", "ko")).toBe("일시중지");
    expect(introCmsListStateLabel("ended", "ko")).toBe("보관");
    expect(introCmsDeviceReadinessLabel("ko")).toBe("기기 수신 상태 미확인");
    expect(introCmsListDeviceReadiness("published")).toBe("unknown");
    expect(
      deriveIntroOperatorAppState({
        campaignId: "camp-1",
        status: "active",
        startsAt: "2026-09-01T00:00:00.000Z",
        endsAt: null,
        appliedCampaignId: "camp-1",
        appliedStatus: "active",
        nowMs: Date.parse("2026-09-28T12:00:00.000Z"),
      })
    ).toBe("published");
  });

  it("restores saved CTA entity labels without dirtying the draft", () => {
    const draft = campaign({
      scenes: [
        {
          ...defaultNewScene("scene-1", 0, "Scene 1"),
          cta: { enabled: true, destination: { type: "POST", id: "post-1" } },
        },
      ],
    });
    const unresolved = collectUnresolvedIntroCtaEntityIds(draft);
    expect(unresolved.get("POST")).toEqual(["post-1"]);
    const labeled = applyIntroCtaEntityLabels(draft, new Map([["POST:post-1", "Medal"]]));
    expect(labeled.scenes[0]?.cta?.destination.label).toBe("Medal");
    expect(collectUnresolvedIntroCtaEntityIds(labeled).size).toBe(0);
  });
});
