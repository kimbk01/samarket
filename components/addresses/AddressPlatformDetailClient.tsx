"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { CanonicalAddressDraft } from "@/lib/addresses/canonical-address-draft";
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
import { normalizeAddressNicknameKey } from "@/lib/addresses/address-nickname-key";
import type { UserAddressDTO, UserAddressLabelType } from "@/lib/addresses/user-address-types";
import { useFormKeyboardViewport } from "@/lib/ui/use-form-keyboard-viewport";
import { ADDR_BTN_PRIMARY_FULL } from "@/lib/ui/address-flow-viber";

const AddressFineTuneMapLazy = dynamic(
  () =>
    import("@/components/addresses/AddressFineTuneMapClient").then((m) => m.AddressFineTuneMapClient),
  { ssr: false },
);

type LabelPreset = "home" | "office" | "other";

export function AddressPlatformDetailClient(props: {
  mode: "create" | "edit";
  initial: UserAddressDTO | null;
  draft: CanonicalAddressDraft | null;
  allAddresses: UserAddressDTO[];
  onSaved: () => void | Promise<void>;
}) {
  const { t } = useI18n();
  const { mode, initial, allAddresses, onSaved } = props;
  const { effectiveBottomInset } = useFormKeyboardViewport({ enabled: true });

  const [draft, setDraft] = useState<CanonicalAddressDraft | null>(props.draft);
  const [detail, setDetail] = useState("");
  const [landmark, setLandmark] = useState("");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [labelPreset, setLabelPreset] = useState<LabelPreset | null>(null);
  const [nickname, setNickname] = useState("");
  const [resolving, setResolving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const seqRef = useRef(0);
  const pinTimerRef = useRef<number | null>(null);
  const userFieldsHydratedRef = useRef(false);
  const preferRef = useRef({ placeId: props.draft?.placeId ?? null, placeName: props.draft?.placeName ?? null });

  useEffect(() => {
    if (props.draft) {
      setDraft(props.draft);
      preferRef.current = { placeId: props.draft.placeId, placeName: props.draft.placeName };
    }
    if (mode === "edit" && initial && !userFieldsHydratedRef.current) {
      userFieldsHydratedRef.current = true;
      setDetail((initial.detailAddress ?? initial.unitFloorRoom ?? "").trim());
      setLandmark((initial.landmark ?? "").trim());
      setDeliveryNote((initial.deliveryNote ?? "").trim());
      if (initial.labelType === "office") setLabelPreset("office");
      else if (initial.labelType === "other" && !isLocationOnlyAddressNickname(initial.nickname)) {
        setLabelPreset("other");
      } else if (initial.labelType === "home") setLabelPreset("home");
      else setLabelPreset(null);
      const nick = (initial.nickname ?? "").trim();
      setNickname(isLocationOnlyAddressNickname(nick) ? "" : nick);
    }
  }, [initial, mode, props.draft]);

  const lines = useMemo(() => {
    if (!draft) return { title: "", addressLine: "", detailLine: null };
    return resolveCanonicalDisplayLines(
      displayInputFromDraft(draft, { detail, landmark, deliveryNote }),
    );
  }, [draft, detail, landmark, deliveryNote]);

  const onPinMove = useCallback((lat: number, lng: number) => {
    if (pinTimerRef.current != null) window.clearTimeout(pinTimerRef.current);
    const seq = ++seqRef.current;
    setResolving(true);
    pinTimerRef.current = window.setTimeout(() => {
      pinTimerRef.current = null;
      void (async () => {
        try {
          const next = await resolveCanonicalAddressFromLatLng(lat, lng, preferRef.current);
          if (seq !== seqRef.current) return;
          if (next) {
            setDraft(next);
            if (!next.samePlaceAsPreferred) {
              preferRef.current = { placeId: next.placeId, placeName: next.placeName };
            }
          }
        } catch {
          if (seq === seqRef.current) setErr(t("addr_ui_resolve_failed_short"));
        } finally {
          if (seq === seqRef.current) setResolving(false);
        }
      })();
    }, 400);
  }, [t]);

  async function save() {
    if (!draft) {
      setErr(t("addr_ui_pick_search_result"));
      return;
    }
    if (!draft.placeId) {
      setErr(t("addr_ui_no_place_id"));
      return;
    }
    if (!detail.trim()) {
      setErr(t("addr_ui_detail_required"));
      return;
    }
    const isShop = initial?.labelType === "shop" || Boolean(initial?.linkedStoreId?.trim());
    const submitLabel: UserAddressLabelType = isShop
      ? "shop"
      : labelPreset === "home" || labelPreset === "office"
        ? labelPreset
        : "other";
    let resolvedNickname: string | null = null;
    if (isShop) {
      resolvedNickname = initial?.nickname ?? null;
    } else if (labelPreset === "other") {
      resolvedNickname = nickname.trim() || null;
      if (!resolvedNickname) {
        setErr(t("addr_ui_custom_name_required"));
        return;
      }
      if (decodeLocationOnlyAddressNicknameId(resolvedNickname)) {
        setErr(t("addr_ui_name_invalid"));
        return;
      }
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
        buildingName: draft.placeName,
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
      const siblingRows = allAddresses.filter((a) => a.id !== initial?.id);
      if (resolvedNickname) {
        const nameKey = normalizeAddressNicknameKey(resolvedNickname);
        const conflict = siblingRows.find((a) => normalizeAddressNicknameKey(a.nickname ?? "") === nameKey);
        if (conflict) {
          setErr(t("addr_ui_api_nickname_duplicate"));
          setBusy(false);
          return;
        }
      }
      const body = {
        labelType: submitLabel,
        linkedStoreId: isShop ? initial?.linkedStoreId ?? null : null,
        nickname: resolvedNickname,
        barangay: draft.barangay,
        cityMunicipality: draft.cityMunicipality,
        province: draft.province,
        streetAddress: draft.streetAddress,
        buildingName: draft.placeName,
        unitFloorRoom: detail.trim(),
        landmark: landmark.trim() || null,
        latitude: draft.latitude,
        longitude: draft.longitude,
        placeId: draft.placeId,
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
        isDefaultLife: initial?.isDefaultLife ?? false,
        isDefaultTrade: initial?.isDefaultTrade ?? false,
        isDefaultDelivery: initial?.isDefaultDelivery ?? false,
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

  const chip = (id: LabelPreset, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setLabelPreset((cur) => (cur === id ? null : id))}
      className={`min-h-[40px] flex-1 rounded-lg border px-3 py-2 sam-text-body font-semibold ${
        labelPreset === id
          ? "border-signature bg-signature/10 text-signature"
          : "border-sam-border bg-sam-surface text-sam-fg"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
        <div className="min-h-[220px]">
          <AddressFineTuneMapLazy
            latitude={draft.latitude}
            longitude={draft.longitude}
            onPositionChange={onPinMove}
            heightPx={240}
          />
        </div>
        {resolving ? (
          <p className="sam-text-helper text-sam-muted">{t("addr_ui_confirming_address")}</p>
        ) : (
          <div>
            {lines.title ? (
              <p className="sam-text-body font-bold leading-snug text-sam-fg">{lines.title}</p>
            ) : null}
            {lines.addressLine ? (
              <p className="mt-1 sam-text-body-secondary leading-snug text-sam-muted">{lines.addressLine}</p>
            ) : null}
          </div>
        )}

        <label className="block">
          <span className="mb-1 block sam-text-helper font-semibold text-sam-fg">{t("addr_ui_detail_address_label")}</span>
          <textarea
            id="addr-editor-detail"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder={t("addr_ui_detail_ph")}
            rows={2}
            className="w-full rounded-lg border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
          />
        </label>

        {initial?.labelType === "shop" ? (
          <p className="sam-text-helper text-sam-muted">{t("addr_ui_kind_shop")}</p>
        ) : (
          <div className="flex gap-2">
            {chip("home", t("addr_v2_label_home"))}
            {chip("office", t("addr_v2_label_office"))}
            {chip("other", t("addr_v2_label_other"))}
          </div>
        )}
        {labelPreset === "other" && initial?.labelType !== "shop" ? (
          <label className="block">
            <span className="mb-1 block sam-text-helper font-semibold text-sam-fg">{t("addr_ui_custom_name_label")}</span>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder={t("addr_v2_nickname_ph")}
              className="w-full rounded-lg border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
            />
          </label>
        ) : null}

        <label className="block">
          <span className="mb-1 block sam-text-helper font-semibold text-sam-fg">{t("addr_v2_landmark_label")}</span>
          <input
            value={landmark}
            onChange={(e) => setLandmark(e.target.value)}
            placeholder={t("addr_v2_landmark_ph")}
            className="w-full rounded-lg border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
          />
        </label>
        <label className="block">
          <span className="mb-1 block sam-text-helper font-semibold text-sam-fg">{t("addr_ui_delivery_note")}</span>
          <input
            value={deliveryNote}
            onChange={(e) => setDeliveryNote(e.target.value)}
            placeholder={t("addr_ui_delivery_ph")}
            className="w-full rounded-lg border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
          />
        </label>
        {err ? <p className="sam-text-body-secondary font-medium text-sam-danger">{err}</p> : null}
      </div>
      <div
        className="shrink-0 border-t border-sam-border bg-sam-app/40 px-4 py-3"
        data-form-keyboard-footer=""
        style={{ paddingBottom: `${effectiveBottomInset + 12}px` }}
      >
        <button type="button" disabled={busy || resolving} onClick={() => void save()} className={ADDR_BTN_PRIMARY_FULL}>
          {busy ? t("addr_ui_saving") : t("addr_ui_save_address")}
        </button>
      </div>
    </div>
  );
}
