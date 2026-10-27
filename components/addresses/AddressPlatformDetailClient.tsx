"use client";

import { ADDR_INPUT_FONT_STYLE } from "@/lib/ui/address-flow-viber";
import { generateAddressClientRequestId } from "@/lib/addresses/address-client-request-id";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { CanonicalAddressDraft } from "@/lib/addresses/canonical-address-draft";
import {
  displayInputFromDraft,
  resolveCanonicalDisplayLines,
} from "@/lib/addresses/canonical-address-display";
import { resolveCurrentPinCanonicalAddress } from "@/lib/addresses/resolve-current-pin-canonical-address";
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
import { useFormKeyboardFocusVisibility } from "@/lib/ui/use-form-keyboard-focus-visibility";
import { useRouter } from "next/navigation";
import {
  clearAddressEditDraftV3,
  readAddressEditDraftV3,
  writeAddressEditDraftV3,
} from "@/lib/addresses/canonical-address-draft-storage";
import { Sam } from "@/lib/ui/sam-component-classes";
import { MyToggle } from "@/components/mypage/ds/MyToggle";
import {
  AddressDesignationField,
  type AddressDesignationPreset,
} from "@/components/addresses/AddressDesignationField";
import { showMypageToast } from "@/lib/mypage/mypage-toast";
import { MYPAGE_BODY_COLUMN_CLASS } from "@/lib/ui/mypage-responsive-breakpoints";
import {
  buildAddressDetailSaveBody,
  isAddressDetailDirty,
  resolveAddressMasterToggleInitial,
  type AddressEditableLabel,
} from "@/lib/addresses/address-detail-save-body";

const AddressFineTuneMapLazy = dynamic(
  () =>
    import("@/components/addresses/AddressFineTuneMapClient").then((m) => m.AddressFineTuneMapClient),
  { ssr: false },
);

function presetFromLabel(label: AddressEditableLabel): AddressDesignationPreset {
  return label === "other" ? "custom" : label;
}

function labelFromPreset(preset: AddressDesignationPreset): AddressEditableLabel {
  if (preset === "home" || preset === "office") return preset;
  return "other";
}

function useIsTabletWidth(): boolean {
  const [tablet, setTablet] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(min-width: 768px)");
    const apply = () => setTablet(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);
  return tablet;
}

/**
 * 주소 편집 (최종 설계 S07) — 지도 → 상세(필수) → 라벨(집·회사·기타) → 랜드마크·배달 메모 → 대표 주소 토글 → 하단 [저장].
 * **수정 저장은 대표 주소를 바꾸지 않는다** — 사용자가 토글을 켰을 때만 `isDefaultMaster: true`, 그 외에는 본문에서 생략.
 */
export function AddressPlatformDetailClient(props: {
  mode: "create" | "edit";
  initial: UserAddressDTO | null;
  draft: CanonicalAddressDraft | null;
  allAddresses: UserAddressDTO[];
  onSaved: () => void | Promise<void>;
  /** 대표 지정 목적의 호출 컨텍스트(`set_default_master`) — 추가 시 토글 기본 ON */
  callerPrefersMaster?: boolean;
  /** 변경 여부 — 부모가 뒤로 시 미저장 확인을 띄운다 */
  onDirtyChange?: (dirty: boolean) => void;
  /** 편집 입력 초안 v3 키의 사용자 id — 빈 값이면 초안 저장·복원 안 함 (UX-008) */
  draftUserId?: string;
  /** draft 없음(만료 id·좌표 없음) 시 「주소 다시 검색」 이동 경로 (UX-002) */
  researchHref?: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const {
    mode,
    initial,
    onSaved,
    allAddresses,
    callerPrefersMaster = false,
    onDirtyChange,
    draftUserId = "",
    researchHref,
  } = props;
  const { effectiveBottomInset, effectiveViewportBottom } = useFormKeyboardViewport({ enabled: true });
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  /** 하단 입력(랜드마크·메모) 포커스 시 키보드 위로 보이게 (UX-006) */
  useFormKeyboardFocusVisibility({ effectiveViewportBottom, scrollRootRef });
  const isTablet = useIsTabletWidth();
  const isShop = initial?.labelType === "shop" || Boolean(initial?.linkedStoreId?.trim());
  const masterInit = useMemo(
    () =>
      resolveAddressMasterToggleInitial({
        mode,
        initialIsMaster: initial?.isDefaultMaster === true,
        isShop,
        activeAddressCount: allAddresses.length,
        callerPrefersMaster,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 진입 시 1회 기준값
    [mode, initial?.id],
  );
  const [label, setLabel] = useState<AddressEditableLabel>(() =>
    initial && initial.labelType !== "shop" ? initial.labelType : "other",
  );
  const [masterOn, setMasterOn] = useState<boolean>(masterInit.on);
  /** 신규 생성은 성공했지만 후속 보정이 실패한 경우 — 다시 저장하면 POST 가 아닌 PATCH(중복 생성 방지) */
  const createdIdRef = useRef<string | null>(null);
  /** 신규 생성 멱등 키 — 화면 단위로 한 번 만들고 재시도에도 같은 값 (ADDR-DATA-003) */
  const clientRequestIdRef = useRef<string>(generateAddressClientRequestId());

  const [draft, setDraft] = useState<CanonicalAddressDraft | null>(props.draft);
  const [detail, setDetail] = useState("");
  const [landmark, setLandmark] = useState("");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [resolving, setResolving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const seqRef = useRef(0);
  const pinTimerRef = useRef<number | null>(null);
  const userFieldsHydratedRef = useRef(false);

  useEffect(() => {
    if (props.draft) {
      setDraft(props.draft);
    }
    if (mode === "edit" && initial && !userFieldsHydratedRef.current) {
      userFieldsHydratedRef.current = true;
      setDetail((initial.detailAddress ?? initial.unitFloorRoom ?? "").trim());
      setLandmark((initial.landmark ?? "").trim());
      setDeliveryNote((initial.deliveryNote ?? "").trim());
      if (initial.labelType !== "shop") setLabel(initial.labelType);
      setMasterOn(initial.isDefaultMaster === true);
    }
  }, [initial, mode, props.draft]);

  /** 편집 입력 초안 v3 (UX-008) — 진입 시 1회 복원, 변경 시 300ms 디바운스 저장 */
  const draftAddressId = mode === "edit" ? initial?.id ?? null : null;
  const draftBaseUpdatedAt = mode === "edit" ? initial?.updatedAt ?? null : null;
  const draftRestoreAttemptedRef = useRef(false);
  const [draftRestored, setDraftRestored] = useState(false);

  useEffect(() => {
    if (draftRestoreAttemptedRef.current || !draftUserId) return;
    if (mode === "edit" && !initial) return;
    draftRestoreAttemptedRef.current = true;
    const saved = readAddressEditDraftV3({
      userId: draftUserId,
      addressId: draftAddressId,
      baseUpdatedAt: draftBaseUpdatedAt,
    });
    if (!saved) return;
    const f = saved.fields;
    setDetail(f.detail ?? "");
    setLandmark(f.landmark ?? "");
    setDeliveryNote(f.note ?? "");
    if (!isShop && (f.labelType === "home" || f.labelType === "office" || f.labelType === "other")) {
      setLabel(f.labelType);
    }
    if (!isShop && !masterInit.locked) setMasterOn(f.isDefault === true);
    setDraftRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 진입 시 1회 복원
  }, [draftUserId, mode, initial]);

  const startOverFromDraft = useCallback(() => {
    clearAddressEditDraftV3(draftUserId, draftAddressId);
    setDetail(mode === "edit" && initial ? (initial.detailAddress ?? initial.unitFloorRoom ?? "").trim() : "");
    setLandmark(mode === "edit" && initial ? (initial.landmark ?? "").trim() : "");
    setDeliveryNote(mode === "edit" && initial ? (initial.deliveryNote ?? "").trim() : "");
    setLabel(initial && initial.labelType !== "shop" ? initial.labelType : "other");
    setMasterOn(mode === "edit" && initial ? initial.isDefaultMaster === true : masterInit.on);
    setDraftRestored(false);
  }, [draftAddressId, draftUserId, initial, masterInit.on, mode]);

  const lines = useMemo(() => {
    if (!draft) return { title: "", addressLine: "", detailLine: null };
    return resolveCanonicalDisplayLines(
      displayInputFromDraft(draft, { detail, landmark, deliveryNote }),
    );
  }, [draft, detail, landmark, deliveryNote]);

  const dirty = useMemo(
    () =>
      isAddressDetailDirty({
        mode,
        initial,
        detail,
        landmark,
        deliveryNote,
        label,
        masterOn,
        draft,
      }),
    [deliveryNote, detail, draft, initial, label, landmark, masterOn, mode],
  );

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!draftUserId || !draftRestoreAttemptedRef.current) return;
    const timer = window.setTimeout(() => {
      if (!dirty) {
        clearAddressEditDraftV3(draftUserId, draftAddressId);
        return;
      }
      writeAddressEditDraftV3({
        userId: draftUserId,
        addressId: draftAddressId,
        baseUpdatedAt: draftBaseUpdatedAt,
        fields: {
          detail,
          landmark,
          note: deliveryNote,
          labelType: label,
          nickname: initial?.nickname ?? null,
          isDefault: masterOn,
        },
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [
    deliveryNote,
    detail,
    dirty,
    draftAddressId,
    draftBaseUpdatedAt,
    draftUserId,
    initial?.nickname,
    label,
    landmark,
    masterOn,
  ]);

  const canSave =
    Boolean(draft) && !resolving && !busy && Boolean(detail.trim()) && (mode === "create" || dirty);

  const onPinMove = useCallback(
    (lat: number, lng: number) => {
      if (pinTimerRef.current != null) window.clearTimeout(pinTimerRef.current);
      const seq = ++seqRef.current;
      setResolving(true);
      setErr(null);
      // Drop stale title immediately — current pin is authority, old search identity is not.
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
      pinTimerRef.current = window.setTimeout(() => {
        pinTimerRef.current = null;
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
      }, 400);
    },
    [t],
  );

  async function save() {
    if (!draft) {
      setErr(t("addr_ui_pick_search_result"));
      return;
    }
    if (resolving) {
      setErr(t("addr_ui_confirming_address"));
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
    /** 거래 D A-1: 시(city/municipality)를 확정하지 못한 주소는 저장하지 않는다(거래 지역·거리 기준이 시) */
    if (!(draft.cityMunicipality ?? "").trim()) {
      setErr(t("addr_ui_city_required"));
      return;
    }

    let resolvedNickname: string | null = null;
    if (isShop) {
      resolvedNickname = initial?.nickname ?? null;
    } else {
      const existing = (initial?.nickname ?? "").trim();
      if (existing && isLocationOnlyAddressNickname(existing)) {
        resolvedNickname = existing;
      } else if (mode === "edit" && initial?.id) {
        resolvedNickname = encodeLocationOnlyAddressNickname(initial.id);
      } else if (createdIdRef.current) {
        resolvedNickname = encodeLocationOnlyAddressNickname(createdIdRef.current);
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
      const body = buildAddressDetailSaveBody({
        isShop,
        label,
        masterOn,
        initialIsMaster: initial?.isDefaultMaster === true,
        mode: createdIdRef.current ? "edit" : mode,
        createdNow: Boolean(createdIdRef.current),
        masterLocked: masterInit.locked,
        fields: {
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
        },
      });
      const targetId = createdIdRef.current ?? initial?.id ?? "";
      const isCreate = mode === "create" && !createdIdRef.current;
      const url = isCreate ? "/api/me/addresses" : `/api/me/addresses/${targetId}`;
      const res = await fetch(url, {
        method: isCreate ? "POST" : "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isCreate ? { ...body, clientRequestId: clientRequestIdRef.current } : body),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string; address?: { id?: string } };
      if (!res.ok || !j.ok) {
        const msg = translateUserAddressApiError(j.error, t, "addr_ui_save_failed");
        setErr(msg);
        showMypageToast(msg, "error");
        return;
      }
      const createdId = typeof j.address?.id === "string" ? j.address.id.trim() : "";
      if (
        isCreate &&
        createdId &&
        resolvedNickname &&
        isLocationOnlyAddressNickname(resolvedNickname) &&
        !decodeLocationOnlyAddressNicknameId(resolvedNickname)
      ) {
        /** 생성 후 닉네임 보정 PATCH — 실패도 오류로 처리(다시 저장하면 같은 행을 PATCH) */
        createdIdRef.current = createdId;
        const fix = await fetch(`/api/me/addresses/${createdId}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nickname: encodeLocationOnlyAddressNickname(createdId) }),
        }).catch(() => null);
        const fixJson = fix ? ((await fix.json().catch(() => ({}))) as { ok?: boolean; error?: string }) : null;
        if (!fix || !fix.ok || !fixJson?.ok) {
          const msg = translateUserAddressApiError(fixJson?.error, t, "addr_ui_save_failed");
          setErr(msg);
          showMypageToast(msg, "error");
          return;
        }
      }
      createdIdRef.current = null;
      showMypageToast(t("mypage_s07_saved_toast"), "success");
      await Promise.resolve(onSaved());
    } catch {
      const msg = t("addr_ui_save_failed");
      setErr(msg);
      showMypageToast(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  if (!draft) {
    return (
      <div className="flex flex-col items-center gap-4 px-4 py-8 text-center">
        <p className="sam-text-body-secondary text-sam-muted">{t("addr_ui_pick_search_result")}</p>
        {researchHref ? (
          <button
            type="button"
            data-testid="address-detail-research"
            onClick={() => router.replace(researchHref)}
            className={`${Sam.btn.secondaryCombo} ${Sam.focusRing}`}
          >
            {t("addr_ui_research_address")}
          </button>
        ) : null}
      </div>
    );
  }

  const mapHeight = isTablet ? 280 : 240;
  const sectionClass = "rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4";
  const inputClass = `${Sam.input.base} ${Sam.focusRing} rounded-ui-rect text-[16px]`;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div ref={scrollRootRef} className={`${MYPAGE_BODY_COLUMN_CLASS} min-h-0 flex-1 space-y-3 overflow-y-auto py-3`}>
        {draftRestored ? (
          <div
            className="flex items-center justify-between gap-2 rounded-ui-rect border border-sam-border-soft bg-sam-surface px-3 py-2"
            role="status"
            data-testid="address-edit-draft-restored"
          >
            <p className="min-w-0 flex-1 sam-text-helper text-sam-muted">{t("addr_ui_edit_draft_restored")}</p>
            <button
              type="button"
              onClick={startOverFromDraft}
              className={`${Sam.btn.secondaryCombo} ${Sam.btn.sm} ${Sam.focusRing}`}
            >
              {t("addr_ui_edit_draft_start_over")}
            </button>
          </div>
        ) : null}
        {err ? (
          <p className="sam-text-body-secondary font-medium text-sam-danger" role="alert" data-testid="address-detail-error">
            {err}
          </p>
        ) : null}
        <section className="overflow-hidden rounded-ui-rect border border-sam-border-soft bg-sam-surface">
          <div className="bg-sam-surface-muted" style={{ minHeight: mapHeight }}>
            <AddressFineTuneMapLazy
              latitude={draft.latitude}
              longitude={draft.longitude}
              onPositionChange={onPinMove}
              heightPx={mapHeight}
            />
          </div>
          <div className="border-t border-sam-border-soft bg-sam-surface px-4 py-3">
            {resolving ? (
              <p className="sam-text-helper font-semibold text-sam-primary">{t("addr_ui_confirming_address")}</p>
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

        <section className={sectionClass}>
          <label className="block">
            <span className="mb-2 block sam-text-helper font-bold text-sam-fg">{t("addr_ui_detail_address_label")}</span>
            <textarea
              id="addr-editor-detail"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder={t("addr_ui_detail_ph")}
              rows={2}
              autoComplete="address-line2"
              enterKeyHint="next"
              className={inputClass}
              style={ADDR_INPUT_FONT_STYLE}
            />
          </label>
        </section>

        <section className={sectionClass} data-testid="address-label-section">
          <p className="mb-2 sam-text-helper font-bold text-sam-fg">{t("mypage_s07_label_title")}</p>
          {isShop ? (
            <p className="rounded-ui-rect bg-sam-warning-soft px-3 py-2 sam-text-helper font-semibold text-sam-warning">
              {t("addr_ui_kind_shop")}
            </p>
          ) : (
            <AddressDesignationField
              name="address-detail-label"
              variant="chips"
              allowCustomName={false}
              hideSectionHeader
              customLabelKey="mypage_s07_label_other"
              value={presetFromLabel(label)}
              onChange={(next) => setLabel(labelFromPreset(next))}
              customName=""
              onCustomNameChange={() => undefined}
            />
          )}
        </section>

        <section className={sectionClass}>
          <div className="space-y-3">
            <label className="block">
              <span className="mb-2 block sam-text-helper font-bold text-sam-fg">{t("addr_v2_landmark_label")}</span>
              <input
                value={landmark}
                onChange={(e) => setLandmark(e.target.value)}
                placeholder={t("addr_v2_landmark_ph")}
                enterKeyHint="next"
                className={inputClass}
              style={ADDR_INPUT_FONT_STYLE}
              />
            </label>
            <label className="block">
              <span className="mb-2 block sam-text-helper font-bold text-sam-fg">{t("addr_ui_delivery_note")}</span>
              <input
                value={deliveryNote}
                onChange={(e) => setDeliveryNote(e.target.value)}
                placeholder={t("addr_ui_delivery_ph")}
                enterKeyHint="done"
                className={inputClass}
              style={ADDR_INPUT_FONT_STYLE}
              />
            </label>
          </div>
        </section>

        {isShop ? null : (
          <section className={sectionClass} data-testid="address-master-toggle-section">
            <div className="flex items-center justify-between gap-3">
              <span className="sam-text-body font-semibold text-sam-fg">{t("mypage_s07_master_toggle")}</span>
              <MyToggle
                checked={masterOn}
                disabled={masterInit.locked}
                ariaLabel={t("mypage_s07_master_toggle")}
                onChange={async (next) => {
                  setMasterOn(next);
                  return true;
                }}
              />
            </div>
            {masterInit.locked ? (
              <p className="mt-2 sam-text-helper text-sam-muted" data-testid="address-master-locked-hint">
                {masterInit.reason === "first"
                  ? t("mypage_s07_master_first_hint")
                  : t("mypage_s07_master_locked_hint")}
              </p>
            ) : null}
          </section>
        )}
      </div>
      <div
        className="shrink-0 border-t border-sam-border-soft bg-sam-surface/95 py-3"
        data-form-keyboard-footer="1"
        style={{ paddingBottom: `${effectiveBottomInset + 12}px` }}
      >
        <div className={MYPAGE_BODY_COLUMN_CLASS}>
          <button
            type="button"
            disabled={!canSave}
            aria-busy={busy}
            data-testid="address-detail-save"
            onClick={() => void save()}
            className={`${Sam.btn.primaryCombo} ${Sam.btn.block} ${Sam.focusRing} disabled:opacity-45`}
          >
            {busy ? t("addr_ui_saving") : t("addr_ui_save_address")}
          </button>
        </div>
      </div>
    </div>
  );
}
