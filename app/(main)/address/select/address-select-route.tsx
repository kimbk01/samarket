"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";
import { ADDR_FLOW_MIN_VIEWPORT } from "@/lib/ui/address-flow-viber";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

/** Google Maps 기반 위치 선택 — 지도는 클라이언트 전용 마운트(hydration 불일치 방지) */
function AddressSelectRouteLoading() {
  const { t } = useI18n();
  return (
    <div
      className={`${ADDR_FLOW_MIN_VIEWPORT} items-center justify-center sam-text-body text-sam-muted`}
    >
      {t("common_loading")}
    </div>
  );
}

const AddressSelectClient = dynamic(
  () =>
    import("@/components/map/AddressSelectClient").then((m) => ({
      default: m.AddressSelectClient,
    })),
  { ssr: false, loading: AddressSelectRouteLoading }
);

export function AddressSelectRoute() {
  return (
    <Suspense fallback={<AddressSelectRouteLoading />}>
      <AddressSelectClient />
    </Suspense>
  );
}
