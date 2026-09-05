"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { BusinessOwnerOpsStrip } from "@/components/business/BusinessOwnerOpsStrip";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import { OwnerCta } from "@/lib/business/owner-cta-classes";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { ownerUiCopy } from "@/lib/business/owner-ui-copy";
import type { BusinessProfile } from "@/lib/types/business";
import type { StoreRow } from "@/lib/stores/db-store-mapper";

type Props = {
  row: StoreRow;
  profile: BusinessProfile;
  canSell: boolean;
};

/**
 * Ops-status — read approval/visibility/sales rights + resolution CTAs to real edit homes.
 * No invented "request approval" mutation.
 */
export function OwnerStoreOpsStatusBody({ row, profile, canSell }: Props) {
  const { t, language } = useI18n();
  const sid = row.id;
  const approved = String(row.approval_status ?? "").toLowerCase() === "approved";
  const visible = row.is_visible === true;

  const resolutionLinks: { href: string; labelKo: string; labelEn: string; primary?: boolean }[] = [
    {
      href: OwnerRoutes.hub(sid),
      labelKo: "대시보드 · 영업/노출 토글",
      labelEn: "Dashboard · open / visibility toggles",
      primary: true,
    },
    {
      href: OwnerRoutes.basicInfo(sid),
      labelKo: "매장 기본 정보",
      labelEn: "Store basic info",
    },
    {
      href: OwnerRoutes.profile(sid),
      labelKo: "매장 설정 (영업시간·배달)",
      labelEn: "Store settings (hours · delivery)",
    },
    {
      href: OwnerRoutes.products(sid),
      labelKo: "상품 관리",
      labelEn: "Product management",
    },
    {
      href: OwnerRoutes.settings(sid),
      labelKo: "알림 · 운영 설정",
      labelEn: "Alerts & ops settings",
    },
  ];

  return (
    <div className={`max-w-full min-w-0 ${OWNER_STORE_STACK_Y_CLASS}`} data-owner-ops-status="1">
      <p className="sam-text-helper leading-relaxed text-sam-muted">
        {t("owner_store_ops_intro_before")}{" "}
        <Link
          href={OwnerRoutes.profile(sid)}
          className="font-medium text-signature underline"
        >
          {t("owner_store_ops_settings_link")}
        </Link>{" "}
        {t("owner_store_ops_intro_after")}
      </p>

      <BusinessOwnerOpsStrip row={row} profile={profile} canSell={canSell} />

      <section
        className="rounded-ui-rect border border-sam-border bg-sam-surface p-3 space-y-2"
        data-owner-ops-resolution="1"
      >
        <h2 className="text-sm font-semibold text-sam-fg">
          {ownerUiCopy(language, "오너가 수정할 수 있는 곳", "Where you can edit")}
        </h2>
        <p className="text-xs text-sam-muted leading-relaxed">
          {ownerUiCopy(
            language,
            "심사·판매 권한은 관리자 영역입니다. 아래는 실제 편집 화면으로 바로 이동합니다. 가짜 승인 요청 버튼은 없습니다.",
            "Approval and sales permission are Admin-controlled. Links below go to real edit screens. No fake approval-request CTA."
          )}
        </p>
        {!approved ? (
          <p className="text-xs font-medium text-sam-danger" data-owner-ops-block="approval">
            {ownerUiCopy(
              language,
              "매장 심사가 완료되지 않아 일부 판매·노출 기능이 제한될 수 있습니다. 관리자 승인을 기다려 주세요.",
              "Store approval is incomplete — some sell/visibility features may be limited. Wait for Admin approval."
            )}
          </p>
        ) : null}
        {approved && !visible ? (
          <p className="text-xs font-medium text-sam-muted" data-owner-ops-block="visibility">
            {ownerUiCopy(
              language,
              "현재 비노출입니다. 고객에게 보이려면 대시보드의 노출 스위치를 켜세요. 주문·재무·상품 관리는 비노출 중에도 가능합니다.",
              "Store is hidden. Turn on visibility from the dashboard. Orders, finance, and products remain manageable while hidden."
            )}
          </p>
        ) : null}
        {!canSell && approved ? (
          <p className="text-xs font-medium text-sam-muted" data-owner-ops-block="cansell">
            {ownerUiCopy(
              language,
              "판매(주문) 권한이 아직 없습니다. 상품 준비는 가능하지만 주문 접수는 관리자 판매 승인 후입니다.",
              "Sales permission is not granted yet. You can prepare products; order intake waits for Admin sales approval."
            )}
          </p>
        ) : null}

        <ul className="grid gap-2 sm:grid-cols-2 pt-1">
          {resolutionLinks.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className={`${link.primary ? OwnerCta.primary : OwnerCta.secondary} ${OwnerCta.block} text-center`}
                data-owner-ops-cta={link.href}
              >
                {ownerUiCopy(language, link.labelKo, link.labelEn)}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
