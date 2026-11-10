"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GuestLoginRequiredPanel } from "@/components/auth/GuestLoginRequiredPanel";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { buildDeliveryAddressesHrefFromPath } from "@/lib/addresses/mypage-addresses-return-to";
import type { DeliveryViewerGate } from "@/lib/stores/delivery-viewer-gate";
import { Sam } from "@/lib/ui/css-vars";

/**
 * 배달 열람 게이트 화면 (S-07·S-08) — 홈·업종·검색·매장 상세가 같은 컴포넌트를 쓴다.
 * - `login_required`  : 기존 `GuestLoginRequiredPanel` (메신저 비회원 게이트와 같은 방식)
 * - `address_required`: 「주소가 없습니다」 + 기존 주소 관리 화면(`/mypage/addresses`) CTA
 */
export function DeliveryViewerGatePanel({
  gate,
  className = "",
}: {
  gate: Exclude<DeliveryViewerGate, "ok">;
  className?: string;
}) {
  const { t } = useI18n();
  const pathname = usePathname() ?? "/stores";

  if (gate === "login_required") {
    return (
      <div className={className} data-delivery-viewer-gate="login_required">
        <GuestLoginRequiredPanel
          actionType="delivery_cart_add"
          messageKey="auth_login_required_body_delivery_browse"
        />
      </div>
    );
  }

  if (gate === "not_service_area") {
    /** 한국 주소 지원(2026-11-10) — 대표 주소가 한국: 배달 보류 안내 + 필리핀 주소로 바꾸기 */
    return (
      <div
        className={`rounded-ui-rect border border-sam-border bg-sam-surface px-5 py-8 text-center ${className}`.trim()}
        data-delivery-viewer-gate="not_service_area"
        role="status"
      >
        <div aria-hidden className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-sam-surface-muted text-[30px]">
          🇰🇷
        </div>
        <h2 className="sam-text-section-title text-sam-fg">{t("store_delivery_not_service_area_title")}</h2>
        <p className="mt-2 sam-text-body leading-relaxed text-sam-muted">{t("store_delivery_not_service_area_body")}</p>
        <Link
          href={buildDeliveryAddressesHrefFromPath(pathname, "")}
          prefetch={false}
          className={`${Sam.btn.primary} sam-press mt-5 inline-flex min-h-11 w-full max-w-xs items-center justify-center px-6`}
        >
          {t("store_delivery_not_service_area_cta")}
        </Link>
        <p className="mt-3 sam-text-helper text-sam-muted">{t("store_delivery_not_service_area_note")}</p>
      </div>
    );
  }

  return (
    <div
      className={`rounded-ui-rect border border-sam-border bg-sam-surface px-5 py-8 text-center ${className}`.trim()}
      data-delivery-viewer-gate="address_required"
      role="status"
    >
      <h2 className="sam-text-section-title text-sam-fg">{t("store_delivery_address_required_title")}</h2>
      <p className="mt-2 sam-text-body leading-relaxed text-sam-muted">
        {t("store_delivery_address_required_body")}
      </p>
      <Link
        href={buildDeliveryAddressesHrefFromPath(pathname, "")}
        prefetch={false}
        className={`${Sam.btn.primary} mt-5 inline-flex min-h-11 w-full max-w-xs items-center justify-center px-6`}
      >
        {t("store_delivery_address_required_cta")}
      </Link>
    </div>
  );
}
