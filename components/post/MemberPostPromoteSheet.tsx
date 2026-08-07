"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import type { MemberPromotionProductId } from "@/lib/points/promotion-products";

function clientIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `promo-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

type CatalogItem = {
  id: MemberPromotionProductId;
  durationDays: number;
  pointCost: number;
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
};

export function MemberPostPromoteSheet({
  postId,
  postTitle,
  open,
  onClose,
  onPurchased,
}: Props) {
  const { t, language, safeT } = useI18n();
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [productId, setProductId] = useState<MemberPromotionProductId>("trade_promote_7");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [successEndAt, setSuccessEndAt] = useState("");
  const [activeEndAt, setActiveEndAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const [promoRes, balRes] = await runSingleFlight(`member-promote:${postId}`, () =>
        Promise.all([
          fetch(`/api/me/points/promotion-orders?catalog=1&targetId=${encodeURIComponent(postId)}`, {
            cache: "no-store",
            credentials: "include",
          }),
          fetch("/api/me/points", { cache: "no-store", credentials: "include" }),
        ])
      );
      const promoJ = (await promoRes.json().catch(() => ({}))) as {
        catalog?: CatalogItem[];
        activeForTarget?: { endAt?: string; orderStatus?: string } | null;
      };
      const balJ = (await balRes.json().catch(() => ({}))) as {
        balance?: number;
        points?: number;
      };
      const items = Array.isArray(promoJ.catalog) ? promoJ.catalog : [];
      setCatalog(items);
      if (items[0]?.id) setProductId(items[0].id);
      const bal = Number(balJ.balance ?? balJ.points);
      setBalance(Number.isFinite(bal) ? bal : null);
      const activeEnd = promoJ.activeForTarget?.endAt?.trim() || null;
      setActiveEndAt(activeEnd);
    } catch {
      setErr(
        safeT("promo_sheet_load_failed", {
          fallbackKo: "홍보 정보를 불러오지 못했습니다.",
          fallbackEn: "Could not load promotion options.",
        })
      );
    } finally {
      setLoading(false);
    }
  }, [postId, safeT]);

  useEffect(() => {
    if (!open) return;
    setSuccessEndAt("");
    void load();
  }, [open, load]);

  const selected = useMemo(
    () => catalog.find((c) => c.id === productId) ?? catalog[0] ?? null,
    [catalog, productId]
  );
  const cost = selected?.pointCost ?? 0;
  const insufficient = balance != null && balance < cost;

  const purchase = async () => {
    if (!selected || busy || insufficient) return;
    setBusy(true);
    setErr("");
    const idem = clientIdempotencyKey();
    try {
      const res = await fetch("/api/me/points/promotion-orders", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idem,
        },
        body: JSON.stringify({
          targetType: "product",
          targetId: postId,
          targetTitle: postTitle,
          productId: selected.id,
          idempotencyKey: idem,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        code?: string;
        endAt?: string;
        balanceAfter?: number;
      };
      if (!res.ok || !j.ok) {
        if (j.error === "insufficient_balance" || j.code === "insufficient_balance") {
          setErr(
            safeT("points_ui_insufficient", {
              fallbackKo: "D-Point가 부족합니다.",
              fallbackEn: "Not enough D-Point.",
            })
          );
        } else if (j.error === "already_active_promotion") {
          setErr(
            safeT("points_ui_promotion_conflict", {
              fallbackKo: "이미 홍보 중인 게시물입니다.",
              fallbackEn: "This post is already being promoted.",
            })
          );
        } else {
          setErr(
            safeT("promo_sheet_purchase_failed", {
              fallbackKo: "홍보 구매에 실패했습니다.",
              fallbackEn: "Promotion purchase failed.",
            })
          );
        }
        return;
      }
      if (typeof j.balanceAfter === "number") setBalance(j.balanceAfter);
      setSuccessEndAt(j.endAt ?? "");
      onPurchased?.();
    } catch {
      setErr(
        safeT("promo_sheet_purchase_failed", {
          fallbackKo: "홍보 구매에 실패했습니다.",
          fallbackEn: "Promotion purchase failed.",
        })
      );
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const langEn = language === "en";

  return (
    <div className="fixed inset-0 z-[46] flex items-end justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-label={t("ui_sheet_close_aria")}
      />
      <div className="relative w-full max-w-lg rounded-t-[length:var(--ui-radius-rect)] bg-sam-surface px-4 pb-8 pt-2 shadow-xl">
        <div className="mx-auto mb-3 mt-1 h-1 w-10 shrink-0 rounded-full bg-sam-surface-muted" aria-hidden />
        <h2 className="mb-1 px-1 sam-text-body-lg font-semibold text-sam-fg">
          {safeT("promo_sheet_title", {
            fallbackKo: "게시물 더 알리기",
            fallbackEn: "Promote this post",
          })}
        </h2>
        <p className="mb-3 line-clamp-2 px-1 sam-text-body-secondary text-sam-muted">{postTitle}</p>

        {successEndAt ? (
          <div className="rounded-ui-rect border border-sam-border bg-sam-app p-4">
            <p className="sam-text-body font-semibold text-sam-fg">
              {safeT("promo_sheet_success", {
                fallbackKo: "홍보가 시작되었습니다.",
                fallbackEn: "Promotion started.",
              })}
            </p>
            <p className="mt-1 sam-text-body-secondary text-sam-muted">
              {safeT("promo_sheet_ends_at", {
                fallbackKo: "종료일",
                fallbackEn: "Ends",
              })}
              {": "}
              {new Date(successEndAt).toLocaleString(langEn ? "en-US" : "ko-KR")}
            </p>
            {balance != null ? (
              <p className="mt-1 sam-text-body-secondary text-sam-muted">
                {safeT("promo_sheet_balance_after", {
                  fallbackKo: "결제 후 잔액",
                  fallbackEn: "Balance after",
                })}
                {": "}
                {balance.toLocaleString()}P
              </p>
            ) : null}
            <button
              type="button"
              className="mt-4 w-full rounded-ui-rect bg-signature py-3 sam-text-body font-medium text-white"
              onClick={onClose}
            >
              {t("common_confirm")}
            </button>
          </div>
        ) : loading ? (
          <p className="py-8 text-center sam-text-body text-sam-muted">{t("common_loading")}</p>
        ) : activeEndAt ? (
          <div className="rounded-ui-rect border border-sam-border bg-sam-app p-4">
            <p className="sam-text-body font-semibold text-sam-fg">
              {safeT("promo_sheet_already_active", {
                fallbackKo: "홍보 중",
                fallbackEn: "Promotion active",
              })}
            </p>
            <p className="mt-1 sam-text-body-secondary text-sam-muted">
              {safeT("promo_sheet_ends_at", {
                fallbackKo: "종료",
                fallbackEn: "Ends",
              })}
              {": "}
              {new Date(activeEndAt).toLocaleString(langEn ? "en-US" : "ko-KR")}
            </p>
            <p className="mt-2 sam-text-helper text-sam-muted">
              {safeT("promo_sheet_no_stack", {
                fallbackKo: "활성 홍보가 끝나면 다시 구매할 수 있습니다.",
                fallbackEn: "You can purchase again after this promotion ends.",
              })}
            </p>
            <button
              type="button"
              className="mt-4 w-full rounded-ui-rect border border-sam-border py-3 sam-text-body font-medium text-sam-fg"
              onClick={onClose}
            >
              {t("common_confirm")}
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {catalog.map((item) => {
                const title = langEn ? item.fallbackTitleEn : item.fallbackTitleKo;
                const desc = langEn ? item.fallbackDescEn : item.fallbackDescKo;
                const selectedNow = item.id === (selected?.id ?? productId);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setProductId(item.id)}
                    className={`w-full rounded-ui-rect border px-3 py-3 text-left ${
                      selectedNow
                        ? "border-sam-primary bg-sam-primary/5"
                        : "border-sam-border bg-sam-app"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="sam-text-body font-semibold text-sam-fg">{title}</span>
                      <span className="sam-text-body font-semibold text-sam-fg">
                        {item.pointCost.toLocaleString()}P
                      </span>
                    </div>
                    <p className="mt-1 sam-text-helper text-sam-muted">{desc}</p>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 rounded-ui-rect border border-sam-border bg-sam-app p-3">
              <p className="sam-text-body-secondary text-sam-muted">
                {safeT("promo_sheet_balance", {
                  fallbackKo: "보유 D-Point",
                  fallbackEn: "Your D-Point",
                })}
                {": "}
                <span className="font-semibold text-sam-fg">
                  {balance == null ? "—" : `${balance.toLocaleString()}P`}
                </span>
              </p>
              {selected && balance != null && !insufficient ? (
                <p className="mt-1 sam-text-helper text-sam-muted">
                  {safeT("promo_sheet_balance_remain", {
                    fallbackKo: "결제 후 예상 잔액",
                    fallbackEn: "Estimated balance after",
                  })}
                  {": "}
                  {(balance - cost).toLocaleString()}P
                </p>
              ) : null}
              {insufficient ? (
                <p className="mt-2 sam-text-body-secondary font-medium text-red-600">
                  {safeT("points_ui_insufficient", {
                    fallbackKo: "D-Point가 부족합니다.",
                    fallbackEn: "Not enough D-Point.",
                  })}
                </p>
              ) : null}
              {err ? <p className="mt-2 sam-text-body-secondary text-red-600">{err}</p> : null}
            </div>

            <div className="mt-3 flex gap-2">
              {insufficient ? (
                <a
                  href="/mypage/points"
                  className="flex-1 rounded-ui-rect border border-sam-border py-3 text-center sam-text-body font-medium text-sam-fg"
                >
                  {safeT("promo_sheet_go_points", {
                    fallbackKo: "D-Point 충전",
                    fallbackEn: "Add D-Point",
                  })}
                </a>
              ) : null}
              <button
                type="button"
                disabled={busy || !selected || insufficient || catalog.length === 0}
                onClick={() => void purchase()}
                className="flex-1 rounded-ui-rect bg-signature py-3 sam-text-body font-medium text-white disabled:opacity-50"
              >
                {busy
                  ? t("common_loading")
                  : safeT("promo_sheet_cta", {
                      fallbackKo: `${cost.toLocaleString()} D-Point로 홍보하기`,
                      fallbackEn: `Promote with ${cost.toLocaleString()} D-Point`,
                    })}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
