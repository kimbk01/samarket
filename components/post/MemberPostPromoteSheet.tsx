"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { CurrencyAmount } from "@/components/currency";
import { runSingleFlight } from "@/lib/http/run-single-flight";
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
    setSuccessExtended(false);
    setSuccessReplay(false);
    setPendingReview(false);
    attemptKeys.current.reset();
    void load();
  }, [open, load]);

  const selected = useMemo(
    () => catalog.find((c) => c.id === productId) ?? catalog[0] ?? null,
    [catalog, productId]
  );
  const cost = selected?.pointCost ?? 0;
  const insufficient = balance != null && balance < cost;
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
    if (!selected || busy || insufficient) return;
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

  const catalogFooter =
    successEndAt || loading ? null : statusOnly ? (
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
            : extending
              ? safeT("promo_sheet_extend_cta", {
                  fallbackKo: "포인트로 연장하기",
                  fallbackEn: "Extend with Point",
                })
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
      footer={successFooter ?? catalogFooter}
    >
      <p className={`mb-2 line-clamp-2 ${OverlayUi.bodySecondary}`}>{postTitle}</p>

      {successEndAt ? (
        <div className="rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-secondary)] p-4">
          <p className="text-[length:var(--overlay-body-2-size)] font-semibold text-[color:var(--overlay-text-primary)]">
            {pendingReview
              ? safeT("promo_sheet_pending_success", {
                  fallbackKo: "홍보 신청이 접수되었습니다. 관리자 승인 후 노출됩니다.",
                  fallbackEn: "Promotion request submitted. It goes live after admin approval.",
                })
              : successReplay
                ? safeT("promo_purchase_already_done", {
                    fallbackKo: "이미 처리된 결제예요. 추가로 결제되지 않았어요.",
                    fallbackEn: "This payment was already processed. No extra charge.",
                  })
                : successExtended
                ? safeT("promo_sheet_extended_success", {
                    fallbackKo: "홍보 기간을 늘렸습니다.",
                    fallbackEn: "Promotion extended.",
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
              {new Date(activeEndAt).toLocaleString(langEn ? "en-US" : "ko-KR")}
            </p>
          ) : null}
          <p className={`mt-2 ${OverlayUi.caption}`}>
            {pausedExisting
              ? safeT("promo_sheet_paused_note", {
                  fallbackKo: "운영자가 다시 시작하면 연장할 수 있어요.",
                  fallbackEn: "You can extend after staff resumes it.",
                })
              : safeT("promo_sheet_no_stack", {
                  fallbackKo: "활성·심사 중인 홍보가 끝나면 다시 신청할 수 있습니다.",
                  fallbackEn: "You can apply again after the current promotion ends or is decided.",
                })}
          </p>
        </div>
      ) : (
        <>
          {extending ? (
            <div className="mb-3 rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-secondary)] p-4">
              <p className="text-[length:var(--overlay-body-2-size)] font-semibold text-[color:var(--overlay-text-primary)]">
                {domain === "community"
                  ? safeT("promo_sheet_already_active", {
                      fallbackKo: "홍보 중",
                      fallbackEn: "Promotion active",
                    })
                  : safeT("promo_sheet_already_active_trade", {
                      fallbackKo: "광고 중",
                      fallbackEn: "Ad active",
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
                {safeT("promo_sheet_extend_note", {
                  fallbackKo: "기간 중 다시 결제하면 끝나는 날이 늘어나요. 목록 자리(순서)는 그대로예요.",
                  fallbackEn: "Paying again during the period extends the end date. Your place in the list stays the same.",
                })}
              </p>
            </div>
          ) : null}
          <div className="space-y-2">
            {catalog.map((item) => {
              const newEnd = extending ? extendEndOf(item.durationDays) : null;
              const title = extending
                ? t("promo_sheet_extend_title", { days: String(item.durationDays) })
                : langEn
                  ? item.fallbackTitleEn
                  : item.fallbackTitleKo;
              const desc = newEnd
                ? t("promo_sheet_extend_new_end", { date: newEnd.toLocaleString(langEn ? "en-US" : "ko-KR") })
                : langEn
                  ? item.fallbackDescEn
                  : item.fallbackDescKo;
              const selectedNow = item.id === (selected?.id ?? productId);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setProductId(item.id)}
                  data-selected={selectedNow ? "true" : undefined}
                  className={`${OverlayUi.selectCard} !flex-col !items-stretch !gap-0`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[length:var(--overlay-body-2-size)] font-semibold text-[color:var(--overlay-text-primary)]">{title}</span>
                    <CurrencyAmount
                      currency="point"
                      amount={item.pointCost}
                      compactPoint
                      className="text-[length:var(--overlay-body-2-size)]"
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
                <li className="pt-1">
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
                <li className="pt-1">
                  {safeT("promo_sheet_trade_ad_label_note", {
                    fallbackKo: "노출 중인 글은 거래 목록에 ‘광고’로 표시돼요.",
                    fallbackEn: "While live, your listing shows an “Ad” label in Trade lists.",
                  })}
                </li>
                <li>
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
              <p className={`mt-2 ${OverlayUi.captionDanger}`}>
                {safeT("points_ui_insufficient", {
                  fallbackKo: "포인트가 부족합니다.",
                  fallbackEn: "Not enough Point.",
                })}
              </p>
            ) : null}
            {err ? <p className={`mt-2 ${OverlayUi.captionDanger}`}>{err}</p> : null}
          </div>
        </>
      )}
    </DibayBottomSheet>
  );
}
