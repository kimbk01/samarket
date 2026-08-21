"use client";

import { dibayAlert, dibayConfirm } from "@/components/ui/dibay-overlay";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AdminStoreReviewRow } from "@/components/admin/stores/admin-store-review-model";
import type { BusinessCcFeeSnapshot } from "@/lib/admin-business/load-business-control-center-detail";
import type { DeliveryStoreDistanceMode } from "@/lib/delivery/delivery-ops-settings";

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
  const { t } = useI18n();
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
    const ok = await dibayConfirm({
      title: t("admin_biz_action_confirm_title"),
      confirmLabel: t("admin_biz_yes"),
      cancelLabel: t("admin_biz_no"),
    });
    if (!ok) return;
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
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        await dibayAlert({ title: j.error ?? t("common_content_unavailable") });
        return;
      }
      onSaved();
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
  const { t } = useI18n();
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
    const ok = await dibayConfirm({
      title: t("admin_biz_action_confirm_title"),
      confirmLabel: t("admin_biz_yes"),
      cancelLabel: t("admin_biz_no"),
    });
    if (!ok) return;
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
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        await dibayAlert({ title: j.error ?? t("common_content_unavailable") });
        return;
      }
      onSaved();
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
  const { t } = useI18n();
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
    const ok = await dibayConfirm({
      title: t("admin_biz_action_confirm_title"),
      confirmLabel: t("admin_biz_yes"),
      cancelLabel: t("admin_biz_no"),
    });
    if (!ok) return;

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
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        await dibayAlert({ title: j.error ?? t("common_content_unavailable") });
        return;
      }
      onSaved();
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
  const { t } = useI18n();
  const [percent, setPercent] = useState(
    String(fee.storeOverrideFeePercent ?? fee.feePercent ?? 10)
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPercent(String(fee.storeOverrideFeePercent ?? fee.feePercent ?? 10));
  }, [storeId, fee.storeOverrideFeePercent, fee.feePercent]);

  const saveOverride = async () => {
    const ok = await dibayConfirm({
      title: t("admin_biz_action_confirm_title"),
      confirmLabel: t("admin_biz_yes"),
      cancelLabel: t("admin_biz_no"),
    });
    if (!ok) return;
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
        const j = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !j.ok) {
          await dibayAlert({ title: j.error ?? t("common_content_unavailable") });
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
        const j = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !j.ok) {
          await dibayAlert({ title: j.error ?? t("common_content_unavailable") });
          return;
        }
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  const clearOverride = async () => {
    if (!fee.storeOverridePolicyId) return;
    const ok = await dibayConfirm({
      title: t("admin_biz_action_confirm_title"),
      confirmLabel: t("admin_biz_yes"),
      cancelLabel: t("admin_biz_no"),
    });
    if (!ok) return;
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
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        await dibayAlert({ title: j.error ?? t("common_content_unavailable") });
        return;
      }
      onSaved();
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
  currentMaxKm,
  onSaved,
}: {
  storeId: string;
  currentMode: string | null;
  currentMaxKm: number | null;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<DeliveryStoreDistanceMode>(
    (currentMode as DeliveryStoreDistanceMode) || "inherit"
  );
  const [maxKm, setMaxKm] = useState(currentMaxKm != null ? String(currentMaxKm) : "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMode((currentMode as DeliveryStoreDistanceMode) || "inherit");
    setMaxKm(currentMaxKm != null ? String(currentMaxKm) : "");
  }, [storeId, currentMode, currentMaxKm]);

  const save = async () => {
    const ok = await dibayConfirm({
      title: t("admin_biz_action_confirm_title"),
      confirmLabel: t("admin_biz_yes"),
      cancelLabel: t("admin_biz_no"),
    });
    if (!ok) return;
    setBusy(true);
    try {
      const getRes = await fetch("/api/admin/delivery/settings", {
        credentials: "include",
        cache: "no-store",
      });
      const getJson = (await getRes.json()) as {
        ok?: boolean;
        store_distance_overrides?: { stores?: Record<string, { mode?: string; maxKm?: number | null }> };
        error?: string;
      };
      if (!getRes.ok || getJson.ok === false) {
        await dibayAlert({ title: getJson.error ?? t("common_content_unavailable") });
        return;
      }
      const stores = { ...(getJson.store_distance_overrides?.stores ?? {}) };
      const parsedKm = maxKm.trim() === "" ? null : Number(maxKm);
      if (parsedKm != null && (!Number.isFinite(parsedKm) || parsedKm <= 0)) {
        await dibayAlert({ title: t("admin_biz_delivery_km_invalid") });
        return;
      }
      if (mode === "inherit" && parsedKm == null) {
        delete stores[storeId];
      } else {
        stores[storeId] = { mode, maxKm: parsedKm };
      }
      const putRes = await fetch("/api/admin/delivery/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store_distance_overrides: { stores } }),
      });
      const putJson = (await putRes.json()) as { ok?: boolean; error?: string };
      if (!putRes.ok || putJson.ok === false) {
        await dibayAlert({ title: putJson.error ?? t("common_content_unavailable") });
        return;
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 space-y-2 border-t border-sam-border-soft pt-3">
      <p className="sam-text-helper font-medium text-sam-fg">{t("admin_biz_manage_delivery_override")}</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="block space-y-1">
          <span className="sam-text-helper text-sam-muted">{t("admin_biz_label_store_override")}</span>
          <select
            className={inputClass}
            value={mode}
            disabled={busy}
            onChange={(e) => setMode(e.target.value as DeliveryStoreDistanceMode)}
          >
            <option value="inherit">inherit</option>
            <option value="enabled">enabled</option>
            <option value="disabled">disabled</option>
          </select>
        </label>
        <label className="block space-y-1">
          <span className="sam-text-helper text-sam-muted">{t("admin_biz_label_max_km")}</span>
          <input
            className={`${inputClass} w-28`}
            value={maxKm}
            disabled={busy}
            onChange={(e) => setMaxKm(e.target.value)}
            placeholder="e.g. 5"
          />
        </label>
        <button type="button" className={btnPrimaryClass} disabled={busy} onClick={() => void save()}>
          {t("admin_biz_save_delivery_override")}
        </button>
      </div>
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
  const { t } = useI18n();
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
    const ok = await dibayConfirm({
      title: t("admin_biz_action_confirm_title"),
      confirmLabel: t("admin_biz_yes"),
      cancelLabel: t("admin_biz_no"),
    });
    if (!ok) return;
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
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        await dibayAlert({ title: j.error ?? t("common_content_unavailable") });
        return;
      }
      onSaved();
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
        {t("admin_biz_label_is_open")} (is_open)
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
