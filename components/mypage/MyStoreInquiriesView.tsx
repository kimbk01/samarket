"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, MessageSquare } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyStateView } from "@/components/mypage/ds/MyStateView";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { formatMypageDate } from "@/lib/mypage/format-mypage-date";
import { useMypageListRestore } from "@/lib/mypage/use-mypage-list-restore";
import {
  peekMypageListPageCache,
  writeMypageListPageCache,
} from "@/lib/mypage/mypage-list-scroll-restore";
import {
  readStoreInquiryExpandedIds,
  storeInquiryRowHref,
  storeInquiryStatusBadgeClass,
  writeStoreInquiryExpandedIds,
} from "@/lib/mypage/store-inquiry-ui";

type Row = {
  id: string;
  store_id: string;
  store_name: string;
  /** A10 — 행 → 매장 화면 */
  store_slug?: string;
  subject: string;
  content: string;
  status: string;
  answer: string | null;
  answered_at: string | null;
  created_at: string;
};

const CACHE_KEY = "mypage:store-inquiries";

/** S34 스켈레톤 — 행 5개(2줄 + 우측 뱃지) */
function StoreInquiriesSkeleton() {
  const bone = "rounded-ui-rect bg-sam-border-soft/70 motion-safe:animate-pulse";
  return (
    <ul aria-busy="true" data-testid="store-inquiries-skeleton" className="space-y-3">
      {[0, 1, 2, 3, 4].map((i) => (
        <li
          key={i}
          data-skeleton-row=""
          className="flex items-center gap-3 rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4"
        >
          <span className="flex min-w-0 flex-1 flex-col gap-2">
            <span className={`h-3.5 w-[40%] ${bone}`} />
            <span className={`h-3 w-[70%] ${bone}`} />
          </span>
          <span className="h-5 w-14 shrink-0 rounded-full bg-sam-border-soft/70 motion-safe:animate-pulse" />
        </li>
      ))}
    </ul>
  );
}

export function MyStoreInquiriesView() {
  const { t, language } = useI18n();
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
    | { kind: "error" }
    | { kind: "ok"; rows: Row[] }
  >(() => {
    const cached = peekMypageListPageCache<Row[]>(CACHE_KEY);
    return cached ? { kind: "ok", rows: cached } : { kind: "loading" };
  });
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set(readStoreInquiryExpandedIds()));

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;
    if (!silent) setState((prev) => (prev.kind === "ok" ? prev : { kind: "loading" }));
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
      const json = (await res.clone().json()) as { ok?: boolean; inquiries?: unknown };
      if (!res.ok || !json?.ok) {
        // 오류 코드 노출 금지 — i18n 문구 + [다시 시도] (조용한 갱신 실패는 기존 목록 유지)
        if (!silent) setState((prev) => (prev.kind === "ok" ? prev : { kind: "error" }));
        return;
      }
      const rows = (json.inquiries ?? []) as Row[];
      writeMypageListPageCache(CACHE_KEY, rows);
      setState({ kind: "ok", rows });
    } catch {
      if (!silent) setState((prev) => (prev.kind === "ok" ? prev : { kind: "error" }));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useRefetchOnPageShowRestore(() => void load({ silent: true }));

  /** 행 → 매장 → 뒤로 시 스크롤 유지 (§1.4) */
  useMypageListRestore({ ready: state.kind === "ok" });

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeStoreInquiryExpandedIds([...next]);
      return next;
    });
  }, []);

  if (state.kind === "loading") {
    return <StoreInquiriesSkeleton />;
  }
  if (state.kind === "unauth") {
    return <p className="text-sm text-sam-muted">{t("mypage_comp_inquiry_login_prompt")}</p>;
  }
  if (state.kind === "error") {
    return (
      <MyStateView
        kind="error"
        error={{ message: t("mypage_oa_inquiries_load_failed"), onRetry: () => void load() }}
      />
    );
  }

  if (state.rows.length === 0) {
    return (
      <MyStateView
        kind="empty"
        empty={{
          icon: <MessageSquare className="h-6 w-6" aria-hidden />,
          title: t("mypage_comp_inquiry_empty"),
          cta: (
            <Link href="/stores" className="sam-btn sam-btn--primary sam-btn--sm">
              {t("mypage_comp_browse_stores")}
            </Link>
          ),
        }}
      />
    );
  }

  return (
    <ul className="space-y-3" data-testid="store-inquiries-list">
      {state.rows.map((r) => {
        const href = storeInquiryRowHref(r.store_slug);
        const open = expanded.has(r.id);
        const statusText = statusLabels[r.status as keyof typeof statusLabels] ?? statusLabels.open;
        const head = (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate sam-text-body font-semibold text-sam-fg">
                {r.store_name || t("mypage_comp_store_fallback_name")}
              </span>
              <span className="mt-0.5 block truncate text-sm text-sam-fg">{r.subject}</span>
              <span className="mt-1 block sam-text-xxs text-sam-meta">
                {formatMypageDate(r.created_at, { style: "datetime", lang: language })}
              </span>
            </span>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 sam-text-xxs font-bold ${storeInquiryStatusBadgeClass(r.status)}`}
              data-inquiry-status={r.status}
            >
              {statusText}
            </span>
            {href ? <ChevronRight className="h-[18px] w-[18px] shrink-0 text-sam-muted/45" aria-hidden /> : null}
          </>
        );
        return (
          <li key={r.id} className="overflow-hidden rounded-ui-rect border border-sam-border-soft bg-sam-surface">
            {href ? (
              <Link
                href={href}
                data-store-inquiry-row="1"
                className="flex min-h-[52px] items-center gap-3 px-4 py-3 active:bg-sam-pressed-surface"
              >
                {head}
              </Link>
            ) : (
              <div className="flex min-h-[52px] items-center gap-3 px-4 py-3">{head}</div>
            )}
            <button
              type="button"
              onClick={() => toggle(r.id)}
              aria-expanded={open}
              className="flex min-h-[44px] w-full items-center justify-center border-t border-sam-border-soft sam-text-body-secondary font-semibold text-sam-primary"
            >
              {open ? t("mypage_oa_inquiry_hide_answer") : t("mypage_oa_inquiry_view_answer")}
            </button>
            {open ? (
              <div className="border-t border-sam-border-soft px-4 py-3">
                <p className="whitespace-pre-wrap text-sm text-sam-muted">{r.content}</p>
                {r.answer ? (
                  <div className="mt-3 rounded-ui-rect bg-sam-app px-3 py-2">
                    <p className="text-xs font-medium text-sam-muted">{t("mypage_comp_inquiry_store_reply")}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-sam-fg">{r.answer}</p>
                    {r.answered_at ? (
                      <p className="mt-1 sam-text-xxs text-sam-meta">
                        {formatMypageDate(r.answered_at, { style: "datetime", lang: language })}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-3 sam-text-helper text-sam-meta">{t("mypage_oa_inquiry_no_answer_yet")}</p>
                )}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
