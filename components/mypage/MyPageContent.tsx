import { AccountTab } from "@/components/mypage/tabs/AccountTab";
import { CommunityTab } from "@/components/mypage/tabs/CommunityTab";
import { MessengerTab } from "@/components/mypage/tabs/MessengerTab";
import { SettingsTab } from "@/components/mypage/tabs/SettingsTab";
import { StoreTab } from "@/components/mypage/tabs/StoreTab";
import { TradeTab } from "@/components/mypage/tabs/TradeTab";
import type { MyPageConsoleProps, MyPageTabId } from "./types";

export function MyPageContent({
  activeTab,
  activeSection,
  ...props
}: MyPageConsoleProps & {
  activeTab: MyPageTabId;
  activeSection: string;
}) {
  return (
    <section className="min-w-0 space-y-3">
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
