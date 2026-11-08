"use client";

/**
 * 상품권 지갑 내역 (C-4) — 「사용 완료」·「보낸 선물」 탭의 기간·쪽 이동·기간 합계.
 * 숫자는 모두 서버 계산값(`/api/me/gift-certificates/wallet?section=history`) — 이 파일은 상태·표시만.
 * 기간·쪽은 주소(`period`·`pfrom`·`pto`·`page`)에 남겨 상세 화면에 갔다 돌아와도 그대로 (포인트 화면과 같은 방식).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatMypageMoney, formatMypageNumber } from "@/lib/mypage/format-mypage-date";
import { checkPointsPeriod, clampPointsPage } from "@/lib/points/points-screen-url-state";
import type { MePointsPeriodQuery } from "@/lib/points/me-points-client";
import type { GiftWalletInstance, GiftWalletTransfer } from "@/lib/gift-certificate/load-gift-wallet";
import {
  GIFT_HISTORY_PAGE_SIZE,
  parseGiftHistoryUrlState,
  writeGiftHistoryUrlState,
  type GiftAmountTotal,
  type GiftHistoryKind,
  type GiftWalletPeriodSummary,
} from "@/lib/gift-certificate/gift-wallet-history";
import { translateBy } from "@/lib/i18n/translate-by";

type Lang = "ko" | "en";

export function giftHistoryRequestUrl(kind: GiftHistoryKind, period: MePointsPeriodQuery, page: number): string {
  const qs = new URLSearchParams();
  qs.set("section", "history");
  qs.set("kind", kind);
  qs.set("offset", String(page * GIFT_HISTORY_PAGE_SIZE));
  qs.set("limit", String(GIFT_HISTORY_PAGE_SIZE));
  if (period.period !== "all") {
    qs.set("period", period.period);
    if (period.period === "custom") {
      if (period.fromDay) qs.set("from", period.fromDay);
      if (period.toDay) qs.set("to", period.toDay);
    }
  }
  return `/api/me/gift-certificates/wallet?${qs.toString()}`;
}

type HistoryResponse = {
  ok?: boolean;
  kind?: GiftHistoryKind;
  items?: unknown[];
  total?: number;
  periodSummary?: GiftWalletPeriodSummary | null;
  periodSummaryError?: boolean;
};

export type GiftWalletHistoryState = {
  period: MePointsPeriodQuery;
  periodCheck: ReturnType<typeof checkPointsPeriod>;
  page: number;
  total: number | null;
  usedItems: GiftWalletInstance[];
  sentItems: GiftWalletTransfer[];
  summary: GiftWalletPeriodSummary | null;
  summaryError: boolean;
  loading: boolean;
  loaded: boolean;
  error: boolean;
  changePeriod: (next: MePointsPeriodQuery) => void;
  goPage: (offset: number) => void;
  reload: () => void;
};

/** `kind` 가 null(보유·받은 선물 탭)이면 조회하지 않는다 */
export function useGiftWalletHistory(kind: GiftHistoryKind | null): GiftWalletHistoryState {
  const searchParams = useSearchParams();
  const [urlInit] = useState(() => parseGiftHistoryUrlState(searchParams));
  const [period, setPeriod] = useState<MePointsPeriodQuery>(urlInit.period);
  const [page, setPage] = useState(urlInit.page);
  const [total, setTotal] = useState<number | null>(null);
  const [usedItems, setUsedItems] = useState<GiftWalletInstance[]>([]);
  const [sentItems, setSentItems] = useState<GiftWalletTransfer[]>([]);
  const [summary, setSummary] = useState<GiftWalletPeriodSummary | null>(null);
  const [summaryError, setSummaryError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [nonce, setNonce] = useState(0);
  const requestIdRef = useRef(0);
  const prevKindRef = useRef(kind);
  const periodCheck = checkPointsPeriod(period);

  /* 탭을 바꾸면 1쪽부터 (기간은 유지) */
  if (prevKindRef.current !== kind) {
    prevKindRef.current = kind;
    setPage(0);
    setTotal(null);
    setUsedItems([]);
    setSentItems([]);
    setLoaded(false);
  }

  /* 기간·쪽 → 주소 (기록 쌓지 않음) */
  useEffect(() => {
    if (!kind || typeof window === "undefined") return;
    const next = writeGiftHistoryUrlState(window.location.search, { period, page });
    const cur = window.location.search.replace(/^\?/, "");
    if (next === cur) return;
    window.history.replaceState(null, "", `${window.location.pathname}${next ? `?${next}` : ""}${window.location.hash}`);
  }, [kind, period, page]);

  useEffect(() => {
    if (!kind || checkPointsPeriod(period) !== "ok") return;
    const reqId = ++requestIdRef.current;
    const ctrl = new AbortController();
    setLoading(true);
    void (async () => {
      try {
        const res = await fetch(giftHistoryRequestUrl(kind, period, page), {
          credentials: "include",
          cache: "no-store",
          signal: ctrl.signal,
        });
        const json = (await res.json().catch(() => ({}))) as HistoryResponse;
        if (reqId !== requestIdRef.current) return;
        if (!res.ok || json.ok !== true || !Array.isArray(json.items)) {
          setError(true);
          return;
        }
        const nextTotal = typeof json.total === "number" ? json.total : json.items.length;
        if (kind === "used") setUsedItems(json.items as GiftWalletInstance[]);
        else setSentItems(json.items as GiftWalletTransfer[]);
        setTotal(nextTotal);
        setSummary(json.periodSummary ?? null);
        setSummaryError(json.periodSummaryError === true);
        setError(false);
        setLoaded(true);
        const c = clampPointsPage(page, nextTotal, GIFT_HISTORY_PAGE_SIZE);
        if (c !== page) setPage(c);
      } catch {
        if (reqId === requestIdRef.current && !ctrl.signal.aborted) setError(true);
      } finally {
        if (reqId === requestIdRef.current) setLoading(false);
      }
    })();
    return () => ctrl.abort();
  }, [kind, period, page, nonce]);

  const changePeriod = useCallback((next: MePointsPeriodQuery) => {
    requestIdRef.current += 1;
    setPeriod(next);
    setPage(0);
    setTotal(null);
    setUsedItems([]);
    setSentItems([]);
    setSummary(null);
    setSummaryError(false);
    setError(false);
    setLoaded(false);
  }, []);

  const goPage = useCallback((offset: number) => {
    setPage(clampPointsPage(Math.floor(offset / GIFT_HISTORY_PAGE_SIZE), Number.MAX_SAFE_INTEGER, GIFT_HISTORY_PAGE_SIZE));
  }, []);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return {
    period,
    periodCheck,
    page,
    total,
    usedItems,
    sentItems,
    summary,
    summaryError,
    loading,
    loaded,
    error,
    changePeriod,
    goPage,
    reload,
  };
}

function Row({ label, value, testId, lang }: { label: string; value: GiftAmountTotal; testId: string; lang: Lang }) {
  return (
    <div className="flex justify-between gap-2" data-testid={testId}>
      <dt className="text-sam-muted">{label}</dt>
      <dd className="text-right tabular-nums text-sam-fg">{`${translateBy(lang, "orders_count_items", { n: formatMypageNumber(value.count, { lang }) })} · ${formatMypageMoney(value.amount)}`}</dd>
    </div>
  );
}

/** 기간 합계 — 구매·사용·받은 선물·보낸 선물 (서버가 기간 전체로 계산 · 현재 쪽 합계 아님) */
export function GiftWalletPeriodSummaryCard({
  summary,
  error,
  lang,
}: {
  summary: GiftWalletPeriodSummary | null;
  error?: boolean;
  lang: Lang;
}) {
  if (!summary) {
    return error ? (
      <p className="mb-3 sam-text-helper text-sam-danger" role="alert">
        {translateBy(lang, "orders_could_not_load_the_period_totals")}
      </p>
    ) : null;
  }
  return (
    <section
      className="mb-3 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2"
      data-testid="gift-wallet-period-summary"
    >
      <p className="mb-1 sam-text-xxs text-sam-muted">
        {translateBy(lang, "orders_count_amount_by_purchase_use_or")}
      </p>
      <dl className="grid grid-cols-1 gap-1 sam-text-helper">
        <Row label={translateBy(lang, "orders_purchased_paid")} value={summary.purchased} testId="gws-purchased" lang={lang} />
        <Row label={translateBy(lang, "orders_used_applied")} value={summary.used} testId="gws-used" lang={lang} />
        {summary.forfeited > 0 ? (
          <div className="flex justify-between gap-2" data-testid="gws-forfeited">
            <dt className="text-sam-muted">{translateBy(lang, "orders_forfeited_on_use")}</dt>
            <dd className="text-right tabular-nums text-sam-fg">{formatMypageMoney(summary.forfeited)}</dd>
          </div>
        ) : null}
        <Row label={translateBy(lang, "orders_gifts_received_face_value")} value={summary.received} testId="gws-received" lang={lang} />
        <Row label={translateBy(lang, "orders_gifts_sent_face_value")} value={summary.sent} testId="gws-sent" lang={lang} />
      </dl>
      <p className="mt-1 sam-text-xxs text-sam-muted">
        {translateBy(lang, "orders_gifts_count_only_when_accepted")}
      </p>
    </section>
  );
}
