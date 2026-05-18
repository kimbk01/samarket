import { SalesHistoryView } from "@/components/mypage/sales/SalesHistoryView";
import { HomePurchaseSalesHubTabs } from "@/components/mypage/HomePurchaseSalesHubTabs";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { resolveServerInitialLanguage } from "@/lib/i18n/language-preference";
import { translate } from "@/lib/i18n/messages";

export default function PhilifeSalesPage() {
  const lang = resolveServerInitialLanguage({});
  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title={translate(lang, "philife_trade_manage_title")}
        backHref="/philife"
        stickyBelow={<HomePurchaseSalesHubTabs />}
      />
      <div className="mx-auto max-w-lg space-y-2 px-4 py-4 pb-24">
        <SalesHistoryView />
      </div>
    </div>
  );
}
