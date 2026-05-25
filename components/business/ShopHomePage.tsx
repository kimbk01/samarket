"use client";

import Link from "next/link";
import { getBusinessProfileBySlug } from "@/lib/business/mock-business-profiles";
import { getBusinessProducts } from "@/lib/business/mock-business-products";
import { BusinessProfileView } from "./BusinessProfileView";
import { BusinessProductList } from "./BusinessProductList";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { isUuidString } from "@/lib/shared/uuid-string";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

interface ShopHomePageProps {
  slug: string;
}

export function ShopHomePage({ slug }: ShopHomePageProps) {
  const { t } = useI18n();
  const profile = getBusinessProfileBySlug(slug);

  if (!profile) {
    return (
      <div className="rounded-ui-rect bg-sam-surface p-8 text-center">
        <p className="sam-text-body text-sam-muted">{t("business_phase7_146")}</p>
        <Link href="/" className="mt-3 inline-block sam-text-body text-signature">
          {t("app_error_go_home_short")}
        </Link>
      </div>
    );
  }

  const products = getBusinessProducts(profile.id);
  const operatorOk = isUuidString(profile.ownerUserId);
  const me = getCurrentUser()?.id ?? "";
  const isOwner = !!me && profile.ownerUserId === me;

  return (
    <div className="space-y-6">
      <BusinessProfileView profile={profile} isOwner={false} />
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3 text-center space-y-2">
        {!operatorOk && (
          <p className="sam-text-helper text-sam-muted">
            {t("business_phase7_630")}
          </p>
        )}
        {!isOwner && operatorOk ? (
          <p className="sam-text-helper text-sam-muted">{t("business_phase7_287")}</p>
        ) : null}
        <button
          type="button"
          className="rounded-full border border-signature bg-sam-surface px-4 py-2 sam-text-body font-medium text-signature"
        >
          {t("business_phase7_631")}
        </button>
      </div>
      <div>
        <h2 className="mb-3 sam-text-body font-semibold text-sam-fg">
          {t("business_phase7_632", { v1: String(profile.productCount) })}
        </h2>
        <BusinessProductList
          products={products}
          shopSlug={profile.slug}
          emptyMessage={t("business_phase7_058")}
        />
      </div>
    </div>
  );
}
