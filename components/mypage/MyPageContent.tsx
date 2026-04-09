import { AccountTab } from "@/components/mypage/tabs/AccountTab";
import { CommunityTab } from "@/components/mypage/tabs/CommunityTab";
import { MessengerTab } from "@/components/mypage/tabs/MessengerTab";
import { SettingsTab } from "@/components/mypage/tabs/SettingsTab";
import { StoreTab } from "@/components/mypage/tabs/StoreTab";
import { TradeTab } from "@/components/mypage/tabs/TradeTab";
import { getMyPageTabNav } from "./mypage-nav";
import type { MyPageConsoleProps, MyPageTabId } from "./types";

export function MyPageContent({
  activeTab,
  activeSection,
  ...props
}: MyPageConsoleProps & {
  activeTab: MyPageTabId;
  activeSection: string;
}) {
  const currentTab = getMyPageTabNav(activeTab);
  const currentSection =
    currentTab.sections.find((item) => item.id === activeSection)?.label ?? currentTab.sections[0]?.label ?? "";

  return (
    <section className="min-w-0 space-y-4">
      <div className="rounded-[4px] border border-gray-200 bg-white px-4 py-3">
        <p className="text-[11px] uppercase tracking-[0.08em] text-gray-500">{currentTab.label}</p>
        <p className="mt-1 text-[14px] font-semibold text-gray-900">{currentSection}</p>
      </div>

      {activeTab === "account" ? (
        <AccountTab section={activeSection} {...props} />
      ) : null}
      {activeTab === "trade" ? <TradeTab section={activeSection} /> : null}
      {activeTab === "community" ? <CommunityTab section={activeSection} /> : null}
      {activeTab === "store" ? (
        <StoreTab
          section={activeSection}
          hasOwnerStore={props.hasOwnerStore}
          ownerHubStoreId={props.ownerHubStoreId}
          storeAttentionSummary={props.storeAttentionSummary}
        />
      ) : null}
      {activeTab === "messenger" ? <MessengerTab section={activeSection} /> : null}
      {activeTab === "settings" ? <SettingsTab section={activeSection} /> : null}
    </section>
  );
}
