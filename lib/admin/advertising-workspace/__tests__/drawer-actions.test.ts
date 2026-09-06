import { describe, expect, it } from "vitest";
import {
  familyFromControlDomain,
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

  it("active community boost exposes pause/end", () => {
    expect(isAdminAuthorityCtaAllowed("boost_community", "PAUSE")).toBe(true);
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
