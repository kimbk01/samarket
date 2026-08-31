"use client";

import type { CSSProperties, ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { BodyPortal } from "@/components/layout/BodyPortal";
import {
  OWNER_STORE_ADMIN_FOOTER_ACTIONS_ROW_CLASS,
  OWNER_STORE_ADMIN_FOOTER_INNER_CLASS,
} from "@/lib/business/owner-admin-footer-actions";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import { DeliveryAdOwnerStepProgress } from "@/components/stores/advertising/DeliveryAdOwnerStepProgress";
import { DELIVERY_AD_OWNER_PRIMARY_BTN_CLASS } from "@/lib/stores/advertising/delivery-ad-owner-ui-presentation";
import type { OwnerDeliveryAdApplicationStep } from "@/lib/stores/advertising/owner-delivery-ad-application-step";

type FooterMode = "next" | "submit" | "blocked";

type Props = {
  activeStep: OwnerDeliveryAdApplicationStep;
  workspace: "store-sponsored" | "banner";
  title: string;
  children: ReactNode;
  formPadStyle?: CSSProperties;
  footerPadStyle?: CSSProperties;
  footerFixedClassName?: string;
  keyboardOpen?: boolean;
  footerMode: FooterMode;
  primaryBusy?: boolean;
  primaryDisabled?: boolean;
  showBack?: boolean;
  onPrimary: () => void;
  onBack?: () => void;
};

export function OwnerDeliveryAdApplicationWizardShell({
  activeStep,
  workspace,
  title,
  children,
  formPadStyle,
  footerPadStyle,
  footerFixedClassName,
  keyboardOpen = false,
  footerMode,
  primaryBusy = false,
  primaryDisabled: primaryDisabledProp = false,
  showBack = false,
  onPrimary,
  onBack,
}: Props) {
  const { t, safeT } = useI18n();

  const primaryLabel =
    footerMode === "submit"
      ? primaryBusy
        ? t("owner_ads_submitting")
        : safeT("owner_ads_apply_submit_cta", {
            fallbackKo: "광고 신청",
            fallbackEn: "Submit ad application",
          })
      : footerMode === "blocked"
        ? t("owner_ads_cta_sale_preparing")
        : t("owner_ads_wizard_next");

  const primaryDisabled =
    footerMode === "blocked" || primaryBusy || primaryDisabledProp;

  return (
    <div
      className={`${OWNER_STORE_STACK_Y_CLASS} mx-auto w-full max-w-[min(100%,42rem)] md:max-w-[min(100%,52rem)] px-4 pt-4`}
      style={formPadStyle}
      data-owner-ads-workspace={workspace}
      data-owner-ads-wizard="step-gated"
      data-owner-ads-wizard-step={activeStep}
    >
      <DeliveryAdOwnerStepProgress activeStep={activeStep} />
      <h1 className="mt-3 text-[18px] font-bold text-sam-fg">{title}</h1>
      <div className="mt-3">{children}</div>

      <BodyPortal>
        <footer
          className={footerFixedClassName}
          style={footerPadStyle}
          data-owner-ads-footer="owner-admin-ssot"
          data-form-keyboard-footer="1"
          data-form-keyboard-open={keyboardOpen ? "true" : "false"}
        >
          <div className={OWNER_STORE_ADMIN_FOOTER_INNER_CLASS}>
            <div className={OWNER_STORE_ADMIN_FOOTER_ACTIONS_ROW_CLASS}>
              {showBack && onBack ? (
                <button
                  type="button"
                  className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-ui-rect border border-[#BDBDBD] bg-white px-4 text-[14px] font-semibold text-sam-fg"
                  onClick={onBack}
                >
                  {t("owner_ads_wizard_back")}
                </button>
              ) : null}
              <button
                type="button"
                className={`${DELIVERY_AD_OWNER_PRIMARY_BTN_CLASS} min-h-[48px] ${
                  showBack ? "flex-[1.2]" : "w-full"
                }`}
                disabled={primaryDisabled}
                data-owner-ads-submit-cta={
                  footerMode === "submit" ? "ready" : footerMode === "blocked" ? "blocked" : "next"
                }
                onClick={onPrimary}
              >
                {primaryLabel}
              </button>
            </div>
          </div>
        </footer>
      </BodyPortal>
    </div>
  );
}
