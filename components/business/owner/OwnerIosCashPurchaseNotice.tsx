"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";

/** iOS 앱 — Cash 충전·Cash 광고 결제 CTA 자리에 표시 (외부 결제 안내 없음 · App Review 3.1.1/3.1.3) */
export function OwnerIosCashPurchaseNotice({ className = "" }: { className?: string }) {
  const { safeT } = useI18n();
  return (
    <p className={`text-sm text-sam-muted ${className}`.trim()} data-owner-ios-cash-purchase-notice="1">
      {safeT("owner_ios_cash_purchase_unavailable", {
        fallbackKo:
          "iPhone 앱에서는 Cash 충전과 Cash 광고 결제를 이용할 수 없습니다. 잔액·내역·진행 중인 광고는 그대로 확인할 수 있습니다.",
        fallbackEn:
          "Cash top-up and Cash ad payments aren't available in the iPhone app. You can still view your balance, history and active ads.",
      })}
    </p>
  );
}
