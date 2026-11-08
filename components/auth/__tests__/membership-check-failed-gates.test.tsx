// @vitest-environment jsdom
/**
 * 회원 판정 재시도 소진(일시 장애) — 메신저 홈·매장 상세·내정보 항목 게이트가 무한 로딩 대신
 * 오류 + [다시 시도]를 그리고, 다시 시도는 새 회원 판정 cycle 을 요청한다.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const membershipState = { current: { status: "checking" } as { status: string } };
const recoveryFailed = { current: false };
const retryClientMembershipRecovery = vi.fn();
const pathname = { current: "/community-messenger" };

vi.mock("@/hooks/use-client-membership-state", () => ({
  useClientMembershipState: () => membershipState.current,
  useClientMembershipRecoveryFailed: () => recoveryFailed.current,
  retryClientMembershipRecovery: (reason: string) => retryClientMembershipRecovery(reason),
}));

vi.mock("@/components/i18n/AppLanguageProvider", async () => {
  /** 언어 SSOT S6: 대체 문구 대신 실제 카탈로그 값(ko)으로 렌더 — 화면과 같은 문구를 확인한다 */
  const { safeTranslate } = await import("@/lib/i18n/safe-translate");
  return ({
  useI18n: () => ({
    t: (key: string) => `t:${key}`,
    safeT: (k: string, o?: Parameters<typeof safeTranslate>[2]) => safeTranslate("ko", k as never, o),
  }),
  });
});

vi.mock("@/lib/runtime/samarket-runtime-debug", () => ({ samarketRuntimeDebugEnabled: () => false }));
vi.mock("@/components/auth/GuestLoginRequiredPanel", () => ({
  GuestLoginRequiredPanel: () => <div data-testid="guest-panel" />,
}));
vi.mock("@/components/delivery/viewer-gate/DeliveryViewerGatePanel", () => ({
  DeliveryViewerGatePanel: () => <div data-testid="delivery-guest-panel" />,
}));
vi.mock("@/components/stores/StoreDeliveryListLoading", () => ({
  StoreDeliveryListLoading: () => <div data-testid="delivery-loading" />,
}));
vi.mock("@/lib/stores/delivery-viewer-gate", () => ({ isDeliveryViewerGatedPath: () => true }));
vi.mock("@/lib/dibay/delivery-list-scroll-restore", () => ({ isStoreConsumerDetailPath: () => true }));

vi.mock("@/lib/auth/get-current-user", () => ({ getCurrentUser: () => null }));
vi.mock("@/hooks/use-mypage-hub-model", () => ({
  useMypageHubModel: () => ({
    data: null,
    loading: false,
    overviewCounts: {},
    ownerHubStoreId: null,
    addressDefaults: null,
    neighborhoodFromLife: null,
    load: vi.fn(),
  }),
}));
vi.mock("@/components/mypage/MyPageItemScreen", () => ({
  MyPageItemScreen: () => <div data-testid="item-screen" />,
  MyPageItemStaticContent: () => <div data-testid="item-static" />,
}));
vi.mock("@/components/mypage/ds/MyScreen", () => ({
  MyScreen: ({ children }: { children: React.ReactNode }) => <div data-testid="my-screen">{children}</div>,
}));
vi.mock("@/lib/mypage/mypage-item-hub-wait", () => ({
  isMypageItemWithoutHubWait: () => false,
  mypageItemScreenTemplate: () => "list",
}));

const dashboardProps = { current: null as null | { loadFailed?: boolean; onProfileRefresh?: () => void } };
const homeModelRefresh = vi.fn();
vi.mock("@/components/mypage/MyPageHomeDashboard", () => ({
  MyPageHomeDashboard: (props: { loadFailed?: boolean; onProfileRefresh?: () => void }) => {
    dashboardProps.current = props;
    return <div data-testid="home-dashboard" />;
  },
}));
vi.mock("@/hooks/use-mypage-home-model", () => ({
  useMypageHomeModel: () => ({ projection: null, refresh: homeModelRefresh, needsRelogin: false, loadFailed: false }),
}));
vi.mock("@/components/my/MyPageHeader", () => ({ MyPageHeader: () => null }));
vi.mock("@/components/mypage/MyPageGuestHomeDashboard", () => ({
  MyPageGuestHomeDashboard: () => <div data-testid="guest-home" />,
}));
vi.mock("@/components/mypage/profile-settings/MypageProfileSheetsHost", () => ({ MypageProfileSheetsHost: () => null }));
vi.mock("@/components/mypage/profile-settings/mypage-profile-sheets-context", () => ({
  MypageProfileSheetsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/mypage/profile-settings/MypageProfileEditQueryOpener", () => ({
  MypageProfileEditQueryOpener: () => null,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

import { MyContent } from "@/app/(main)/my/MyContent";
import { CommunityMessengerGuestGate } from "@/components/community-messenger/CommunityMessengerGuestGate";
import { DeliveryViewerGuestGate } from "@/components/delivery/viewer-gate/DeliveryViewerGuestGate";
import { MyPageItemRouteClient } from "@/components/mypage/MyPageItemRouteClient";

describe("membership check failed — gates show error + retry instead of infinite loading", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    membershipState.current = { status: "checking" };
    recoveryFailed.current = false;
    retryClientMembershipRecovery.mockReset();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render(node: React.ReactNode) {
    act(() => root.render(node));
  }

  function clickRetry(): void {
    const button = container.querySelector("button");
    expect(button).not.toBeNull();
    act(() => button!.click());
  }

  it("messenger home: checking → loading text (unchanged)", () => {
    pathname.current = "/community-messenger";
    render(<CommunityMessengerGuestGate><div data-testid="child" /></CommunityMessengerGuestGate>);
    expect(container.querySelector("[data-cm-guest-gate-spinner]")).not.toBeNull();
    expect(container.querySelector("[data-testid=membership-check-failed]")).toBeNull();
  });

  it("messenger home: recovery failed → error + retry, no guest panel", () => {
    pathname.current = "/community-messenger";
    recoveryFailed.current = true;
    render(<CommunityMessengerGuestGate><div data-testid="child" /></CommunityMessengerGuestGate>);
    expect(container.querySelector("[data-testid=membership-check-failed]")).not.toBeNull();
    expect(container.textContent).toContain("로그인 상태를 확인하지 못했어요");
    expect(container.querySelector("[data-cm-guest-gate-spinner]")).toBeNull();
    expect(container.querySelector("[data-testid=guest-panel]")).toBeNull();
    clickRetry();
    expect(retryClientMembershipRecovery).toHaveBeenCalledWith("community-messenger-guest-gate");
  });

  it("messenger home: confirmed guest still shows the login panel (unchanged)", () => {
    pathname.current = "/community-messenger";
    membershipState.current = { status: "guest" };
    render(<CommunityMessengerGuestGate><div data-testid="child" /></CommunityMessengerGuestGate>);
    expect(container.querySelector("[data-testid=guest-panel]")).not.toBeNull();
  });

  it("store detail: checking → loading (unchanged); recovery failed → error + retry", () => {
    pathname.current = "/stores/sample-store";
    render(<DeliveryViewerGuestGate><div data-testid="child" /></DeliveryViewerGuestGate>);
    expect(container.querySelector("[data-testid=delivery-loading]")).not.toBeNull();

    recoveryFailed.current = true;
    render(<DeliveryViewerGuestGate><div data-testid="child" /></DeliveryViewerGuestGate>);
    expect(container.querySelector("[data-testid=delivery-loading]")).toBeNull();
    expect(container.querySelector("[data-testid=membership-check-failed]")).not.toBeNull();
    expect(container.querySelector("[data-testid=delivery-guest-panel]")).toBeNull();
    clickRetry();
    expect(retryClientMembershipRecovery).toHaveBeenCalledWith("delivery-viewer-guest-gate");
  });

  it("mypage root: checking → home shell skeleton (unchanged); recovery failed → existing load-failed card wired to membership retry", () => {
    pathname.current = "/mypage";
    render(<MyContent />);
    expect(container.querySelector("[data-testid=home-dashboard]")).not.toBeNull();
    expect(dashboardProps.current?.loadFailed).toBe(false);

    recoveryFailed.current = true;
    render(<MyContent />);
    expect(container.querySelector("[data-testid=guest-home]")).toBeNull();
    expect(dashboardProps.current?.loadFailed).toBe(true);
    act(() => dashboardProps.current?.onProfileRefresh?.());
    expect(retryClientMembershipRecovery).toHaveBeenCalledWith("mypage-root");
    expect(homeModelRefresh).not.toHaveBeenCalled();
  });

  it("mypage item: recovery failed → existing error state + retry", () => {
    recoveryFailed.current = true;
    render(
      <MyPageItemRouteClient
        initialMyPageData={null}
        section="account"
        item="payment"
        itemLabelKey={"mypage_home_load_failed" as never}
      />,
    );
    expect(container.querySelector("[data-testid=my-state-error]")).not.toBeNull();
    expect(container.textContent).toContain("t:mypage_home_load_failed");
    clickRetry();
    expect(retryClientMembershipRecovery).toHaveBeenCalledWith("mypage-item-route");
  });
});
