"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { CurrencyAmount } from "@/components/currency";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import type { MemberPromotionProductId } from "@/lib/points/promotion-products";
import { DibayBottomSheet, DibayOverlayButton } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

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
  const [productId, setProductId] = useState<MemberPromotionProductId>(
    domain === "community" ? "community_promote_3" : "trade_promote_7"
  );
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [successEndAt, setSuccessEndAt] = useState("");
  const [pendingReview, setPendingReview] = useState(false);
  const [activeEndAt, setActiveEndAt] = useState<string | null>(null);
  const [pendingExisting, setPendingExisting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const [promoRes, balRes] = await runSingleFlight(`member-promote:${domain}:${postId}`, () =>
        Promise.all([
          fetch(
            `/api/me/points/promotion-orders?catalog=1&domain=${encodeURIComponent(domain)}&targetId=${encodeURIComponent(postId)}`,
            {
              cache: "no-store",
              credentials: "include",
            }
          ),
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
      const st = String(promoJ.activeForTarget?.orderStatus ?? "").toLowerCase();
      const activeEnd = promoJ.activeForTarget?.endAt?.trim() || null;
      if (st === "pending_review" || st === "pending") {
        setPendingExisting(true);
        setActiveEndAt(activeEnd);
      } else {
        setPendingExisting(false);
        setActiveEndAt(st === "active" ? activeEnd : null);
      }
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
  }, [postId, domain, safeT]);

  useEffect(() => {
    if (!open) return;
    setSuccessEndAt("");
    setPendingReview(false);
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
          targetType: domain === "community" ? "community_post" : "product",
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
        pendingReview?: boolean;
        status?: string;
      };
      if (!res.ok || !j.ok) {
        if (j.error === "insufficient_balance" || j.code === "insufficient_balance") {
          setErr(
            safeT("points_ui_insufficient", {
              fallbackKo: "포인트가 부족합니다.",
              fallbackEn: "Not enough Point.",
            })
          );
        } else if (j.error === "already_active_promotion") {
          setErr(
            safeT("points_ui_promotion_conflict", {
              fallbackKo: "이미 홍보 중이거나 심사 중인 게시물입니다.",
              fallbackEn: "This post already has an active or pending promotion.",
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
      setPendingReview(j.pendingReview === true || j.status === "pending_review");
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

  const catalogFooter =
    successEndAt || loading ? null : activeEndAt || pendingExisting ? (
      <div className={OverlayUi.actionsRow}>
        <DibayOverlayButton roleTone="secondary" onClick={onClose}>
          {t("common_confirm")}
        </DibayOverlayButton>
      </div>
    ) : (
      <div className={OverlayUi.actionsRow}>
        {insufficient ? (
          <a href="/mypage/points" className={`${OverlayUi.btn.secondary} text-center`}>
            {safeT("promo_sheet_go_points", {
              fallbackKo: "포인트 충전",
              fallbackEn: "Add Point",
            })}
          </a>
        ) : null}
        <DibayOverlayButton
          roleTone="primary"
          disabled={busy || !selected || insufficient || catalog.length === 0}
          loading={busy}
          onClick={() => void purchase()}
        >
          {busy
            ? t("common_loading")
            : safeT("promo_sheet_cta", {
                fallbackKo: `${cost.toLocaleString()} 포인트로 신청`,
                fallbackEn: `Apply with ${cost.toLocaleString()} Point`,
              })}
        </DibayOverlayButton>
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
      anchor="above-bottom-nav"
      footer={successFooter ?? catalogFooter}
    >
      <p className={`mb-2 line-clamp-2 ${OverlayUi.bodySecondary}`}>{postTitle}</p>

      {successEndAt ? (
        <div className="rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-secondary)] p-4">
          <p className="text-sm font-semibold text-[color:var(--overlay-text-primary)]">
            {pendingReview
              ? safeT("promo_sheet_pending_success", {
                  fallbackKo: "홍보 신청이 접수되었습니다. 관리자 승인 후 노출됩니다.",
                  fallbackEn: "Promotion request submitted. It goes live after admin approval.",
                })
              : safeT("promo_sheet_success", {
                  fallbackKo: "홍보가 시작되었습니다.",
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
            {new Date(successEndAt).toLocaleString(langEn ? "en-US" : "ko-KR")}
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
      ) : activeEndAt || pendingExisting ? (
        <div className="rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-secondary)] p-4">
          <p className="text-sm font-semibold text-[color:var(--overlay-text-primary)]">
            {pendingExisting
              ? safeT("promo_sheet_pending_existing", {
                  fallbackKo: "심사 중",
                  fallbackEn: "Under review",
                })
              : safeT("promo_sheet_already_active", {
                  fallbackKo: "홍보 중",
                  fallbackEn: "Promotion active",
                })}
          </p>
          {activeEndAt ? (
            <p className={`mt-1 ${OverlayUi.bodySecondary}`}>
              {safeT("promo_sheet_ends_at", {
                fallbackKo: "종료",
                fallbackEn: "Ends",
              })}
              {": "}
              {new Date(activeEndAt).toLocaleString(langEn ? "en-US" : "ko-KR")}
            </p>
          ) : null}
          <p className={`mt-2 ${OverlayUi.caption}`}>
            {safeT("promo_sheet_no_stack", {
              fallbackKo: "활성·심사 중인 홍보가 끝나면 다시 신청할 수 있습니다.",
              fallbackEn: "You can apply again after the current promotion ends or is decided.",
            })}
          </p>
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
                  className={`w-full rounded-[length:var(--overlay-radius-md)] border px-3 py-3 text-left ${
                    selectedNow
                      ? "border-[color:var(--overlay-primary)] bg-[color:var(--overlay-primary)]/5"
                      : "border-[color:var(--overlay-border)] bg-[color:var(--overlay-secondary)]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-[color:var(--overlay-text-primary)]">{title}</span>
                    <CurrencyAmount
                      currency="point"
                      amount={item.pointCost}
                      compactPoint
                      className="text-sm"
                    />
                  </div>
                  <p className={`mt-1 ${OverlayUi.caption}`}>{desc}</p>
                </button>
              );
            })}
          </div>

          <ul
            className={`mt-3 space-y-1 rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-secondary)] px-3 py-2.5 ${OverlayUi.caption}`}
          >
            <li>
              {safeT("promo_sheet_surfaces_intro", {
                fallbackKo: "적용 위치",
                fallbackEn: "Where it appears",
              })}
            </li>
            {domain === "community" ? (
              <>
                <li>
                  ·{" "}
                  {safeT("promo_sheet_surface_community_home", {
                    fallbackKo: "커뮤니티 홈 피드 상단",
                    fallbackEn: "Community home feed top",
                  })}
                </li>
                <li>
                  ·{" "}
                  {safeT("promo_sheet_surface_community_topic", {
                    fallbackKo: "이 게시물 주제(토픽) 피드 상단",
                    fallbackEn: "This post's topic feed top",
                  })}
                </li>
                <li className="pt-1 opacity-80">
                  {safeT("promo_sheet_community_immediate_note", {
                    fallbackKo:
                      "포인트 결제 즉시 피드 상단에 노출됩니다. 관리자 승인이 없습니다.",
                    fallbackEn:
                      "Goes live at the top of the feed immediately with Point. No admin approval.",
                  })}
                </li>
              </>
            ) : (
              <>
                <li>
                  ·{" "}
                  {safeT("promo_sheet_surface_trade_home", {
                    fallbackKo: "거래 홈 목록",
                    fallbackEn: "Trade home list",
                  })}
                </li>
                <li>
                  ·{" "}
                  {safeT("promo_sheet_surface_trade_category", {
                    fallbackKo: "이 게시물의 카테고리 목록",
                    fallbackEn: "This post's category list",
                  })}
                </li>
                <li className="pt-1 opacity-80">
                  {safeT("promo_sheet_not_top_pin", {
                    fallbackKo: "커뮤니티 상단 고정·피드 광고와는 다른 기능입니다.",
                    fallbackEn: "Different from Community top-pin and Feed ads.",
                  })}
                </li>
              </>
            )}
          </ul>

          <div className="mt-4 rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-secondary)] p-3">
            <p className={OverlayUi.bodySecondary}>
              {safeT("promo_sheet_balance", {
                fallbackKo: "보유 포인트",
                fallbackEn: "Your Point",
              })}
              {": "}
              {balance == null ? (
                <span className="font-semibold text-[color:var(--overlay-text-primary)]">—</span>
              ) : (
                <CurrencyAmount currency="point" amount={balance} compactPoint className="font-semibold" />
              )}
            </p>
            {selected && balance != null && !insufficient ? (
              <p className={`mt-1 ${OverlayUi.caption}`}>
                {safeT("promo_sheet_balance_remain", {
                  fallbackKo: "결제 후 예상 잔액",
                  fallbackEn: "Estimated balance after",
                })}
                {": "}
                <CurrencyAmount
                  currency="point"
                  amount={balance - cost}
                  compactPoint
                  className="font-medium"
                />
              </p>
            ) : null}
            {insufficient ? (
              <p className="mt-2 text-sm font-medium text-[color:var(--overlay-danger)]">
                {safeT("points_ui_insufficient", {
                  fallbackKo: "포인트가 부족합니다.",
                  fallbackEn: "Not enough Point.",
                })}
              </p>
            ) : null}
            {err ? <p className="mt-2 text-sm text-[color:var(--overlay-danger)]">{err}</p> : null}
          </div>
        </>
      )}
    </DibayBottomSheet>
  );
}
