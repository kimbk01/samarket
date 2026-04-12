"use client";

import { formatMoneyPhp } from "@/lib/utils/format";
import { formatPhMobileDisplay, parsePhMobileInput, telHrefFromLoosePhPhone } from "@/lib/utils/ph-mobile";

function statusBadge(isOpen: boolean) {
  if (isOpen) {
    return (
      <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
        영업중
      </span>
    );
  }
  return (
    <span className="rounded bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
      준비중
    </span>
  );
}

export type StoreCommerceSummaryCardProps = {
  storeName: string;
  isOpen: boolean;
  deliveryAvailable: boolean;
  pickupAvailable: boolean;
  /** 표시용 지역 한 줄 */
  regionLabel: string;
  /** 최소주문 금액(페소). null 이면 안내 문구 */
  minOrderPhp: number | null;
  /** 배달비(페소). null 이면 안내 문구 */
  deliveryFeePhp: number | null;
  /** 예: "25~35분" */
  estPrepLabel: string;
  /** 짧은 소개 (선택) */
  intro?: string | null;
  /** 전화 (선택) */
  phone?: string | null;
  disclaimer?: string;
};

export function StoreCommerceSummaryCard({
  storeName,
  isOpen,
  deliveryAvailable,
  pickupAvailable,
  regionLabel,
  minOrderPhp,
  deliveryFeePhp,
  estPrepLabel,
  intro,
  phone,
  disclaimer = "금액·시간은 매장 운영에 따라 달라질 수 있어요. 주문 전 매장에 확인해 주세요.",
}: StoreCommerceSummaryCardProps) {
  const minOrderDd =
    minOrderPhp != null && minOrderPhp > 0 ? formatMoneyPhp(minOrderPhp) : "주문 시 확인";
  const deliveryDd =
    deliveryFeePhp != null && deliveryFeePhp >= 0 ? formatMoneyPhp(deliveryFeePhp) : "문의";

  return (
    <div className="mx-4 mt-3 space-y-2 rounded-ui-rect border border-sam-border-soft bg-sam-surface p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-bold text-sam-fg">{storeName}</h2>
        {statusBadge(isOpen)}
      </div>
      <div className="flex flex-wrap gap-2 text-[11px]">
        {deliveryAvailable ? (
          <span className="rounded border border-orange-200 bg-orange-50 px-2 py-0.5 font-medium text-orange-900">
            배달 가능
          </span>
        ) : (
          <span className="rounded border border-sam-border bg-sam-app px-2 py-0.5 text-sam-muted">
            배달 불가
          </span>
        )}
        {pickupAvailable ? (
          <span className="rounded border border-sky-200 bg-sky-50 px-2 py-0.5 font-medium text-sky-900">
            포장 가능
          </span>
        ) : (
          <span className="rounded border border-sam-border bg-sam-app px-2 py-0.5 text-sam-muted">
            포장 불가
          </span>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-[12px] text-sam-fg">
        <dt className="text-sam-muted">최소주문</dt>
        <dd className="text-right font-medium">{minOrderDd}</dd>
        <dt className="text-sam-muted">배달비</dt>
        <dd className="text-right font-medium">{deliveryAvailable ? deliveryDd : "—"}</dd>
        <dt className="text-sam-muted">예상 조리</dt>
        <dd className="text-right font-medium">{estPrepLabel}</dd>
        <dt className="text-sam-muted">지역</dt>
        <dd className="text-right">{regionLabel || "—"}</dd>
        {phone ? (
          <>
            <dt className="text-sam-muted">연락처</dt>
            <dd className="text-right font-medium">
              <a
                href={
                  telHrefFromLoosePhPhone(phone) ?? `tel:${phone.replace(/\s/g, "")}`
                }
                className="text-signature"
              >
                {parsePhMobileInput(phone).length === 11
                  ? formatPhMobileDisplay(parsePhMobileInput(phone))
                  : phone}
              </a>
            </dd>
          </>
        ) : null}
      </dl>
      {intro ? (
        <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-sam-fg">{intro}</p>
      ) : null}
      <p className="text-[11px] leading-relaxed text-sam-muted">{disclaimer}</p>
    </div>
  );
}
