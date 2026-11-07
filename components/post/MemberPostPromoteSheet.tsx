"use client";

import { formatPhtDisplayDateTime } from "@/lib/time/format-pht-display";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { CurrencyAmount } from "@/components/currency";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { ENTRY_SHARED_FLIGHT_DEADLINE_MS, runWithSharedFlightDeadline } from "@/lib/http/shared-flight-deadline";
import type { MemberPromotionProductId } from "@/lib/points/promotion-products";
import { DibayBottomSheet, DibayOverlayButton } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

import { createPromotionAttemptKeyStore } from "@/lib/points/promotion-attempt-key";

type CatalogItem = {
  id: MemberPromotionProductId;
  durationDays: number;
  pointCost: number;
  requiresAdminApproval?: boolean;
  fallbackTitleKo: string;
  fallbackTitleEn: string;
  fallbackDescKo: string;
  fallbackDescEn: string;
};

type Props = {
  postId: string;
  postTitle: string;
  open: boolean;
  onClose: () => void;
  onPurchased?: () => void;
  /** trade (default) | community — catalog + CTA copy */
  domain?: "trade" | "community";
};

export function MemberPostPromoteSheet({
  postId,
  postTitle,
  open,
  onClose,
  onPurchased,
  domain = "trade",
}: Props) {
  const { t, language, safeT } = useI18n();
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [productId, setProductId] = useState<MemberPromotionProductId | null>(
    domain === "community" ? "community_promote_3" : "trade_promote_7"
  );
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [successEndAt, setSuccessEndAt] = useState("");
  const [pendingReview, setPendingReview] = useState(false);
  const [activeEndAt, setActiveEndAt] = useState<string | null>(null);
  const [pendingExisting, setPendingExisting] = useState(false);
  /** 재감사 R2: 운영자 일시정지 — 연장 불가(서버도 already_active_promotion) */
  const [pausedExisting, setPausedExisting] = useState(false);
  const [successExtended, setSuccessExtended] = useState(false);
  const [successReplay, setSuccessReplay] = useState(false);
  /** 재감사 S-0 (X-1): 같은 결제 시도 = 같은 요청 키 (응답이 끊긴 뒤 다시 눌러도 한 번만 차감) */
  const attemptKeys = useRef(createPromotionAttemptKeyStore());

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      /** 공유 비행은 파싱된 JSON 을 나눈다 — Response 본문은 한 번만 읽힌다 */
      const [promoJ, balJ] = await runSingleFlight(`member-promote:${domain}:${postId}`, () =>
        runWithSharedFlightDeadline("member_post_promote_sheet", ENTRY_SHARED_FLIGHT_DEADLINE_MS, (signal) =>
          Promise.all([
            fetch(
              `/api/me/points/promotion-orders?catalog=1&domain=${encodeURIComponent(domain)}&targetId=${encodeURIComponent(postId)}`,
              {
                cache: "no-store",
                credentials: "include",
                signal,
              }
            ).then(
              async (r) =>
                (await r.json().catch(() => ({}))) as {
                  catalog?: CatalogItem[];
                  activeForTarget?: { endAt?: string; orderStatus?: string } | null;
                }
            ),
            fetch("/api/me/points", { cache: "no-store", credentials: "include", signal }).then(
              async (r) => (await r.json().catch(() => ({}))) as { balance?: number; points?: number }
            ),
          ])
        )
      );
      const items = Array.isArray(promoJ.catalog) ? promoJ.catalog : [];
      setCatalog(items);
      // 재감사 R-01 (P0): 결과를 모르는 결제가 있으면 그 상품을 그대로 둔다 (첫 상품으로 되돌리면 새 키 → 두 번째 차감)
      const pendingProduct = attemptKeys.current.pendingProductFor(postId);
      const bal = Number(balJ.balance ?? balJ.points);
      const balOk = Number.isFinite(bal) ? bal : null;
      setBalance(balOk);
      // 설계 2026-11-08 ⑨: 기본 선택 = 결과를 모르는 결제 상품 → 지금 고른 상품(살 수 있으면) → 살 수 있는 첫 상품 → 없음
      const canBuy = (i: CatalogItem) => balOk != null && balOk >= i.pointCost;
      setProductId((prev) => {
        const pending = items.find((i) => i.id === pendingProduct);
        if (pending) return pending.id;
        const prevItem = items.find((i) => i.id === prev);
        if (prevItem && canBuy(prevItem)) return prevItem.id;
        return items.find(canBuy)?.id ?? null;
      });
      const st = String(promoJ.activeForTarget?.orderStatus ?? "").toLowerCase();
      const activeEnd = promoJ.activeForTarget?.endAt?.trim() || null;
      setPausedExisting(st === "paused");
      if (st === "pending_review" || st === "pending") {
        setPendingExisting(true);
        setActiveEndAt(activeEnd);
      } else {
        setPendingExisting(false);
        setActiveEndAt(st === "active" || st === "paused" ? activeEnd : null);
      }
    } catch {
      setErr(
        safeT("promo_sheet_load_failed", {
          fallbackKo: "상위노출 정보를 불러오지 못했습니다.",
          fallbackEn: "Could not load promotion options.",
        })
      );
    } finally {
      setLoading(false);
    }
  }, [postId, domain, safeT]);

  useEffect(() => {
    if (!open) return;
    setSuccessEndAt("");
    setSuccessExtended(false);
    setSuccessReplay(false);
    setPendingReview(false);
    attemptKeys.current.reset();
    void load();
  }, [open, load]);

  /**
   * 설계 2026-11-08 ⑨ (거래 광고 창 시안 v3 와 같음): 모자란 상품 줄은 고를 수 없다.
   * 예외 — 결과를 모르는 결제 상품(재감사 R-01)은 잔액이 줄어도 그대로 고른다(같은 키로 다시 확인).
   */
  const pendingProductId = attemptKeys.current.pendingProductFor(postId);
  const canBuyItem = useCallback(
    (c: CatalogItem) => c.id === pendingProductId || (balance != null && balance >= c.pointCost),
    [balance, pendingProductId]
  );
  const selected = useMemo(
    () => catalog.find((c) => c.id === productId && canBuyItem(c)) ?? null,
    [catalog, productId, canBuyItem]
  );
  const cost = selected?.pointCost ?? 0;
  /** 고를 수 있는 상품이 없을 때 충전 화면에 넘길 부족분 = 가장 적게 모자란 양 */
  const minShortage = catalog.reduce((min, c) => {
    const sh = balance != null ? Math.max(0, c.pointCost - balance) : 0;
    return sh > 0 && (min === 0 || sh < min) ? sh : min;
  }, 0);
  /**
   * 재감사 R2 (Owner 「기간 이전에 추가 포인트를 결제하고 추가 신청하면 연장」 · D-4 커뮤니티 같은 규칙):
   * 홍보 중(active)이면 같은 상품 줄로 연장. 심사 중·일시정지면 상태만 보여 준다.
   */
  const statusOnly = pendingExisting || pausedExisting;
  const extending = Boolean(activeEndAt) && !statusOnly;
  const extendEndOf = (days: number) => {
    const end = activeEndAt ? Date.parse(activeEndAt) : NaN;
    return Number.isFinite(end) ? new Date(end + days * 86_400_000) : null;
  };

  const purchase = async () => {
    if (!selected || busy) return;
    setBusy(true);
    setErr("");
    const idem = attemptKeys.current.keyFor(postId, selected.id);
    let status: number | null = null;
    try {
      const res = await fetch("/api/me/points/promotion-orders", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idem,
        },
        body: JSON.stringify({
          targetType: domain === "community" ? "community_post" : "product",
          targetId: postId,
          targetTitle: postTitle,
          productId: selected.id,
          idempotencyKey: idem,
          /** 화면에 보였던 금액·기간 — 그 사이 어드민이 바꿨으면 결제 없이 409 price_changed */
          expectedPointCost: selected.pointCost,
          expectedDurationDays: selected.durationDays,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        code?: string;
        endAt?: string;
        balanceAfter?: number;
        pendingReview?: boolean;
        status?: string;
        extended?: boolean;
        idempotent?: boolean;
      };
      status = res.status;
      /** 성공 응답인데 본문을 못 읽음 = 결과를 모름 → 키 유지 */
      if (res.ok && typeof j.ok !== "boolean") status = null;
      if (!res.ok || !j.ok) {
        if (j.error === "insufficient_balance" || j.code === "insufficient_balance") {
          setErr(
            safeT("points_ui_insufficient", {
              fallbackKo: "포인트가 부족합니다.",
              fallbackEn: "Not enough Point.",
            })
          );
        } else if (j.error === "price_changed") {
          /** 새 가격을 다시 읽은 뒤 안내 (다시 읽기가 안내를 지우지 않게 순서 고정) */
          void load().then(() =>
            setErr(
              safeT("promo_price_changed", {
                fallbackKo: "가격이 바뀌었어요. 새 가격을 확인해 주세요.",
                fallbackEn: "The price has changed. Please check the new price.",
              })
            )
          );
        } else if (j.error === "already_active_promotion") {
          setErr(
            safeT("points_ui_promotion_conflict", {
              fallbackKo: "이미 광고 중이거나 운영자가 잠시 멈춘 글입니다.",
              fallbackEn: "This post already has an active or pending promotion.",
            })
          );
        } else {
          setErr(
            safeT("promo_sheet_purchase_failed", {
              fallbackKo: "상위노출 결제에 실패했습니다.",
              fallbackEn: "Promotion purchase failed.",
            })
          );
        }
        return;
      }
      if (typeof j.balanceAfter === "number") setBalance(j.balanceAfter);
      setPendingReview(j.pendingReview === true || j.status === "pending_review");
      setSuccessExtended(j.extended === true);
      setSuccessReplay(j.idempotent === true);
      setSuccessEndAt(j.endAt ?? "");
      onPurchased?.();
    } catch {
      /** 응답을 못 받음 = 결제됐는지 모름 → 키를 유지하고 상태를 다시 불러온다 (다시 누르면 같은 결제로 확인) */
      await load();
      setErr(
        safeT("promo_purchase_unconfirmed", {
          fallbackKo: "결제 결과를 확인하지 못했어요. 상태를 다시 불러왔어요. 다시 눌러도 같은 결제로 확인해서 두 번 결제되지 않아요.",
          fallbackEn: "We could not confirm the payment. Status was reloaded. Tapping again checks the same payment, so you will not be charged twice.",
        })
      );
    } finally {
      attemptKeys.current.settleIfFinal(status);
      setBusy(false);
    }
  };

  const langEn = language === "en";
  const sheetTitle =
    domain === "community"
      ? safeT("promo_sheet_title_community", {
          fallbackKo: "Community 상위노출",
          fallbackEn: "Community top exposure",
        })
      : safeT("promo_sheet_title_trade", {
          fallbackKo: "거래 상위노출",
          fallbackEn: "Trade top exposure",
        });

  /** 충전 화면: 고른 상품에 모자란 만큼(`need`) · 돌아올 주소(거래 광고 창과 같은 경로) */
  const chargeHref = (() => {
    const qs = new URLSearchParams();
    if (minShortage > 0) qs.set("need", String(minShortage));
    if (typeof window !== "undefined") qs.set("returnTo", `${window.location.pathname}${window.location.search}`);
    const q = qs.toString();
    return q ? `/mypage/points/charge?${q}` : "/mypage/points/charge";
  })();
  const fmtP = (n: number) => `${Math.max(0, Math.floor(n)).toLocaleString(langEn ? "en-US" : "ko-KR")}P`;

  /**
   * Owner 2026-11-07 「포인트 사용을 위한 불필요한 설명이 너무 많다 — 정확한 버튼」:
   * 버튼 하나 = 고른 상품 금액으로 시작·연장(「10,000P로 시작」) · 모자라면 그 자리에서 충전.
   */
  const catalogFooter =
    successEndAt || loading ? null : statusOnly ? (
      <div className={OverlayUi.actionsRow}>
        <DibayOverlayButton roleTone="secondary" onClick={onClose}>
          {t("common_confirm")}
        </DibayOverlayButton>
      </div>
    ) : (
      <div className={OverlayUi.actionsRow}>
        {!selected ? (
          <a href={chargeHref} className={`${OverlayUi.btn.primary} text-center`} data-promo-sheet-charge="1">
            {safeT("promo_sheet_go_points", {
              fallbackKo: "포인트 충전",
              fallbackEn: "Add Point",
            })}
          </a>
        ) : (
          <DibayOverlayButton
            roleTone="primary"
            disabled={busy}
            loading={busy}
            onClick={() => void purchase()}
          >
            {busy
              ? t("common_loading")
              : extending
                ? t("trade_ad_extend", { points: fmtP(cost) })
                : t("trade_ad_start", { points: fmtP(cost) })}
          </DibayOverlayButton>
        )}
      </div>
    );

  const successFooter = successEndAt ? (
    <div className={OverlayUi.actionsRow}>
      <DibayOverlayButton roleTone="primary" onClick={onClose}>
        {t("common_confirm")}
      </DibayOverlayButton>
    </div>
  ) : null;

  return (
    <DibayBottomSheet
      open={open}
      onClose={onClose}
      title={sheetTitle}
      footer={successFooter ?? catalogFooter}
    >
      <p className={`mb-2 line-clamp-2 ${OverlayUi.bodySecondary}`}>{postTitle}</p>
      {!successEndAt && !statusOnly ? (
        <div
          className="mb-2.5 flex items-center gap-2.5 rounded-ui-rect border border-[color:var(--currency-point-border)] bg-[color:var(--currency-point-bg)] px-3.5 py-3"
          data-promo-sheet-balance="1"
        >
          <span className="text-[13px] text-sam-muted">{t("trade_ad_my_points")}</span>
          <span className="ml-auto text-[22px] font-extrabold tabular-nums text-sam-fg">
            {balance == null ? "—" : fmtP(balance)}
          </span>
          <a
            href={chargeHref}
            className="inline-flex h-8 shrink-0 items-center rounded-ui-rect border border-sam-primary px-3 text-[13px] font-bold text-sam-primary"
          >
            {t("trade_ad_charge_small")}
          </a>
        </div>
      ) : null}

      {successEndAt ? (
        <div className="rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-secondary)] p-4">
          <p className="text-[length:var(--overlay-body-2-size)] font-semibold text-[color:var(--overlay-text-primary)]">
            {pendingReview
              ? safeT("promo_sheet_pending_success", {
                  fallbackKo: "상위노출 신청이 접수되었습니다. 관리자 승인 후 노출됩니다.",
                  fallbackEn: "Promotion request submitted. It goes live after admin approval.",
                })
              : successReplay
                ? safeT("promo_purchase_already_done", {
                    fallbackKo: "이미 처리된 결제예요. 추가로 결제되지 않았어요.",
                    fallbackEn: "This payment was already processed. No extra charge.",
                  })
                : successExtended
                ? safeT("promo_sheet_extended_success", {
                    fallbackKo: "상위노출 기간을 늘렸습니다.",
                    fallbackEn: "Promotion extended.",
                  })
                : safeT("promo_sheet_success", {
                    fallbackKo: "상위노출이 시작되었습니다.",
                    fallbackEn: "Promotion started.",
                  })}
          </p>
          <p className={`mt-1 ${OverlayUi.bodySecondary}`}>
            {pendingReview
              ? safeT("promo_sheet_pending_period", {
                  fallbackKo: "승인 시 적용 기간",
                  fallbackEn: "Period after approval",
                })
              : safeT("promo_sheet_ends_at", {
                  fallbackKo: "종료일",
                  fallbackEn: "Ends",
                })}
            {": "}
            {formatPhtDisplayDateTime(successEndAt, langEn ? "en" : "ko")}
          </p>
          {balance != null ? (
            <p className={`mt-1 ${OverlayUi.bodySecondary}`}>
              {safeT("promo_sheet_balance_after", {
                fallbackKo: "결제 후 잔액",
                fallbackEn: "Balance after",
              })}
              {": "}
              <CurrencyAmount currency="point" amount={balance} compactPoint className="font-medium" />
            </p>
          ) : null}
        </div>
      ) : loading ? (
        <p className={`py-8 text-center ${OverlayUi.bodySecondary}`}>{t("common_loading")}</p>
      ) : statusOnly ? (
        <div className="rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-secondary)] p-4">
          <p className="text-[length:var(--overlay-body-2-size)] font-semibold text-[color:var(--overlay-text-primary)]">
            {pendingExisting
              ? safeT("promo_sheet_pending_existing", {
                  fallbackKo: "심사 중",
                  fallbackEn: "Under review",
                })
              : safeT("promo_sheet_paused_existing", {
                  fallbackKo: "운영자가 잠시 멈춤",
                  fallbackEn: "Paused by staff",
                })}
          </p>
          {activeEndAt ? (
            <p className={`mt-1 ${OverlayUi.bodySecondary}`}>
              {safeT("promo_sheet_ends_at", {
                fallbackKo: "종료",
                fallbackEn: "Ends",
              })}
              {": "}
              {formatPhtDisplayDateTime(activeEndAt, langEn ? "en" : "ko")}
            </p>
          ) : null}
          <p className={`mt-2 ${OverlayUi.caption}`}>
            {pausedExisting
              ? safeT("promo_sheet_paused_note", {
                  fallbackKo: "운영자가 다시 시작하면 연장할 수 있어요.",
                  fallbackEn: "You can extend after staff resumes it.",
                })
              : safeT("promo_sheet_no_stack", {
                  fallbackKo: "광고 기간이 끝나면 다시 결제할 수 있습니다.",
                  fallbackEn: "You can apply again after the current promotion ends or is decided.",
                })}
          </p>
        </div>
      ) : (
        <>
          {extending && activeEndAt ? (
            <p className={`mb-2 ${OverlayUi.bodySecondary}`} data-promo-sheet-running="1">
              {safeT("promo_sheet_already_active", { fallbackKo: "광고 중", fallbackEn: "Promotion active" })}
              {" · "}
              {t("trade_ad_ends", { date: formatPhtDisplayDateTime(activeEndAt, langEn ? "en" : "ko") })}
            </p>
          ) : null}
          <div role="radiogroup" aria-label={sheetTitle} className="space-y-1.5">
            {catalog.map((item) => {
              const newEnd = extending ? extendEndOf(item.durationDays) : null;
              const title = extending
                ? t("promo_sheet_extend_title", { days: String(item.durationDays) })
                : langEn
                  ? item.fallbackTitleEn
                  : item.fallbackTitleKo;
              /** 한 줄: 연장이면 끝나는 날 · 아니면 노출 위치(위쪽 1자리 = 가장 최근 결제 · D-08 뜻 유지) */
              const where = newEnd
                ? t("promo_sheet_extend_new_end", { date: formatPhtDisplayDateTime(newEnd, langEn ? "en" : "ko") })
                : t("promo_sheet_where_community");
              const short = balance != null ? Math.max(0, item.pointCost - balance) : 0;
              const enabled = canBuyItem(item);
              const selectedNow = enabled && item.id === selected?.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={selectedNow}
                  disabled={!enabled}
                  onClick={() => enabled && setProductId(item.id)}
                  data-selected={selectedNow ? "true" : undefined}
                  data-promo-sheet-option-state={selectedNow ? "selected" : enabled ? "enabled" : "disabled"}
                  className={`flex min-h-14 w-full items-center gap-2.5 rounded-ui-rect border px-3 py-2.5 text-left ${
                    selectedNow
                      ? "border-2 border-sam-primary bg-sam-pressed-surface"
                      : enabled
                        ? "border-sam-border bg-sam-surface"
                        : "border-sam-border bg-sam-app"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`h-5 w-5 shrink-0 rounded-full border-2 ${
                      selectedNow
                        ? "border-[6px] border-sam-primary"
                        : enabled
                          ? "border-sam-border"
                          : "border-sam-border-soft bg-sam-surface-muted"
                    }`}
                  />
                  <span className={`min-w-0 flex-1 text-[15px] font-semibold ${enabled ? "text-sam-fg" : "text-sam-muted"}`}>
                    {title}
                    <span className="block text-[12px] font-normal text-sam-muted">{where}</span>
                  </span>
                  <span className="shrink-0 text-right tabular-nums">
                    <span className={`block text-[15px] font-bold ${enabled ? "text-sam-fg" : "text-sam-muted"}`}>
                      {fmtP(item.pointCost)}
                    </span>
                    {short > 0 ? (
                      <span className="block text-[12px] font-bold text-sam-danger" data-promo-sheet-short>
                        {t("trade_ad_short", { points: fmtP(short) })}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
          {extending ? <p className={`mt-2 ${OverlayUi.bodySecondary}`}>{t("trade_ad_extend_keeps_place")}</p> : null}
          {err ? <p className={`mt-2 ${OverlayUi.captionDanger}`}>{err}</p> : null}
        </>
      )}
    </DibayBottomSheet>
  );
}
