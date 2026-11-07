"use client";

import { useEffect, useState } from "react";
import { newOwnerFormRequestKey } from "@/lib/business/owner-form-request-key";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { PointPlan, PointPaymentMethod } from "@/lib/types/point";
import { CUSTOMER_CENTER_FORM_COLUMN_CLASS } from "@/lib/mypage/customer-center-layout";
import { DibayBottomSheet, DibayOverlayButton } from "@/components/ui/dibay-overlay";
import { CurrencyAmount } from "@/components/currency";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import { MyStickyCta } from "@/components/mypage/ds/MyStickyCta";
import { useMypageSubmitGuard } from "@/lib/mypage/use-mypage-submit-guard";
import { formatMypageMoney, formatMypageNumber } from "@/lib/mypage/format-mypage-date";
import { showMypageToast } from "@/lib/mypage/mypage-toast";
import { recommendChargePlanId } from "@/lib/points/ad-shortage";
import { useAppleIapTopUp } from "@/lib/apple-iap/use-apple-iap-top-up";
import { appleIapPhaseBlocksNewPurchase } from "@/lib/apple-iap/apple-iap-contract";
import { AppleIapStatusNotice } from "@/components/apple-iap/AppleIapStatusNotice";
import Link from "next/link";
import { Sam } from "@/lib/ui/sam-component-classes";
import { usePointChargeMode } from "@/components/points/use-point-charge-mode";
import { POINT_CHARGE_APP_UPDATE_HREF, isIosPointChargeBlockedResponse } from "@/lib/points/ios-point-charge-gate";

interface PointChargeFormProps {
  plans: PointPlan[];
  onSuccess: () => void;
  /** Apple 결제 지급 완료 후 [확인] — 없으면 onSuccess */
  onAppleCredited?: () => void;
  onClose?: () => void;
  /** page = full-screen form (CS Slice 2); sheet = legacy bottom sheet overlay */
  /** page = 자체 본문 열 · screen = `MyScreen` 안(열은 화면 틀이 소유) · sheet = 시트 */
  layout?: "page" | "screen" | "sheet";
  /** 광고하기 창에서 넘어온 부족 포인트 — 채울 수 있는 가장 작은 상품을 미리 고르고 「추천 · N P 부족」 표시 */
  recommendForPoints?: number;
}

export function PointChargeForm({
  plans: allPlans,
  onSuccess,
  onAppleCredited,
  onClose,
  layout = "sheet",
  recommendForPoints = 0,
}: PointChargeFormProps) {
  const { t, language } = useI18n();
  /** iOS 앱에 Apple 결제 모듈이 있으면 Apple 결제만 (계좌 안내 숨김 · Apple 3.1.1/3.1.3). Android·웹·구 바이너리는 기존 그대로. */
  const apple = useAppleIapTopUp({ kind: "point" });
  /**
   * D-07: iOS 앱인데 StoreKit 이 없는 구 빌드(22 이하)는 서버가 계좌 충전을 403 으로 막는다 — 같은 신호로 판정해
   * 계좌 폼 대신 「앱 업데이트」 안내. 서버 403 `ios_digital_purchase_unavailable` 응답도 같은 안내로 바꾼다.
   */
  const chargeMode = usePointChargeMode();
  const [iosBlockedByServer, setIosBlockedByServer] = useState(false);
  const iosUpdateRequired = !apple.available && (chargeMode === "ios_update_required" || iosBlockedByServer);
  const appleProductByPlanId = new Map(
    apple.products.filter((p) => p.pointPlanId).map((p) => [p.pointPlanId as string, p])
  );
  const plans = apple.available ? allPlans.filter((p) => appleProductByPlanId.has(p.id)) : allPlans;
  // 플랜 이름·설명은 화면 언어로 고른다 — 서버 언어 판정(쿠키 없음 → 기본값)에 맡기면 한국어 화면에 영문이 나왔음 (실기 2026-11-03)
  const planName = (p: PointPlan) => (language === "en" ? p.nameEn : p.nameKo) || p.name;
  const planDescription = (p: PointPlan) => (language === "en" ? p.descriptionEn : p.descriptionKo) || p.description;
  const recommendedPlanId = recommendForPoints > 0 ? recommendChargePlanId(plans, recommendForPoints) : null;
  const [pickedPlanId, setSelectedPlanId] = useState<string>(recommendedPlanId ?? plans[0]?.id ?? "");
  const selectedPlanId = plans.some((p) => p.id === pickedPlanId)
    ? pickedPlanId
    : (recommendedPlanId ?? plans[0]?.id ?? "");
  const [paymentMethod, setPaymentMethod] = useState<PointPaymentMethod>("manual_confirm");
  const [depositorName, setDepositorName] = useState("");
  const [userMemo, setUserMemo] = useState("");
  const [err, setErr] = useState("");
  /** S41 — 중복 제출 방지(진행 중 버튼 비활성+스피너, 연타 무시). */
  const guard = useMypageSubmitGuard();
  /**
   * P1 — 서버 중복 방지 키: 제출 1회당 1개 (응답 유실 후 재시도해도 같은 신청 1건).
   * 성공 후, 또는 요금제·결제수단을 바꾸면 새 키.
   */
  const [requestKey, setRequestKey] = useState(() => newOwnerFormRequestKey("point_charge"));
  useEffect(() => {
    setRequestKey(newOwnerFormRequestKey("point_charge"));
  }, [selectedPlanId, paymentMethod]);
  const submitting = guard.pending;

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);
  const totalPoint = selectedPlan
    ? selectedPlan.pointAmount + (selectedPlan.bonusPointAmount ?? 0)
    : 0;

  /** 팝업 SSOT T3 — 시트(`layout="sheet"`)일 때만 팝업 부품·토큰. page·screen 은 앱 화면 모양 그대로. */
  const overlay = layout === "sheet";
  const ovB1 = "text-[length:var(--overlay-body-1-size)] leading-[1.6]";
  const ovB2 = "text-[length:var(--overlay-body-2-size)] leading-[1.6]";
  const ovCap = "text-[length:var(--overlay-caption-size)] leading-[1.4]";
  const ovFg = "text-[color:var(--overlay-text-primary)]";
  const ovMuted = "text-[color:var(--overlay-text-secondary)]";

  const methodLabel = (m: PointPaymentMethod) =>
    m === "manual_confirm" ? t("points_ui_method_manual") : t("points_ui_method_bank");

  const appleProduct = selectedPlanId ? appleProductByPlanId.get(selectedPlanId) : undefined;
  const appleBlocked = apple.busy || appleIapPhaseBlocksNewPurchase(apple.phase);
  const appleSubmitDisabled = appleBlocked || !appleProduct;
  const submitApple = () => {
    if (appleProduct) void apple.purchase(appleProduct.productId);
  };
  const dismissApple = () => {
    if (apple.phase === "credited") (onAppleCredited ?? onSuccess)();
    apple.dismiss();
  };

  const submit = () =>
    guard.run(async () => {
      if (!selectedPlanId) return;
      if (paymentMethod === "manual_confirm" && !depositorName.trim()) {
        setErr(t("points_ui_depositor_required_err"));
        return;
      }
      setErr("");
      try {
        const res = await fetch("/api/me/points/charge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planId: selectedPlanId, paymentMethod, depositorName, userMemo, idempotencyKey: requestKey }),
        });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (isIosPointChargeBlockedResponse(res.status, j.error)) {
          setErr("");
          setIosBlockedByServer(true);
          return;
        }
        if (!res.ok || !j.ok) {
          // 서버 오류 코드는 노출하지 않는다 — 공통 실패 문구 + 실패 토스트
          setErr(t("points_ui_request_failed"));
          showMypageToast(t("points_ui_request_failed"), "error");
          return;
        }
        setRequestKey(newOwnerFormRequestKey("point_charge"));
        onSuccess();
      } catch {
        setErr(t("points_ui_request_failed"));
        showMypageToast(t("points_ui_request_failed"), "error");
      }
    });

  const iosUpdateNotice = (
    <div
      className={layout === "page" ? `${CUSTOMER_CENTER_FORM_COLUMN_CLASS} pb-4 pt-2` : undefined}
      data-testid="point-charge-ios-update-required"
    >
      <p
        className={
          overlay
            ? `rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-surface)] px-4 py-6 text-center ${ovB1} ${ovFg}`
            : "rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-6 text-center sam-text-body text-sam-fg"
        }
      >
        {t("points_charge_ios_update_required")}
      </p>
      <Link
        href={POINT_CHARGE_APP_UPDATE_HREF}
        className={`${Sam.btn.primaryCombo} ${Sam.focusRing} mt-3 flex min-h-12 w-full items-center justify-center`}
        data-testid="point-charge-ios-update-cta"
      >
        {t("points_charge_ios_update_cta")}
      </Link>
    </div>
  );

  const body = iosUpdateRequired ? iosUpdateNotice : (
    <div className={layout === "page" ? `${CUSTOMER_CENTER_FORM_COLUMN_CLASS} pb-4 pt-2` : undefined}>
      {apple.available && plans.length === 0 ? (
        <AppleIapStatusNotice
          phase={apple.phase}
          delayed={apple.delayed}
          attempt={apple.attempt}
          errorCode={apple.errorCode}
          busy={apple.busy}
          variant="mypage"
          onRecheck={() => void apple.recheck()}
          onDismiss={dismissApple}
        />
      ) : null}
      {plans.length === 0 ? (
        <p
          className={
            overlay
              ? `rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-surface)] px-4 py-6 text-center ${ovB1} ${ovMuted}`
              : "rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-6 text-center sam-text-body text-sam-muted"
          }
        >
          {!apple.available
            ? t("mypage_oa_charge_no_plans")
            : apple.loading
              ? t("apple_iap_loading")
              : t("apple_iap_unavailable")}
        </p>
      ) : (
        <>
          <p className={overlay ? `mb-2 ${ovB2} font-semibold ${ovFg}` : "mb-2 sam-text-body-secondary font-semibold text-sam-fg"}>
            {t("points_ui_select_plan")}
          </p>
          {/* 플랜 1열, 태블릿(820px) 2열 */}
          <div className={`mb-4 grid gap-2 ${layout !== "sheet" ? "md:grid-cols-2" : ""}`}>
            {plans.map((plan) => {
              const total = plan.pointAmount + (plan.bonusPointAmount ?? 0);
              const isSelected = selectedPlanId === plan.id;
              return (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => setSelectedPlanId(plan.id)}
                  aria-pressed={isSelected}
                  className={
                    overlay
                      ? `${OverlayUi.selectCard} flex-col !items-stretch`
                      : `min-h-11 w-full rounded-ui-rect border px-4 py-3 text-left transition-colors ${
                          isSelected
                            ? "border-sam-primary bg-sam-pressed-surface"
                            : "border-sam-border bg-sam-surface hover:bg-sam-app"
                        }`
                  }
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className={overlay ? `${ovB1} font-semibold ${ovFg}` : "sam-text-body font-semibold text-sam-fg"}>
                        {planName(plan)}
                      </p>
                      {plan.id === recommendedPlanId ? (
                        <p className="mt-0.5 sam-text-helper font-semibold text-sam-primary" data-point-plan-recommended>
                          {t("points_ui_plan_recommended", { points: `${formatMypageNumber(recommendForPoints)}P` })}
                        </p>
                      ) : null}
                      {planDescription(plan) ? (
                        <p
                          className={
                            overlay
                              ? `mt-0.5 break-words ${ovB2} ${ovMuted}`
                              : "mt-0.5 break-words sam-text-helper text-sam-muted"
                          }
                        >
                          {planDescription(plan)}
                        </p>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <CurrencyAmount
                        currency="point"
                        amount={total}
                        compactPoint
                        className={overlay ? ovB1 : "sam-text-body"}
                      />
                      <p className={overlay ? `${ovB2} ${ovMuted}` : "sam-text-helper text-sam-muted"}>
                        {apple.available
                          ? (apple.prices[appleProductByPlanId.get(plan.id)?.productId ?? ""] ??
                            t("apple_iap_price_from_store"))
                          : formatMypageMoney(plan.paymentAmount)}
                      </p>
                      {(plan.bonusPointAmount ?? 0) > 0 && (
                        <p className={overlay ? `${ovCap} font-semibold text-[color:var(--overlay-primary)]` : "sam-text-xxs text-sam-success"}>
                          {t("points_ui_bonus", { bonus: plan.bonusPointAmount ?? 0 })}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <p className={overlay ? `mb-2 ${ovB2} font-semibold ${ovFg}` : "mb-2 sam-text-body-secondary font-semibold text-sam-fg"}>
            {t("points_ui_payment_method")}
          </p>
          <div className="mb-4 flex flex-wrap gap-2">
            {/* 「자동 이체」 제거 (Owner 승인 v3): 서버는 두 방식 모두 관리자 확인 후 지급 — 자동 처리 없음 */}
            {apple.available ? (
              <button
                type="button"
                aria-pressed
                data-selected={overlay ? "true" : undefined}
                className={
                  overlay
                    ? `${OverlayUi.chip} min-w-[8rem] flex-1`
                    : "min-h-11 min-w-[8rem] flex-1 rounded-ui-rect border border-sam-primary bg-sam-pressed-surface py-2.5 sam-text-body-secondary font-medium text-sam-primary"
                }
              >
                {t("apple_iap_method_label")}
              </button>
            ) : null}
            {(apple.available ? [] : (["manual_confirm"] as PointPaymentMethod[])).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setPaymentMethod(m)}
                data-selected={overlay && paymentMethod === m ? "true" : undefined}
                className={
                  overlay
                    ? `${OverlayUi.chip} min-w-[8rem] flex-1`
                    : `min-h-11 min-w-[8rem] flex-1 rounded-ui-rect border py-2.5 sam-text-body-secondary font-medium transition-colors ${
                        paymentMethod === m
                          ? "border-sam-primary bg-sam-pressed-surface text-sam-primary"
                          : "border-sam-border bg-sam-surface text-sam-fg"
                      }`
                }
              >
                {methodLabel(m)}
              </button>
            ))}
          </div>

          {apple.available ? (
            <p
              className={overlay ? `mb-4 ${ovB2} ${ovFg}` : "mb-4 sam-text-helper text-sam-muted"}
              data-point-charge-apple-use-note="1"
            >
              {t("apple_iap_point_use_note")}
            </p>
          ) : null}

          {!apple.available && paymentMethod === "manual_confirm" && (
            <div className="mb-4 space-y-2">
              <div
                className={
                  overlay
                    ? `rounded-[length:var(--overlay-radius-sm)] bg-[color:color-mix(in_srgb,#d4a017_10%,#fff)] px-3 py-2.5 ${ovB2} ${ovFg}`
                    : "rounded-ui-rect bg-sam-warning-soft px-3 py-2.5 sam-text-helper text-sam-fg"
                }
              >
                <p className="font-semibold">{t("points_ui_deposit_guide_title")}</p>
                <p>{t("points_ui_deposit_guide_body")}</p>
                <p className="mt-1 break-all font-mono">{t("points_ui_deposit_account")}</p>
              </div>
              <input
                type="text"
                value={depositorName}
                onChange={(e) => setDepositorName(e.target.value)}
                placeholder={t("points_ui_depositor_required")}
                className={`min-h-11 w-full ${OverlayUi.input}`}
              />
              <input
                type="text"
                value={userMemo}
                onChange={(e) => setUserMemo(e.target.value)}
                placeholder={t("points_ui_memo_optional")}
                className={`min-h-11 w-full ${OverlayUi.input}`}
              />
            </div>
          )}

          {selectedPlan && (
            <div className="mb-4 flex items-center justify-between rounded-[length:var(--overlay-radius-md)] bg-[color:var(--overlay-secondary)] px-3 py-2.5">
              <span className="text-[color:var(--overlay-text-primary)]">{t("points_ui_charge_points_label")}</span>
              <CurrencyAmount
                currency="point"
                amount={totalPoint}
                compactPoint
                className="font-bold"
              />
            </div>
          )}

          {apple.available ? (
            <AppleIapStatusNotice
              phase={apple.phase}
              delayed={apple.delayed}
              attempt={apple.attempt}
              errorCode={apple.errorCode}
              busy={apple.busy}
              variant="mypage"
              onRecheck={() => void apple.recheck()}
              onDismiss={dismissApple}
            />
          ) : null}

          {err ? <p className={`mb-3 ${OverlayUi.captionDanger}`}>{err}</p> : null}

          {!overlay ? null : apple.available ? (
            <DibayOverlayButton
              roleTone="primary"
              type="button"
              onClick={submitApple}
              disabled={appleSubmitDisabled}
              loading={apple.busy}
              className="w-full"
            >
              {apple.busy ? t("apple_iap_phase_purchasing") : t("apple_iap_pay_cta")}
            </DibayOverlayButton>
          ) : (
            <DibayOverlayButton
              roleTone="primary"
              type="button"
              onClick={() => void submit()}
              disabled={submitting || !selectedPlanId}
              loading={submitting}
              className="w-full"
            >
              {submitting ? t("common_processing") : t("points_ui_submit_charge")}
            </DibayOverlayButton>
          )}
        </>
      )}
    </div>
  );

  if (!overlay) {
    // S41 — 하단 고정 [충전 요청] (활성 = 플랜 선택 & 미제출 중)
    return (
      <>
        {body}
        {plans.length > 0 && !iosUpdateRequired ? (
          <MyStickyCta
            dirty={Boolean(selectedPlanId)}
            primary={
              apple.available
                ? {
                    label: t("apple_iap_pay_cta"),
                    onPress: submitApple,
                    loading: apple.busy,
                    disabled: appleSubmitDisabled,
                  }
                : {
                    label: t("points_ui_submit_charge"),
                    onPress: () => void submit(),
                    loading: submitting,
                    disabled: submitting,
                  }
            }
          />
        ) : null}
      </>
    );
  }

  return (
    <DibayBottomSheet
      open
      onClose={() => onClose?.()}
      title={t("points_ui_charge_modal_title")}
    >
      {body}
    </DibayBottomSheet>
  );
}
