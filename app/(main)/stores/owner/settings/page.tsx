"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerStoreSettingsContent } from "@/components/business/owner/OwnerStoreSettingsContent";
import { OwnerAdminPageScrollShell } from "@/components/business/owner/OwnerAdminPageScrollShell";
import { OwnerTabSkeleton } from "@/components/business/owner/OwnerTabSkeleton";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import {
  fetchMeStoresListDeduped,
  invalidateMeStoresListDedupedCache,
} from "@/lib/me/fetch-me-stores-deduped";
import { refreshOwnerLiteStore } from "@/lib/stores/use-owner-lite-store";
import { useOwnerToast } from "@/components/business/owner/OwnerToastHost";
import { ownerFetchJson } from "@/lib/business/owner-fetch-json";
import { formatOwnerStoreToggleFailure } from "@/lib/business/owner-store-patch-error-i18n";

type MessengerFeatureKey =
  | "messenger_voice_messages_enabled"
  | "messenger_voice_calls_enabled"
  | "messenger_video_calls_enabled";

type Phase =
  | { kind: "loading" }
  | { kind: "need_store_id" }
  | { kind: "error"; message: string }
  | { kind: "ok"; row: StoreRow };

function MyBusinessSettingsPageInner() {
  const { t, language } = useI18n();
  const toast = useOwnerToast();
  const searchParams = useSearchParams();
  const storeIdParam = searchParams.get("storeId")?.trim() ?? "";
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  /** IA-17 — 메신저 기능 토글 처리 중 키 (이중 클릭 방지) */
  const [messengerBusyKey, setMessengerBusyKey] = useState<MessengerFeatureKey | null>(null);
  const messengerBusyRef = useRef(false);

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
      invalidateMeStoresListDedupedCache();
      refreshOwnerLiteStore();
      if (json.store?.id === row.id) {
        setPhase({ kind: "ok", row: json.store });
      } else {
        await load();
      }
    } catch {
      await load();
    }
  }, [phase, load]);

  /** IA-17 — busy + 낙관 반영, 실패 시 이전 행으로 원복 + 토스트 (전체 재로드 없음) */
  const toggleMessengerFeature = useCallback(
    async (key: MessengerFeatureKey, next: boolean) => {
      if (phase.kind !== "ok") return;
      if (messengerBusyRef.current) return;
      const prevRow = phase.row;
      if (prevRow.approval_status !== "approved") return;
      messengerBusyRef.current = true;
      setMessengerBusyKey(key);
      setPhase({ kind: "ok", row: { ...prevRow, [key]: next } });
      try {
        const res = await ownerFetchJson<{ ok: true; store?: StoreRow }>(`/api/me/stores/${prevRow.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ [key]: next }),
        });
        if (!res.ok) {
          setPhase({ kind: "ok", row: prevRow });
          toast.error(formatOwnerStoreToggleFailure(res.code, language));
          return;
        }
        invalidateMeStoresListDedupedCache();
        refreshOwnerLiteStore();
        if (res.data.store?.id === prevRow.id) {
          setPhase({ kind: "ok", row: res.data.store });
        }
      } finally {
        messengerBusyRef.current = false;
        setMessengerBusyKey(null);
      }
    },
    [phase, toast, language]
  );

  if (phase.kind === "loading") {
    /** 하단 탭 이동 뼈대와 같은 그림 — 뼈대 → 글자 → 내용으로 두 번 바뀌지 않게 (하단 탭 계약 v2 · Samsung 실측 2026-11-15 14:09) */
    return <OwnerTabSkeleton kind="manage" />;
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
      <p className="sam-text-body text-sam-danger">
        {/* 언어 재감사 2026-11-27: 영문 코드를 괄호로 붙이지 않는다 */}
        {phase.message === "unauthorized" ? t("common_login_required") : t("owner_store_settings_load_failed")}
      </p>
    );
  }

  return (
    <OwnerStoreSettingsContent
      row={phase.row}
      onToggleVisible={() => void toggleVisible()}
      onToggleMessengerFeature={(key, next) => void toggleMessengerFeature(key, next)}
      messengerBusyKey={messengerBusyKey}
      onStoreUpdated={() => void load()}
    />
  );
}

export default function MyBusinessSettingsPage() {
  return (
    <Suspense
      fallback={
        <OwnerAdminPageScrollShell>
          <OwnerTabSkeleton kind="manage" />
        </OwnerAdminPageScrollShell>
      }
    >
      <OwnerAdminPageScrollShell>
        <MyBusinessSettingsPageInner />
      </OwnerAdminPageScrollShell>
    </Suspense>
  );
}
