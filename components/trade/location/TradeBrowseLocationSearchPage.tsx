"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  TradeLocationNationalPicker,
  type TradeNationalPickerHit,
} from "@/components/trade/TradeLocationNationalPicker";
import { MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS } from "@/lib/layout/main-bottom-nav-hub-clearance";
import {
  cloneTradeBrowseLocation,
  type TradeBrowseLocation,
} from "@/lib/trade/location/trade-browse-location";
import { defaultTradeBrowseRadiusSelection } from "@/lib/trade/location/trade-browse-radius";
import {
  createTradeBrowseLocationDraftSession,
  readTradeBrowseLocationDraftSession,
  writeTradeBrowseLocationDraftSession,
} from "@/lib/trade/location/trade-browse-location-draft-session";
import { TRADE_BROWSE_LOCATION_PATH } from "@/lib/trade/location/trade-browse-location-paths";
import { rememberTradeLguDisplayLabel } from "@/lib/trade/location/trade-location-scope";

export function TradeBrowseLocationSearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const session = useMemo(() => readTradeBrowseLocationDraftSession(), []);
  const [draft] = useState<TradeBrowseLocation>(() =>
    cloneTradeBrowseLocation(session?.location ?? { kind: "all" })
  );

  const locationBackHref = useMemo(() => {
    const q = searchParams.toString();
    return q ? `${TRADE_BROWSE_LOCATION_PATH}?${q}` : TRADE_BROWSE_LOCATION_PATH;
  }, [searchParams]);

  const onSelect = useCallback(
    (hit: TradeNationalPickerHit) => {
      const prev = readTradeBrowseLocationDraftSession();
      const radius = prev?.radius ?? defaultTradeBrowseRadiusSelection();
      const next: TradeBrowseLocation = {
        kind: "city",
        canonicalId: hit.canonicalId,
        displayName: hit.displayName,
      };
      rememberTradeLguDisplayLabel(hit.canonicalId, hit.displayName);
      writeTradeBrowseLocationDraftSession(
        createTradeBrowseLocationDraftSession(next, radius)
      );
      router.push(locationBackHref);
    },
    [locationBackHref, router]
  );

  const onBack = useCallback(() => {
    router.push(locationBackHref);
  }, [locationBackHref, router]);

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] min-h-0 w-full flex-col overflow-hidden bg-sam-app text-sam-fg">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <TradeLocationNationalPicker
          selectedCanonicalId={draft.kind === "city" ? draft.canonicalId : null}
          onSelect={onSelect}
          onBack={onBack}
        />
      </div>
      <div className={`shrink-0 ${MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS}`} aria-hidden />
    </div>
  );
}
