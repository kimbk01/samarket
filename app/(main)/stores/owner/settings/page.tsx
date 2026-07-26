"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerStoreSettingsContent } from "@/components/business/owner/OwnerStoreSettingsContent";
import { OwnerAdminPageScrollShell } from "@/components/business/owner/OwnerAdminPageScrollShell";
import { OwnerStoreSuspenseFallback } from "@/components/business/owner/OwnerStoreSuspenseFallback";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import { fetchMeStoresListDeduped } from "@/lib/me/fetch-me-stores-deduped";

type Phase =
  | { kind: "loading" }
  | { kind: "need_store_id" }
  | { kind: "error"; message: string }
  | { kind: "ok"; row: StoreRow };

function MyBusinessSettingsPageInner() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const storeIdParam = searchParams.get("storeId")?.trim() ?? "";
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });

  const load = useCallback(async () => {
    if (!storeIdParam) {
      setPhase({ kind: "need_store_id" });
      return;
    }
    setPhase({ kind: "loading" });
    try {
      const { status, json: raw } = await fetchMeStoresListDeduped();
      const json = raw as { ok?: boolean; stores?: StoreRow[] };
      if (status === 401) {
        setPhase({ kind: "error", message: "unauthorized" });
        return;
      }
      if (!json?.ok || !Array.isArray(json.stores)) {
        setPhase({ kind: "error", message: "load_failed" });
        return;
      }
      const row = json.stores.find((s) => s.id === storeIdParam);
      if (!row) {
        setPhase({ kind: "error", message: "not_found" });
        return;
      }
      setPhase({ kind: "ok", row });
    } catch {
      setPhase({ kind: "error", message: "network_error" });
    }
  }, [storeIdParam]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleVisible = useCallback(async () => {
    if (phase.kind !== "ok") return;
    const row = phase.row;
    const okApproved = row.approval_status === "approved";
    if (!okApproved) return;
    const next = !(row.is_visible === true);
    try {
      const res = await fetch(`/api/me/stores/${row.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ is_visible: next }),
      });
      const json = (await res.json()) as { ok?: boolean; store?: StoreRow; error?: string };
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? `http_${res.status}`);
      if (json.store?.id === row.id) {
        setPhase({ kind: "ok", row: json.store });
      } else {
        await load();
      }
    } catch {
      await load();
    }
  }, [phase, load]);

  const toggleMessengerFeature = useCallback(
    async (
      key:
        | "messenger_voice_messages_enabled"
        | "messenger_voice_calls_enabled"
        | "messenger_video_calls_enabled",
      next: boolean
    ) => {
      if (phase.kind !== "ok") return;
      const row = phase.row;
      if (row.approval_status !== "approved") return;
      try {
        const res = await fetch(`/api/me/stores/${row.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ [key]: next }),
        });
        const json = (await res.json()) as { ok?: boolean; store?: StoreRow; error?: string };
        if (!res.ok || !json?.ok) throw new Error(json?.error ?? `http_${res.status}`);
        if (json.store?.id === row.id) {
          setPhase({ kind: "ok", row: json.store });
        } else {
          await load();
        }
      } catch {
        await load();
      }
    },
    [phase, load]
  );

  if (phase.kind === "loading") {
    return <OwnerStoreSuspenseFallback />;
  }
  if (phase.kind === "need_store_id") {
    return (
      <div className={`${OWNER_STORE_STACK_Y_CLASS} sam-text-body text-sam-muted`}>
        <p>{t("owner_store_need_store_id")}</p>
        <Link href="/stores/owner" className="font-medium text-signature underline">
          {t("owner_store_dashboard_link")}
        </Link>
      </div>
    );
  }
  if (phase.kind === "error") {
    return (
      <p className="sam-text-body text-red-600">
        {t("owner_store_settings_load_failed")} ({phase.message})
      </p>
    );
  }

  return (
    <OwnerStoreSettingsContent
      row={phase.row}
      onToggleVisible={() => void toggleVisible()}
      onToggleMessengerFeature={(key, next) => void toggleMessengerFeature(key, next)}
    />
  );
}

export default function MyBusinessSettingsPage() {
  return (
    <Suspense
      fallback={
        <OwnerAdminPageScrollShell className="py-4">
          <OwnerStoreSuspenseFallback />
        </OwnerAdminPageScrollShell>
      }
    >
      <OwnerAdminPageScrollShell>
        <MyBusinessSettingsPageInner />
      </OwnerAdminPageScrollShell>
    </Suspense>
  );
}
