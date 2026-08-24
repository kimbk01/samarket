"use client";

import { Fragment, useCallback, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Sam } from "@/lib/ui/sam-component-classes";

export type AdminStoreCouponRow = {
  id: string;
  store_id: string;
  title: string;
  discount_type: string;
  discount_value: number;
  min_order_amount: number | null;
  terms_copy: string | null;
  start_at: string;
  end_at: string;
  is_active: boolean;
  computed_state: "active" | "upcoming" | "expired" | "inactive";
};

type CouponFormState = {
  storeId: string;
  title: string;
  discountType: "percent" | "fixed_amount";
  discountValue: string;
  minOrderAmount: string;
  termsCopy: string;
  startAt: string;
  endAt: string;
  isActive: boolean;
};

const emptyForm = (): CouponFormState => ({
  storeId: "",
  title: "",
  discountType: "percent",
  discountValue: "",
  minOrderAmount: "",
  termsCopy: "",
  startAt: "",
  endAt: "",
  isActive: true,
});

function toDatetimeLocal(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocal(value: string): string {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toISOString();
}

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function resolveCouponWriterErrorMessage(
  code: string | undefined,
  t: ReturnType<typeof useI18n>["t"]
): string {
  if (!code) return t("admin_store_insertions_coupons_save_fail");
  const keyMap: Record<string, keyof typeof import("@/lib/i18n/catalog/admin-store-insertions").adminStoreInsertionsMessages.ko> = {
    invalid_window: "admin_store_insertions_coupons_err_invalid_window",
    empty_title: "admin_store_insertions_coupons_err_empty_title",
    invalid_start_at: "admin_store_insertions_coupons_err_invalid_start_at",
    invalid_end_at: "admin_store_insertions_coupons_err_invalid_end_at",
    invalid_discount_type: "admin_store_insertions_coupons_err_invalid_discount_type",
    invalid_discount_value: "admin_store_insertions_coupons_err_invalid_discount_value",
    store_not_found: "admin_store_insertions_coupons_err_store_not_found",
    store_not_eligible: "admin_store_insertions_coupons_err_store_not_eligible",
    missing_store_id: "admin_store_insertions_coupons_err_missing_store_id",
  };
  const key = keyMap[code];
  if (key) return t(key);
  return t("admin_store_insertions_coupons_save_fail");
}

type Props = {
  campaigns: AdminStoreCouponRow[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  stateLabel: (state: AdminStoreCouponRow["computed_state"]) => string;
};

export function AdminStoreCouponWriterPanel({
  campaigns,
  loading,
  error,
  onRefresh,
  stateLabel,
}: Props) {
  const { t } = useI18n();
  const [createForm, setCreateForm] = useState<CouponFormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<CouponFormState>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const startEdit = useCallback((row: AdminStoreCouponRow) => {
    setEditingId(row.id);
    setEditForm({
      storeId: row.store_id,
      title: row.title,
      discountType: row.discount_type === "fixed_amount" ? "fixed_amount" : "percent",
      discountValue: String(row.discount_value),
      minOrderAmount: row.min_order_amount == null ? "" : String(row.min_order_amount),
      termsCopy: row.terms_copy ?? "",
      startAt: toDatetimeLocal(row.start_at),
      endAt: toDatetimeLocal(row.end_at),
      isActive: row.is_active,
    });
    setMsg(null);
    setSaveErr(null);
  }, []);

  const buildCreatePayload = (form: CouponFormState) => {
    const discountValue = parseOptionalNumber(form.discountValue);
    return {
      storeId: form.storeId.trim(),
      title: form.title,
      discountType: form.discountType,
      discountValue,
      minOrderAmount: parseOptionalNumber(form.minOrderAmount),
      termsCopy: form.termsCopy.trim() || null,
      startAt: fromDatetimeLocal(form.startAt),
      endAt: fromDatetimeLocal(form.endAt),
      isActive: form.isActive,
    };
  };

  const buildEditPayload = (id: string, form: CouponFormState) => {
    const discountValue = parseOptionalNumber(form.discountValue);
    return {
      id,
      title: form.title,
      discountType: form.discountType,
      discountValue,
      minOrderAmount: parseOptionalNumber(form.minOrderAmount),
      termsCopy: form.termsCopy.trim() || null,
      startAt: fromDatetimeLocal(form.startAt),
      endAt: fromDatetimeLocal(form.endAt),
      isActive: form.isActive,
    };
  };

  const onCreate = async () => {
    setBusy(true);
    setMsg(null);
    setSaveErr(null);
    try {
      const res = await fetch("/api/admin/store-coupons", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildCreatePayload(createForm)),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setSaveErr(resolveCouponWriterErrorMessage(json.error, t));
        return;
      }
      setCreateForm(emptyForm());
      setMsg(t("admin_store_insertions_coupons_save_ok"));
      onRefresh();
    } catch {
      setSaveErr(t("admin_store_insertions_coupons_save_fail"));
    } finally {
      setBusy(false);
    }
  };

  const onSaveEdit = async () => {
    if (!editingId) return;
    setBusy(true);
    setMsg(null);
    setSaveErr(null);
    try {
      const res = await fetch("/api/admin/store-coupons", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildEditPayload(editingId, editForm)),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setSaveErr(resolveCouponWriterErrorMessage(json.error, t));
        return;
      }
      setEditingId(null);
      setMsg(t("admin_store_insertions_coupons_save_ok"));
      onRefresh();
    } catch {
      setSaveErr(t("admin_store_insertions_coupons_save_fail"));
    } finally {
      setBusy(false);
    }
  };

  const onDeactivate = async (id: string) => {
    setBusy(true);
    setMsg(null);
    setSaveErr(null);
    try {
      const res = await fetch("/api/admin/store-coupons", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, isActive: false }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setSaveErr(resolveCouponWriterErrorMessage(json.error, t));
        return;
      }
      if (editingId === id) setEditingId(null);
      setMsg(t("admin_store_insertions_coupons_save_ok"));
      onRefresh();
    } catch {
      setSaveErr(t("admin_store_insertions_coupons_save_fail"));
    } finally {
      setBusy(false);
    }
  };

  const formatDiscount = (row: AdminStoreCouponRow) =>
    `${row.discount_type} / ${row.discount_value}`;

  const renderFormFields = (
    form: CouponFormState,
    setForm: (f: CouponFormState) => void,
    opts: { showStoreId: boolean }
  ) => (
    <div className="grid gap-2 sm:grid-cols-2">
      {opts.showStoreId ? (
        <label className="block text-[12px] text-sam-muted sm:col-span-2">
          {t("admin_store_insertions_coupons_field_store_id")}
          <input
            className="mt-1 block w-full rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5 text-[13px] text-sam-fg"
            value={form.storeId}
            onChange={(e) => setForm({ ...form, storeId: e.target.value })}
          />
        </label>
      ) : null}
      <label className="block text-[12px] text-sam-muted">
        {t("admin_store_insertions_coupons_field_discount_type")}
        <select
          className="mt-1 block w-full rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5 text-[13px] text-sam-fg"
          value={form.discountType}
          onChange={(e) =>
            setForm({
              ...form,
              discountType: e.target.value === "fixed_amount" ? "fixed_amount" : "percent",
            })
          }
        >
          <option value="percent">{t("admin_store_insertions_coupons_type_percent")}</option>
          <option value="fixed_amount">
            {t("admin_store_insertions_coupons_type_fixed_amount")}
          </option>
        </select>
      </label>
      <label className="block text-[12px] text-sam-muted">
        {t("admin_store_insertions_coupons_field_active")}
        <select
          className="mt-1 block w-full rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5 text-[13px] text-sam-fg"
          value={form.isActive ? "true" : "false"}
          onChange={(e) => setForm({ ...form, isActive: e.target.value === "true" })}
        >
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      </label>
      <label className="block text-[12px] text-sam-muted sm:col-span-2">
        {t("admin_store_insertions_coupons_field_title")}
        <input
          className="mt-1 block w-full rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5 text-[13px] text-sam-fg"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
      </label>
      <label className="block text-[12px] text-sam-muted">
        {t("admin_store_insertions_coupons_field_discount_value")}
        <input
          type="number"
          className="mt-1 block w-full rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5 text-[13px] text-sam-fg"
          value={form.discountValue}
          onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
        />
      </label>
      <label className="block text-[12px] text-sam-muted">
        {t("admin_store_insertions_coupons_field_min_order")}
        <input
          type="number"
          className="mt-1 block w-full rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5 text-[13px] text-sam-fg"
          value={form.minOrderAmount}
          onChange={(e) => setForm({ ...form, minOrderAmount: e.target.value })}
        />
      </label>
      <label className="block text-[12px] text-sam-muted sm:col-span-2">
        {t("admin_store_insertions_coupons_field_terms")}
        <textarea
          className="mt-1 block min-h-[64px] w-full rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5 text-[13px] text-sam-fg"
          value={form.termsCopy}
          onChange={(e) => setForm({ ...form, termsCopy: e.target.value })}
        />
      </label>
      <label className="block text-[12px] text-sam-muted">
        {t("admin_store_insertions_coupons_field_start")}
        <input
          type="datetime-local"
          className="mt-1 block w-full rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5 text-[13px] text-sam-fg"
          value={form.startAt}
          onChange={(e) => setForm({ ...form, startAt: e.target.value })}
        />
      </label>
      <label className="block text-[12px] text-sam-muted">
        {t("admin_store_insertions_coupons_field_end")}
        <input
          type="datetime-local"
          className="mt-1 block w-full rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5 text-[13px] text-sam-fg"
          value={form.endAt}
          onChange={(e) => setForm({ ...form, endAt: e.target.value })}
        />
      </label>
    </div>
  );

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-ui-rect border border-sam-border px-2 text-[12px] text-sam-muted">
          {t("admin_store_insertions_coupons_writer_badge")}
        </span>
        {msg ? <span className="text-[12px] text-green-700">{msg}</span> : null}
        {saveErr ? <span className="text-[12px] text-red-700">{saveErr}</span> : null}
      </div>

      <div className="mb-4 rounded-ui-rect border border-sam-border/80 p-3">
        <h3 className="mb-2 text-[13px] font-semibold text-sam-fg">
          {t("admin_store_insertions_coupons_create_title")}
        </h3>
        {renderFormFields(createForm, setCreateForm, { showStoreId: true })}
        <div className="mt-3">
          <button
            type="button"
            className={Sam.btn.primary}
            disabled={busy}
            onClick={() => void onCreate()}
          >
            {t("admin_store_insertions_coupons_create_btn")}
          </button>
        </div>
      </div>

      {error ? (
        <p className="mb-2 text-[13px] text-red-700">{t("admin_store_insertions_coupons_fail")}</p>
      ) : null}
      {loading ? (
        <p className="text-[13px] text-sam-muted">{t("admin_store_insertions_coupons_loading")}</p>
      ) : campaigns.length === 0 ? (
        <p className="text-[13px] text-sam-muted">{t("admin_store_insertions_coupons_empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-[12px]">
            <thead className="text-sam-muted">
              <tr>
                <th className="px-2 py-1 font-medium">
                  {t("admin_store_insertions_coupons_col_store")}
                </th>
                <th className="px-2 py-1 font-medium">
                  {t("admin_store_insertions_coupons_col_title")}
                </th>
                <th className="px-2 py-1 font-medium">
                  {t("admin_store_insertions_coupons_col_discount")}
                </th>
                <th className="px-2 py-1 font-medium">
                  {t("admin_store_insertions_coupons_col_min_order")}
                </th>
                <th className="px-2 py-1 font-medium">
                  {t("admin_store_insertions_coupons_col_start")}
                </th>
                <th className="px-2 py-1 font-medium">
                  {t("admin_store_insertions_coupons_col_end")}
                </th>
                <th className="px-2 py-1 font-medium">
                  {t("admin_store_insertions_coupons_col_active")}
                </th>
                <th className="px-2 py-1 font-medium">
                  {t("admin_store_insertions_coupons_col_state")}
                </th>
                <th className="px-2 py-1 font-medium" />
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <Fragment key={c.id}>
                  <tr className="border-t border-sam-border/70 text-sam-fg">
                    <td className="px-2 py-1.5">
                      <div className="text-[11px] text-sam-muted">{c.store_id}</div>
                    </td>
                    <td className="px-2 py-1.5">{c.title}</td>
                    <td className="px-2 py-1.5">{formatDiscount(c)}</td>
                    <td className="px-2 py-1.5">
                      {c.min_order_amount == null ? "—" : c.min_order_amount}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5">{c.start_at}</td>
                    <td className="whitespace-nowrap px-2 py-1.5">{c.end_at}</td>
                    <td className="px-2 py-1.5">{c.is_active ? "true" : "false"}</td>
                    <td className="px-2 py-1.5">{stateLabel(c.computed_state)}</td>
                    <td className="whitespace-nowrap px-2 py-1.5">
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          className={Sam.btn.secondary}
                          disabled={busy}
                          onClick={() => startEdit(c)}
                        >
                          {t("admin_store_insertions_coupons_edit_btn")}
                        </button>
                        {c.is_active ? (
                          <button
                            type="button"
                            className={Sam.btn.secondary}
                            disabled={busy}
                            onClick={() => void onDeactivate(c.id)}
                          >
                            {t("admin_store_insertions_coupons_deactivate_btn")}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                  {editingId === c.id ? (
                    <tr className="border-t border-sam-border/40 bg-sam-app/40">
                      <td colSpan={9} className="px-2 py-3">
                        <h4 className="mb-2 text-[13px] font-semibold">
                          {t("admin_store_insertions_coupons_edit_title")}
                        </h4>
                        {renderFormFields(editForm, setEditForm, { showStoreId: false })}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            className={Sam.btn.primary}
                            disabled={busy}
                            onClick={() => void onSaveEdit()}
                          >
                            {t("admin_store_insertions_coupons_save_btn")}
                          </button>
                          <button
                            type="button"
                            className={Sam.btn.secondary}
                            disabled={busy}
                            onClick={() => setEditingId(null)}
                          >
                            {t("admin_store_insertions_coupons_cancel_btn")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
