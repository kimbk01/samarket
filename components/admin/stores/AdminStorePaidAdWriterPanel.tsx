"use client";

import { Fragment, useCallback, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Sam } from "@/lib/ui/sam-component-classes";

export type AdminStorePaidAdRow = {
  id: string;
  store_id: string;
  placement: string;
  title: string;
  headline: string;
  body_copy: string | null;
  image_url: string | null;
  start_at: string;
  end_at: string;
  is_active: boolean;
  computed_state: "active" | "upcoming" | "expired" | "inactive";
  exposure?: {
    actualExposureEligible: boolean;
    blockingReasons: string[];
    factors: Record<string, boolean>;
    surfaceAllowed: boolean;
    placement: string;
  };
};

type PaidAdFormState = {
  storeId: string;
  placement: "stores_home" | "stores_browse";
  title: string;
  headline: string;
  bodyCopy: string;
  imageUrl: string;
  startAt: string;
  endAt: string;
  isActive: boolean;
};

const emptyForm = (): PaidAdFormState => ({
  storeId: "",
  placement: "stores_home",
  title: "",
  headline: "",
  bodyCopy: "",
  imageUrl: "",
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

function resolvePaidAdWriterErrorMessage(
  code: string | undefined,
  t: ReturnType<typeof useI18n>["t"]
): string {
  if (!code) return t("admin_store_insertions_paid_ads_save_fail");
  const keyMap: Record<string, keyof typeof import("@/lib/i18n/catalog/admin-store-insertions").adminStoreInsertionsMessages.ko> = {
    invalid_window: "admin_store_insertions_paid_ads_err_invalid_window",
    empty_title: "admin_store_insertions_paid_ads_err_empty_title",
    empty_headline: "admin_store_insertions_paid_ads_err_empty_headline",
    invalid_start_at: "admin_store_insertions_paid_ads_err_invalid_start_at",
    invalid_end_at: "admin_store_insertions_paid_ads_err_invalid_end_at",
    invalid_placement: "admin_store_insertions_paid_ads_err_invalid_placement",
    store_not_found: "admin_store_insertions_paid_ads_err_store_not_found",
    store_not_eligible: "admin_store_insertions_paid_ads_err_store_not_eligible",
    missing_store_id: "admin_store_insertions_paid_ads_err_missing_store_id",
  };
  const key = keyMap[code];
  if (key) return t(key);
  return t("admin_store_insertions_paid_ads_save_fail");
}

type Props = {
  campaigns: AdminStorePaidAdRow[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  stateLabel: (state: AdminStorePaidAdRow["computed_state"]) => string;
};

export function AdminStorePaidAdWriterPanel({
  campaigns,
  loading,
  error,
  onRefresh,
  stateLabel,
}: Props) {
  const { t } = useI18n();
  const [createForm, setCreateForm] = useState<PaidAdFormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<PaidAdFormState>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const startEdit = useCallback((row: AdminStorePaidAdRow) => {
    setEditingId(row.id);
    setEditForm({
      storeId: row.store_id,
      placement: row.placement === "stores_browse" ? "stores_browse" : "stores_home",
      title: row.title,
      headline: row.headline,
      bodyCopy: row.body_copy ?? "",
      imageUrl: row.image_url ?? "",
      startAt: toDatetimeLocal(row.start_at),
      endAt: toDatetimeLocal(row.end_at),
      isActive: row.is_active,
    });
    setMsg(null);
    setSaveErr(null);
  }, []);

  const onCreate = async () => {
    setBusy(true);
    setMsg(null);
    setSaveErr(null);
    try {
      const res = await fetch("/api/admin/store-paid-ads", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: createForm.storeId.trim(),
          placement: createForm.placement,
          title: createForm.title,
          headline: createForm.headline,
          bodyCopy: createForm.bodyCopy.trim() || null,
          imageUrl: createForm.imageUrl.trim() || null,
          startAt: fromDatetimeLocal(createForm.startAt),
          endAt: fromDatetimeLocal(createForm.endAt),
          isActive: createForm.isActive,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setSaveErr(resolvePaidAdWriterErrorMessage(json.error, t));
        return;
      }
      setCreateForm(emptyForm());
      setMsg(t("admin_store_insertions_paid_ads_save_ok"));
      onRefresh();
    } catch {
      setSaveErr(t("admin_store_insertions_paid_ads_save_fail"));
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
      const res = await fetch("/api/admin/store-paid-ads", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          placement: editForm.placement,
          title: editForm.title,
          headline: editForm.headline,
          bodyCopy: editForm.bodyCopy.trim() || null,
          imageUrl: editForm.imageUrl.trim() || null,
          startAt: fromDatetimeLocal(editForm.startAt),
          endAt: fromDatetimeLocal(editForm.endAt),
          isActive: editForm.isActive,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setSaveErr(resolvePaidAdWriterErrorMessage(json.error, t));
        return;
      }
      setEditingId(null);
      setMsg(t("admin_store_insertions_paid_ads_save_ok"));
      onRefresh();
    } catch {
      setSaveErr(t("admin_store_insertions_paid_ads_save_fail"));
    } finally {
      setBusy(false);
    }
  };

  const onDeactivate = async (id: string) => {
    setBusy(true);
    setMsg(null);
    setSaveErr(null);
    try {
      const res = await fetch("/api/admin/store-paid-ads", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, isActive: false }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setSaveErr(resolvePaidAdWriterErrorMessage(json.error, t));
        return;
      }
      if (editingId === id) setEditingId(null);
      setMsg(t("admin_store_insertions_paid_ads_save_ok"));
      onRefresh();
    } catch {
      setSaveErr(t("admin_store_insertions_paid_ads_save_fail"));
    } finally {
      setBusy(false);
    }
  };

  const renderFormFields = (
    form: PaidAdFormState,
    setForm: (f: PaidAdFormState) => void,
    opts: { showStoreId: boolean }
  ) => (
    <div className="grid gap-2 sm:grid-cols-2">
      {opts.showStoreId ? (
        <label className="block text-[12px] text-sam-muted sm:col-span-2">
          {t("admin_store_insertions_paid_ads_field_store_id")}
          <input
            className="mt-1 block w-full rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5 text-[13px] text-sam-fg"
            value={form.storeId}
            onChange={(e) => setForm({ ...form, storeId: e.target.value })}
          />
        </label>
      ) : null}
      <label className="block text-[12px] text-sam-muted">
        {t("admin_store_insertions_paid_ads_field_placement")}
        <select
          className="mt-1 block w-full rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5 text-[13px] text-sam-fg"
          value={form.placement}
          onChange={(e) =>
            setForm({
              ...form,
              placement: e.target.value === "stores_browse" ? "stores_browse" : "stores_home",
            })
          }
        >
          <option value="stores_home">
            {t("admin_store_insertions_paid_ads_placement_stores_home")}
          </option>
          <option value="stores_browse">
            {t("admin_store_insertions_paid_ads_placement_stores_browse")}
          </option>
        </select>
      </label>
      <label className="block text-[12px] text-sam-muted">
        {t("admin_store_insertions_paid_ads_field_active")}
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
        {t("admin_store_insertions_paid_ads_field_title")}
        <input
          className="mt-1 block w-full rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5 text-[13px] text-sam-fg"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
      </label>
      <label className="block text-[12px] text-sam-muted sm:col-span-2">
        {t("admin_store_insertions_paid_ads_field_headline")}
        <input
          className="mt-1 block w-full rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5 text-[13px] text-sam-fg"
          value={form.headline}
          onChange={(e) => setForm({ ...form, headline: e.target.value })}
        />
      </label>
      <label className="block text-[12px] text-sam-muted sm:col-span-2">
        {t("admin_store_insertions_paid_ads_field_body")}
        <textarea
          className="mt-1 block min-h-[64px] w-full rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5 text-[13px] text-sam-fg"
          value={form.bodyCopy}
          onChange={(e) => setForm({ ...form, bodyCopy: e.target.value })}
        />
      </label>
      <label className="block text-[12px] text-sam-muted sm:col-span-2">
        {t("admin_store_insertions_paid_ads_field_image")}
        <input
          className="mt-1 block w-full rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5 text-[13px] text-sam-fg"
          value={form.imageUrl}
          onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
        />
      </label>
      <label className="block text-[12px] text-sam-muted">
        {t("admin_store_insertions_paid_ads_field_start")}
        <input
          type="datetime-local"
          className="mt-1 block w-full rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5 text-[13px] text-sam-fg"
          value={form.startAt}
          onChange={(e) => setForm({ ...form, startAt: e.target.value })}
        />
      </label>
      <label className="block text-[12px] text-sam-muted">
        {t("admin_store_insertions_paid_ads_field_end")}
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
          {t("admin_store_insertions_paid_ads_writer_badge")}
        </span>
        {msg ? <span className="text-[12px] text-green-700">{msg}</span> : null}
        {saveErr ? <span className="text-[12px] text-red-700">{saveErr}</span> : null}
      </div>

      <div className="mb-4 rounded-ui-rect border border-sam-border/80 p-3">
        <h3 className="mb-2 text-[13px] font-semibold text-sam-fg">
          {t("admin_store_insertions_paid_ads_create_title")}
        </h3>
        {renderFormFields(createForm, setCreateForm, { showStoreId: true })}
        <div className="mt-3">
          <button
            type="button"
            className={Sam.btn.primary}
            disabled={busy}
            onClick={() => void onCreate()}
          >
            {t("admin_store_insertions_paid_ads_create_btn")}
          </button>
        </div>
      </div>

      {error ? (
        <p className="mb-2 text-[13px] text-red-700">{t("admin_store_insertions_paid_ads_fail")}</p>
      ) : null}
      {loading ? (
        <p className="text-[13px] text-sam-muted">{t("admin_store_insertions_paid_ads_loading")}</p>
      ) : campaigns.length === 0 ? (
        <p className="text-[13px] text-sam-muted">{t("admin_store_insertions_paid_ads_empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-[12px]">
            <thead className="text-sam-muted">
              <tr>
                <th className="px-2 py-1 font-medium">
                  {t("admin_store_insertions_paid_ads_col_store")}
                </th>
                <th className="px-2 py-1 font-medium">
                  {t("admin_store_insertions_paid_ads_col_placement")}
                </th>
                <th className="px-2 py-1 font-medium">
                  {t("admin_store_insertions_paid_ads_col_title")}
                </th>
                <th className="px-2 py-1 font-medium">
                  {t("admin_store_insertions_paid_ads_col_headline")}
                </th>
                <th className="px-2 py-1 font-medium">
                  {t("admin_store_insertions_paid_ads_col_start")}
                </th>
                <th className="px-2 py-1 font-medium">
                  {t("admin_store_insertions_paid_ads_col_end")}
                </th>
                <th className="px-2 py-1 font-medium">
                  {t("admin_store_insertions_paid_ads_col_active")}
                </th>
                <th className="px-2 py-1 font-medium">
                  {t("admin_store_insertions_paid_ads_col_state")}
                </th>
                <th className="px-2 py-1 font-medium">
                  {t("admin_store_paid_ads_exposure")}
                </th>
                <th className="px-2 py-1 font-medium">
                  {t("admin_store_paid_ads_blocking")}
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
                    <td className="px-2 py-1.5">{c.placement}</td>
                    <td className="px-2 py-1.5">{c.title}</td>
                    <td className="px-2 py-1.5">{c.headline}</td>
                    <td className="whitespace-nowrap px-2 py-1.5">{c.start_at}</td>
                    <td className="whitespace-nowrap px-2 py-1.5">{c.end_at}</td>
                    <td className="px-2 py-1.5">{c.is_active ? "true" : "false"}</td>
                    <td className="px-2 py-1.5">{stateLabel(c.computed_state)}</td>
                    <td className="px-2 py-1.5">
                      {c.exposure?.actualExposureEligible
                        ? t("admin_store_paid_ads_exposure_eligible")
                        : t("admin_store_paid_ads_exposure_blocked")}
                    </td>
                    <td className="px-2 py-1.5 text-[10px] text-sam-muted">
                      {(c.exposure?.blockingReasons ?? []).join(", ") || "—"}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5">
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          className={Sam.btn.secondary}
                          disabled={busy}
                          onClick={() => startEdit(c)}
                        >
                          {t("admin_store_insertions_paid_ads_edit_btn")}
                        </button>
                        {c.is_active ? (
                          <button
                            type="button"
                            className={Sam.btn.secondary}
                            disabled={busy}
                            onClick={() => void onDeactivate(c.id)}
                          >
                            {t("admin_store_insertions_paid_ads_deactivate_btn")}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                  {editingId === c.id ? (
                    <tr className="border-t border-sam-border/40 bg-sam-app/40">
                      <td colSpan={9} className="px-2 py-3">
                        <h4 className="mb-2 text-[13px] font-semibold">
                          {t("admin_store_insertions_paid_ads_edit_title")}
                        </h4>
                        {renderFormFields(editForm, setEditForm, { showStoreId: false })}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            className={Sam.btn.primary}
                            disabled={busy}
                            onClick={() => void onSaveEdit()}
                          >
                            {t("admin_store_insertions_paid_ads_save_btn")}
                          </button>
                          <button
                            type="button"
                            className={Sam.btn.secondary}
                            disabled={busy}
                            onClick={() => setEditingId(null)}
                          >
                            {t("admin_store_insertions_paid_ads_cancel_btn")}
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
