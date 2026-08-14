"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { AddressEditorLocationSearch } from "@/components/addresses/AddressEditorLocationSearch";
import { fetchPlacePredictionsPh, type PlacePredictionRow } from "@/lib/map/fetch-place-predictions-ph";
import { resolveCanonicalAddressFromPlaceId, resolveCanonicalAddressFromLatLng } from "@/lib/addresses/canonical-address-resolver";
import { writeAddressPlatformV2Draft } from "@/lib/addresses/canonical-address-draft-storage";
import {
  buildMypageAddressEditHref,
  buildMypageAddressesHref,
  parseSafeInternalReturnTo,
} from "@/lib/addresses/mypage-addresses-return-to";
import { requestLocationWithDiBaYGate } from "@/lib/permissions/device-permission-manager";
import {
  MYPAGE_ADDRESS_MANAGE_PAGE_ROOT_CLASS,
  MYPAGE_ADDRESS_MANAGE_SCROLL_CLASS,
  MYPAGE_ADDRESS_MANAGE_SCROLL_INNER_CLASS,
} from "@/lib/addresses/mypage-address-manage-layout";
import { ADDR_BTN_TERTIARY_FULL } from "@/lib/ui/address-flow-viber";

function AddressPlatformSearchInner() {
  const { t } = useI18n();
  const router = useRouter();
  const sp = useSearchParams();
  const returnTo = parseSafeInternalReturnTo(sp.get("returnTo"));
  const listHref = buildMypageAddressesHref(returnTo);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [predictions, setPredictions] = useState<PlacePredictionRow[]>([]);
  const [resolvingPlaceId, setResolvingPlaceId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) {
      setPredictions([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const rows = await fetchPlacePredictionsPh(q);
          if (!cancelled) setPredictions(rows);
        } catch {
          if (!cancelled) setPredictions([]);
        } finally {
          if (!cancelled) setSearching(false);
        }
      })();
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [search]);

  const goDetail = useCallback(() => {
    router.replace(buildMypageAddressEditHref({ returnTo }));
  }, [returnTo, router]);

  async function onSelectPrediction(row: PlacePredictionRow) {
    if (!row.placeId.trim()) return;
    setErr(null);
    setResolvingPlaceId(row.placeId);
    try {
      const draft = await resolveCanonicalAddressFromPlaceId(row.placeId);
      if (!draft) {
        setErr(t("addr_ui_coords_invalid"));
        return;
      }
      writeAddressPlatformV2Draft({ draft, source: "search" });
      goDetail();
    } finally {
      setResolvingPlaceId(null);
    }
  }

  async function onCurrentLocation() {
    setErr(null);
    setLocating(true);
    try {
      const res = await requestLocationWithDiBaYGate({ featureKey: "delivery_address_location" });
      if (!res.ok) {
        if (res.reason === "later") return;
        setErr(res.reason === "denied" ? t("addr_ui_geo_hint_default") : t("addr_ui_geo_failed"));
        return;
      }
      const draft = await resolveCanonicalAddressFromLatLng(res.position.latitude, res.position.longitude);
      if (!draft) {
        setErr(t("addr_ui_resolve_failed"));
        return;
      }
      writeAddressPlatformV2Draft({ draft, source: "current_location" });
      goDetail();
    } finally {
      setLocating(false);
    }
  }

  return (
    <div className={MYPAGE_ADDRESS_MANAGE_PAGE_ROOT_CLASS}>
      <MySubpageHeader
        inlineChrome
        registerMainTier1={false}
        titleKey="addr_v2_search_title"
        backHref={listHref}
        hideCtaStrip
        showHubQuickActions
      />
      <div className={MYPAGE_ADDRESS_MANAGE_SCROLL_CLASS}>
        <div className={MYPAGE_ADDRESS_MANAGE_SCROLL_INNER_CLASS}>
          <p className="mb-3 text-[18px] font-bold leading-snug text-sam-fg">{t("addr_v2_search_lead")}</p>
          <AddressEditorLocationSearch
            search={search}
            searching={searching}
            predictions={predictions}
            resolvingPlaceId={resolvingPlaceId}
            onSearchChange={setSearch}
            onSearchFocus={() => undefined}
            onSelectPrediction={(p) => void onSelectPrediction(p)}
            placeholder={t("addr_v2_search_placeholder")}
          />
          {err ? <p className="mt-2 sam-text-body-secondary font-medium text-sam-danger">{err}</p> : null}
          {predictions.length === 0 && search.trim().length < 2 ? (
            <div className="mt-5 space-y-2 sam-text-body-secondary text-sam-muted">
              <p className="font-semibold text-sam-fg">{t("addr_v2_search_hint_title")}</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>{t("addr_v2_search_hint_road")}</li>
                <li>{t("addr_v2_search_hint_building")}</li>
                <li>{t("addr_v2_search_hint_place")}</li>
                <li>{t("addr_v2_search_hint_lot")}</li>
              </ul>
            </div>
          ) : null}
          <button
            type="button"
            className={`${ADDR_BTN_TERTIARY_FULL} mt-6`}
            disabled={locating}
            onClick={() => void onCurrentLocation()}
          >
            {locating ? t("addr_ui_locating") : t("addr_ui_find_current")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AddressPlatformSearchClient() {
  return (
    <Suspense fallback={null}>
      <AddressPlatformSearchInner />
    </Suspense>
  );
}
