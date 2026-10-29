"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/components/addresses/MandatoryAddressGate";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { isDeliveryRoutableMasterAddress } from "@/lib/addresses/delivery-routable-address";
import { fetchAddressDefaultsSnapshot } from "@/lib/addresses/fetch-address-defaults-client";
import { buildMypageAddressesHrefFromPath } from "@/lib/addresses/mypage-addresses-return-to";
import { pickAddressRowForDeliveryRouting } from "@/lib/addresses/pick-address-row-for-delivery-routing";
import type { UserAddressDefaultsDTO } from "@/lib/addresses/user-address-types";
import { MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS } from "@/lib/layout/main-bottom-nav-hub-clearance";
import { STORES_DELIVERY_CONTENT_INNER_CLASS } from "@/lib/stores/stores-home-ui";
import { Sam } from "@/lib/ui/css-vars";

/**
 * CUT 5 — Delivery-only routable guard (does not change ADDRESS_COMPLETE).
 *
 * Blocks consumer Delivery surfaces when master exists but lat/lng is not routable.
 * Owner / admin store paths are excluded. Guests pass through.
 */

function isDeliveryConsumerPath(pathname: string): boolean {
  const p = pathname.split("?")[0]?.trim() || "";
  if (!p.startsWith("/stores")) return false;
  if (p === "/stores/owner" || p.startsWith("/stores/owner/")) return false;
  return true;
}

type GatePhase = "checking" | "pass" | "repair";

/**
 * 재감사 F3 (2026-10-30) — 마지막 판정을 세션 동안 기억.
 * 배달 화면을 옮길 때마다 이 게이트가 다시 마운트되며 「checking」으로 시작해 주소 확인(~0.5초)
 * 동안 화면 전체를 「불러오는 중…」으로 가렸다 (홈→업종·목록→매장·매장→메뉴 모두).
 * 이제 처음 한 번만 기다리고, 이후에는 마지막 판정으로 바로 그린 뒤 뒤에서 다시 확인한다.
 * 주소 변경 이벤트(`SAMARKET_ADDRESSES_UPDATED_EVENT`) 때도 다시 판정한다.
 */
let lastGatePhase: Exclude<GatePhase, "checking"> | null = null;

/** @internal vitest */
export function resetDeliveryRoutableAddressGateCacheForTests(): void {
  lastGatePhase = null;
}

export function DeliveryRoutableAddressGate({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const { t } = useI18n();
  const [phase, setPhaseState] = useState<GatePhase>(() => lastGatePhase ?? "checking");
  const setPhase = useCallback((next: Exclude<GatePhase, "checking">) => {
    lastGatePhase = next;
    setPhaseState(next);
  }, []);

  const runCheck = useCallback(async () => {
    if (!isDeliveryConsumerPath(pathname)) {
      setPhase("pass");
      return;
    }
    try {
      const snapshot = await fetchAddressDefaultsSnapshot({
        caller: "delivery_routable_gate",
        reason: "delivery_routable",
      });
      if (snapshot == null) {
        setPhase("pass");
        return;
      }
      if (snapshot.status === 401) {
        setPhase("pass");
        return;
      }
      if (!snapshot.ok || snapshot.defaults == null) {
        /** Incomplete load — do not invent GPS; leave MandatoryAddressGate / browse fail-closed. */
        setPhase("pass");
        return;
      }
      const row = pickAddressRowForDeliveryRouting(snapshot.defaults as UserAddressDefaultsDTO);
      if (!row?.id) {
        /** No master — ADDRESS_COMPLETE / MandatoryAddressGate owns this. */
        setPhase("pass");
        return;
      }
      if (isDeliveryRoutableMasterAddress(row)) {
        setPhase("pass");
        return;
      }
      setPhase("repair");
    } catch {
      setPhase("pass");
    }
  }, [pathname, setPhase]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await runCheck();
      if (cancelled) return;
    })();
    const onRefresh = () => {
      void runCheck();
    };
    window.addEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onRefresh);
    return () => {
      cancelled = true;
      window.removeEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onRefresh);
    };
  }, [runCheck]);

  if (!isDeliveryConsumerPath(pathname) || phase === "pass") {
    return <>{children}</>;
  }

  if (phase === "checking") {
    return (
      <div className={`min-h-[40vh] ${MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS}`}>
        <div className={`${STORES_DELIVERY_CONTENT_INNER_CLASS} pt-8`}>
          <p className="text-sm text-sam-muted">{t("common_loading")}</p>
        </div>
      </div>
    );
  }

  const repairHref = buildMypageAddressesHrefFromPath(pathname, "");

  return (
    <div className={`min-h-[50vh] bg-sam-app ${MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS}`}>
      <div className={`${STORES_DELIVERY_CONTENT_INNER_CLASS} space-y-4 pt-8`}>
        <h1 className="text-base font-semibold text-sam-fg">{t("store_delivery_routable_repair_title")}</h1>
        <p className="text-sm text-sam-muted">{t("store_err_delivery_customer_coords_required")}</p>
        <Link href={repairHref} className={Sam.btn.primary}>
          {t("store_address_manage_link")}
        </Link>
      </div>
    </div>
  );
}
