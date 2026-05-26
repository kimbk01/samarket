"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { reverseGeocodeLatLngPh, type ReverseGeocodePhResult } from "@/lib/addresses/reverse-geocode-ph-client";
import { stripCountryFromAddressDisplayLine } from "@/lib/addresses/user-address-format";

const AddressFineTuneMapLazy = dynamic(
  () =>
    import("@/components/addresses/AddressFineTuneMapClient").then((m) => m.AddressFineTuneMapClient),
  {
    ssr: false,
    loading: () => <AddressFineTuneMapLoadingPlaceholder />,
  },
);

function AddressFineTuneMapLoadingPlaceholder() {
  const { t } = useI18n();
  return (
    <div className="flex h-[200px] items-center justify-center rounded-lg border border-sam-border bg-sam-surface-muted sam-text-body-secondary text-sam-muted">
      {t("addr_ui_fine_tune_map_loading")}
    </div>
  );
}

type Props = {
  open: boolean;
  latitude: number;
  longitude: number;
  onClose: () => void;
  /** 역지오코딩으로 채운 스냅샷을 폼에 반영 */
  onApply: (r: ReverseGeocodePhResult) => void;
};

export function AddressFineTuneSheet(props: Props) {
  const { t } = useI18n();
  const { open, latitude, longitude, onClose, onApply } = props;
  const [draftLat, setDraftLat] = useState(latitude);
  const [draftLng, setDraftLng] = useState(longitude);
  const [resolving, setResolving] = useState(false);
  const [resolveErr, setResolveErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<ReverseGeocodePhResult | null>(null);
  const debounceRef = useRef<number | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    setDraftLat(latitude);
    setDraftLng(longitude);
    setPreview(null);
    setResolveErr(null);
    setResolving(true);
    const seq = ++seqRef.current;
    void (async () => {
      try {
        const r = await reverseGeocodeLatLngPh(latitude, longitude);
        if (seq !== seqRef.current) return;
        setPreview(r);
        if (!r?.placeId) {
          setResolveErr(t("addr_ui_no_place_id"));
        } else {
          setResolveErr(null);
        }
      } catch {
        if (seq !== seqRef.current) return;
        setPreview(null);
        setResolveErr(t("addr_ui_resolve_failed"));
      } finally {
        if (seq === seqRef.current) setResolving(false);
      }
    })();
  }, [open, latitude, longitude]);

  const scheduleReverse = useCallback((lat: number, lng: number) => {
    setDraftLat(lat);
    setDraftLng(lng);
    if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = null;
      const seq = ++seqRef.current;
      setResolving(true);
      void (async () => {
        try {
          const r = await reverseGeocodeLatLngPh(lat, lng);
          if (seq !== seqRef.current) return;
          setPreview(r);
          if (!r?.placeId) {
            setResolveErr(t("addr_ui_no_place_id_move"));
          } else {
            setResolveErr(null);
          }
        } catch {
          if (seq !== seqRef.current) return;
          setPreview(null);
          setResolveErr(t("addr_ui_resolve_failed_short"));
        } finally {
          if (seq === seqRef.current) setResolving(false);
        }
      })();
    }, 450);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
    };
  }, []);

  if (!open) return null;

  const previewLine =
    preview?.formattedAddress != null
      ? stripCountryFromAddressDisplayLine(preview.formattedAddress, "Philippines") || preview.formattedAddress
      : null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 sm:p-6"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[min(88dvh,560px)] w-full max-w-md min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl bg-sam-surface shadow-[0_4px_24px_rgba(0,0,0,0.18)] ring-1 ring-black/[0.06]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="addr-finetune-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-sam-border px-4 py-3">
          <h2 id="addr-finetune-title" className="text-[16px] font-bold leading-6 text-sam-fg">
            {t("addr_ui_fine_tune_title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-sam-muted transition-colors hover:bg-sam-app hover:text-sam-fg"
            aria-label={t("common_close")}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          <p className="sam-text-xxs leading-snug text-sam-muted">
            {t("addr_ui_fine_tune_hint")}{" "}
            <strong className="font-semibold text-sam-fg">{t("addr_ui_apply_location")}</strong>
          </p>
          <div className="min-h-[200px]">
            <AddressFineTuneMapLazy
              key={`${latitude},${longitude}`}
              latitude={draftLat}
              longitude={draftLng}
              onPositionChange={scheduleReverse}
              heightPx={220}
            />
          </div>
          <div className="rounded-lg border border-sam-border bg-sam-app/60 px-3 py-2.5">
            {resolving ? (
              <p className="sam-text-helper text-sam-muted">{t("addr_ui_confirming_address")}</p>
            ) : previewLine ? (
              <p className="sam-text-body-secondary leading-relaxed text-sam-fg">{previewLine}</p>
            ) : (
              <p className="sam-text-helper text-sam-muted">{t("addr_ui_move_pin_hint")}</p>
            )}
          </div>
          {resolveErr ? <p className="sam-text-body-secondary font-medium text-sam-danger">{resolveErr}</p> : null}
        </div>

        <div className="flex shrink-0 gap-2 border-t border-sam-border bg-sam-app/40 px-4 py-3 safe-area-pb">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-sam-border bg-sam-surface py-2.5 sam-text-body font-semibold text-sam-fg transition-colors hover:bg-sam-app"
          >
            취소
          </button>
          <button
            type="button"
            disabled={resolving || !preview?.placeId}
            onClick={() => {
              if (!preview?.placeId) return;
              onApply(preview);
              onClose();
            }}
            className="flex-1 rounded-lg bg-sam-primary py-2.5 sam-text-body font-semibold text-white shadow-sm transition-opacity hover:bg-sam-primary-hover disabled:opacity-40"
          >
            {t("addr_ui_apply_location")}
          </button>
        </div>
      </div>
    </div>
  );
}
