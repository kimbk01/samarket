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
import { LogIn, MapPin } from "lucide-react";
import { MyStateView } from "@/components/mypage/ds/MyStateView";
import { buildLoginHref } from "@/lib/auth/client-access-flow";

/**
 * 배달 소비자 화면 진입 게이트 (Owner 2026-10-29 · 단일 정의).
 *
 * - 비로그인: 배달 내용 대신 로그인 유도 (로그인 후 원래 경로 복귀)
 * - 로그인 + 배달 가능한 주소(좌표) 없음: 화면 위 「배달 주소가 없습니다 · 주소 설정」 배너.
 *   목록은 서버가 실매장을 빼고 샘플만 준다 (`shouldExcludeStoreFromMemberDeliveryList` · `member_no_address`)
 * - 사장님(`/stores/owner/**`) 경로 제외. ADDRESS_COMPLETE(`MandatoryAddressGate`)는 바꾸지 않는다.
 */

function isDeliveryConsumerPath(pathname: string): boolean {
  const p = pathname.split("?")[0]?.trim() || "";
  if (!p.startsWith("/stores")) return false;
  if (p === "/stores/owner" || p.startsWith("/stores/owner/")) return false;
  return true;
}

type GatePhase = "checking" | "pass" | "login" | "address_missing";

export function DeliveryRoutableAddressGate({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const { t } = useI18n();
  const [phase, setPhase] = useState<GatePhase>("checking");

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
        setPhase("login");
        return;
      }
      if (!snapshot.ok || snapshot.defaults == null) {
        /** Incomplete load — do not invent GPS; 서버 목록이 주소 판정을 다시 한다. */
        setPhase("pass");
        return;
      }
      const row = pickAddressRowForDeliveryRouting(snapshot.defaults as UserAddressDefaultsDTO);
      /** 서버 `resolveMemberDeliveryOrigin` 과 같은 기준 — 대표 배달 주소가 없거나 좌표가 없으면 「주소 없음」 */
      setPhase(row?.id && isDeliveryRoutableMasterAddress(row) ? "pass" : "address_missing");
    } catch {
      setPhase("pass");
    }
  }, [pathname]);

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

  if (phase === "login") {
    return (
      <div className={`min-h-[50vh] bg-sam-app ${MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS}`} data-delivery-gate="login">
        <div className={STORES_DELIVERY_CONTENT_INNER_CLASS}>
          <MyStateView
            kind="empty"
            empty={{
              icon: <LogIn className="h-6 w-6" aria-hidden />,
              title: t("store_delivery_login_required_title"),
              body: t("store_delivery_login_required_hint"),
              cta: (
                <Link href={buildLoginHref(pathname)} className={Sam.btn.primary}>
                  {t("store_delivery_login_cta")}
                </Link>
              ),
            }}
          />
        </div>
      </div>
    );
  }

  const addressHref = buildMypageAddressesHrefFromPath(pathname, "");
  return (
    <>
      <div className={`${STORES_DELIVERY_CONTENT_INNER_CLASS} pt-2`} data-delivery-gate="address_missing">
        <div className="flex items-center gap-3 rounded-ui-rect border border-sam-warning-soft bg-sam-warning-soft px-3 py-2.5">
          <MapPin className="h-4 w-4 shrink-0 text-sam-warning" aria-hidden />
          <p className="min-w-0 flex-1 text-[13px] text-sam-fg">{t("store_delivery_address_missing_banner")}</p>
          <Link href={addressHref} className={`${Sam.btn.primary} shrink-0`}>
            {t("store_delivery_address_set_cta")}
          </Link>
        </div>
      </div>
      {children}
    </>
  );
}
