"use client";

import { dibayAlert } from "@/components/ui/dibay-overlay";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminOperatorErrorMessage } from "@/lib/admin/operator-ux/operator-labels";
import { coerceBusinessHoursRecord } from "@/lib/stores/coerce-business-hours-json";
import { applyAutoBusinessHoursToRecord } from "@/lib/stores/serialize-store-business-hours-json";
import {
  normalizeHHMM,
  readAutoBusinessHoursEnabled,
  readAutoHoursFormFields,
  readBreakHoursFormFields,
  STORE_AUTO_TIMEZONE_OPTIONS,
} from "@/lib/stores/store-auto-hours";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AdminStoreReviewRow } from "@/components/admin/stores/admin-store-review-model";
import type { BusinessCcFeeSnapshot } from "@/lib/admin-business/load-business-control-center-detail";
import type { DeliveryStoreDistanceMode } from "@/lib/delivery/delivery-ops-settings";
import { AdminDeliveryServiceAreaEditor } from "@/components/admin/business/AdminDeliveryServiceAreaEditor";
import { resolveEffectiveStoreDeliveryRadiusKm } from "@/lib/delivery/store-delivery-radius";

type TaxonomyCat = { id: string; name: string; is_active?: boolean | null };
type TaxonomyTopic = {
  id: string;
  name: string;
  store_category_id: string;
  is_active?: boolean | null;
};

const inputClass =
  "w-full rounded border border-sam-border bg-sam-app px-2.5 py-1.5 sam-text-body text-sam-fg";
const btnClass =
  "rounded border border-sam-border bg-sam-app px-3 py-1.5 sam-text-helper font-medium text-sam-fg hover:bg-sam-surface-muted disabled:opacity-50";
const btnPrimaryClass =
  "rounded border border-signature bg-signature px-3 py-1.5 sam-text-helper font-medium text-white hover:opacity-90 disabled:opacity-50";

export function AdminBusinessCcTaxonomyEditor({
  store,
  busy,
  onSaved,
}: {
  store: AdminStoreReviewRow;
  busy?: boolean;
  onSaved: () => void;
}) {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [cats, setCats] = useState<TaxonomyCat[]>([]);
  const [topics, setTopics] = useState<TaxonomyTopic[]>([]);
  const [categoryId, setCategoryId] = useState(store.store_category_id ?? "");
  const [topicId, setTopicId] = useState(store.store_topic_id ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCategoryId(store.store_category_id ?? "");
    setTopicId(store.store_topic_id ?? "");
  }, [store.id, store.store_category_id, store.store_topic_id]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/admin/stores/taxonomy", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; categories?: TaxonomyCat[]; topics?: TaxonomyTopic[] }) => {
        if (cancelled || !j.ok) return;
        setCats(Array.isArray(j.categories) ? j.categories : []);
        setTopics(Array.isArray(j.topics) ? j.topics : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const topicOptions = useMemo(
    () => topics.filter((tp) => !categoryId || tp.store_category_id === categoryId),
    [topics, categoryId]
  );

  const save = async () => {
    const confirmed = await confirmAdminAction({
      level: "L1",
      ko,
      title: ko ? "업종을 저장할까요?" : "Save category?",
      confirmLabel: ko ? "저장" : "Save",
    });
    if (!confirmed.ok) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/stores/${encodeURIComponent(store.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_store_taxonomy",
          store_category_id: categoryId || null,
          store_topic_id: topicId || null,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        await dibayAlert({ title: adminOperatorErrorMessage(j.error ?? "update_failed", ko) });
        return;
      }
      await dibayAlert({ title: ko ? "저장했습니다." : "Saved." });
      onSaved();
    } catch {
      await dibayAlert({ title: adminOperatorErrorMessage("network_error", ko) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 border-t border-sam-border-soft pt-3">
      <p className="sam-text-helper font-medium text-sam-fg">{t("admin_biz_manage_taxonomy")}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="sam-text-helper text-sam-muted">{t("admin_biz_label_category")}</span>
          <select
            className={inputClass}
            value={categoryId}
            disabled={busy || saving}
            onChange={(e) => {
              setCategoryId(e.target.value);
              setTopicId("");
            }}
          >
            <option value="">—</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="sam-text-helper text-sam-muted">{t("admin_biz_label_topic")}</span>
          <select
            className={inputClass}
            value={topicId}
            disabled={busy || saving || !categoryId}
            onChange={(e) => setTopicId(e.target.value)}
          >
            <option value="">—</option>
            {topicOptions.map((tp) => (
              <option key={tp.id} value={tp.id}>
                {tp.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button
        type="button"
        className={btnPrimaryClass}
        disabled={busy || saving}
        onClick={() => void save()}
      >
        {t("admin_biz_save_taxonomy")}
      </button>
    </div>
  );
}

export function AdminBusinessCcContactEditor({
  store,
  busy,
  onSaved,
}: {
  store: AdminStoreReviewRow;
  busy?: boolean;
  onSaved: () => void;
}) {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [phone, setPhone] = useState(store.phone ?? "");
  const [email, setEmail] = useState(store.email ?? "");
  const [description, setDescription] = useState(store.description ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPhone(store.phone ?? "");
    setEmail(store.email ?? "");
    setDescription(store.description ?? "");
  }, [store.id, store.phone, store.email, store.description]);

  const save = async () => {
    const confirmed = await confirmAdminAction({
      level: "L1",
      ko,
      title: ko ? "연락처를 저장할까요?" : "Save contact info?",
      confirmLabel: ko ? "저장" : "Save",
    });
    if (!confirmed.ok) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/stores/${encodeURIComponent(store.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_store_contact",
          phone: phone.trim() || null,
          email: email.trim() || null,
          description: description.trim() || null,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        await dibayAlert({ title: adminOperatorErrorMessage(j.error ?? "update_failed", ko) });
        return;
      }
      await dibayAlert({ title: ko ? "저장했습니다." : "Saved." });
      onSaved();
    } catch {
      await dibayAlert({ title: adminOperatorErrorMessage("network_error", ko) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 border-t border-sam-border-soft pt-3">
      <p className="sam-text-helper font-medium text-sam-fg">{t("admin_biz_manage_contact")}</p>
      <p className="sam-text-helper text-sam-muted">{t("admin_biz_email_field_note")}</p>
      <label className="block space-y-1">
        <span className="sam-text-helper text-sam-muted">{t("admin_biz_label_phone")}</span>
        <input className={inputClass} value={phone} disabled={busy || saving} onChange={(e) => setPhone(e.target.value)} />
      </label>
      <label className="block space-y-1">
        <span className="sam-text-helper text-sam-muted">{t("admin_biz_label_email")}</span>
        <input className={inputClass} value={email} disabled={busy || saving} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="block space-y-1">
        <span className="sam-text-helper text-sam-muted">{t("admin_biz_label_intro")}</span>
        <textarea
          className={inputClass}
          rows={3}
          value={description}
          disabled={busy || saving}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <button type="button" className={btnPrimaryClass} disabled={busy || saving} onClick={() => void save()}>
        {t("admin_biz_save_contact")}
      </button>
    </div>
  );
}

export function AdminBusinessCcLocationEditor({
  store,
  busy,
  onSaved,
}: {
  store: AdminStoreReviewRow;
  busy?: boolean;
  onSaved: () => void;
}) {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [region, setRegion] = useState(store.region ?? "");
  const [city, setCity] = useState(store.city ?? "");
  const [address1, setAddress1] = useState(store.address_line1 ?? store.district ?? "");
  const [address2, setAddress2] = useState(store.address_line2 ?? "");
  const [detailAddress, setDetailAddress] = useState(store.detail_address ?? "");
  const [placeId, setPlaceId] = useState(store.place_id ?? "");
  const [formatted, setFormatted] = useState(store.formatted_address ?? "");
  const [lat, setLat] = useState(store.lat != null ? String(store.lat) : "");
  const [lng, setLng] = useState(store.lng != null ? String(store.lng) : "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRegion(store.region ?? "");
    setCity(store.city ?? "");
    setAddress1(store.address_line1 ?? store.district ?? "");
    setAddress2(store.address_line2 ?? "");
    setDetailAddress(store.detail_address ?? "");
    setPlaceId(store.place_id ?? "");
    setFormatted(store.formatted_address ?? "");
    setLat(store.lat != null ? String(store.lat) : "");
    setLng(store.lng != null ? String(store.lng) : "");
  }, [
    store.id,
    store.region,
    store.city,
    store.address_line1,
    store.district,
    store.address_line2,
    store.detail_address,
    store.place_id,
    store.formatted_address,
    store.lat,
    store.lng,
  ]);

  const save = async () => {
    const confirmed = await confirmAdminAction({
      level: "L1",
      ko,
      title: ko ? "매장 위치를 저장할까요?" : "Save store location?",
      confirmLabel: ko ? "저장" : "Save",
    });
    if (!confirmed.ok) return;

    const latTrim = lat.trim();
    const lngTrim = lng.trim();
    let latVal: number | null | undefined;
    let lngVal: number | null | undefined;
    if (latTrim === "" && lngTrim === "") {
      latVal = undefined;
      lngVal = undefined;
    } else if (latTrim === "" || lngTrim === "") {
      await dibayAlert({ title: t("admin_biz_location_coords_pair") });
      return;
    } else {
      const la = Number(latTrim);
      const ln = Number(lngTrim);
      if (!Number.isFinite(la) || !Number.isFinite(ln)) {
        await dibayAlert({ title: t("admin_biz_location_coords_invalid") });
        return;
      }
      latVal = la;
      lngVal = ln;
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        action: "set_store_location",
        region: region.trim() || null,
        city: city.trim() || null,
        address_line1: address1.trim() || null,
        address_line2: address2.trim() || null,
        detail_address: detailAddress.trim() || null,
        place_id: placeId.trim() || null,
        formatted_address: formatted.trim() || null,
      };
      if (latVal !== undefined && lngVal !== undefined) {
        body.lat = latVal;
        body.lng = lngVal;
      }
      const res = await fetch(`/api/admin/stores/${encodeURIComponent(store.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        await dibayAlert({ title: adminOperatorErrorMessage(j.error ?? "update_failed", ko) });
        return;
      }
      await dibayAlert({ title: ko ? "저장했습니다." : "Saved." });
      onSaved();
    } catch {
      await dibayAlert({ title: adminOperatorErrorMessage("network_error", ko) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 border-t border-sam-border-soft pt-3">
      <p className="sam-text-helper font-medium text-sam-fg">{t("admin_biz_manage_location")}</p>
      <p className="sam-text-helper text-sam-muted">{t("admin_biz_location_hint")}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="sam-text-helper text-sam-muted">{t("admin_biz_label_region")}</span>
          <input className={inputClass} value={region} disabled={busy || saving} onChange={(e) => setRegion(e.target.value)} />
        </label>
        <label className="block space-y-1">
          <span className="sam-text-helper text-sam-muted">{t("admin_biz_label_city")}</span>
          <input className={inputClass} value={city} disabled={busy || saving} onChange={(e) => setCity(e.target.value)} />
        </label>
      </div>
      <label className="block space-y-1">
        <span className="sam-text-helper text-sam-muted">{t("admin_biz_label_address1")}</span>
        <input className={inputClass} value={address1} disabled={busy || saving} onChange={(e) => setAddress1(e.target.value)} />
      </label>
      <label className="block space-y-1">
        <span className="sam-text-helper text-sam-muted">{t("admin_biz_label_address2")}</span>
        <input className={inputClass} value={address2} disabled={busy || saving} onChange={(e) => setAddress2(e.target.value)} />
      </label>
      <label className="block space-y-1">
        <span className="sam-text-helper text-sam-muted">{t("admin_biz_label_detail_address")}</span>
        <input
          className={inputClass}
          value={detailAddress}
          disabled={busy || saving}
          onChange={(e) => setDetailAddress(e.target.value)}
        />
      </label>
      <label className="block space-y-1">
        <span className="sam-text-helper text-sam-muted">{t("admin_biz_label_formatted_address")}</span>
        <input className={inputClass} value={formatted} disabled={busy || saving} onChange={(e) => setFormatted(e.target.value)} />
      </label>
      <label className="block space-y-1">
        <span className="sam-text-helper text-sam-muted">{t("admin_biz_label_place_id")}</span>
        <input className={inputClass} value={placeId} disabled={busy || saving} onChange={(e) => setPlaceId(e.target.value)} />
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="sam-text-helper text-sam-muted">{t("admin_biz_label_lat")}</span>
          <input className={inputClass} value={lat} disabled={busy || saving} onChange={(e) => setLat(e.target.value)} />
        </label>
        <label className="block space-y-1">
          <span className="sam-text-helper text-sam-muted">{t("admin_biz_label_lng")}</span>
          <input className={inputClass} value={lng} disabled={busy || saving} onChange={(e) => setLng(e.target.value)} />
        </label>
      </div>
      <button type="button" className={btnPrimaryClass} disabled={busy || saving} onClick={() => void save()}>
        {t("admin_biz_save_location")}
      </button>
    </div>
  );
}

export function AdminBusinessCcFeeOverrideEditor({
  storeId,
  fee,
  onSaved,
}: {
  storeId: string;
  fee: BusinessCcFeeSnapshot;
  onSaved: () => void;
}) {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [percent, setPercent] = useState(
    String(fee.storeOverrideFeePercent ?? fee.feePercent ?? 10)
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPercent(String(fee.storeOverrideFeePercent ?? fee.feePercent ?? 10));
  }, [storeId, fee.storeOverrideFeePercent, fee.feePercent]);

  const saveOverride = async () => {
    const confirmed = await confirmAdminAction({
      level: "L1",
      ko,
      title: ko ? "매장 개별 수수료를 저장할까요?" : "Save store fee override?",
      confirmLabel: ko ? "저장" : "Save",
    });
    if (!confirmed.ok) return;
    const feePercent = Number(percent);
    if (!Number.isFinite(feePercent) || feePercent < 0 || feePercent > 100) {
      await dibayAlert({ title: t("admin_biz_fee_percent_invalid") });
      return;
    }
    setBusy(true);
    try {
      if (fee.storeOverridePolicyId) {
        const res = await fetch(
          `/api/admin/store-fee-policies/${encodeURIComponent(fee.storeOverridePolicyId)}`,
          {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fee_percent: feePercent,
              is_active: true,
              starts_at: null,
              ends_at: null,
            }),
          }
        );
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !j.ok) {
          await dibayAlert({ title: adminOperatorErrorMessage(j.error ?? "update_failed", ko) });
          return;
        }
      } else {
        const res = await fetch("/api/admin/store-fee-policies", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            policy_name: `Store override ${storeId.slice(0, 8)}`,
            store_id: storeId,
            fee_percent: feePercent,
            fixed_fee: 0,
            delivery_fee_mode: "none",
            delivery_fee_percent: 0,
            is_active: true,
            priority: 10,
          }),
        });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !j.ok) {
          await dibayAlert({ title: adminOperatorErrorMessage(j.error ?? "update_failed", ko) });
          return;
        }
      }
      await dibayAlert({ title: ko ? "저장했습니다." : "Saved." });
      onSaved();
    } catch {
      await dibayAlert({ title: adminOperatorErrorMessage("network_error", ko) });
    } finally {
      setBusy(false);
    }
  };

  const clearOverride = async () => {
    if (!fee.storeOverridePolicyId) return;
    const confirmed = await confirmAdminAction({
      level: "L1",
      ko,
      title: ko ? "매장 개별 수수료를 해제할까요?" : "Remove store fee override?",
      confirmLabel: ko ? "해제" : "Remove",
      destructive: true,
    });
    if (!confirmed.ok) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/store-fee-policies/${encodeURIComponent(fee.storeOverridePolicyId)}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_active: false }),
        }
      );
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        await dibayAlert({ title: adminOperatorErrorMessage(j.error ?? "update_failed", ko) });
        return;
      }
      await dibayAlert({ title: ko ? "저장했습니다." : "Saved." });
      onSaved();
    } catch {
      await dibayAlert({ title: adminOperatorErrorMessage("network_error", ko) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 space-y-2 border-t border-sam-border-soft pt-3">
      <p className="sam-text-helper font-medium text-sam-fg">{t("admin_biz_manage_fee_override")}</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="block space-y-1">
          <span className="sam-text-helper text-sam-muted">{t("admin_biz_label_fee_percent")}</span>
          <input
            className={`${inputClass} w-28`}
            value={percent}
            disabled={busy}
            onChange={(e) => setPercent(e.target.value)}
          />
        </label>
        <button type="button" className={btnPrimaryClass} disabled={busy} onClick={() => void saveOverride()}>
          {fee.storeOverridePolicyId
            ? t("admin_biz_fee_update_override")
            : t("admin_biz_fee_create_override")}
        </button>
        {fee.storeOverridePolicyId ? (
          <button type="button" className={btnClass} disabled={busy} onClick={() => void clearOverride()}>
            {t("admin_biz_fee_clear_override")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function AdminBusinessCcDeliveryOverrideEditor({
  storeId,
  currentMode,
  currentDeliveryRadiusKm,
  currentEffectiveMaxKm,
  onSaved,
}: {
  storeId: string;
  currentMode: string | null;
  /** Configured stores.delivery_radius_km (null = unconfigured → effective 10). */
  currentDeliveryRadiusKm: number | null;
  currentEffectiveMaxKm: number | null;
  onSaved: () => void;
}) {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [mode, setMode] = useState<DeliveryStoreDistanceMode>(
    (currentMode as DeliveryStoreDistanceMode) || "inherit"
  );
  const [maxKm, setMaxKm] = useState(
    currentEffectiveMaxKm != null ? String(currentEffectiveMaxKm) : "10"
  );
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    setMode((currentMode as DeliveryStoreDistanceMode) || "inherit");
    setMaxKm(currentEffectiveMaxKm != null ? String(currentEffectiveMaxKm) : "10");
  }, [storeId, currentMode, currentDeliveryRadiusKm, currentEffectiveMaxKm]);

  const save = async () => {
    const confirmed = await confirmAdminAction({
      level: "L1",
      ko,
      title: ko ? "배달 반경·거리 정책을 저장할까요?" : "Save delivery radius and distance policy?",
      confirmLabel: ko ? "저장" : "Save",
    });
    if (!confirmed.ok) return;
    setBusy(true);
    setResult(null);
    try {
      const parsedKm = Number(maxKm);
      if (!Number.isFinite(parsedKm) || parsedKm <= 0) {
        await dibayAlert({ title: t("admin_biz_delivery_km_invalid") });
        return;
      }

      // DEF-58 — 단일 API: 반경 + 이 매장 거리 정책 모드. 서버가 전역 JSON 에 이 매장만 병합하고,
      // 화면이 불러온 모드와 서버 현재 모드가 다르면 409 → 재조회 안내 (덮어쓰기 금지).
      const res = await fetch(`/api/admin/stores/${encodeURIComponent(storeId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_store_delivery_distance",
          delivery_radius_km: Math.round(parsedKm * 10) / 10,
          distance_mode: mode,
          expected_distance_mode: currentMode || "inherit",
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || j.ok === false) {
        const code = j.error ?? "update_failed";
        await dibayAlert({ title: adminOperatorErrorMessage(code, ko) });
        if (code === "status_changed") onSaved();
        return;
      }
      setResult(ko ? "배달 반경·거리 정책을 저장했습니다." : "Delivery radius and distance policy saved.");
      onSaved();
    } catch {
      await dibayAlert({ title: adminOperatorErrorMessage("network_error", ko) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 space-y-2 border-t border-sam-border-soft pt-3">
      <p className="sam-text-helper font-medium text-sam-fg">{t("business_store_delivery_radius_label")}</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="block space-y-1">
          <span className="sam-text-helper text-sam-muted">{t("admin_biz_label_store_override")}</span>
          <select
            className={inputClass}
            value={mode}
            disabled={busy}
            onChange={(e) => setMode(e.target.value as DeliveryStoreDistanceMode)}
          >
            <option value="inherit">{ko ? "전역 정책 따름" : "Follow global policy"}</option>
            <option value="enabled">{ko ? "허용" : "Allowed"}</option>
            <option value="disabled">{ko ? "차단" : "Blocked"}</option>
          </select>
        </label>
        <label className="block space-y-1">
          <span className="sam-text-helper text-sam-muted">{t("business_store_delivery_radius_label")}</span>
          <input
            className={`${inputClass} w-28`}
            value={maxKm}
            disabled={busy}
            onChange={(e) => setMaxKm(e.target.value)}
            inputMode="decimal"
          />
        </label>
        <button type="button" className={btnPrimaryClass} disabled={busy} onClick={() => void save()}>
          {t("admin_biz_save_delivery_override")}
        </button>
      </div>
      {result ? (
        <p role="status" className="rounded-ui-rect border border-emerald-300 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-950">
          {result}
        </p>
      ) : null}
      <p className="sam-text-helper text-sam-muted">{t("business_store_delivery_radius_help")}</p>
      <AdminDeliveryServiceAreaEditor
        storeId={storeId}
        referenceRadiusKmDisplay={String(
          resolveEffectiveStoreDeliveryRadiusKm(
            currentDeliveryRadiusKm != null ? currentDeliveryRadiusKm : currentEffectiveMaxKm
          )
        )}
        onSaved={onSaved}
      />
    </div>
  );
}

/** Same stores row flags as Owner — set_delivery_flags (is_open / delivery / pickup). */
export function AdminBusinessCcOpsFlagsEditor({
  storeId,
  deliveryAvailable,
  pickupAvailable,
  isOpen,
  busy,
  onSaved,
}: {
  storeId: string;
  deliveryAvailable: boolean | null;
  pickupAvailable: boolean | null;
  isOpen: boolean | null;
  busy?: boolean;
  onSaved: () => void;
}) {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [deliveryOn, setDeliveryOn] = useState(deliveryAvailable !== false);
  const [pickupOn, setPickupOn] = useState(pickupAvailable !== false);
  const [openOn, setOpenOn] = useState(isOpen !== false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDeliveryOn(deliveryAvailable !== false);
    setPickupOn(pickupAvailable !== false);
    setOpenOn(isOpen !== false);
  }, [storeId, deliveryAvailable, pickupAvailable, isOpen]);

  const save = async () => {
    const confirmed = await confirmAdminAction({
      level: "L1",
      ko,
      title: ko ? "영업·배달·포장 설정을 저장할까요?" : "Save open, delivery and pickup settings?",
      confirmLabel: ko ? "저장" : "Save",
    });
    if (!confirmed.ok) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/stores/${encodeURIComponent(storeId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_delivery_flags",
          delivery_available: deliveryOn,
          pickup_available: pickupOn,
          is_open: openOn,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        await dibayAlert({ title: adminOperatorErrorMessage(j.error ?? "update_failed", ko) });
        return;
      }
      await dibayAlert({ title: ko ? "저장했습니다." : "Saved." });
      onSaved();
    } catch {
      await dibayAlert({ title: adminOperatorErrorMessage("network_error", ko) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 space-y-2 border-t border-sam-border-soft pt-3">
      <p className="sam-text-helper font-medium text-sam-fg">{t("admin_biz_manage_ops_flags")}</p>
      <p className="sam-text-helper text-sam-muted">{t("admin_biz_ops_flags_hint")}</p>
      <label className="flex items-center gap-2 sam-text-body">
        <input
          type="checkbox"
          checked={openOn}
          disabled={busy || saving}
          onChange={(e) => setOpenOn(e.target.checked)}
        />
        {t("admin_biz_label_is_open")}
      </label>
      <label className="flex items-center gap-2 sam-text-body">
        <input
          type="checkbox"
          checked={deliveryOn}
          disabled={busy || saving}
          onChange={(e) => setDeliveryOn(e.target.checked)}
        />
        {t("admin_biz_label_delivery_flag")}
      </label>
      <label className="flex items-center gap-2 sam-text-body">
        <input
          type="checkbox"
          checked={pickupOn}
          disabled={busy || saving}
          onChange={(e) => setPickupOn(e.target.checked)}
        />
        {t("admin_biz_label_pickup_flag")}
      </label>
      <button
        type="button"
        className={btnPrimaryClass}
        disabled={busy || saving}
        onClick={() => void save()}
      >
        {t("admin_biz_save_ops_flags")}
      </button>
    </div>
  );
}

/**
 * DEF-18 — 영업시간 편집 (Admin). 기존 PATCH `set_business_hours` 만 사용.
 * 직렬화는 사장님 폼과 같은 `applyAutoBusinessHoursToRecord` — 다른 business_hours_json 키는 보존한다.
 */
export function AdminBusinessCcBusinessHoursEditor({
  storeId,
  businessHoursJson,
  busy,
  onSaved,
}: {
  storeId: string;
  businessHoursJson: unknown;
  busy?: boolean;
  onSaved: () => void;
}) {
  const { language } = useI18n();
  const ko = language !== "en";
  const initial = useMemo(() => {
    const auto = readAutoHoursFormFields(businessHoursJson);
    const br = readBreakHoursFormFields(businessHoursJson);
    return {
      enabled: readAutoBusinessHoursEnabled(businessHoursJson),
      tz: auto.autoHoursTz,
      open: auto.autoHoursOpen,
      close: auto.autoHoursClose,
      breakOn: Boolean(br.breakHoursStart && br.breakHoursEnd),
      breakStart: br.breakHoursStart || "14:00",
      breakEnd: br.breakHoursEnd || "15:00",
    };
  }, [businessHoursJson]);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [tz, setTz] = useState(initial.tz);
  const [open, setOpen] = useState(initial.open);
  const [close, setClose] = useState(initial.close);
  const [breakOn, setBreakOn] = useState(initial.breakOn);
  const [breakStart, setBreakStart] = useState(initial.breakStart);
  const [breakEnd, setBreakEnd] = useState(initial.breakEnd);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setEnabled(initial.enabled);
    setTz(initial.tz);
    setOpen(initial.open);
    setClose(initial.close);
    setBreakOn(initial.breakOn);
    setBreakStart(initial.breakStart);
    setBreakEnd(initial.breakEnd);
  }, [storeId, initial]);

  const save = async () => {
    setResult(null);
    const o = normalizeHHMM(open.trim());
    const c = normalizeHHMM(close.trim());
    if (!o || !c || o === c) {
      setResult({
        ok: false,
        text: ko ? "여는 시간과 닫는 시간을 서로 다르게 입력하세요 (예: 09:00, 22:00)." : "Enter different open and close times (e.g. 09:00, 22:00).",
      });
      return;
    }
    const bs = normalizeHHMM(breakStart.trim());
    const be = normalizeHHMM(breakEnd.trim());
    if (breakOn && (!bs || !be || bs === be)) {
      setResult({
        ok: false,
        text: ko ? "쉬는 시간 시작·종료를 확인하세요." : "Check the break start and end times.",
      });
      return;
    }
    const confirmed = await confirmAdminAction({
      level: "L1",
      ko,
      title: ko ? "영업시간을 저장할까요?" : "Save business hours?",
      description: ko
        ? "저장하면 고객 앱의 영업 표시와 주문 가능 시간에 바로 반영됩니다."
        : "Customers see the new hours and ordering window immediately.",
      confirmLabel: ko ? "저장" : "Save",
    });
    if (!confirmed.ok) return;
    const next = coerceBusinessHoursRecord(businessHoursJson);
    delete next.break_hours;
    delete next.break_time;
    if (breakOn && bs && be) {
      next.break_hours = { start: bs, end: be };
      next.break_time = `${bs}–${be}`;
    }
    applyAutoBusinessHoursToRecord(next, {
      autoBusinessHoursEnabled: enabled,
      autoHoursTz: tz,
      autoHoursOpen: o,
      autoHoursClose: c,
    });
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/stores/${encodeURIComponent(storeId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_business_hours", business_hours_json: next }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setResult({ ok: false, text: adminOperatorErrorMessage(j.error ?? "update_failed", ko) });
        return;
      }
      setResult({ ok: true, text: ko ? "영업시간을 저장했습니다." : "Business hours saved." });
      onSaved();
    } catch {
      setResult({ ok: false, text: adminOperatorErrorMessage("network_error", ko) });
    } finally {
      setSaving(false);
    }
  };

  const disabled = Boolean(busy || saving);
  return (
    <div className="space-y-3" data-admin-business-hours-editor="1">
      <p className="sam-text-helper text-sam-muted">
        {ko
          ? "자동 영업시간을 켜면 아래 시간에만 주문을 받습니다. 끄면 사장님의 수동 영업 스위치만 따릅니다."
          : "With automatic hours on, orders are accepted only within these hours. Off = owner's manual open switch only."}
      </p>
      <label className="flex items-center gap-2 sam-text-body">
        <input type="checkbox" checked={enabled} disabled={disabled} onChange={(e) => setEnabled(e.target.checked)} />
        {ko ? "자동 영업시간 사용" : "Use automatic hours"}
      </label>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="block space-y-1">
          <span className="sam-text-helper text-sam-muted">{ko ? "시간대" : "Time zone"}</span>
          <select className={inputClass} value={tz} disabled={disabled} onChange={(e) => setTz(e.target.value)}>
            {STORE_AUTO_TIMEZONE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="sam-text-helper text-sam-muted">{ko ? "여는 시간" : "Opens"}</span>
          <input type="time" className={inputClass} value={open} disabled={disabled} onChange={(e) => setOpen(e.target.value)} />
        </label>
        <label className="block space-y-1">
          <span className="sam-text-helper text-sam-muted">{ko ? "닫는 시간" : "Closes"}</span>
          <input type="time" className={inputClass} value={close} disabled={disabled} onChange={(e) => setClose(e.target.value)} />
        </label>
      </div>
      <label className="flex items-center gap-2 sam-text-body">
        <input type="checkbox" checked={breakOn} disabled={disabled} onChange={(e) => setBreakOn(e.target.checked)} />
        {ko ? "쉬는 시간 사용" : "Use break time"}
      </label>
      {breakOn ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="sam-text-helper text-sam-muted">{ko ? "쉬는 시간 시작" : "Break starts"}</span>
            <input type="time" className={inputClass} value={breakStart} disabled={disabled} onChange={(e) => setBreakStart(e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="sam-text-helper text-sam-muted">{ko ? "쉬는 시간 종료" : "Break ends"}</span>
            <input type="time" className={inputClass} value={breakEnd} disabled={disabled} onChange={(e) => setBreakEnd(e.target.value)} />
          </label>
        </div>
      ) : null}
      {result ? (
        <p
          role={result.ok ? "status" : "alert"}
          className={`rounded-ui-rect border px-3 py-2 text-[13px] ${
            result.ok ? "border-emerald-300 bg-emerald-50 text-emerald-950" : "border-red-300 bg-red-50 text-red-900"
          }`}
        >
          {result.text}
        </p>
      ) : null}
      <button type="button" className={btnPrimaryClass} disabled={disabled} onClick={() => void save()}>
        {saving ? (ko ? "저장 중…" : "Saving…") : ko ? "저장" : "Save"}
      </button>
    </div>
  );
}
