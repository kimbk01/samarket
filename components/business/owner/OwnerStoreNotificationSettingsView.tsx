"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerNotificationSettings } from "@/components/stores/owner/OwnerNotificationSettings";
import { fetchMeStoresListDeduped } from "@/lib/me/fetch-me-stores-deduped";

/** Canonical Owner notification settings — `/stores/owner/notification-settings?storeId=`. */
export function OwnerStoreNotificationSettingsView() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const [storeId, setStoreId] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sidQuery = searchParams.get("storeId")?.trim() ?? "";
      if (sidQuery) {
        setStoreId(sidQuery);
        setErr(null);
        return;
      }
      try {
        const { status, json } = await fetchMeStoresListDeduped();
        if (cancelled) return;
        if (status === 401) {
          setErr(t("common_login_required"));
          return;
        }
        const stores = (json as { ok?: boolean; stores?: { id: string }[] })?.stores;
        const sid = Array.isArray(stores) && stores[0]?.id ? stores[0].id : "";
        if (!sid) {
          setErr(t("store_not_found_short"));
          return;
        }
        setStoreId(sid);
        setErr(null);
      } catch {
        if (!cancelled) setErr(t("common_error"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams, t]);

  if (err) return <p className="text-sm text-sam-muted">{err}</p>;
  if (!storeId) return <p className="text-sm text-sam-muted">{t("common_loading")}</p>;
  return <OwnerNotificationSettings storeId={storeId} />;
}
