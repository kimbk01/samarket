"use client";

/**
 * 5-F 「배달 화면 구성」 허브 — 고객 배달 화면 구역을 앱 순서대로 한 곳에서 편집한다.
 * 탭: 홈 화면 · 메뉴 구성 · 업종 분류 (주소 `?tab=home|browse|taxonomy`).
 * 메뉴 구성 탭 = WP2 메뉴 편집기(위) + 기존 업종 목록 정책(아래).
 * 기존 화면 컴포넌트·저장 API 재사용 — 새 저장 API·테이블 없음. 광고 승인·결제·이력은 공통 광고 메뉴에 그대로.
 */

import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminDeliveryCmsChrome } from "@/components/admin/shell/AdminDeliveryCmsChrome";
import { AdminTabs, resolveAdminTabValue } from "@/components/admin/ui/AdminTabs";
import { DELIVERY_SCREENS_TABS, type DeliveryScreensTab } from "./delivery-screens-status";
import { DeliveryScreensHomeTab } from "./DeliveryScreensHomeTab";
import { DeliveryScreensBrowseTab } from "./DeliveryScreensBrowseTab";
import { DeliveryScreensMenusTab } from "./DeliveryScreensMenusTab";
import { DeliveryScreensTaxonomyTab } from "./DeliveryScreensTaxonomyTab";

export function AdminDeliveryScreensHub() {
  const { language } = useI18n();
  const ko = language === "ko";
  const searchParams = useSearchParams();
  const tabs = DELIVERY_SCREENS_TABS.map((item) => ({ id: item.id, label: ko ? item.labelKo : item.labelEn }));
  const tab = resolveAdminTabValue(searchParams?.get("tab"), tabs, "home") as DeliveryScreensTab;

  return (
    <AdminDeliveryCmsChrome>
      <div className="space-y-4" data-admin-delivery-screens-hub="1">
        <div>
          <p className="text-[12px] text-sam-muted">{ko ? "배달 › 화면 구성" : "Delivery › Screens"}</p>
          <h1 className="text-[20px] font-bold text-sam-fg">{ko ? "배달 화면 구성" : "Delivery screen layout"}</h1>
          <p className="mt-1 text-[12px] text-sam-muted">
            {ko
              ? "고객 앱에 보이는 순서대로 구역을 나열합니다. 광고 승인·결제·이력은 「광고」 메뉴에서 처리합니다."
              : "Zones are listed in the order customers see them. Ad approval, billing and history stay in the Ads menu."}
          </p>
        </div>
        <AdminTabs
          tabs={tabs}
          ariaLabel={ko ? "배달 화면 구성" : "Delivery screen layout"}
          defaultValue="home"
          resetParams={["page", "primary", "tier", "sub"]}
        />
        {tab === "home" ? <DeliveryScreensHomeTab /> : null}
        {tab === "browse" ? (
          <div className="space-y-4">
            <DeliveryScreensMenusTab />
            <DeliveryScreensBrowseTab />
          </div>
        ) : null}
        {tab === "taxonomy" ? <DeliveryScreensTaxonomyTab /> : null}
      </div>
    </AdminDeliveryCmsChrome>
  );
}
