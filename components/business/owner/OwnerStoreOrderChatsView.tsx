"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AppLanguageCode } from "@/lib/i18n/config";
import { OWNER_MOBILE_BOTTOM_NAV_PAD_CLASS } from "@/lib/stores/owner-mobile-ui-tokens";
import { runSingleFlight } from "@/lib/http/run-single-flight";

type ChatRow = {
  order_id: string;
  order_no: string;
  room_id: string;
  buyer_public_label: string;
  order_status_label: string;
  unread_count: number;
  last_message_at: string;
  last_message_preview: string;
  messenger_href: string;
};

type ViewState =
  | { kind: "loading" }
  | { kind: "need_store" }
  | { kind: "error"; message: string }
  | { kind: "ok"; storeName: string; chats: ChatRow[] };

function formatListTime(iso: string, language: AppLanguageCode): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString(language === "ko" ? "ko-KR" : "en-US", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString(language === "ko" ? "ko-KR" : "en-US", { month: "numeric", day: "numeric" });
}

export function OwnerStoreOrderChatsView() {
  const { t, language } = useI18n();
  const searchParams = useSearchParams();
  const storeId = searchParams.get("storeId")?.trim() ?? "";
  const [state, setState] = useState<ViewState>({ kind: "loading" });

  const load = useCallback(async () => {
    if (!storeId) {
      setState({ kind: "need_store" });
      return;
    }
    setState({ kind: "loading" });
    try {
      const res = await runSingleFlight(`owner-order-chats:${storeId}`, () =>
        fetch(`/api/me/stores/${encodeURIComponent(storeId)}/order-chats`, {
          credentials: "include",
          cache: "no-store",
        })
      );
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        store?: { store_name?: string };
        chats?: ChatRow[];
      };
      if (res.status === 401) {
        setState({ kind: "error", message: t("common_login_required") });
        return;
      }
      if (!json.ok || !Array.isArray(json.chats)) {
        setState({ kind: "error", message: json.error ?? t("store_owner_err_load_list") });
        return;
      }
      setState({
        kind: "ok",
        storeName: json.store?.store_name?.trim() || t("store_owner_store_fallback"),
        chats: json.chats,
      });
    } catch {
      setState({ kind: "error", message: t("store_owner_err_network") });
    }
  }, [storeId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.kind === "loading") {
    return (
      <div
        className={`flex h-full min-h-0 flex-col bg-[var(--biz-app-bg)] ${OWNER_MOBILE_BOTTOM_NAV_PAD_CLASS}`}
      >
        <div className="space-y-2 p-2 animate-pulse">
          <div className="h-16 rounded-[4px] bg-white" />
          <div className="h-16 rounded-[4px] bg-white" />
          <div className="h-16 rounded-[4px] bg-white" />
        </div>
      </div>
    );
  }

  if (state.kind === "need_store") {
    return (
      <div
        className={`flex h-full flex-col items-center justify-center bg-[var(--biz-app-bg)] text-sm text-[#8C8C8C] ${OWNER_MOBILE_BOTTOM_NAV_PAD_CLASS}`}
      >
        {t("store_owner_chats_need_store")}
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div
        className={`flex h-full flex-col items-center justify-center gap-3 bg-[var(--biz-app-bg)] text-sm text-red-600 ${OWNER_MOBILE_BOTTOM_NAV_PAD_CLASS}`}
      >
        {state.message}
        <button type="button" className="text-[var(--biz-primary)] underline" onClick={() => void load()}>
          {t("store_owner_chats_retry")}
        </button>
      </div>
    );
  }

  return (
    <div className={`flex h-full min-h-0 flex-col bg-[var(--biz-app-bg)] ${OWNER_MOBILE_BOTTOM_NAV_PAD_CLASS}`}>
      <div className="shrink-0 border-b border-[#E5E7EB] bg-white py-2">
        <p className="text-[13px] text-[#8C8C8C]">
          {t("store_owner_chats_list_hint", { storeName: state.storeName })}
        </p>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain py-2">
        {state.chats.length === 0 ?
          <li className="flex flex-col items-center justify-center gap-2 rounded-[4px] bg-white px-4 py-12 text-center">
            <MessageCircle className="h-10 w-10 text-[#D9D9D9]" strokeWidth={1.5} aria-hidden />
            <p className="text-[14px] font-medium text-[#262626]">{t("store_owner_chats_empty_title")}</p>
            <p className="text-[12px] text-[#8C8C8C]">{t("store_owner_chats_empty_hint")}</p>
          </li>
        : state.chats.map((c) => (
            <li key={c.order_id}>
              <Link
                href={c.messenger_href}
                className="mb-2 flex gap-3 rounded-[4px] border border-[#E5E7EB] bg-white px-3 py-3 active:bg-[#F5F5F5]"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--biz-tan-soft)] text-[var(--biz-primary)]">
                  <MessageCircle className="h-5 w-5" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-[14px] font-semibold text-[#262626]">
                      {c.buyer_public_label}
                    </p>
                    <span className="shrink-0 text-[11px] text-[#8C8C8C]">
                      {formatListTime(c.last_message_at, language)}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[12px] text-[#8C8C8C]">
                    {t("store_owner_order_line_short", { no: c.order_no })}
                  </p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className="min-w-0 flex-1 truncate text-[13px] text-[#595959]">
                      {c.last_message_preview}
                    </p>
                    {c.unread_count > 0 ?
                      <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[#FF4D4F] px-1.5 text-[10px] font-bold text-white">
                        {c.unread_count > 99 ? "99+" : c.unread_count}
                      </span>
                    : null}
                  </div>
                  <span className="mt-1 inline-block rounded bg-[#F5F5F5] px-1.5 py-px text-[10px] font-medium text-[#8C8C8C]">
                    {c.order_status_label}
                  </span>
                </div>
              </Link>
            </li>
          ))
        }
      </ul>
    </div>
  );
}
