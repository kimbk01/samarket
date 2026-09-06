"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { fetchMeStoresListDeduped } from "@/lib/me/fetch-me-stores-deduped";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

/**
 * Product New without `storeId` must not render as a blank composer canvas.
 * Resolve the owner's first store and redirect; only show the need-store message if none.
 */
export function OwnerProductNewStoreIdRedirect({
  draft,
  menuSectionId,
}: {
  draft?: boolean;
  menuSectionId?: string;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { status, json } = await fetchMeStoresListDeduped();
        if (cancelled) return;
        if (status !== 200) {
          setFailed(true);
          return;
        }
        const body = json as { ok?: boolean; stores?: { id?: string }[] };
        const sid =
          body?.ok && Array.isArray(body.stores) ? String(body.stores[0]?.id ?? "").trim() : "";
        if (!sid) {
          setFailed(true);
          return;
        }
        let href = OwnerRoutes.productNew(sid);
        if (draft) href += "&draft=1";
        if (menuSectionId) href += `&menuSectionId=${encodeURIComponent(menuSectionId)}`;
        router.replace(href);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [draft, menuSectionId, router]);

  if (!failed) {
    return (
      <div className="px-4 py-8" data-owner-product-new-need-store="resolving">
        <p className="sam-text-body text-sam-muted">{t("common_loading")}</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-8" data-owner-product-new-need-store="1">
      <p className="sam-text-body text-sam-fg">
        {t("owner_store_need_store_id")}{" "}
        <Link href={OwnerRoutes.hub()} className="font-medium text-signature underline">
          {t("owner_store_dashboard_link")}
        </Link>
        {t("owner_store_need_store_id_suffix_products")}
      </p>
    </div>
  );
}
