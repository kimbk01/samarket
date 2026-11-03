"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayBottomSheet, DibayOverlayButton } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { adShortagePoints, canAffordAd } from "@/lib/points/ad-shortage";
import { createPromotionAttemptKeyStore } from "@/lib/points/promotion-attempt-key";
import { buildSupportEnterHref } from "@/lib/support/support-enter-href";

/**
 * 광고하기 창 — 시안 v3 (Owner 2026-11-03 승인).
 * 내 포인트 · 상품 4줄(상위노출 7·14일 / 배너 3·7일) · 모자란 상품은 막고 줄마다 「N P 부족」 · 버튼 2개(보조 왼쪽·주 오른쪽).
 * 가격 = 서버 카탈로그(상위노출 `member_promotion_products` · 배너 `feed_ad_products`) · 광고 창에는 P 만(페소 표시·입금 계좌 없음).
 * 재감사 R2 (Owner 「기간 이전에 추가 포인트를 결제하고 추가 신청하면 연장」): 광고 중이면 상위노출 줄이 「N일 연장」으로
 * 바뀐다(끝나는 날 미리 표시). 심사 중·운영자 일시정지면 연장 줄 없이 상태만(서버도 already_active_promotion).
 */
type BoostItem = { id: string; pointCost: number; durationDays: number };
type BannerItem = { id: string; pointCost: number; durationDays: number; domain?: string };
type Row =
  | {
      key: string;
      kind: "boost" | "banner";
      productId: string;
      pointCost: number;
      durationDays: number;
      /** 광고 중인 상위노출을 같은 상품으로 늘리기 — 끝나는 날 = 지금 끝나는 날 + 기간 */
      extendEndAt?: string;
    }
  | { key: string; kind: "boost_running"; endAt: string | null }
  | { key: string; kind: "banner_running"; displayStatus: string };

type Loaded = {
  balance: number | null;
  boost: BoostItem[];
  boostActive: {
    endAt: string | null;
    pending: boolean;
    paused: boolean;
    pausedAt: string | null;
    /** 글 상태 연동: listing_* = 글이 숨겨져 멈춤 (운영자 일시정지와 문구 구분) */
    pausedBy: string | null;
  } | null;
  banner: BannerItem[];
  bannerCurrent: { displayStatus: string } | null;
};

const DAY_MS = 86_400_000;

export function TradeAdQuickSheet({
  open,
  onClose,
  postId,
  postTitle,
  thumbnailUrl,
  onStarted,
}: {
  open: boolean;
  onClose: () => void;
  postId: string;
  postTitle: string;
  thumbnailUrl?: string | null;
  /** 상위노출 결제 성공 뒤 — 목록 다시 읽기 등 */
  onStarted?: () => void;
}) {
  const { t, language } = useI18n();
  const router = useRouter();
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();
  const [data, setData] = useState<Loaded | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [startedEndAt, setStartedEndAt] = useState<string | null>(null);
  const [startedExtended, setStartedExtended] = useState(false);
  /** 재감사 S-0 (X-1): 같은 결제 시도 = 같은 요청 키 (응답이 끊긴 뒤 다시 눌러도 한 번만 차감) */
  const attemptKeys = useRef(createPromotionAttemptKeyStore());
  const [startedReplay, setStartedReplay] = useState(false);

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      const [promo, points, banner] = await runSingleFlight(`trade-ad-sheet:${postId}`, () =>
        Promise.all([
          fetch(
            `/api/me/points/promotion-orders?catalog=1&domain=trade&targetId=${encodeURIComponent(postId)}`,
            { credentials: "include", cache: "no-store" }
          ).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))),
          fetch("/api/me/points", { credentials: "include", cache: "no-store" }).then((r) =>
            r.ok ? r.json() : Promise.reject(new Error(String(r.status)))
          ),
          fetch("/api/me/feed-ad-requests?domain=trade", { credentials: "include", cache: "no-store" })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
        ])
      );
      const p = promo as {
        catalog?: BoostItem[];
        activeForTarget?: { endAt?: string; orderStatus?: string; pausedAt?: string; pausedBy?: string } | null;
      };
      const st = String(p.activeForTarget?.orderStatus ?? "").toLowerCase();
      const bal = Number((points as { balance?: number; points?: number }).balance ?? (points as { points?: number }).points);
      const b = (banner ?? {}) as {
        catalog?: BannerItem[];
        canCreateBanner?: boolean;
        currentBanner?: { displayStatus?: string } | null;
      };
      setData({
        balance: Number.isFinite(bal) ? bal : null,
        boost: Array.isArray(p.catalog) ? p.catalog : [],
        boostActive: p.activeForTarget
          ? {
              endAt: p.activeForTarget.endAt ?? null,
              pending: st === "pending" || st === "pending_review",
              paused: st === "paused",
              pausedAt: p.activeForTarget.pausedAt ?? null,
              pausedBy: p.activeForTarget.pausedBy ?? null,
            }
          : null,
        banner: (Array.isArray(b.catalog) ? b.catalog : []).filter((x) => !x.domain || x.domain === "trade"),
        bannerCurrent:
          b.canCreateBanner === false ? { displayStatus: String(b.currentBanner?.displayStatus ?? "active") } : null,
      });
    } catch {
      setLoadFailed(true);
    }
  }, [postId]);

  useEffect(() => {
    if (!open) return;
    setData(null);
    setNotice("");
    setStartedEndAt(null);
    setStartedExtended(false);
    setStartedReplay(false);
    setSelectedKey(null);
    attemptKeys.current.reset();
    void load();
  }, [open, load]);

  const rows: Row[] = useMemo(() => {
    if (!data) return [];
    const out: Row[] = [];
    const running = data.boostActive;
    if (running) out.push({ key: "boost_running", kind: "boost_running", endAt: running.endAt });
    const runningEndMs = running?.endAt ? Date.parse(running.endAt) : NaN;
    const canExtend = Boolean(running && !running.pending && !running.paused && Number.isFinite(runningEndMs));
    if (!running || canExtend)
      for (const it of data.boost)
        out.push({
          key: `boost:${it.id}`,
          kind: "boost",
          productId: it.id,
          pointCost: it.pointCost,
          durationDays: it.durationDays,
          ...(canExtend ? { extendEndAt: new Date(runningEndMs + it.durationDays * DAY_MS).toISOString() } : {}),
        });
    if (data.bannerCurrent)
      out.push({ key: "banner_running", kind: "banner_running", displayStatus: data.bannerCurrent.displayStatus });
    else
      for (const it of data.banner)
        out.push({ key: `banner:${it.id}`, kind: "banner", productId: it.id, pointCost: it.pointCost, durationDays: it.durationDays });
    return out;
  }, [data]);

  const buyable = rows.filter(
    (r): r is Extract<Row, { kind: "boost" | "banner" }> =>
      (r.kind === "boost" || r.kind === "banner") && canAffordAd(r.pointCost, data?.balance ?? null)
  );
  /**
   * 재감사 R-02 (P0): 결과를 모르는 결제가 있으면 그 상품 줄을 그대로 고른다 — 다시 불러온 잔액이 줄어도
   * 다른 상품으로 바꾸지 않는다(같은 키로 다시 보내 서버가 처음 결과를 돌려준다).
   */
  const pendingRow = (() => {
    const pid = attemptKeys.current.pendingProductFor(postId);
    if (!pid) return null;
    return (
      rows.find(
        (r): r is Extract<Row, { kind: "boost" | "banner" }> =>
          (r.kind === "boost" || r.kind === "banner") && r.productId === pid
      ) ?? null
    );
  })();
  /** 처음 열 때 기본 선택 = 고를 수 있는 첫 상품 (결과를 모르는 결제가 있으면 그 상품) */
  useEffect(() => {
    if (!data) return;
    setSelectedKey((prev) =>
      pendingRow ? pendingRow.key : prev && buyable.some((r) => r.key === prev) ? prev : buyable[0]?.key ?? null
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
  const selected =
    (pendingRow && pendingRow.key === selectedKey ? pendingRow : null) ??
    buyable.find((r) => r.key === selectedKey) ??
    null;

  /** 충전 화면에 넘길 부족분 = 고를 수 없는 상품 중 가장 적게 모자란 것 */
  const minShortage = rows.reduce((min, r) => {
    if (r.kind !== "boost" && r.kind !== "banner") return min;
    const s = adShortagePoints(r.pointCost, data?.balance ?? null);
    return s > 0 && (min === 0 || s < min) ? s : min;
  }, 0);

  const fmtP = (n: number) => `${Math.max(0, Math.floor(n)).toLocaleString(language === "en" ? "en-US" : "ko-KR")}P`;
  const returnTo = `${pathname}${searchParams?.toString() ? `?${searchParams.toString()}` : ""}`;

  const goCharge = () => {
    const qs = new URLSearchParams();
    if (minShortage > 0) qs.set("need", String(minShortage));
    qs.set("returnTo", returnTo);
    onClose();
    router.push(`/mypage/points/charge?${qs.toString()}`);
  };
  const goSupport = () => {
    onClose();
    router.push(buildSupportEnterHref({ category: "AD", referenceType: "TRADE_POST", referenceId: postId }));
  };

  const start = async () => {
    if (!selected || busy) return;
    if (selected.kind === "banner") {
      const qs = new URLSearchParams({ domain: "trade", targetPostId: postId, productId: selected.productId });
      onClose();
      router.push(`/mypage/ads/feed-request?${qs.toString()}`);
      return;
    }
    setBusy(true);
    setNotice("");
    const idem = attemptKeys.current.keyFor(postId, selected.productId);
    let status: number | null = null;
    try {
      const res = await fetch("/api/me/points/promotion-orders", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idem },
        body: JSON.stringify({
          targetType: "product",
          targetId: postId,
          targetTitle: postTitle,
          productId: selected.productId,
          idempotencyKey: idem,
          expectedPointCost: selected.pointCost,
          expectedDurationDays: selected.durationDays,
        }),
      });
      status = res.status;
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        endAt?: string;
        extended?: boolean;
        idempotent?: boolean;
      };
      /** 성공 응답인데 본문을 못 읽음 = 결과를 모름 → 키 유지 */
      if (res.ok && typeof j.ok !== "boolean") status = null;
      if (res.ok && j.ok) {
        setStartedExtended(j.extended === true);
        setStartedReplay(j.idempotent === true);
        setStartedEndAt(j.endAt ?? "");
        onStarted?.();
        return;
      }
      const err = j.error ?? "";
      /** 가격 변경·잔액 변화·이미 광고 중 → 새 값으로 다시 그린 뒤 안내 */
      await load();
      setNotice(
        err === "price_changed"
          ? t("promo_price_changed")
          : err === "insufficient_balance"
            ? t("points_ui_insufficient")
            : err === "already_active_promotion"
              ? t("points_ui_promotion_conflict")
              : t("promo_sheet_purchase_failed")
      );
    } catch {
      /** 응답을 못 받음 = 결제됐는지 모름 → 키를 유지하고 상태를 다시 불러온다 (다시 누르면 같은 결제로 확인) */
      await load();
      setNotice(t("promo_purchase_unconfirmed"));
    } finally {
      attemptKeys.current.settleIfFinal(status);
      setBusy(false);
    }
  };

  const rowLabel = (r: Row) => {
    if (r.kind === "boost_running") return t("trade_ad_option_boost_running_name");
    if (r.kind === "banner_running") return t("trade_ad_option_banner_running_name");
    if (r.kind === "boost" && r.extendEndAt) return t("trade_ad_option_boost_extend", { days: String(r.durationDays) });
    return r.kind === "boost"
      ? t("trade_ad_option_boost", { days: String(r.durationDays) })
      : t("trade_ad_option_banner", { days: String(r.durationDays) });
  };
  const fmtDateTime = (iso: string) =>
    new Date(iso).toLocaleString(language === "en" ? "en-US" : "ko-KR", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  const rowWhere = (r: Row) => {
    if (r.kind === "boost" && r.extendEndAt) return t("trade_ad_where_boost_extend", { date: fmtDateTime(r.extendEndAt) });
    /** 재감사 S-2 (시안 ②③): 광고 중 = 끝나는 시각 · 일시정지 = 남은 기간(멈춘 시각 기준, 재개하면 이어짐) */
    if (r.kind === "boost_running" && data?.boostActive && !data.boostActive.pending) {
      const ba = data.boostActive;
      if (ba.paused) {
        const end = ba.endAt ? Date.parse(ba.endAt) : NaN;
        const from = ba.pausedAt ? Date.parse(ba.pausedAt) : Date.now();
        const days = Number.isFinite(end) ? Math.max(0, Math.ceil((end - from) / DAY_MS)) : 0;
        return String(ba.pausedBy ?? "").startsWith("listing_")
          ? t("trade_ad_boost_paused_listing_detail", { days: String(days) })
          : t("trade_ad_boost_paused_detail", { days: String(days) });
      }
      if (r.endAt) return t("trade_ad_where_boost_until", { date: fmtDateTime(r.endAt) });
    }
    return r.kind === "boost" || r.kind === "boost_running" ? t("trade_ad_where_boost") : t("trade_ad_where_banner");
  };

  const footer = startedEndAt !== null ? (
    <div className={OverlayUi.actionsRow}>
      <DibayOverlayButton roleTone="primary" onClick={onClose}>
        {t("common_confirm")}
      </DibayOverlayButton>
    </div>
  ) : (
    <div className={OverlayUi.actionsRow}>
      <DibayOverlayButton roleTone="secondary" onClick={goSupport}>
        {t("trade_ad_support")}
      </DibayOverlayButton>
      {selected ? (
        <DibayOverlayButton roleTone="primary" loading={busy} onClick={() => void start()}>
          {selected.kind === "banner"
            ? t("trade_ad_banner_apply", { points: fmtP(selected.pointCost) })
            : selected.extendEndAt
              ? t("trade_ad_extend", { points: fmtP(selected.pointCost) })
              : t("trade_ad_start", { points: fmtP(selected.pointCost) })}
        </DibayOverlayButton>
      ) : data?.boostActive?.paused && !rows.some((r) => r.kind === "banner") ? (
        /** 재감사 S-2 (시안 ③): 일시정지 글은 충전이 아니라 막힌 버튼 + 이유 */
        <DibayOverlayButton roleTone="primary" disabled>
          {t("trade_ad_paused_cta")}
        </DibayOverlayButton>
      ) : (
        <DibayOverlayButton roleTone="primary" disabled={!data} onClick={goCharge}>
          {t("trade_ad_charge")}
        </DibayOverlayButton>
      )}
    </div>
  );

  return (
    <DibayBottomSheet open={open} onClose={onClose} title={t("trade_ad_cta")} footer={footer}>
      <div className="flex items-center gap-2.5 pb-3" data-trade-ad-sheet={postId}>
        {thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnailUrl} alt="" className="h-10 w-10 shrink-0 rounded-ui-rect object-cover" />
        ) : (
          <span className="h-10 w-10 shrink-0 rounded-ui-rect bg-sam-surface-muted" aria-hidden />
        )}
        <p className="min-w-0 truncate text-[16px] font-bold text-sam-fg">{postTitle}</p>
      </div>

      <div className="mb-2.5 flex items-center gap-2.5 rounded-ui-rect border border-[color:var(--currency-point-border)] bg-[color:var(--currency-point-bg)] px-3.5 py-3">
        <span className="text-[13px] text-sam-muted">{t("trade_ad_my_points")}</span>
        <span className="ml-auto text-[22px] font-extrabold tabular-nums text-sam-fg" data-trade-ad-balance>
          {data?.balance == null ? "—" : fmtP(data.balance)}
        </span>
        {selected ? (
          <button
            type="button"
            onClick={goCharge}
            className="h-8 shrink-0 rounded-ui-rect border border-sam-primary px-3 text-[13px] font-bold text-sam-primary"
          >
            {t("trade_ad_charge_small")}
          </button>
        ) : null}
      </div>

      {startedEndAt !== null ? (
        <div className="rounded-ui-rect bg-sam-pressed-surface px-3.5 py-3 text-[15px] font-semibold text-sam-fg" role="status">
          {startedReplay ? t("promo_purchase_already_done") : startedExtended ? t("trade_ad_extended") : t("trade_ad_started")}
          {startedEndAt ? (
            <span className="mt-1 block text-[13px] font-normal text-sam-muted">
              {t("trade_ad_ends", { date: new Date(startedEndAt).toLocaleDateString(language === "en" ? "en-US" : "ko-KR") })}
            </span>
          ) : null}
        </div>
      ) : loadFailed ? (
        <p className={OverlayUi.captionDanger}>{t("trade_ad_load_failed")}</p>
      ) : !data ? (
        <p className={OverlayUi.bodySecondary}>{t("common_loading")}</p>
      ) : rows.length === 0 ? (
        <p className={OverlayUi.bodySecondary}>{t("trade_ad_none")}</p>
      ) : (
        <div role="radiogroup" aria-label={t("trade_ad_cta")} className="space-y-1.5">
          {rows.map((r) => {
            const isOption = r.kind === "boost" || r.kind === "banner";
            const short = isOption ? adShortagePoints(r.pointCost, data.balance) : 0;
            const enabled = isOption && short === 0 && data.balance != null;
            const on = enabled && r.key === selectedKey;
            return (
              <button
                key={r.key}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={!enabled}
                onClick={() => enabled && setSelectedKey(r.key)}
                data-trade-ad-option={r.key}
                data-trade-ad-option-state={on ? "selected" : enabled ? "enabled" : "disabled"}
                className={`flex min-h-14 w-full items-center gap-2.5 rounded-ui-rect border px-3 py-2.5 text-left ${
                  on
                    ? "border-2 border-sam-primary bg-sam-pressed-surface"
                    : enabled
                      ? "border-sam-border bg-sam-surface"
                      : "border-sam-border bg-sam-app"
                }`}
              >
                <span
                  aria-hidden
                  className={`h-5 w-5 shrink-0 rounded-full border-2 ${
                    on ? "border-[6px] border-sam-primary" : enabled ? "border-sam-border" : "border-sam-border-soft bg-sam-surface-muted"
                  }`}
                />
                <span className={`min-w-0 flex-1 text-[15px] font-semibold ${enabled ? "text-sam-fg" : "text-sam-muted"}`}>
                  {rowLabel(r)}
                  <span className="block text-[12px] font-normal text-sam-muted">{rowWhere(r)}</span>
                </span>
                <span className="shrink-0 text-right tabular-nums">
                  {r.kind === "boost_running" ? (
                    <span className="text-[13px] font-bold text-sam-primary">
                      {data.boostActive?.pending
                        ? t("trade_ad_boost_pending")
                        : data.boostActive?.paused
                          ? t("trade_ad_boost_paused")
                          : t("trade_ad_boost_running", {
                            days: String(
                              r.endAt ? Math.max(0, Math.ceil((Date.parse(r.endAt) - Date.now()) / DAY_MS)) : 0
                            ),
                          })}
                    </span>
                  ) : r.kind === "banner_running" ? (
                    <span className="text-[13px] font-bold text-sam-primary">
                      {r.displayStatus === "pending_review" ? t("trade_ad_banner_pending") : t("trade_ad_banner_running")}
                    </span>
                  ) : (
                    <>
                      <span className={`block text-[15px] font-bold ${enabled ? "text-sam-fg" : "text-sam-muted"}`}>
                        {fmtP(r.pointCost)}
                      </span>
                      {short > 0 ? (
                        <span className="block text-[12px] font-bold text-sam-danger" data-trade-ad-short>
                          {t("trade_ad_short", { points: fmtP(short) })}
                        </span>
                      ) : null}
                    </>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {startedEndAt === null && rows.some((r) => r.kind === "boost" && r.extendEndAt) ? (
        <p className={`mt-2 ${OverlayUi.bodySecondary}`}>{t("trade_ad_extend_keeps_place")}</p>
      ) : null}
      {notice ? <p className={`mt-2 ${OverlayUi.captionDanger}`}>{notice}</p> : null}
    </DibayBottomSheet>
  );
}
