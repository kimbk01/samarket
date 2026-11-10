"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayFullSheet } from "@/components/ui/dibay-overlay/DibayFullSheet";
import { MapPicker, MAP_PICKER_DEFAULT_CENTER } from "@/components/map/MapPicker";
import { resolveCanonicalAddressFromLatLng } from "@/lib/addresses/canonical-address-resolver";
import { requestLocationWithDiBaYGate } from "@/lib/permissions/device-permission-manager";
import { FORM_INTERACTIVE_PRESS_CLASS } from "@/lib/ui/form-keyboard-viewport-contract";
import { triggerInteractionFeedback } from "@/lib/ui/light-tap-feedback";

/** 실제 영업장 위치 — 신청 API `location` 그대로 */
export type StoreApplyLocation = {
  lat: number;
  lng: number;
  formattedAddress: string;
  placeId: string | null;
  region: string;
  city: string;
  street: string;
  detail: string;
};

/**
 * 매장 위치(실제 영업장) 고르기 — 지도 가운데 핀을 옮겨 정한다 (매장 신청 v2 · Owner 2026-11-10).
 * 회원 주소록은 매장 위치를 채우지 않는다(STORE DOMAIN EXCLUDED 계약) — 그래서 지도에서 직접 고른다.
 */
export function StoreLocationPickSheet({
  open,
  onClose,
  initial,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  initial: StoreApplyLocation | null;
  onConfirm: (loc: StoreApplyLocation) => void;
}) {
  const { t } = useI18n();
  const [pin, setPin] = useState(() =>
    initial ? { lat: initial.lat, lng: initial.lng } : MAP_PICKER_DEFAULT_CENTER
  );
  const [resolved, setResolved] = useState<Omit<StoreApplyLocation, "detail"> | null>(null);
  const [detail, setDetail] = useState(initial?.detail ?? "");
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const seqRef = useRef(0);
  /** 열 때 받은 저장 위치의 좌표 — 이 좌표는 이미 주소가 있으므로 다시 찾지 않는다 */
  const initialKeyRef = useRef<string>("");

  useEffect(() => {
    if (!open) return;
    setPin(initial ? { lat: initial.lat, lng: initial.lng } : MAP_PICKER_DEFAULT_CENTER);
    setDetail(initial?.detail ?? "");
    setBusy(false);
    initialKeyRef.current = initial ? `${initial.lat.toFixed(7)},${initial.lng.toFixed(7)}` : "";
    setResolved(
      initial
        ? {
            lat: initial.lat,
            lng: initial.lng,
            formattedAddress: initial.formattedAddress,
            placeId: initial.placeId,
            region: initial.region,
            city: initial.city,
            street: initial.street,
          }
        : null
    );
  }, [open, initial]);

  /** 지도가 같은 좌표를 새 객체로 다시 보내면 상태를 바꾸지 않는다 (다시 그리기 반복 방지) */
  const updatePin = useCallback((p: { lat: number; lng: number }) => {
    setPin((prev) => (Math.abs(prev.lat - p.lat) < 1e-7 && Math.abs(prev.lng - p.lng) < 1e-7 ? prev : p));
  }, []);

  /**
   * 핀이 멈추면 0.6초 뒤 주소 글자 찾기.
   * 의존값은 좌표 글자(pinKey) — 지도가 같은 좌표를 새 객체로 다시 보내도 다시 돌지 않는다.
   * (재확인 2026-11-10 P1: 의존값이 객체였을 때 같은 좌표 재전송 → 대기 타이머만 지워지고 다시 예약되지 않아
   *  「주소를 찾는 중…」에서 멈춤 → 매장 위치를 정할 수 없었음.)
   */
  const pinKey = `${pin.lat.toFixed(7)},${pin.lng.toFixed(7)}`;
  useEffect(() => {
    if (!open) return;
    if (initialKeyRef.current && initialKeyRef.current === pinKey) {
      setBusy(false);
      return;
    }
    const [latStr, lngStr] = pinKey.split(",");
    const lat = Number(latStr);
    const lng = Number(lngStr);
    const seq = ++seqRef.current;
    setBusy(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        const draft = await resolveCanonicalAddressFromLatLng(lat, lng);
        if (seq !== seqRef.current) return;
        setBusy(false);
        if (!draft) {
          setResolved(null);
          return;
        }
        const street = (draft.streetAddress || [draft.streetNumber, draft.route].filter(Boolean).join(" ") || "").trim();
        setResolved({
          lat,
          lng,
          formattedAddress: (draft.formattedAddress ?? "").trim(),
          placeId: draft.placeId,
          region: (draft.province ?? "").trim(),
          city: (draft.cityMunicipality ?? "").trim(),
          street: street || (draft.barangay ?? "").trim(),
        });
      })();
    }, 600);
    return () => window.clearTimeout(timer);
  }, [pinKey, open]);

  const locateMe = async () => {
    setLocating(true);
    try {
      const res = await requestLocationWithDiBaYGate({ featureKey: "delivery_address_location" });
      if (res.ok) updatePin({ lat: res.position.latitude, lng: res.position.longitude });
    } finally {
      setLocating(false);
    }
  };

  const canConfirm = !busy && !!resolved?.formattedAddress;

  return (
    <DibayFullSheet
      open={open}
      onClose={onClose}
      title={t("store_apply_location_sheet_title")}
      actions={[
        { key: "cancel", label: t("common_cancel"), roleTone: "secondary", onClick: onClose },
        {
          key: "ok",
          label: t("store_apply_location_confirm"),
          roleTone: "primary",
          disabled: !canConfirm,
          onClick: () => {
            if (!resolved) return;
            onConfirm({ ...resolved, detail: detail.trim() });
            onClose();
          },
        },
      ]}
    >
      <div className="flex flex-col" data-testid="store-location-pick-sheet">
        <p className="px-4 pb-2 pt-1 text-[13px] text-sam-muted">{t("store_apply_location_sheet_desc")}</p>
        <div className="relative h-[42dvh] min-h-[220px] w-full">
          <MapPicker marker={pin} onMarkerPositionChange={updatePin} mode="center" centerChrome="none" className="h-full w-full" />
          <button
            type="button"
            disabled={locating}
            onClick={(e) => {
              triggerInteractionFeedback("light", { pointerType: (e.nativeEvent as PointerEvent).pointerType });
              void locateMe();
            }}
            className={`absolute bottom-3 right-3 inline-flex min-h-[44px] items-center rounded-full border border-sam-border bg-sam-surface px-4 text-[14px] font-semibold text-sam-fg shadow-sm ${FORM_INTERACTIVE_PRESS_CLASS}`}
          >
            {t("store_apply_location_current")}
          </button>
        </div>
        <div className="space-y-3 px-4 py-3">
          <div>
            <p className="text-[14px] font-semibold text-sam-fg">{t("store_apply_location_address_label")}</p>
            <p className="mt-1 text-[15px] text-sam-fg" aria-live="polite">
              {busy ? t("store_apply_location_finding") : resolved?.formattedAddress || t("store_apply_location_not_found")}
            </p>
          </div>
          <div>
            <label htmlFor="store-location-detail" className="text-[14px] font-semibold text-sam-fg">
              {t("store_apply_location_detail_label")}
            </label>
            <input
              id="store-location-detail"
              type="text"
              value={detail}
              maxLength={80}
              onChange={(e) => setDetail(e.target.value)}
              placeholder={t("store_apply_location_detail_placeholder")}
              className="sam-input mt-1 w-full min-w-0 bg-sam-surface !text-[16px] text-sam-fg placeholder:!text-[15px]"
            />
          </div>
        </div>
      </div>
    </DibayFullSheet>
  );
}
