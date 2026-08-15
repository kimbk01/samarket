"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  applySelectedPlaceIdentity,
  resolvePinMoveAgainstSelectedIdentity,
  selectedPlaceIdentityFromDraft,
  stripSelectedPlaceIdentity,
  type CanonicalAddressDraft,
  type CanonicalPreferredPlace,
} from "@/lib/addresses/canonical-address-draft";
import {
  displayInputFromDraft,
  resolveCanonicalDisplayLines,
} from "@/lib/addresses/canonical-address-display";
import { resolveCanonicalAddressFromLatLng } from "@/lib/addresses/canonical-address-resolver";
import { mapUserAddressToAppLocation } from "@/lib/addresses/map-user-address-to-app-location";
import { translateUserAddressApiError } from "@/lib/addresses/user-address-api-error-i18n";
import {
  isLocationOnlyAddressNickname,
  decodeLocationOnlyAddressNicknameId,
  encodePendingLocationOnlyNickname,
  encodeLocationOnlyAddressNickname,
} from "@/lib/addresses/location-only-address-nickname";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { useFormKeyboardViewport } from "@/lib/ui/use-form-keyboard-viewport";
import { ADDR_BTN_PRIMARY_FULL, ADDR_BTN_TERTIARY_FULL } from "@/lib/ui/address-flow-viber";

const AddressFineTuneMapLazy = dynamic(
  () =>
    import("@/components/addresses/AddressFineTuneMapClient").then((m) => m.AddressFineTuneMapClient),
  { ssr: false },
);

type PendingIdentityResolution = {
  locationDraft: CanonicalAddressDraft;
  selectedIdentity: CanonicalPreferredPlace;
};

export function AddressPlatformDetailClient(props: {
  mode: "create" | "edit";
  initial: UserAddressDTO | null;
  draft: CanonicalAddressDraft | null;
  allAddresses: UserAddressDTO[];
  onSaved: () => void | Promise<void>;
}) {
  const { t } = useI18n();
  const { mode, initial, onSaved } = props;
  const { effectiveBottomInset } = useFormKeyboardViewport({ enabled: true });

  const [draft, setDraft] = useState<CanonicalAddressDraft | null>(props.draft);
  const [detail, setDetail] = useState("");
  const [landmark, setLandmark] = useState("");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [resolving, setResolving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pendingResolution, setPendingResolution] = useState<PendingIdentityResolution | null>(null);
  const seqRef = useRef(0);
  const pinTimerRef = useRef<number | null>(null);
  const userFieldsHydratedRef = useRef(false);
  const selectedPlaceIdentityRef = useRef(selectedPlaceIdentityFromDraft(props.draft));

  useEffect(() => {
    if (props.draft) {
      setDraft(props.draft);
      selectedPlaceIdentityRef.current = selectedPlaceIdentityFromDraft(props.draft);
      setPendingResolution(null);
    }
    if (mode === "edit" && initial && !userFieldsHydratedRef.current) {
      userFieldsHydratedRef.current = true;
      setDetail((initial.detailAddress ?? initial.unitFloorRoom ?? "").trim());
      setLandmark((initial.landmark ?? "").trim());
      setDeliveryNote((initial.deliveryNote ?? "").trim());
    }
  }, [initial, mode, props.draft]);

  const lines = useMemo(() => {
    if (!draft) return { title: "", addressLine: "", detailLine: null };
    return resolveCanonicalDisplayLines(
      displayInputFromDraft(draft, { detail, landmark, deliveryNote }),
    );
  }, [draft, detail, landmark, deliveryNote]);

  const pendingPinLines = useMemo(() => {
    if (!pendingResolution) return null;
    return resolveCanonicalDisplayLines(displayInputFromDraft(pendingResolution.locationDraft));
  }, [pendingResolution]);

  const onPinMove = useCallback(
    (lat: number, lng: number) => {
      if (pinTimerRef.current != null) window.clearTimeout(pinTimerRef.current);
      const seq = ++seqRef.current;
      setResolving(true);
      pinTimerRef.current = window.setTimeout(() => {
        pinTimerRef.current = null;
        void (async () => {
          try {
            const selectedIdentity = selectedPlaceIdentityRef.current;
            const nextLocation = await resolveCanonicalAddressFromLatLng(lat, lng, selectedIdentity);
            if (seq !== seqRef.current) return;
            if (!nextLocation) return;
            const resolved = resolvePinMoveAgainstSelectedIdentity(nextLocation, selectedIdentity);
            if (resolved.kind === "auto_keep") {
              setPendingResolution(null);
              setDraft(resolved.draft);
              return;
            }
            if (resolved.kind === "location_only") {
              setPendingResolution(null);
              selectedPlaceIdentityRef.current = null;
              setDraft(resolved.draft);
              return;
            }
            setPendingResolution({
              locationDraft: resolved.locationDraft,
              selectedIdentity: resolved.selectedIdentity,
            });
            setDraft(resolved.locationDraft);
          } catch {
            if (seq === seqRef.current) setErr(t("addr_ui_resolve_failed_short"));
          } finally {
            if (seq === seqRef.current) setResolving(false);
          }
        })();
      }, 400);
    },
    [t],
  );

  const keepSelectedPlace = useCallback(() => {
    if (!pendingResolution) return;
    const next = applySelectedPlaceIdentity(
      pendingResolution.locationDraft,
      pendingResolution.selectedIdentity,
    );
    selectedPlaceIdentityRef.current = selectedPlaceIdentityFromDraft(next);
    setDraft(next);
    setPendingResolution(null);
    setErr(null);
  }, [pendingResolution]);

  const useCurrentPinLocation = useCallback(() => {
    if (!pendingResolution) return;
    const next = stripSelectedPlaceIdentity(pendingResolution.locationDraft);
    selectedPlaceIdentityRef.current = null;
    setDraft(next);
    setPendingResolution(null);
    setErr(null);
  }, [pendingResolution]);

  async function save() {
    if (!draft) {
      setErr(t("addr_ui_pick_search_result"));
      return;
    }
    if (pendingResolution) {
      setErr(t("addr_v2_identity_resolve_required"));
      return;
    }
    if (!detail.trim()) {
      setErr(t("addr_ui_detail_required"));
      return;
    }
    const formatted = (draft.formattedAddress ?? draft.streetAddress ?? "").trim();
    if (!formatted) {
      setErr(t("addr_ui_resolve_failed_short"));
      return;
    }
    const selectedPlaceName = (draft.placeName ?? "").trim() || null;
    const selectedPlaceId = selectedPlaceName ? (draft.placeId ?? "").trim() || null : null;
    if (selectedPlaceName && !selectedPlaceId) {
      setErr(t("addr_ui_no_place_id"));
      return;
    }

    const isShop = initial?.labelType === "shop" || Boolean(initial?.linkedStoreId?.trim());
    const submitLabel = isShop ? "shop" : "other";
    let resolvedNickname: string | null = null;
    if (isShop) {
      resolvedNickname = initial?.nickname ?? null;
    } else {
      const existing = (initial?.nickname ?? "").trim();
      if (existing && isLocationOnlyAddressNickname(existing)) {
        resolvedNickname = existing;
      } else if (mode === "edit" && initial?.id) {
        resolvedNickname = encodeLocationOnlyAddressNickname(initial.id);
      } else {
        resolvedNickname = encodePendingLocationOnlyNickname();
      }
    }

    setBusy(true);
    setErr(null);
    try {
      const taxonomy = mapUserAddressToAppLocation({
        appRegionId: initial?.appRegionId ?? null,
        appCityId: initial?.appCityId ?? null,
        buildingName: selectedPlaceName,
        landmark: landmark.trim() || null,
        barangay: draft.barangay,
        district: null,
        cityMunicipality: draft.cityMunicipality,
        province: draft.province,
        streetAddress: draft.streetAddress,
        neighborhoodName: draft.neighborhoodName,
        formattedAddress: draft.formattedAddress,
        roadAddress: draft.formattedAddress,
        fullAddress: draft.formattedAddress,
      });
      const body = {
        labelType: submitLabel,
        linkedStoreId: isShop ? initial?.linkedStoreId ?? null : null,
        nickname: resolvedNickname,
        barangay: draft.barangay,
        cityMunicipality: draft.cityMunicipality,
        province: draft.province,
        streetAddress: draft.streetAddress,
        buildingName: selectedPlaceName,
        unitFloorRoom: detail.trim(),
        landmark: landmark.trim() || null,
        latitude: draft.latitude,
        longitude: draft.longitude,
        placeId: selectedPlaceId,
        formattedAddress: draft.formattedAddress,
        roadAddress: draft.formattedAddress,
        detailAddress: detail.trim(),
        deliveryNote: deliveryNote.trim() || null,
        fullAddress: draft.formattedAddress,
        neighborhoodName: draft.neighborhoodName,
        appRegionId: taxonomy?.regionId ?? initial?.appRegionId ?? null,
        appCityId: taxonomy?.cityId ?? initial?.appCityId ?? null,
        useForLife: true,
        useForTrade: true,
        useForDelivery: true,
        isDefaultMaster: isShop ? false : true,
      };
      const url = mode === "create" ? "/api/me/addresses" : `/api/me/addresses/${initial?.id}`;
      const res = await fetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string; address?: { id?: string } };
      if (!res.ok || !j.ok) {
        setErr(translateUserAddressApiError(j.error, t, "addr_ui_save_failed"));
        return;
      }
      const createdId = typeof j.address?.id === "string" ? j.address.id.trim() : "";
      if (
        mode === "create" &&
        createdId &&
        resolvedNickname &&
        isLocationOnlyAddressNickname(resolvedNickname) &&
        !decodeLocationOnlyAddressNicknameId(resolvedNickname)
      ) {
        await fetch(`/api/me/addresses/${createdId}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nickname: encodeLocationOnlyAddressNickname(createdId) }),
        });
      }
      await Promise.resolve(onSaved());
    } finally {
      setBusy(false);
    }
  }

  if (!draft) {
    return <p className="px-4 py-8 text-center sam-text-body-secondary text-sam-muted">{t("addr_ui_pick_search_result")}</p>;
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-[10px] py-3 pr-2">
        <section className="overflow-hidden rounded-[24px] border border-signature/10 bg-white shadow-sm">
          <div className="min-h-[220px] bg-sam-surface-muted">
            <AddressFineTuneMapLazy
              latitude={draft.latitude}
              longitude={draft.longitude}
              onPositionChange={onPinMove}
              heightPx={240}
            />
          </div>
          <div className="border-t border-sam-border bg-gradient-to-b from-white to-signature/[0.04] px-4 py-3">
            {resolving ? (
              <p className="sam-text-helper font-semibold text-signature">{t("addr_ui_confirming_address")}</p>
            ) : (
              <>
                {lines.title ? (
                  <p className="sam-text-body font-extrabold leading-snug text-sam-fg">{lines.title}</p>
                ) : null}
                {lines.addressLine ? (
                  <p className="mt-1 sam-text-body-secondary leading-snug text-sam-muted">{lines.addressLine}</p>
                ) : null}
              </>
            )}
          </div>
        </section>

        {pendingResolution ? (
          <section className="rounded-[24px] border border-signature/20 bg-white p-4 shadow-sm">
            <p className="sam-text-body font-extrabold text-sam-fg">{t("addr_v2_identity_mismatch_title")}</p>
            <p className="mt-1 sam-text-body-secondary text-sam-muted">{t("addr_v2_identity_mismatch_lead")}</p>
            <div className="mt-3 space-y-2 rounded-[18px] bg-sam-surface px-3 py-3">
              <div>
                <p className="sam-text-helper font-bold text-sam-muted">{t("addr_v2_identity_selected_place")}</p>
                <p className="sam-text-body font-semibold text-sam-fg">
                  {pendingResolution.selectedIdentity.placeName}
                </p>
              </div>
              <div>
                <p className="sam-text-helper font-bold text-sam-muted">{t("addr_v2_identity_current_pin")}</p>
                <p className="sam-text-body font-semibold text-sam-fg">
                  {[pendingPinLines?.title, pendingPinLines?.addressLine].filter(Boolean).join(", ")}
                </p>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              <button type="button" onClick={keepSelectedPlace} className={ADDR_BTN_PRIMARY_FULL}>
                {t("addr_v2_identity_keep_selected")}
              </button>
              <button type="button" onClick={useCurrentPinLocation} className={ADDR_BTN_TERTIARY_FULL}>
                {t("addr_v2_identity_use_pin")}
              </button>
            </div>
          </section>
        ) : null}

        <section className="rounded-[24px] border border-sam-border bg-white p-4 shadow-sm">
          <label className="block">
            <span className="mb-2 block sam-text-helper font-bold text-sam-fg">{t("addr_ui_detail_address_label")}</span>
            <textarea
              id="addr-editor-detail"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder={t("addr_ui_detail_ph")}
              rows={2}
              className="w-full rounded-[18px] border border-sam-border bg-sam-surface px-3 py-3 sam-text-body text-sam-fg outline-none transition-colors focus:border-signature/50 focus:bg-white"
            />
          </label>
          {initial?.labelType === "shop" ? (
            <p className="mt-2 rounded-[14px] bg-[#F7F3ED] px-3 py-2 sam-text-helper font-semibold text-[#6F4E37]">
              {t("addr_ui_kind_shop")}
            </p>
          ) : null}
        </section>

        <section className="rounded-[24px] border border-sam-border bg-white p-4 shadow-sm">
          <div className="space-y-3">
            <label className="block">
              <span className="mb-2 block sam-text-helper font-bold text-sam-fg">{t("addr_v2_landmark_label")}</span>
              <input
                value={landmark}
                onChange={(e) => setLandmark(e.target.value)}
                placeholder={t("addr_v2_landmark_ph")}
                className="w-full rounded-[18px] border border-sam-border bg-sam-surface px-3 py-3 sam-text-body text-sam-fg outline-none transition-colors focus:border-signature/50 focus:bg-white"
              />
            </label>
            <label className="block">
              <span className="mb-2 block sam-text-helper font-bold text-sam-fg">{t("addr_ui_delivery_note")}</span>
              <input
                value={deliveryNote}
                onChange={(e) => setDeliveryNote(e.target.value)}
                placeholder={t("addr_ui_delivery_ph")}
                className="w-full rounded-[18px] border border-sam-border bg-sam-surface px-3 py-3 sam-text-body text-sam-fg outline-none transition-colors focus:border-signature/50 focus:bg-white"
              />
            </label>
          </div>
        </section>
        {err ? <p className="sam-text-body-secondary font-medium text-sam-danger">{err}</p> : null}
      </div>
      <div
        className="shrink-0 border-t border-sam-border bg-white/95 px-[10px] py-3 pr-2 shadow-[0_-8px_20px_rgba(15,23,42,0.04)]"
        data-form-keyboard-footer=""
        style={{ paddingBottom: `${effectiveBottomInset + 12}px` }}
      >
        <button
          type="button"
          disabled={busy || resolving || Boolean(pendingResolution)}
          onClick={() => void save()}
          className={ADDR_BTN_PRIMARY_FULL}
        >
          {busy ? t("addr_ui_saving") : t("addr_ui_save_address")}
        </button>
      </div>
    </div>
  );
}
