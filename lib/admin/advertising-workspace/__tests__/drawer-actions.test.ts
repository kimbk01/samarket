import { describe, expect, it } from "vitest";
import {
  familyFromControlDomain,
  filterWorkspaceActionsByMode,
  listWorkspaceDrawerActions,
} from "@/lib/admin/advertising-workspace/resolve-drawer-actions";
import { isAdminAuthorityCtaAllowed } from "@/lib/ads/admin-authority-matrix";
import { splitAdminMessages } from "@/lib/ads/admin-authority-matrix";

describe("workspace drawer writer CTAs", () => {
  it("pending community boost exposes approve/reject only (writer-backed)", () => {
    const actions = listWorkspaceDrawerActions({
      family: "boost_community",
      statusRaw: "검토 대기",
    });
    expect(actions).toContain("approve");
    expect(actions).toContain("reject");
    expect(actions).toContain("add_internal_memo");
    expect(actions).not.toContain("terminate");
  });

  it("active community boost exposes pause/resume/end (Owner sanction writers)", () => {
    expect(isAdminAuthorityCtaAllowed("boost_community", "PAUSE")).toBe(true);
    expect(isAdminAuthorityCtaAllowed("boost_community", "RESUME")).toBe(true);
    expect(isAdminAuthorityCtaAllowed("boost_community", "END")).toBe(true);
    const actions = listWorkspaceDrawerActions({
      family: "boost_community",
      statusRaw: "active",
    });
    expect(actions).toContain("pause");
    expect(actions).toContain("end");
  });

  it("maps control domains to families", () => {
    expect(familyFromControlDomain("community_promote", "x")).toBe("boost_community");
    expect(familyFromControlDomain("delivery", "banner")).toBe("delivery_banner");
    expect(familyFromControlDomain("popup", "x")).toBe("platform_popup_request");
    expect(
      familyFromControlDomain("popup", "platform_popup", {
        id: "popup_campaign:abc",
        source: "platform_popup_campaigns",
      })
    ).toBe("platform_popup_campaign");
  });

  it("popup campaign draft exposes delete_safe_draft", () => {
    expect(isAdminAuthorityCtaAllowed("platform_popup", "DELETE_DRAFT")).toBe(true);
    const actions = listWorkspaceDrawerActions({
      family: "platform_popup_campaign",
      statusRaw: "임시저장",
    });
    expect(actions).toContain("delete_safe_draft");
    expect(actions).not.toContain("pause");
  });

  it("popup campaign active exposes pause/end/change_period without extend_compensation", () => {
    const actions = listWorkspaceDrawerActions({
      family: "platform_popup_campaign",
      statusRaw: "활성",
    });
    expect(actions).toContain("pause");
    expect(actions).toContain("end");
    expect(actions).toContain("change_period");
    expect(actions).not.toContain("extend_compensation");
    expect(actions).not.toContain("approve");
  });

  it("popup campaign incomplete / 노출 대기 map to operable buckets", () => {
    expect(
      listWorkspaceDrawerActions({
        family: "platform_popup_campaign",
        statusRaw: "불완전",
      })
    ).toContain("delete_safe_draft");
    const waiting = listWorkspaceDrawerActions({
      family: "platform_popup_campaign",
      statusRaw: "노출 대기",
    });
    expect(waiting).toContain("pause");
    expect(waiting).toContain("end");
    expect(waiting).not.toContain("approve");
  });

  it("mode=all keeps popup ops CTAs including delete", () => {
    const draft = filterWorkspaceActionsByMode(
      listWorkspaceDrawerActions({
        family: "platform_popup_campaign",
        statusRaw: "임시저장",
      }),
      "all"
    );
    expect(draft).toContain("delete_safe_draft");
    const live = filterWorkspaceActionsByMode(
      listWorkspaceDrawerActions({
        family: "platform_popup_campaign",
        statusRaw: "노출 중",
      }),
      "all"
    );
    expect(live).toContain("pause");
    expect(live).toContain("end");
    expect(live).not.toContain("delete_safe_draft");
  });

  it("popup request pending exposes approve/reject only", () => {
    const actions = listWorkspaceDrawerActions({
      family: "platform_popup_request",
      statusRaw: "승인 대기",
    });
    expect(actions).toContain("approve");
    expect(actions).toContain("reject");
    expect(actions).not.toContain("pause");
  });

  it("splits internal memo vs public message", () => {
    const s = splitAdminMessages({
      internalMemo: "  ops note  ",
      applicantVisibleMessage: "  please fix image  ",
    });
    expect(s.internalMemo).toBe("ops note");
    expect(s.publicAdminMessage).toBe("please fix image");
  });

  it("active delivery banner exposes compensation extend (writer-backed)", () => {
    expect(isAdminAuthorityCtaAllowed("delivery_banner", "EXTEND_COMPENSATION")).toBe(true);
    const actions = listWorkspaceDrawerActions({
      family: "delivery_banner",
      statusRaw: "active",
    });
    expect(actions).toContain("extend_compensation");
    expect(actions).toContain("pause");
  });
});
