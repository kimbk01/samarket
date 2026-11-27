"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { OwnerAdminPageScrollShell } from "@/components/business/owner/OwnerAdminPageScrollShell";
import { OwnerEventPromotionDetailClient } from "@/components/business/owner/ads/OwnerEventPromotionDetailClient";
import { OwnerStoreSuspenseFallback } from "@/components/business/owner/OwnerStoreSuspenseFallback";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

function DetailInner() {
  const { t } = useI18n();
  const params = useParams();
  const requestId = String(params?.requestId ?? "").trim();
  if (!requestId) return <p className="p-4 text-sm text-sam-muted">{t("common_content_unavailable")}</p>;
  return <OwnerEventPromotionDetailClient requestId={requestId} />;
}

export default function OwnerEventPromotionDetailPage() {
  return (
    <Suspense
      fallback={
        <OwnerAdminPageScrollShell className="pt-4">
          <OwnerStoreSuspenseFallback className="text-sm text-sam-muted" />
        </OwnerAdminPageScrollShell>
      }
    >
      <OwnerAdminPageScrollShell>
        <DetailInner />
      </OwnerAdminPageScrollShell>
    </Suspense>
  );
}
