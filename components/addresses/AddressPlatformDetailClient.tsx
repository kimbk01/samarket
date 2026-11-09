"use client";

import {
  MY_STICKY_CTA_BAR_SURFACE_CLASS,
  MY_STICKY_CTA_PRIMARY_BUTTON_CLASS,
  MY_STICKY_CTA_ROW_CLASS,
} from "@/components/mypage/ds/MyStickyCta";
import { ADDR_INPUT_FONT_STYLE } from "@/lib/ui/address-flow-viber";
import { generateAddressClientRequestId } from "@/lib/addresses/address-client-request-id";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { CanonicalAddressDraft } from "@/lib/addresses/canonical-address-draft";
import {
  displayInputFromDraft,
  resolveCanonicalDisplayLines,
} from "@/lib/addresses/canonical-address-display";
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
import { tapHaptic } from "@/lib/ui/tap-haptic";
import { showMypageToast } from "@/lib/mypage/mypage-toast";
import { MYPAGE_BODY_COLUMN_CLASS } from "@/lib/ui/mypage-responsive-breakpoints";
import {
  buildAddressDetailSaveBody,
  isAddressDetailDirty,
  resolveAddressMasterToggleInitial,
  type AddressEditableLabel,
} from "@/lib/addresses/address-detail-save-body";

/** 이름 라디오 카드 (주소 입력 시안 4번) — 집·회사·기타 */
const LABEL_OPTIONS: ReadonlyArray<{ id: AddressEditableLabel; key: "addr_v2_label_home" | "addr_v2_label_office" | "addr_v2_label_other" }> = [
  { id: "home", key: "addr_v2_label_home" },
  { id: "office", key: "addr_v2_label_office" },
  { id: "other", key: "addr_v2_label_other" },
];

function LabelIcon({ id }: { id: AddressEditableLabel }) {
  if (id === "home") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />
      </svg>
    );
  }
  if (id === "office") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="7" width="18" height="13" rx="1" />
        <path d="M8 7V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M3 12h18" />
      </svg>
    );
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

/**
 * 주소 저장 (주소 입력 시안 4·6번 · Owner 2026-11-09 「시안대로 구현」) — 지도 확인(3번) 다음 화면.
 * - 일반(`purpose="general"`): 주소 요약(위치 변경) → 상세 주소(선택) → 이름 라디오(집·회사·기타) → 대표 주소 → [저장](본문 안).
 * - 배달(`purpose="delivery"`): 주소 요약 → 세부 주소(필수) → 찾아오는 길 → 배달 요청사항 → 하단 [다음 칸 | 저장하고 배달 받기](키보드 위).
 *   배달 주소는 대표 주소가 기준이라 새 배달 주소는 대표로 저장한다.
 * **수정 저장은 대표 주소를 바꾸지 않는다**(일반) — 사용자가 켰을 때만 `isDefaultMaster: true`.
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
  /** 일반 / 배달 입력 */
  purpose?: "general" | "delivery";
  /** 주소 목록을 받아 왔는지 — 받기 전에는 대표 토글을 「첫 주소」로 판정하지 않는다 (A4) */
  listReady?: boolean;
  /** 「위치 변경」 — 지금 주소 초안을 들고 지도 확인(3번)으로 */
  onChangeLocation?: (draft: CanonicalAddressDraft) => void;
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
    purpose = "general",
    listReady = true,
    onChangeLocation,
  } = props;
  const isDelivery = purpose === "delivery";
  const { effectiveBottomInset, effectiveViewportBottom, keyboardOpen } = useFormKeyboardViewport({ enabled: true });
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  /** 하단 입력(찾아오는 길·요청사항) 포커스 시 키보드 위로 보이게 (UX-006) */
  useFormKeyboardFocusVisibility({ effectiveViewportBottom, scrollRootRef });
  const isShop = initial?.labelType === "shop" || Boolean(initial?.linkedStoreId?.trim());
  /**
   * A4 (2026-11-09 감사): 목록을 받기 전(0개)에 계산하면 「첫 주소 → 자동 대표(켜짐·잠김)」로 보이지만
   * 실제로는 첫 주소가 아니라 대표로 저장되지 않았다 → 목록을 받은 뒤 다시 계산한다.
   */
  const masterInit = useMemo(
    () =>
      resolveAddressMasterToggleInitial({
        mode,
        initialIsMaster: initial?.isDefaultMaster === true,
        isShop,
        activeAddressCount: listReady ? allAddresses.length : 1,
        /** 배달 주소는 대표 주소가 기준 — 새 배달 주소는 대표로 */
        callerPrefersMaster: callerPrefersMaster || (isDelivery && mode === "create"),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 진입·목록 수신 때만 다시 계산
    [mode, initial?.id, listReady, allAddresses.length],
  );
  const masterTouchedRef = useRef(false);
  const [label, setLabel] = useState<AddressEditableLabel>(() =>
    initial && initial.labelType !== "shop" ? initial.labelType : "other",
  );
  const [masterOn, setMasterOn] = useState<boolean>(masterInit.on);
  useEffect(() => {
    if (masterTouchedRef.current) return;
    setMasterOn(masterInit.on);
  }, [masterInit.on]);
  /** 필수 칸 검사 결과 — 저장을 누른 뒤에만 보인다(입력 중 빨간색 금지) */
  const [triedSave, setTriedSave] = useState(false);
  const detailRef = useRef<HTMLInputElement | null>(null);
  const landmarkRef = useRef<HTMLInputElement | null>(null);
  const noteRef = useRef<HTMLInputElement | null>(null);
  /** 지금 입력 중인 칸(0 세부 주소 · 1 찾아오는 길 · 2 요청사항) — 버튼 문구 「다음 칸 / 키보드 닫기」 */
  const [focusedField, setFocusedField] = useState<number | null>(null);
  /** 신규 생성은 성공했지만 후속 보정이 실패한 경우 — 다시 저장하면 POST 가 아닌 PATCH(중복 생성 방지) */
  const createdIdRef = useRef<string | null>(null);
  /** 신규 생성 멱등 키 — 화면 단위로 한 번 만들고 재시도에도 같은 값 (ADDR-DATA-003) */
  const clientRequestIdRef = useRef<string>(generateAddressClientRequestId());

  const [draft, setDraft] = useState<CanonicalAddressDraft | null>(props.draft);
  const [detail, setDetail] = useState("");
  const [landmark, setLandmark] = useState("");
  const [deliveryNote, setDeliveryNote] = useState("");
  const resolving = false;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
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

  /** 버튼은 비활성으로 두지 않는다 — 누르면 빠진 칸을 그 칸 아래에서 알려 준다 (시안 6번) */
  /** 배달은 항상 누를 수 있다(빈 세부 주소를 그 칸 아래에서 알려 줌) · 일반 수정은 바뀐 것이 있을 때만 */
  const canSave = Boolean(draft) && !busy && (isDelivery || mode === "create" || dirty);
  const detailMissing = isDelivery && !detail.trim();

  async function save() {
    if (!draft) {
      setErr(t("addr_ui_pick_search_result"));
      return;
    }
    if (resolving) {
      setErr(t("addr_ui_confirming_address"));
      return;
    }
    /** 배달 주소만 세부 주소 필수 — 일반 주소는 선택 (시안 4·6번) */
    if (isDelivery && !detail.trim()) {
      setTriedSave(true);
      tapHaptic("error");
      detailRef.current?.focus();
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
      /** 수정 시 예전 지역 ID 를 넣지 않는다 — 바뀐 주소로 다시 계산(서버도 같은 계산으로 덮어씀 · 주소 SSOT) */
      const taxonomy = mapUserAddressToAppLocation({
        appRegionId: null,
        appCityId: null,
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
        /** 사용자가 켠 대표 지정 — 배달 새 주소도 여기서 켜져 있다 */
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
        tapHaptic("error");
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
      tapHaptic("success");
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

  const fieldClass = (invalid: boolean) =>
    `${Sam.input.base} ${Sam.focusRing} h-[52px] rounded-ui-rect text-[16px] ${invalid ? "sam-input--error" : ""}`;
  const sectionLabelClass = "mb-2 block sam-text-body-secondary font-bold text-sam-fg";
  const detailInvalid = triedSave && detailMissing;

  /** 키보드 「다음」·버튼 「다음 칸」 — 세부 주소 → 찾아오는 길 → 요청사항 → (마지막) 키보드 닫기 */
  const focusOrder = [detailRef, landmarkRef, noteRef];
  function focusNextField() {
    const active = typeof document !== "undefined" ? document.activeElement : null;
    const idx = focusOrder.findIndex((r) => r.current === active);
    const next = idx >= 0 ? focusOrder[idx + 1] : focusOrder[0];
    if (next?.current) {
      next.current.focus();
      return;
    }
    (active as HTMLElement | null)?.blur?.();
  }
  const onLastField = focusedField === 2;

  const summary = (
    <button
      type="button"
      onClick={() => draft && onChangeLocation?.(draft)}
      disabled={!onChangeLocation}
      className={`sam-press flex w-full items-start gap-3 rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4 text-left disabled:cursor-default ${Sam.focusRing}`}
      data-testid="address-detail-summary"
    >
      <svg className="mt-0.5 h-5 w-5 shrink-0 text-sam-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z" />
        <circle cx="12" cy="9" r="2.5" />
      </svg>
      <span className="min-w-0 flex-1">
        {lines.title ? <span className="block sam-text-body font-bold leading-snug text-sam-fg">{lines.title}</span> : null}
        {lines.addressLine ? (
          <span className="mt-0.5 block sam-text-body-secondary leading-snug text-sam-muted">{lines.addressLine}</span>
        ) : null}
      </span>
      {onChangeLocation ? (
        <span className="shrink-0 sam-text-body-secondary font-semibold text-sam-primary">{t("addr_v3_change_location")}</span>
      ) : null}
    </button>
  );

  const detailField = (
    <label className="block">
      <span className={sectionLabelClass}>
        {isDelivery ? t("addr_v3_detail_label_delivery") : t("addr_v3_detail_label")}{" "}
        <span className={`sam-text-helper font-bold ${isDelivery ? "text-sam-danger" : "font-medium text-sam-muted"}`}>
          {isDelivery ? t("addr_v3_required") : `(${t("addr_v3_optional")})`}
        </span>
      </span>
      <input
        ref={detailRef}
        id="addr-editor-detail"
        onFocus={() => setFocusedField(0)}
        onBlur={() => setFocusedField((f) => (f === 0 ? null : f))}
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (isDelivery) focusNextField();
            else (e.currentTarget as HTMLInputElement).blur();
          }
        }}
        placeholder={t("addr_v3_detail_ph")}
        autoComplete="address-line2"
        enterKeyHint={isDelivery ? "next" : "done"}
        aria-invalid={detailInvalid || undefined}
        aria-describedby={detailInvalid ? "addr-editor-detail-err" : undefined}
        className={fieldClass(detailInvalid)}
        style={ADDR_INPUT_FONT_STYLE}
      />
      {detailInvalid ? (
        <span id="addr-editor-detail-err" role="alert" className="mt-1.5 block sam-text-helper font-medium text-sam-danger">
          {t("addr_v3_detail_required_err")}
        </span>
      ) : null}
    </label>
  );

  const errLine = err ? (
    <p className="sam-text-body-secondary font-medium text-sam-danger" role="alert" data-testid="address-detail-error">
      {err}
    </p>
  ) : null;

  const draftRestoredBar = draftRestored ? (
    <div
      className="flex items-center justify-between gap-2 rounded-ui-rect border border-sam-border-soft bg-sam-surface px-3 py-2"
      role="status"
      data-testid="address-edit-draft-restored"
    >
      <p className="min-w-0 flex-1 sam-text-helper text-sam-muted">{t("addr_ui_edit_draft_restored")}</p>
      <button type="button" onClick={startOverFromDraft} className={`${Sam.btn.secondaryCombo} ${Sam.btn.sm} ${Sam.focusRing} sam-press`}>
        {t("addr_ui_edit_draft_start_over")}
      </button>
    </div>
  ) : null;

  if (isDelivery) {
    /** 시안 6번 — 배달 정보: 칸 3개 + 키보드 위 버튼 줄 */
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div ref={scrollRootRef} className={`${MYPAGE_BODY_COLUMN_CLASS} min-h-0 flex-1 space-y-4 overflow-y-auto py-4`}>
          {draftRestoredBar}
          {summary}
          {detailField}
          <label className="block">
            <span className={sectionLabelClass}>
              {t("addr_v2_landmark_label")}{" "}
              <span className="sam-text-helper font-medium text-sam-muted">({t("addr_v3_optional")})</span>
            </span>
            <input
              ref={landmarkRef}
              onFocus={() => setFocusedField(1)}
              onBlur={() => setFocusedField((f) => (f === 1 ? null : f))}
              value={landmark}
              onChange={(e) => setLandmark(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  focusNextField();
                }
              }}
              placeholder={t("addr_v2_landmark_ph")}
              enterKeyHint="next"
              className={fieldClass(false)}
              style={ADDR_INPUT_FONT_STYLE}
            />
          </label>
          <label className="block">
            <span className={sectionLabelClass}>
              {t("addr_v3_delivery_note_label")}{" "}
              <span className="sam-text-helper font-medium text-sam-muted">({t("addr_v3_optional")})</span>
            </span>
            <input
              ref={noteRef}
              onFocus={() => setFocusedField(2)}
              onBlur={() => setFocusedField((f) => (f === 2 ? null : f))}
              value={deliveryNote}
              onChange={(e) => setDeliveryNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void save();
                }
              }}
              placeholder={t("addr_ui_delivery_ph")}
              enterKeyHint="done"
              className={fieldClass(false)}
              style={ADDR_INPUT_FONT_STYLE}
            />
          </label>
          {errLine}
        </div>
        {/* 하단 버튼 줄 — 내정보 공통 하단 바(`MyStickyCta`) · 키보드가 열리면 키보드 높이만큼 위로(공통 키보드 측정) */}
        <div
          className={`shrink-0 ${MY_STICKY_CTA_BAR_SURFACE_CLASS}`}
          data-form-keyboard-footer="1"
          style={{ paddingBottom: `${effectiveBottomInset}px` }}
        >
          <div className={MY_STICKY_CTA_ROW_CLASS}>
            {keyboardOpen ? (
              <button
                type="button"
                /** 입력 포커스 유지 — 버튼이 포커스를 가져가지 않게 */
                onMouseDown={(e) => e.preventDefault()}
                onClick={focusNextField}
                className={`${Sam.btn.secondaryCombo} ${Sam.focusRing} sam-press flex-1`}
                data-testid="address-detail-next-field"
              >
                {onLastField ? t("addr_v3_close_keyboard") : t("addr_v3_next_field")}
              </button>
            ) : null}
            <button
              type="button"
              disabled={!canSave}
              aria-busy={busy}
              data-testid="address-detail-save"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void save()}
              className={`${MY_STICKY_CTA_PRIMARY_BUTTON_CLASS} sam-press`}
            >
              {busy ? t("addr_ui_saving") : t("addr_v3_save_and_deliver")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  /** 시안 4번 — 일반 주소: 칸 최소, 저장 버튼은 칸 바로 아래(본문 안 — 키보드에 가려지지 않음) */
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div
        ref={scrollRootRef}
        className={`${MYPAGE_BODY_COLUMN_CLASS} min-h-0 flex-1 space-y-5 overflow-y-auto py-4`}
        style={{ paddingBottom: `calc(1rem + ${effectiveBottomInset}px)` }}
      >
        {draftRestoredBar}
        {summary}
        {detailField}

        {isShop ? (
          <p className="rounded-ui-rect bg-sam-warning-soft px-3 py-2 sam-text-helper font-semibold text-sam-warning">
            {t("addr_ui_kind_shop")}
          </p>
        ) : (
          <div data-testid="address-label-section">
            <span id="addr-editor-label-title" className={sectionLabelClass}>
              {t("addr_v3_name_label")}
            </span>
            <div role="radiogroup" aria-labelledby="addr-editor-label-title" className="grid grid-cols-3 gap-2">
              {LABEL_OPTIONS.map((o) => {
                const on = label === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => {
                      if (on) return;
                      tapHaptic("select");
                      setLabel(o.id);
                    }}
                    className={`sam-press flex h-[76px] flex-col items-center justify-center gap-1.5 rounded-ui-rect sam-text-body-secondary font-bold ${Sam.focusRing} ${
                      on
                        ? "border-2 border-sam-primary bg-sam-primary-soft text-sam-primary"
                        : "border border-sam-border bg-sam-surface text-sam-muted"
                    }`}
                    data-testid={`address-label-${o.id}`}
                  >
                    <LabelIcon id={o.id} />
                    {t(o.key)}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {isShop ? null : (
          <section
            className="flex items-center justify-between gap-3 rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4"
            data-testid="address-master-toggle-section"
          >
            <span className="min-w-0">
              <span className="block sam-text-body font-bold text-sam-fg">{t("addr_v3_master_title")}</span>
              <span className="mt-0.5 block sam-text-helper text-sam-muted">
                {masterInit.locked
                  ? masterInit.reason === "first"
                    ? t("mypage_s07_master_first_hint")
                    : t("mypage_s07_master_locked_hint")
                  : t("addr_v3_master_desc")}
              </span>
            </span>
            <MyToggle
              checked={masterOn}
              disabled={masterInit.locked || !listReady}
              ariaLabel={t("addr_v3_master_title")}
              onChange={async (next) => {
                masterTouchedRef.current = true;
                tapHaptic("select");
                setMasterOn(next);
                return true;
              }}
            />
          </section>
        )}

        {errLine}
        <button
          type="button"
          disabled={!canSave}
          aria-busy={busy}
          data-testid="address-detail-save"
          onClick={() => void save()}
          className={`${Sam.btn.primaryCombo} ${Sam.btn.block} ${Sam.focusRing} sam-press h-[52px] text-[16px] disabled:opacity-50`}
        >
          {busy ? t("addr_ui_saving") : t("addr_v3_save")}
        </button>
        <p className="text-center sam-text-helper text-sam-muted">{t("addr_v3_general_footnote")}</p>
      </div>
    </div>
  );
}
