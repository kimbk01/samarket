"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import {
  MY_STICKY_CTA_BAR_SURFACE_CLASS,
  MY_STICKY_CTA_PRIMARY_BUTTON_CLASS,
  MY_STICKY_CTA_ROW_CLASS,
} from "@/components/mypage/ds/MyStickyCta";
import type { CanonicalAddressDraft } from "@/lib/addresses/canonical-address-draft";
import {
  readAddressPlatformV2Draft,
  writeAddressPlatformV2Draft,
  type AddressPlatformV2DraftPayload,
} from "@/lib/addresses/canonical-address-draft-storage";
import {
  displayInputFromDraft,
  resolveCanonicalDisplayLines,
} from "@/lib/addresses/canonical-address-display";
import { resolveCurrentPinCanonicalAddress } from "@/lib/addresses/resolve-current-pin-canonical-address";
import {
  buildMypageAddressEditHref,
  buildMypageAddressSearchHref,
  parseAddressFlowPurpose,
  parseSafeInternalReturnTo,
} from "@/lib/addresses/mypage-addresses-return-to";
import { MYPAGE_ADDRESS_MANAGE_PAGE_ROOT_CLASS } from "@/lib/addresses/mypage-address-manage-layout";
import { requestLocationWithDiBaYGate } from "@/lib/permissions/device-permission-manager";
import { Sam } from "@/lib/ui/sam-component-classes";

const AddressCenterPinMapLazy = dynamic(
  () => import("@/components/addresses/AddressCenterPinMapClient").then((m) => m.AddressCenterPinMapClient),
  { ssr: false },
);

/**
 * 지도 위치 확인 (주소 입력 시안 3번 · 일반·배달 공통) — `/mypage/addresses/map`.
 * 검색 결과·현재 위치·「위치 변경」으로 들어와 가운데 핀을 건물 입구에 맞춘 뒤 「이 위치로 주소 설정」 → 저장 화면.
 * 주소 초안은 기존 흐름과 같은 sessionStorage(`writeAddressPlatformV2Draft`)로만 주고받는다.
 */
function AddressMapConfirmInner() {
  const { t } = useI18n();
  const router = useRouter();
  const sp = useSearchParams();
  const returnTo = parseSafeInternalReturnTo(sp.get("returnTo"));
  const addressId = (sp.get("id") ?? "").trim();
  const purpose = parseAddressFlowPurpose(sp.get("purpose"));
  const searchHref = buildMypageAddressSearchHref({ returnTo, id: addressId || null, purpose });

  const [payload, setPayload] = useState<AddressPlatformV2DraftPayload | null>(null);
  const [draft, setDraft] = useState<CanonicalAddressDraft | null>(null);
  const [resolving, setResolving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [recenterTo, setRecenterTo] = useState<{ lat: number; lng: number; seq: number } | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    const p = readAddressPlatformV2Draft();
    if (!p) {
      router.replace(searchHref);
      return;
    }
    setPayload(p);
    setDraft(p.draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 진입 시 1회
  }, []);

  /** 사용자가 핀(지도)을 옮겼다 놓음 — 그 자리의 주소로 다시 읽는다 (예전 검색 장소 이름은 버림) */
  const onCenterSettled = useCallback(
    (lat: number, lng: number) => {
      const seq = ++seqRef.current;
      setResolving(true);
      setErr(null);
      setDraft((prev) =>
        prev
          ? {
              ...prev,
              latitude: lat,
              longitude: lng,
              placeId: null,
              placeName: null,
              placeTypes: [],
              identitySource: "address_only",
              samePlaceAsPreferred: false,
            }
          : prev,
      );
      void (async () => {
        try {
          const next = await resolveCurrentPinCanonicalAddress(lat, lng);
          if (seq !== seqRef.current) return;
          setDraft(next);
        } catch {
          if (seq === seqRef.current) setErr(t("addr_ui_resolve_failed_short"));
        } finally {
          if (seq === seqRef.current) setResolving(false);
        }
      })();
    },
    [t],
  );

  async function moveToMyLocation() {
    if (locating) return;
    setLocating(true);
    setErr(null);
    try {
      const res = await requestLocationWithDiBaYGate({ featureKey: "delivery_address_location" });
      if (!res.ok) {
        if (res.reason !== "later") {
          setErr(res.reason === "denied" ? t("addr_ui_geo_hint_default") : t("addr_ui_geo_failed"));
        }
        return;
      }
      setRecenterTo({ lat: res.position.latitude, lng: res.position.longitude, seq: Date.now() });
    } finally {
      setLocating(false);
    }
  }

  function confirm() {
    if (!draft || resolving || !payload) return;
    writeAddressPlatformV2Draft({ ...payload, draft, source: payload.source === "search" && draft.placeId ? "search" : "pin" });
    /** 지도 → 저장은 교체 이동 — 뒤로는 검색(또는 들어오기 전 화면)으로 */
    router.replace(buildMypageAddressEditHref({ returnTo, id: addressId || undefined, purpose }));
  }

  const lines = useMemo(
    () => (draft ? resolveCanonicalDisplayLines(displayInputFromDraft(draft)) : null),
    [draft],
  );

  return (
    <div className={MYPAGE_ADDRESS_MANAGE_PAGE_ROOT_CLASS}>
      <MySubpageHeader
        inlineChrome
        registerMainTier1={false}
        titleKey="addr_v3_map_title"
        backHref={searchHref}
        preferHistoryBack
        hideCtaStrip
      />
      <div className="relative min-h-0 flex-1">
        {draft ? (
          <AddressCenterPinMapLazy
            latitude={draft.latitude}
            longitude={draft.longitude}
            onCenterSettled={onCenterSettled}
            hint={t("addr_v3_map_hint")}
            recenterTo={recenterTo}
          />
        ) : (
          <div className="h-full w-full bg-sam-surface-muted" aria-hidden />
        )}
        <button
          type="button"
          onClick={() => void moveToMyLocation()}
          disabled={locating}
          aria-label={t("addr_v3_map_my_location_aria")}
          className={`sam-press absolute bottom-4 right-4 flex h-11 w-11 items-center justify-center rounded-full border border-sam-border bg-sam-surface text-sam-primary disabled:opacity-60 ${Sam.focusRing}`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <circle cx="12" cy="12" r="3" />
            <circle cx="12" cy="12" r="8" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
          </svg>
        </button>
      </div>
      <div className="shrink-0 border-t border-sam-border-soft bg-sam-surface px-4 pb-1 pt-4" aria-live="polite">
        {resolving || !lines ? (
          <div className="space-y-2" aria-label={t("addr_ui_confirming_address")}>
            <div className="h-[18px] w-36 rounded-ui-rect bg-sam-surface-muted" />
            <div className="h-[14px] w-64 rounded-ui-rect bg-sam-surface-muted" />
          </div>
        ) : (
          <>
            {lines.title ? <p className="text-[18px] font-bold leading-snug text-sam-fg">{lines.title}</p> : null}
            {lines.addressLine ? (
              <p className="mt-1 sam-text-body-secondary leading-snug text-sam-muted">{lines.addressLine}</p>
            ) : null}
          </>
        )}
        {err ? (
          <p className="mt-2 sam-text-helper font-medium text-sam-danger" role="alert">
            {err}
          </p>
        ) : null}
      </div>
      <div className={`shrink-0 ${MY_STICKY_CTA_BAR_SURFACE_CLASS}`}>
        <div className={MY_STICKY_CTA_ROW_CLASS}>
          <button
            type="button"
            onClick={confirm}
            disabled={!draft || resolving}
            data-testid="address-map-confirm"
            className={`${MY_STICKY_CTA_PRIMARY_BUTTON_CLASS} sam-press`}
          >
            {t("addr_v3_map_cta")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AddressMapConfirmClient() {
  return (
    <Suspense fallback={null}>
      <AddressMapConfirmInner />
    </Suspense>
  );
}
