"use client";

import { useCallback, useEffect, useState } from "react";
import type { MessageKey } from "@/lib/i18n/messages";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  ADMIN_BOARD_CATEGORY_MODES,
  ADMIN_BOARD_SKIN_TYPES,
  normalizeBoardSlug,
} from "@/lib/admin-boards/parse-create-board-body";
import { DibayOverlayButton, DibayOverlayRoot } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

const BOARD_CREATE_ERROR_KEYS: Record<string, MessageKey> = {
  duplicate_slug: "admin_board_err_duplicate_slug",
  service_not_found: "admin_board_err_service_not_found",
  invalid_slug: "admin_board_err_invalid_slug",
  invalid_name: "admin_board_err_invalid_name",
  forbidden: "admin_board_err_forbidden_short",
  supabase_unconfigured: "admin_board_err_supabase_short",
};

type ServiceOption = { id: string; name: string; slug: string };

export function AdminBoardCreateForm({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useI18n();
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [loadingSvc, setLoadingSvc] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [serviceId, setServiceId] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [skinType, setSkinType] = useState<string>("basic");
  const [formType, setFormType] = useState<string>("basic");
  const [categoryMode, setCategoryMode] = useState<string>("none");
  const [isActive, setIsActive] = useState(true);
  const [sortOrder, setSortOrder] = useState(0);

  const loadServices = useCallback(async () => {
    setLoadingSvc(true);
    const sb = getSupabaseClient();
    if (!sb) {
      setServices([]);
      setLoadingSvc(false);
      return;
    }
    try {
      const { data, error: e } = await (sb as any)
        .from("services")
        .select("id, name, slug")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (e || !Array.isArray(data)) {
        setServices([]);
        return;
      }
      const list = (data as { id: string; name?: string; slug?: string }[]).map((r) => ({
        id: r.id,
        name: r.name ?? r.slug ?? r.id,
        slug: r.slug ?? "",
      }));
      setServices(list);
      setServiceId((prev) => {
        if (prev && list.some((s) => s.id === prev)) return prev;
        const community = list.find((s) => s.slug === "community");
        return community?.id ?? list[0]?.id ?? "";
      });
    } catch {
      setServices([]);
    } finally {
      setLoadingSvc(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setName("");
    setSlug("");
    setDescription("");
    setSkinType("basic");
    setFormType("basic");
    setCategoryMode("none");
    setIsActive(true);
    setSortOrder(0);
    void loadServices();
  }, [open, loadServices]);

  useEffect(() => {
    if (!open) return;
    const t = name.trim();
    if (!t) return;
    setSlug((prev) => {
      if (prev.trim() === "") return normalizeBoardSlug(t);
      return prev;
    });
  }, [name, open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_id: serviceId,
          name: name.trim(),
          slug: slug.trim() || normalizeBoardSlug(name),
          description: description.trim() || null,
          skin_type: skinType,
          form_type: formType,
          category_mode: categoryMode,
          is_active: isActive,
          sort_order: sortOrder,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        const err = data?.error as string | undefined;
        const errKey = err ? BOARD_CREATE_ERROR_KEYS[err] : undefined;
        setError(errKey ? t(errKey) : err ?? t("admin_board_err_save_failed"));
        return;
      }
      setName("");
      setSlug("");
      setDescription("");
      setSortOrder(0);
      onCreated();
      onClose();
    } catch {
      setError(t("admin_board_err_network"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DibayOverlayRoot open={open} onClose={onClose} dismissible placement="center" zRole="dialog">
      <div
        className={`${OverlayUi.dialogPanel} !max-w-lg max-h-[90vh] overflow-y-auto !p-0`}
        onClick={(e) => e.stopPropagation()}
        aria-labelledby="admin-board-create-title"
      >
        <div className="flex items-center justify-between border-b border-[color:var(--overlay-border)] px-4 py-3">
          <h2 id="admin-board-create-title" className={OverlayUi.title}>
            {t("admin_board_create_title")}
          </h2>
          <DibayOverlayButton
            roleTone="text"
            onClick={onClose}
            className="!min-h-9 !w-9 !flex-none !p-0"
            aria-label={t("admin_board_close_aria")}
          >
            ×
          </DibayOverlayButton>
        </div>

        <form onSubmit={(e) => void submit(e)} className="space-y-3 px-4 py-4 sam-text-body">
          {loadingSvc ? (
            <p className="text-sam-muted">{t("admin_board_svc_loading")}</p>
          ) : services.length === 0 ? (
            <p className="text-amber-800">{t("admin_board_no_active_service")}</p>
          ) : null}

          <label className="block">
            <span className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">{t("admin_board_label_service")}</span>
            <select
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              required
              className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
            >
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.slug})
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">{t("admin_board_label_name")}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
              className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
              placeholder={t("admin_board_name_ph")}
            />
          </label>

          <label className="block">
            <span className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">{t("admin_board_label_slug_url")}</span>
            <input
              value={slug}
              onChange={(e) => setSlug(normalizeBoardSlug(e.target.value))}
              required
              maxLength={64}
              className="w-full rounded-ui-rect border border-sam-border px-3 py-2 font-mono sam-text-body-secondary"
              placeholder={t("admin_board_slug_ph")}
            />
            <span className="mt-0.5 block sam-text-helper text-sam-muted">{t("admin_board_slug_hint")}</span>
          </label>

          <label className="block">
            <span className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">{t("admin_board_label_desc")}</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={2}
              className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">{t("admin_board_label_skin")}</span>
              <select value={skinType} onChange={(e) => setSkinType(e.target.value)} className="w-full rounded-ui-rect border border-sam-border px-2 py-2 sam-text-body-secondary">
                {ADMIN_BOARD_SKIN_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">{t("admin_board_label_form")}</span>
              <select value={formType} onChange={(e) => setFormType(e.target.value)} className="w-full rounded-ui-rect border border-sam-border px-2 py-2 sam-text-body-secondary">
                {ADMIN_BOARD_SKIN_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">{t("admin_board_label_category_mode")}</span>
            <select
              value={categoryMode}
              onChange={(e) => setCategoryMode(e.target.value)}
              className="w-full rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body-secondary"
            >
              {ADMIN_BOARD_CATEGORY_MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4" />
            <span className="sam-text-body-secondary text-sam-fg">{t("admin_board_label_active")}</span>
          </label>

          <label className="block">
            <span className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">{t("admin_board_label_sort")}</span>
            <input
              type="number"
              min={0}
              max={99999}
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
              className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
            />
          </label>

          {error ? <p className="rounded-ui-rect bg-red-50 px-3 py-2 sam-text-body-secondary text-red-800">{error}</p> : null}

          <div className={`${OverlayUi.actionsRow} border-t border-[color:var(--overlay-border)] pt-3`}>
            <DibayOverlayButton roleTone="secondary" type="button" onClick={onClose}>
              {t("common_cancel")}
            </DibayOverlayButton>
            <DibayOverlayButton
              roleTone="primary"
              type="submit"
              disabled={submitting || loadingSvc || services.length === 0}
              loading={submitting}
            >
              {submitting ? t("admin_board_saving") : t("admin_board_submit_add")}
            </DibayOverlayButton>
          </div>
        </form>
      </div>
    </DibayOverlayRoot>
  );
}
