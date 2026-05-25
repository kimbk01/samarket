"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DetailHeader } from "@/components/layout/sector-header";
import { parseSlug } from "@/lib/validate-params";
import { ShopHomePage } from "@/components/business/ShopHomePage";

export default function ShopSlugRoute() {
  const { t } = useI18n();
  const params = useParams();
  const slug = parseSlug(params.slug);

  if (!slug) {
    return (
      <div className="px-4 py-8 text-center sam-text-body text-sam-muted">
        <Link href="/philife" className="text-signature">
          {t("app_error_go_home_short")}
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <DetailHeader title={t("ui_finish_shop_title")} backHref="/" preferHistoryBack={false} />
      <div className="px-4 py-4">
        <ShopHomePage slug={slug} />
      </div>
    </div>
  );
}
