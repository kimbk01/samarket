"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import { OwnerStoreAdminConfirmModal } from "@/components/business/owner/OwnerStoreAdminConfirmModal";
import { dispatchOwnerHubBadgeRefresh } from "@/lib/chats/chat-channel-events";
import { useCallback, useEffect, useState } from "react";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { fetchMeStoresListDeduped } from "@/lib/me/fetch-me-stores-deduped";
import { resolveOwnerActiveStoreRowFromOwnedList } from "@/lib/delivery/owner/resolve-owner-active-store";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { resolveOwnerApiErrorMessage } from "@/lib/business/owner-api-error-i18n";
import { ownerFetchJson, ownerFetchErrorMessage } from "@/lib/business/owner-fetch-json";
import { catalogDateLocale } from "@/lib/i18n/catalog-date-locale";
import type { AppLanguageCode } from "@/lib/i18n/config";
import { useOwnerToast } from "@/components/business/owner/OwnerToastHost";
import { OwnerStateView } from "@/components/business/owner/OwnerStateView";

type Row = {
  id: string;
  from_user_id: string;
  subject: string;
  content: string;
  status: string;
  answer: string | null;
  answered_at: string | null;
  created_at: string;
};

function formatDate(iso: string | null, language: AppLanguageCode) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(catalogDateLocale(language));
}

export function OwnerStoreInquiriesView() {
  const { t, language } = useI18n();
  const toast = useOwnerToast();
  const inquiryStatusLabel = (status: string) => {
    switch (status) {
      case "open":
        return t("business_phase7_461");
      case "answered":
        return t("business_phase7_462");
      case "closed":
        return t("business_phase7_257");
      case "escalated":
        return t("business_phase7_463");
      default:
        return status;
    }
  };
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const preferredStoreId = (searchParams.get("storeId") ?? "").trim();
  const loginHref = "/login";

  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "unauth" }
    | { kind: "config" }
    | { kind: "no_store" }
    | { kind: "error"; message: string }
    | { kind: "ok"; storeId: string; storeName: string; rows: Row[] }
  >({ kind: "loading" });
  const [draftById, setDraftById] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [closeConfirmId, setCloseConfirmId] = useState<string | null>(null);

  /** IA-16 — `silent` 배경 갱신: 기존 목록 유지(로딩 깜박임 없음), 실패해도 목록 유지 */
  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) setState({ kind: "loading" });
    try {
      const { status: srStatus, json: rawStores } = await fetchMeStoresListDeduped();
      if (srStatus === 401) {
        setState({ kind: "unauth" });
        return;
      }
      if (srStatus === 503) {
        setState({ kind: "config" });
        return;
      }
      const sj = rawStores as { ok?: boolean; stores?: { id: string; store_name?: string }[] };
      if (!sj?.ok || !Array.isArray(sj.stores) || sj.stores.length === 0) {
        setState({ kind: "no_store" });
        return;
      }
      const stores = sj.stores as { id: string; store_name?: string }[];
      const store = resolveOwnerActiveStoreRowFromOwnedList(stores, preferredStoreId);
      if (!store) {
        setState({ kind: "no_store" });
        return;
      }
      // Single-flight must share parsed JSON — Response body can only be read once.
      const payload = await runSingleFlight(`me:stores:${store.id}:inquiries:get`, async () => {
        const ir = await fetch(`/api/me/stores/${encodeURIComponent(store.id)}/inquiries`, {
          credentials: "include",
        });
        const ij = (await ir.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          inquiries?: Row[];
        };
        return { httpOk: ir.ok, ij };
      });
      if (!payload.httpOk || !payload.ij?.ok) {
        if (silent) return;
        setState({
          kind: "error",
          message: typeof payload.ij?.error === "string" ? payload.ij.error : "load_failed",
        });
        return;
      }
      setState({
        kind: "ok",
        storeId: store.id,
        storeName: String(store.store_name ?? t("business_phase7_484")),
        rows: (payload.ij.inquiries ?? []) as Row[],
      });
    } catch {
      if (silent) return;
      setState({ kind: "error", message: "network_error" });
    }
  }, [preferredStoreId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function sendAnswer(id: string) {
    if (state.kind !== "ok") return;
    const text = (draftById[id] ?? "").trim();
    if (!text) return;
    const sid = state.storeId;
    setBusyId(id);
    try {
      const res = await ownerFetchJson(
        `/api/me/stores/${encodeURIComponent(sid)}/inquiries/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answer: text }),
        }
      );
      if (!res.ok) {
        toast.error(ownerFetchErrorMessage(res, t));
        return;
      }
      setDraftById((d) => {
        const n = { ...d };
        delete n[id];
        return n;
      });
      toast.success(t("owner_s4_inquiry_answer_sent"));
      await load({ silent: true });
      dispatchOwnerHubBadgeRefresh({
        source: "owner-store-inquiries-answer",
        key: `${sid}:${id}:answer`,
      });
    } finally {
      setBusyId(null);
    }
  }

  /** IA-16 — 종료 결과 확인: 실패 시 토스트, 성공 시에만 배지 갱신 */
  async function performCloseThread(id: string): Promise<boolean> {
    if (state.kind !== "ok") return false;
    const sid = state.storeId;
    setBusyId(id);
    try {
      const res = await ownerFetchJson(
        `/api/me/stores/${encodeURIComponent(sid)}/inquiries/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ close_only: true }),
        }
      );
      if (!res.ok) {
        toast.error(ownerFetchErrorMessage(res, t));
        return false;
      }
      toast.success(t("owner_s4_inquiry_closed"));
      await load({ silent: true });
      dispatchOwnerHubBadgeRefresh({
        source: "owner-store-inquiries-close",
        key: `${sid}:${id}:close`,
      });
      return true;
    } finally {
      setBusyId(null);
    }
  }

  if (state.kind === "loading") {
    return <p className="text-sm text-sam-muted">{t("common_loading")}</p>;
  }
  if (state.kind === "unauth") {
    return (
      <div className="rounded-ui-rect bg-sam-surface p-6 text-sm text-sam-muted shadow-sm">
        <p>{t("business_phase7_062")}</p>
        <Link href={loginHref} className="mt-3 inline-flex rounded-ui-rect bg-signature px-4 py-2 font-semibold text-sam-on-primary">
          {t("business_phase7_464")}
        </Link>
      </div>
    );
  }
  if (state.kind === "config") {
    return <p className="text-sm text-sam-muted">{t("business_phase7_158")}</p>;
  }
  if (state.kind === "no_store") {
    return (
      <div className="rounded-ui-rect bg-sam-surface p-6 text-sm text-sam-muted shadow-sm">
        <p>{t("business_phase7_057")}</p>
        <Link href="/stores/owner/apply" className="mt-2 inline-block text-signature">
          {t("business_phase7_465")}
        </Link>
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <OwnerStateView
        kind="error"
        message={resolveOwnerApiErrorMessage(state.message, t)}
        onRetry={() => void load()}
      />
    );
  }

  return (
    <div className={OWNER_STORE_STACK_Y_CLASS}>
      <p className="text-sm text-sam-muted">{state.storeName}</p>
      {state.rows.length === 0 ? (
        <p className="rounded-ui-rect bg-sam-surface p-6 text-sm text-sam-muted shadow-sm">{t("business_phase7_101")}</p>
      ) : (
        <ul className={OWNER_STORE_STACK_Y_CLASS}>
          {state.rows.map((r) => (
            <li key={r.id} className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4 shadow-sm">
              <p className="text-xs text-sam-muted">
                {inquiryStatusLabel(r.status)} ·{" "}
                <span className="font-mono sam-text-xxs">{r.from_user_id}</span>
              </p>
              <p className="mt-1 text-sm font-semibold text-sam-fg">{r.subject}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-sam-fg">{r.content}</p>
              <p className="mt-1 sam-text-xxs text-sam-meta">{formatDate(r.created_at, language)}</p>
              {r.answer ? (
                <div className="mt-2 rounded-ui-rect bg-sam-app px-3 py-2 text-sm text-sam-fg">
                  <span className="text-xs text-sam-muted">{t("business_phase7_043")}</span>
                  <p className="mt-1 whitespace-pre-wrap">{r.answer}</p>
                </div>
              ) : null}
              {r.status === "open" || r.status === "answered" ? (
                <div className="mt-3 space-y-2 border-t border-sam-border-soft pt-3">
                  <textarea
                    value={draftById[r.id] ?? ""}
                    onChange={(e) =>
                      setDraftById((d) => ({ ...d, [r.id]: e.target.value }))
                    }
                    placeholder={t("business_phase7_052")}
                    rows={3}
                    disabled={busyId !== null}
                    className="w-full resize-none rounded-ui-rect border border-sam-border px-3 py-2 text-sm"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busyId !== null || !(draftById[r.id] ?? "").trim()}
                      onClick={() => void sendAnswer(r.id)}
                      className="rounded-ui-rect bg-signature px-4 py-2 text-sm font-medium text-sam-on-primary disabled:opacity-50"
                    >
                      {busyId === r.id ? "…" : t("business_phase7_467")}
                    </button>
                    <button
                      type="button"
                      disabled={busyId !== null}
                      onClick={() => setCloseConfirmId(r.id)}
                      className="rounded-ui-rect border border-sam-border px-4 py-2 text-sm text-sam-fg"
                    >
                      {t("business_phase7_257")}
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <OwnerStoreAdminConfirmModal
        open={closeConfirmId != null && state.kind === "ok"}
        titleId="owner-store-inquiries-close-title"
        title={t("business_phase7_097")}
        description={t("business_phase7_468")}
        confirmLabel={t("business_phase7_257")}
        busy={closeConfirmId != null && busyId === closeConfirmId}
        disableActions={busyId !== null}
        confirmTone="danger"
        onCancel={() => setCloseConfirmId(null)}
        onConfirm={async () => {
          if (!closeConfirmId || state.kind !== "ok") return;
          const id = closeConfirmId;
          await performCloseThread(id);
          setCloseConfirmId(null);
        }}
      />
    </div>
  );
}
