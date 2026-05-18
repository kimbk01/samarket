"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import { OwnerStoreAdminConfirmModal } from "@/components/business/owner/OwnerStoreAdminConfirmModal";
import { dispatchOwnerHubBadgeRefresh } from "@/lib/chats/chat-channel-events";
import { useCallback, useEffect, useState } from "react";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { fetchMeStoresListDeduped } from "@/lib/me/fetch-me-stores-deduped";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { resolveOwnerApiErrorMessage } from "@/lib/business/owner-api-error-i18n";

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

function formatDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("ko-KR");
}

export function OwnerStoreInquiriesView() {
  const { t } = useI18n();
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

  const load = useCallback(async () => {
    setState({ kind: "loading" });
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
      const store =
        preferredStoreId && stores.some((s) => s.id === preferredStoreId)
          ? stores.find((s) => s.id === preferredStoreId)!
          : stores[0];
      const ir = await runSingleFlight(`me:stores:${store.id}:inquiries:get`, () =>
        fetch(`/api/me/stores/${encodeURIComponent(store.id)}/inquiries`, {
          credentials: "include",
        })
      );
      const ij = await ir.json();
      if (!ij?.ok) {
        setState({
          kind: "error",
          message: typeof ij?.error === "string" ? ij.error : "load_failed",
        });
        return;
      }
      setState({
        kind: "ok",
        storeId: store.id,
        storeName: String(store.store_name ?? t("business_phase7_484")),
        rows: (ij.inquiries ?? []) as Row[],
      });
    } catch {
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
    setBusyId(id);
    try {
      const res = await fetch(
        `/api/me/stores/${encodeURIComponent(state.storeId)}/inquiries/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answer: text }),
        }
      );
      const json = await res.json();
      if (!json?.ok) return;
      setDraftById((d) => {
        const n = { ...d };
        delete n[id];
        return n;
      });
      await load();
      dispatchOwnerHubBadgeRefresh({
        source: "owner-store-inquiries-answer",
        key: `${state.storeId}:${id}:answer`,
      });
    } finally {
      setBusyId(null);
    }
  }

  async function performCloseThread(id: string) {
    if (state.kind !== "ok") return;
    setBusyId(id);
    try {
      await fetch(
        `/api/me/stores/${encodeURIComponent(state.storeId)}/inquiries/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ close_only: true }),
        }
      );
      await load();
      dispatchOwnerHubBadgeRefresh({
        source: "owner-store-inquiries-close",
        key: `${state.storeId}:${id}:close`,
      });
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
        <Link href={loginHref} className="mt-3 inline-flex rounded-ui-rect bg-signature px-4 py-2 font-semibold text-white">
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
      <div className={OWNER_STORE_STACK_Y_CLASS}>
        <p className="text-sm text-red-600">{resolveOwnerApiErrorMessage(state.message, t)}</p>
        <button type="button" onClick={() => void load()} className="text-sm text-signature underline">
          {t("business_phase7_466")}
        </button>
      </div>
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
              <p className="mt-1 sam-text-xxs text-sam-meta">{formatDate(r.created_at)}</p>
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
                      className="rounded-ui-rect bg-signature px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
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
          setCloseConfirmId(null);
          await performCloseThread(id);
        }}
      />
    </div>
  );
}
