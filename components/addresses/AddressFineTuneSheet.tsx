"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { reverseGeocodeLatLngPh, type ReverseGeocodePhResult } from "@/lib/addresses/reverse-geocode-ph-client";
import { stripCountryFromAddressDisplayLine } from "@/lib/addresses/user-address-format";
import {
  MYPAGE_ADDRESS_MANAGE_PAGE_ROOT_CLASS,
  MYPAGE_ADDRESS_MANAGE_SCROLL_CLASS,
  MYPAGE_ADDRESS_MANAGE_SCROLL_INNER_CLASS,
} from "@/lib/addresses/mypage-address-manage-layout";
import { useFormKeyboardViewport } from "@/lib/ui/use-form-keyboard-viewport";

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
    <div className="flex h-[min(52vh,420px)] items-center justify-center rounded-lg border border-sam-border bg-sam-surface-muted sam-text-body-secondary text-sam-muted">
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
  /** page = 전체 화면 스택 페이지 · modal = 레거시 임베드(점진 제거) */
  layout?: "page" | "modal";
  pageBackHref?: string;
};

export function AddressFineTuneSheet(props: Props) {
  const { t } = useI18n();
  const { open, latitude, longitude, onClose, onApply, layout = "modal", pageBackHref } = props;
  const enabled = open;
  const { effectiveBottomInset, keyboardOpen, visualViewportHeight, visualViewportOffsetTop } =
    useFormKeyboardViewport({ enabled });
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
  }, [open, latitude, longitude, t]);

  const scheduleReverse = useCallback(
    (lat: number, lng: number) => {
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
    },
    [t],
  );

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
  const buildingHeadline = (preview?.parsed.buildingOrPlaceHeadline ?? "").trim();
  const businessNames = (preview?.buildingOrPlaceNames ?? []).filter(
    (n) => n.trim() && n.trim().toLowerCase() !== buildingHeadline.toLowerCase(),
  );

  const previewBlock = (
    <div className="rounded-lg border border-sam-border bg-sam-app/60 px-3 py-2.5">
      {resolving ? (
        <p className="sam-text-helper text-sam-muted">{t("addr_ui_confirming_address")}</p>
      ) : previewLine || buildingHeadline ? (
        <div className="space-y-1.5">
          {buildingHeadline ? (
            <p className="sam-text-body font-semibold leading-snug text-sam-fg">{buildingHeadline}</p>
          ) : null}
          {businessNames.length > 0 ? (
            <p className="sam-text-body-secondary leading-snug text-sam-fg">
              {businessNames.slice(0, 3).join(" · ")}
            </p>
          ) : null}
          {previewLine ? (
            <p className="sam-text-body-secondary leading-relaxed text-sam-muted">{previewLine}</p>
          ) : null}
        </div>
      ) : (
        <p className="sam-text-helper text-sam-muted">{t("addr_ui_move_pin_hint")}</p>
      )}
    </div>
  );

  const footerButtons = (
    <div className="flex gap-2 px-4 py-3">
      <button
        type="button"
        onClick={onClose}
        className="flex-1 rounded-lg border border-sam-border bg-sam-surface py-2.5 sam-text-body font-semibold text-sam-fg transition-colors hover:bg-sam-app"
      >
        {t("common_cancel")}
      </button>
      <button
        type="button"
        disabled={resolving || !preview?.placeId}
        onClick={() => {
          if (!preview?.placeId) return;
          onApply(preview);
        }}
        className="flex-1 rounded-lg bg-sam-primary py-2.5 sam-text-body font-semibold text-white shadow-sm transition-opacity hover:bg-sam-primary-hover disabled:opacity-40"
      >
        {t("addr_ui_apply_location")}
      </button>
    </div>
  );

  if (layout === "page") {
    return (
      <div
        className={MYPAGE_ADDRESS_MANAGE_PAGE_ROOT_CLASS}
        data-form-keyboard-open={keyboardOpen ? "true" : "false"}
      >
        <MySubpageHeader
          inlineChrome
          registerMainTier1={false}
          titleKey="addr_ui_fine_tune_title"
          backHref={pageBackHref || "/mypage/addresses"}
          preferHistoryBack
          hideCtaStrip
          showHubQuickActions
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className={MYPAGE_ADDRESS_MANAGE_SCROLL_CLASS}>
            <div className={`${MYPAGE_ADDRESS_MANAGE_SCROLL_INNER_CLASS} space-y-3`}>
              <p className="sam-text-xxs leading-snug text-sam-muted">
                {t("addr_ui_fine_tune_hint")}{" "}
                <strong className="font-semibold text-sam-fg">{t("addr_ui_apply_location")}</strong>
              </p>
              <div className="min-h-[min(52vh,420px)]">
                <AddressFineTuneMapLazy
                  key={`${latitude},${longitude}`}
                  latitude={draftLat}
                  longitude={draftLng}
                  onPositionChange={scheduleReverse}
                  heightPx={Math.min(typeof window !== "undefined" ? Math.round(window.innerHeight * 0.52) : 420, 420)}
                />
              </div>
              {previewBlock}
              {resolveErr ? <p className="sam-text-body-secondary font-medium text-sam-danger">{resolveErr}</p> : null}
            </div>
          </div>
          <div
            data-form-keyboard-footer="1"
            className="z-30 w-full min-w-0 shrink-0 border-t border-sam-primary-border/50 bg-sam-surface"
            style={{ paddingBottom: `${effectiveBottomInset}px` }}
          >
            {footerButtons}
          </div>
        </div>
      </div>
    );
  }

  const overlayStyle =
    visualViewportHeight > 0
      ? {
          top: visualViewportOffsetTop,
          height: visualViewportHeight,
          left: 0,
          right: 0,
          bottom: "auto",
        }
      : undefined;

  return (
    <div
      className="fixed inset-0 z-[1310] flex flex-col bg-sam-surface"
      style={overlayStyle}
      data-form-keyboard-open={keyboardOpen ? "true" : "false"}
      role="dialog"
      aria-modal="true"
      aria-labelledby="addr-finetune-title"
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
        <div className="min-h-[min(52vh,420px)]">
          <AddressFineTuneMapLazy
            key={`${latitude},${longitude}`}
            latitude={draftLat}
            longitude={draftLng}
            onPositionChange={scheduleReverse}
            heightPx={Math.min(typeof window !== "undefined" ? Math.round(window.innerHeight * 0.52) : 420, 420)}
          />
        </div>
        {previewBlock}
        {resolveErr ? <p className="sam-text-body-secondary font-medium text-sam-danger">{resolveErr}</p> : null}
      </div>

      <div
        data-form-keyboard-footer="1"
        className="shrink-0 border-t border-sam-border bg-sam-app/40"
        style={{ paddingBottom: `${effectiveBottomInset}px` }}
      >
        {footerButtons}
      </div>
    </div>
  );
}
