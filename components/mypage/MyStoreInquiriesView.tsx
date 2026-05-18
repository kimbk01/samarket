"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { runSingleFlight } from "@/lib/http/run-single-flight";

type Row = {
  id: string;
  store_id: string;
  store_name: string;
  subject: string;
  content: string;
  status: string;
  answer: string | null;
  answered_at: string | null;
  created_at: string;
};

export function MyStoreInquiriesView() {
  const { t, language } = useI18n();
  const dateLocale = language === "en" ? "en-US" : "ko-KR";
  const statusLabels = useMemo(
    () => ({
      open: t("mypage_comp_inquiry_status_open"),
      answered: t("mypage_comp_inquiry_status_answered"),
      closed: t("mypage_comp_inquiry_status_closed"),
      escalated: t("mypage_comp_inquiry_status_escalated"),
    }),
    [t],
  );
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "unauth" }
    | { kind: "error"; message: string }
    | { kind: "ok"; rows: Row[] }
  >({ kind: "loading" });

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;
    if (!silent) setState({ kind: "loading" });
    try {
      const res = await runSingleFlight("me:store-inquiries:get", () =>
        fetch("/api/me/store-inquiries", {
          credentials: "include",
          cache: "no-store",
        })
      );
      if (res.status === 401) {
        setState({ kind: "unauth" });
        return;
      }
      const json = (await res.clone().json()) as {
        ok?: boolean;
        error?: string;
        inquiries?: unknown;
      };
      if (!json?.ok) {
        if (!silent) {
          setState({
            kind: "error",
            message: typeof json?.error === "string" ? json.error : "load_failed",
          });
        }
        return;
      }
      setState({ kind: "ok", rows: (json.inquiries ?? []) as Row[] });
    } catch {
      if (!silent) setState({ kind: "error", message: "network_error" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useRefetchOnPageShowRestore(() => void load({ silent: true }));

  function formatDate(iso: string | null) {
    if (!iso) return "";
    return new Date(iso).toLocaleString(dateLocale);
  }

  if (state.kind === "loading") {
    return <p className="text-sm text-sam-muted">{t("mypage_comp_loading_short")}</p>;
  }
  if (state.kind === "unauth") {
    return <p className="text-sm text-sam-muted">{t("mypage_comp_inquiry_login_prompt")}</p>;
  }
  if (state.kind === "error") {
    return (
      <div className="space-y-2">
        <p className="text-sm text-red-600">({state.message})</p>
        <button type="button" onClick={() => void load({ silent: false })} className="text-sm text-signature underline">
          {t("mypage_comp_retry")}
        </button>
      </div>
    );
  }

  if (state.rows.length === 0) {
    return (
      <div className="rounded-ui-rect bg-sam-surface p-6 text-center text-sm text-sam-muted shadow-sm">
        <p>{t("mypage_comp_inquiry_empty")}</p>
        <Link href="/stores" className="mt-3 inline-block text-signature">
          {t("mypage_comp_browse_stores")}
        </Link>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {state.rows.map((r) => (
        <li key={r.id} className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4 shadow-sm">
          <p className="sam-text-body font-semibold text-sam-fg">{r.store_name || t("mypage_comp_store_fallback_name")}</p>
          <p className="mt-1 text-sm font-medium text-sam-fg">{r.subject}</p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-sam-muted">{r.content}</p>
          <p className="mt-2 text-xs text-sam-muted">
            {statusLabels[r.status as keyof typeof statusLabels] ?? r.status} · {formatDate(r.created_at)}
          </p>
          {r.answer ? (
            <div className="mt-3 rounded-ui-rect bg-sam-app px-3 py-2">
              <p className="text-xs font-medium text-sam-muted">{t("mypage_comp_inquiry_store_reply")}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-sam-fg">{r.answer}</p>
              {r.answered_at ? (
                <p className="mt-1 sam-text-xxs text-sam-meta">{formatDate(r.answered_at)}</p>
              ) : null}
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
