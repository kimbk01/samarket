"use client";

import { AdminDestinationResolvedHint } from "@/components/admin/destination/AdminDestinationResolvedHint";
import { Fragment, useCallback, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Sam } from "@/lib/ui/sam-component-classes";
import { adminIsoToManilaInput, adminManilaInputToIso } from "@/lib/admin/operator-ux/admin-manila-datetime-input";

export type AdminStoreBannerAdRow = {
  id: string;
  surface: string;
  title: string | null;
  subtitle: string | null;
  image_url: string;
  cta_href: string;
  sort_order: number;
  start_at: string;
  end_at: string;
  is_active: boolean;
  computed_state: "active" | "scheduled" | "expired" | "inactive" | "invalid_creative";
  visibility?: {
    visible: boolean;
    blockingReasons: string[];
    factors: Record<string, boolean>;
  };
};

type BannerFormState = {
  title: string;
  subtitle: string;
  imageUrl: string;
  ctaHref: string;
  sortOrder: string;
  startAt: string;
  endAt: string;
  isActive: boolean;
};

const emptyForm = (): BannerFormState => ({
  title: "",
  subtitle: "",
  imageUrl: "",
  ctaHref: "",
  sortOrder: "0",
  startAt: "",
  endAt: "",
  isActive: true,
});

/** v4 재감사 UI-16 — 관리자 시각 입력은 필리핀 시간(PHT) 고정 (기기 시간대 무관, W4 공용 변환). */
function toDatetimeLocal(iso: string): string {
  return adminIsoToManilaInput(iso);
}

/** PHT 입력 → ISO. 수정 시 원래 값과 같은 칸은 원래 ISO 그대로(초 보존). 빈 값·형식 오류 = "" (기존 계약). */
function fromDatetimeLocal(value: string, originalIso?: string | null): string {
  return adminManilaInputToIso(value, originalIso) ?? "";
}

type Props = {
  campaigns: AdminStoreBannerAdRow[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  stateLabel: (state: AdminStoreBannerAdRow["computed_state"]) => string;
};

export function AdminStoreBannerAdWriterPanel({
  campaigns,
  loading,
  error,
  onRefresh,
  stateLabel,
}: Props) {
  const { t } = useI18n();
  const [createForm, setCreateForm] = useState<BannerFormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingRow = editingId ? campaigns.find((c) => c.id === editingId) ?? null : null;
  const [editForm, setEditForm] = useState<BannerFormState>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const startEdit = useCallback((row: AdminStoreBannerAdRow) => {
    setEditingId(row.id);
    setEditForm({
      title: row.title ?? "",
      subtitle: row.subtitle ?? "",
      imageUrl: row.image_url,
      ctaHref: row.cta_href,
      sortOrder: String(row.sort_order ?? 0),
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
      const res = await fetch("/api/admin/store-banner-ads", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          surface: "stores_home_hero",
          title: createForm.title.trim() || null,
          subtitle: createForm.subtitle.trim() || null,
          imageUrl: createForm.imageUrl.trim(),
          ctaHref: createForm.ctaHref.trim(),
          sortOrder: Number(createForm.sortOrder) || 0,
          startAt: fromDatetimeLocal(createForm.startAt),
          endAt: fromDatetimeLocal(createForm.endAt),
          isActive: createForm.isActive,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setSaveErr(json.error ?? t("admin_store_banner_ads_save_fail"));
        return;
      }
      setCreateForm(emptyForm());
      setMsg(t("admin_store_banner_ads_save_ok"));
      onRefresh();
    } catch {
      setSaveErr(t("admin_store_banner_ads_save_fail"));
    } finally {
      setBusy(false);
    }
  };

  const onUpdate = async () => {
    if (!editingId) return;
    setBusy(true);
    setMsg(null);
    setSaveErr(null);
    try {
      const res = await fetch("/api/admin/store-banner-ads", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          title: editForm.title.trim() || null,
          subtitle: editForm.subtitle.trim() || null,
          imageUrl: editForm.imageUrl.trim(),
          ctaHref: editForm.ctaHref.trim(),
          sortOrder: Number(editForm.sortOrder) || 0,
          startAt: fromDatetimeLocal(editForm.startAt, editingRow?.start_at),
          endAt: fromDatetimeLocal(editForm.endAt, editingRow?.end_at),
          isActive: editForm.isActive,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setSaveErr(json.error ?? t("admin_store_banner_ads_save_fail"));
        return;
      }
      setEditingId(null);
      setMsg(t("admin_store_banner_ads_save_ok"));
      onRefresh();
    } catch {
      setSaveErr(t("admin_store_banner_ads_save_fail"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4" data-admin-banner-ads="1">
      <p className="text-[11px] text-sam-muted">
        {t("admin_store_banner_ads_authority")} · {t("admin_store_banner_ads_surface")}
      </p>
      {error ? <p className="text-sm text-sam-danger">{error}</p> : null}
      {msg ? <p className="text-sm text-sam-success">{msg}</p> : null}
      {saveErr ? <p className="text-sm text-sam-danger">{saveErr}</p> : null}

      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3 space-y-2">
        <p className="text-sm font-semibold">{t("admin_store_banner_ads_create")}</p>
        <BannerFields form={createForm} setForm={setCreateForm} t={t} />
        <button
          type="button"
          className={Sam.btn.primary}
          disabled={busy}
          onClick={() => void onCreate()}
        >
          {t("admin_store_banner_ads_save")}
        </button>
      </div>

      <div className="overflow-x-auto rounded-ui-rect border border-sam-border">
        <table className="min-w-full text-left text-[12px]">
          <thead className="bg-sam-app text-sam-muted">
            <tr>
              <th className="px-2 py-2">{t("admin_store_banner_ads_col_title")}</th>
              <th className="px-2 py-2">{t("admin_store_banner_ads_col_sort")}</th>
              <th className="px-2 py-2">{t("admin_store_banner_ads_col_status")}</th>
              <th className="px-2 py-2">{t("admin_store_banner_ads_col_visibility")}</th>
              <th className="px-2 py-2">{t("admin_store_banner_ads_col_block")}</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-2 py-3 text-sam-muted" colSpan={6}>
                  …
                </td>
              </tr>
            ) : campaigns.length === 0 ? (
              <tr>
                <td className="px-2 py-3 text-sam-muted" colSpan={6}>
                  {t("admin_store_banner_ads_empty")}
                </td>
              </tr>
            ) : (
              campaigns.map((row) => (
                <Fragment key={row.id}>
                  <tr className="border-t border-sam-border">
                    <td className="px-2 py-2">
                      <div className="font-medium">{row.title || "—"}</div>
                      <div className="text-[10px] text-sam-muted truncate max-w-[12rem]">
                        {row.image_url}
                      </div>
                    </td>
                    <td className="px-2 py-2">{row.sort_order}</td>
                    <td className="px-2 py-2">{stateLabel(row.computed_state)}</td>
                    <td className="px-2 py-2">
                      {row.visibility?.visible
                        ? t("admin_store_paid_ads_exposure_eligible")
                        : t("admin_store_paid_ads_exposure_blocked")}
                    </td>
                    <td className="px-2 py-2 text-[10px] text-sam-muted">
                      {(row.visibility?.blockingReasons ?? []).join(", ") || "—"}
                    </td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        className={Sam.btn.ghost}
                        onClick={() => startEdit(row)}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                  {editingId === row.id ? (
                    <tr className="border-t border-sam-border bg-sam-app/40">
                      <td colSpan={6} className="px-2 py-3 space-y-2">
                        <BannerFields form={editForm} setForm={setEditForm} t={t} />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className={Sam.btn.primary}
                            disabled={busy}
                            onClick={() => void onUpdate()}
                          >
                            {t("admin_store_banner_ads_save")}
                          </button>
                          <button
                            type="button"
                            className={Sam.btn.ghost}
                            onClick={() => setEditingId(null)}
                          >
                            {t("admin_store_banner_ads_cancel")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
      <button type="button" className={Sam.btn.ghost} onClick={onRefresh}>
        {t("admin_store_banner_ads_reload")}
      </button>
    </div>
  );
}

function BannerFields({
  form,
  setForm,
  t,
}: {
  form: BannerFormState;
  setForm: (v: BannerFormState) => void;
  t: ReturnType<typeof useI18n>["t"];
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="text-[11px]">
        {t("admin_store_banner_ads_col_title")}
        <input
          className={Sam.input.base}
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
      </label>
      <label className="text-[11px]">
        Subtitle
        <input
          className={Sam.input.base}
          value={form.subtitle}
          onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
        />
      </label>
      <label className="text-[11px] sm:col-span-2">
        {t("admin_store_banner_ads_col_image")}
        <input
          className={Sam.input.base}
          value={form.imageUrl}
          onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
        />
      </label>
      <label className="text-[11px]">
        {t("admin_store_banner_ads_col_cta")}
        <input
          className={Sam.input.base}
          value={form.ctaHref}
          onChange={(e) => setForm({ ...form, ctaHref: e.target.value })}
        />
        <AdminDestinationResolvedHint href={form.ctaHref} className="mt-0.5 text-[11px] text-sam-muted" />
      </label>
      <label className="text-[11px]">
        {t("admin_store_banner_ads_col_sort")}
        <input
          className={Sam.input.base}
          value={form.sortOrder}
          onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
        />
      </label>
      <label className="text-[11px]">
        start
        <input
          type="datetime-local"
          className={Sam.input.base}
          value={form.startAt}
          onChange={(e) => setForm({ ...form, startAt: e.target.value })}
        />
      </label>
      <label className="text-[11px]">
        end
        <input
          type="datetime-local"
          className={Sam.input.base}
          value={form.endAt}
          onChange={(e) => setForm({ ...form, endAt: e.target.value })}
        />
      </label>
      <label className="flex items-center gap-2 text-[11px]">
        <input
          type="checkbox"
          checked={form.isActive}
          onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
        />
        {t("admin_store_banner_ads_active")}
      </label>
    </div>
  );
}
