"use client";

import { dibayConfirm, dibayAlert } from "@/components/ui/dibay-overlay";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type {
  StoreTaxonomyCategory,
  StoreTaxonomySubtopic,
  StoreTaxonomyTopic,
} from "@/lib/stores/store-taxonomy-types";
import {
  mergeAdminTaxonomyState,
  patchRowImageInState,
  upsertCategoryInState,
  upsertSubtopicInState,
  upsertTopicInState,
  type AdminTaxonomyState,
} from "@/lib/stores/admin-store-taxonomy-state";
import { clearStoresTaxonomyClientCache } from "@/lib/stores/store-delivery-api-client";
import { slugifyStoreTaxonomyLoose } from "@/lib/stores/store-taxonomy-slug";

type TaxonomyKind = "category" | "topic" | "subtopic";

type RowDraft = {
  name: string;
  name_en: string;
  sort_order: number;
  pendingImage: File | null;
};

type TaxonomyRowBase = {
  id: string;
  name: string;
  name_en?: string | null;
  slug: string;
  sort_order: number;
  image_url?: string | null;
  is_active?: boolean;
};

const TaxonomyThumb = memo(function TaxonomyThumb({
  imageUrl,
  labelNone,
}: {
  imageUrl?: string | null;
  labelNone: string;
}) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        key={imageUrl}
        src={imageUrl}
        alt=""
        aria-hidden
        className="h-10 w-10 shrink-0 rounded-ui-rect border border-sam-border object-cover"
        loading="eager"
        decoding="async"
      />
    );
  }
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-ui-rect border border-dashed border-sam-border bg-sam-app sam-text-xxs font-semibold text-sam-muted">
      {labelNone}
    </div>
  );
});

function TaxonomyColumn<T extends TaxonomyRowBase>({
  title,
  rows,
  selectedId,
  onSelect,
  loading,
  emptyLabel,
  seedLabel,
  onSeed,
  seeding,
  addLabels,
  newRow,
  onNewRowChange,
  onAdd,
  addDisabled,
  editingId,
  editingDraft,
  onStartEdit,
  onCancelEdit,
  onDraftChange,
  onSave,
  saving,
  onToggleActive,
  uploadKeyPrefix,
  uploadingKey,
  selectable = true,
  t,
}: {
  title: string;
  rows: T[];
  selectedId: string;
  onSelect: (id: string) => void;
  /** false = 3차 등 선택 하이라이트 없음 */
  selectable?: boolean;
  loading: boolean;
  emptyLabel: string;
  seedLabel?: string;
  onSeed?: () => void;
  seeding?: boolean;
  addLabels: { name: string; nameEn: string; slug: string; button: string };
  newRow: { name: string; nameEn: string; slug: string };
  onNewRowChange: (patch: Partial<{ name: string; nameEn: string; slug: string }>) => void;
  onAdd: () => void;
  addDisabled: boolean;
  editingId: string | null;
  editingDraft: RowDraft | null;
  onStartEdit: (row: T) => void;
  onCancelEdit: () => void;
  onDraftChange: (patch: Partial<RowDraft>) => void;
  onSave: () => void;
  saving: boolean;
  onToggleActive: (id: string, nextActive: boolean) => void;
  uploadKeyPrefix: TaxonomyKind;
  uploadingKey: string | null;
  t: ReturnType<typeof useI18n>["t"];
}) {
  const previewUrl = useMemo(() => {
    if (!editingDraft?.pendingImage) return null;
    return URL.createObjectURL(editingDraft.pendingImage);
  }, [editingDraft?.pendingImage]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  return (
    <div className="flex min-h-[320px] flex-col rounded-ui-rect border border-sam-border bg-sam-surface">
      <div className="border-b border-sam-border bg-sam-app px-3 py-2">
        <h3 className="sam-text-body font-semibold text-sam-fg">{title}</h3>
      </div>

      <ul className="min-h-0 flex-1 divide-y divide-sam-border-soft overflow-y-auto">
        {loading && rows.length === 0 ? (
          <li className="px-3 py-4 sam-text-body-secondary text-sam-muted">{t("common_loading")}</li>
        ) : rows.length === 0 ? (
          <li className="px-3 py-4">
            <p className="sam-text-body-secondary text-sam-muted">{emptyLabel}</p>
            {onSeed && seedLabel ? (
              <button
                type="button"
                onClick={onSeed}
                disabled={seeding}
                className="mt-2 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary font-semibold text-sam-fg disabled:opacity-50"
              >
                {seeding ? t("admin_stores_app_taxonomy_seeding") : seedLabel}
              </button>
            ) : null}
          </li>
        ) : (
          rows.map((row) => {
            const isSelected = selectedId === row.id;
            const isEditing = editingId === row.id && editingDraft != null;
            const uploadKey = `${uploadKeyPrefix}:${row.id}`;
            const isUploading = uploadingKey === uploadKey;

            const rowShellClass = `w-full px-3 py-2 text-left ${
              selectable && isSelected ? "bg-sam-primary-soft/60" : selectable ? "hover:bg-sam-app" : ""
            }`;

            const rowBody =
              isEditing && editingDraft ? (
                    <div className="space-y-2" onClick={selectable ? (e) => e.stopPropagation() : undefined}>
                      <div className="flex items-start gap-2">
                        <TaxonomyThumb
                          imageUrl={previewUrl ?? row.image_url}
                          labelNone={t("common_none")}
                        />
                        <label className="sam-text-helper font-semibold text-signature underline">
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="sr-only"
                            disabled={isUploading || saving}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              e.target.value = "";
                              if (f) onDraftChange({ pendingImage: f });
                            }}
                          />
                          {isUploading
                            ? t("admin_stores_app_taxonomy_uploading")
                            : previewUrl || row.image_url
                              ? t("admin_stores_app_taxonomy_change_image")
                              : t("admin_stores_app_taxonomy_add_image")}
                        </label>
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        <input
                          value={editingDraft.name}
                          onChange={(e) => onDraftChange({ name: e.target.value })}
                          className="rounded border border-sam-border px-2 py-1.5 sam-text-body text-sam-fg"
                          placeholder={t("admin_stores_app_taxonomy_ph_name")}
                        />
                        <input
                          value={editingDraft.name_en}
                          onChange={(e) => onDraftChange({ name_en: e.target.value })}
                          className="rounded border border-sam-border px-2 py-1.5 sam-text-body text-sam-fg"
                          placeholder={t("admin_stores_app_taxonomy_ph_name_en")}
                        />
                        <input
                          value={String(editingDraft.sort_order)}
                          onChange={(e) =>
                            onDraftChange({ sort_order: Number(e.target.value) || 0 })
                          }
                          className="rounded border border-sam-border px-2 py-1.5 sam-text-body text-sam-fg"
                          placeholder="sort_order"
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={saving || isUploading}
                          onClick={() => void onSave()}
                          className="rounded-ui-rect bg-signature px-3 py-1.5 sam-text-helper font-semibold text-white disabled:opacity-50"
                        >
                          {saving || isUploading ? t("admin_stores_saving") : t("common_save")}
                        </button>
                        <button
                          type="button"
                          disabled={saving || isUploading}
                          onClick={onCancelEdit}
                          className="rounded-ui-rect border border-sam-border px-3 py-1.5 sam-text-helper font-semibold text-sam-fg"
                        >
                          {t("common_cancel")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <TaxonomyThumb imageUrl={row.image_url} labelNone={t("common_none")} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold text-sam-fg">{row.name}</span>
                          <span className="rounded-full bg-sam-surface-muted px-1.5 py-0.5 sam-text-xxs font-semibold text-sam-muted">
                            {row.is_active ? t("common_active") : t("common_hidden")}
                          </span>
                        </div>
                        <p className="truncate sam-text-xxs text-sam-meta">{row.slug}</p>
                      </div>
                      <div
                        className="flex shrink-0 flex-col gap-1"
                        onClick={selectable ? (e) => e.stopPropagation() : undefined}
                      >
                        <button
                          type="button"
                          onClick={() => onStartEdit(row)}
                          className="sam-text-xxs font-semibold text-signature underline"
                        >
                          {t("common_edit")}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void (async () => {
                              const nextActive = !row.is_active;
                              const label = nextActive
                                ? t("admin_stores_app_taxonomy_confirm_show")
                                : t("admin_stores_app_taxonomy_confirm_hide");
                              if (
                                !(await dibayConfirm({
                                  title: label,
                                  confirmTone: nextActive ? "primary" : "destructive",
                                }))
                              ) {
                                return;
                              }
                              onToggleActive(row.id, nextActive);
                            })();
                          }}
                          className="sam-text-xxs font-semibold text-red-600 underline"
                        >
                          {row.is_active ? t("common_delete") : t("admin_stores_app_taxonomy_restore")}
                        </button>
                      </div>
                    </div>
                  );

            return (
              <li key={row.id}>
                {selectable ? (
                  <button type="button" onClick={() => onSelect(row.id)} className={rowShellClass}>
                    {rowBody}
                  </button>
                ) : (
                  <div className={rowShellClass}>{rowBody}</div>
                )}
              </li>
            );
          })
        )}
      </ul>

      <div className="border-t border-sam-border p-3">
        <div className="grid grid-cols-1 gap-2">
          <input
            value={newRow.name}
            onChange={(e) => onNewRowChange({ name: e.target.value })}
            className="rounded border border-sam-border px-2 py-1.5 sam-text-body text-sam-fg"
            placeholder={addLabels.name}
          />
          <input
            value={newRow.nameEn}
            onChange={(e) => onNewRowChange({ nameEn: e.target.value })}
            className="rounded border border-sam-border px-2 py-1.5 sam-text-body text-sam-fg"
            placeholder={addLabels.nameEn}
          />
          <input
            value={newRow.slug}
            onChange={(e) => onNewRowChange({ slug: e.target.value })}
            className="rounded border border-sam-border px-2 py-1.5 sam-text-body text-sam-fg"
            placeholder={addLabels.slug}
          />
          <button
            type="button"
            onClick={onAdd}
            disabled={addDisabled}
            className="rounded-ui-rect bg-signature px-3 py-2 sam-text-body-secondary font-semibold text-white disabled:opacity-50"
          >
            {addLabels.button}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AdminStoreTaxonomyManager({
  onMessage,
}: {
  onMessage: (text: string) => void;
}) {
  const { t } = useI18n();
  const [taxonomy, setTaxonomy] = useState<AdminTaxonomyState | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const reloadInFlightRef = useRef(false);
  const hasTaxonomyDataRef = useRef(false);
  const reloadAbortRef = useRef<AbortController | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [pickedCategoryId, setPickedCategoryId] = useState("");
  /** null = 해당 1차의 첫 2차 자동 선택 */
  const [manualTopicId, setManualTopicId] = useState<string | null>(null);
  const [editingKind, setEditingKind] = useState<TaxonomyKind | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<RowDraft | null>(null);
  const [rowSaving, setRowSaving] = useState(false);
  const [imageUploading, setImageUploading] = useState<string | null>(null);

  const [newCategory, setNewCategory] = useState({ name: "", nameEn: "", slug: "" });
  const [newTopic, setNewTopic] = useState({ name: "", nameEn: "", slug: "" });
  const [newSubtopic, setNewSubtopic] = useState({ name: "", nameEn: "", slug: "" });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [subtopicsTableMissing, setSubtopicsTableMissing] = useState(false);

  const applyServerTaxonomy = useCallback(
    (payload: AdminTaxonomyState, meta?: { subtopics_table?: string }) => {
      setTaxonomy((prev) => mergeAdminTaxonomyState(prev, payload));
      setSubtopicsTableMissing(meta?.subtopics_table === "missing");
      setPickedCategoryId((prev) => {
        if (prev && payload.categories.some((c) => c.id === prev)) return prev;
        return payload.categories[0]?.id ?? "";
      });
      hasTaxonomyDataRef.current = payload.categories.length > 0;
    },
    []
  );

  const reloadTaxonomy = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (reloadInFlightRef.current) reloadAbortRef.current?.abort();
      reloadInFlightRef.current = true;
      const silent = opts?.silent === true || hasTaxonomyDataRef.current;
      if (!silent) setRefreshing(true);
      setLoadError(null);
      reloadAbortRef.current?.abort();
      const ac = new AbortController();
      reloadAbortRef.current = ac;
      try {
        const res = await fetch("/api/admin/stores/taxonomy", {
          cache: "no-store",
          credentials: "include",
          signal: ac.signal,
        });
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          categories?: unknown;
          topics?: unknown;
          subtopics?: unknown;
          meta?: { subtopics_table?: string };
        };
        if (ac.signal.aborted) return;
        if (!res.ok || !j?.ok || !Array.isArray(j.categories) || !Array.isArray(j.topics)) {
          setLoadError(typeof j?.error === "string" ? j.error : `HTTP ${res.status}`);
          return;
        }
        const payload: AdminTaxonomyState = {
          categories: j.categories as StoreTaxonomyCategory[],
          topics: j.topics as StoreTaxonomyTopic[],
          subtopics: Array.isArray(j.subtopics) ? (j.subtopics as StoreTaxonomySubtopic[]) : [],
        };
        applyServerTaxonomy(payload, j.meta);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setLoadError("network_error");
      } finally {
        if (reloadAbortRef.current === ac) reloadAbortRef.current = null;
        reloadInFlightRef.current = false;
        setInitialLoading(false);
        setRefreshing(false);
      }
    },
    [applyServerTaxonomy]
  );

  useEffect(() => {
    void reloadTaxonomy();
    return () => reloadAbortRef.current?.abort();
  }, [reloadTaxonomy]);

  const categories = taxonomy?.categories ?? [];
  const topics = taxonomy?.topics ?? [];
  const subtopics = taxonomy?.subtopics ?? [];

  const topicsForCategory = useMemo(
    () =>
      topics
        .filter((row) => row.store_category_id === pickedCategoryId)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [topics, pickedCategoryId]
  );

  const activeTopicId = useMemo(() => {
    if (manualTopicId && topicsForCategory.some((t) => t.id === manualTopicId)) return manualTopicId;
    return topicsForCategory[0]?.id ?? "";
  }, [manualTopicId, topicsForCategory]);

  const subtopicsForTopic = useMemo(
    () =>
      subtopics
        .filter((row) => row.store_topic_id === activeTopicId)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [subtopics, activeTopicId]
  );

  const cancelEdit = useCallback(() => {
    setEditingKind(null);
    setEditingId(null);
    setEditingDraft(null);
  }, []);

  const startEdit = useCallback((kind: TaxonomyKind, row: TaxonomyRowBase) => {
    setEditingKind(kind);
    setEditingId(row.id);
    setEditingDraft({
      name: row.name,
      name_en: row.name_en ?? "",
      sort_order: row.sort_order,
      pendingImage: null,
    });
  }, []);

  const uploadImage = useCallback(
    async (kind: TaxonomyKind, id: string, file: File) => {
      const key = `${kind}:${id}`;
      setImageUploading(key);
      try {
        const fd = new FormData();
        fd.append("kind", kind);
        fd.append("id", id);
        fd.append("file", file);
        const res = await fetch("/api/admin/stores/taxonomy/upload-image", {
          method: "POST",
          credentials: "include",
          body: fd,
        });
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          message?: string;
          url?: string;
        };
        if (!res.ok || !j?.ok) {
          await dibayAlert({ title: j.message ?? j.error ?? t("admin_stores_app_taxonomy_err_upload") });
          return false;
        }
        const url = typeof j.url === "string" ? j.url.trim() : "";
        if (url) {
          setTaxonomy((prev) => {
            if (!prev) return prev;
            return patchRowImageInState(prev, kind, id, url);
          });
          clearStoresTaxonomyClientCache();
        }
        return true;
      } catch {
        await dibayAlert({ title: "network_error" });
        return false;
      } finally {
        setImageUploading((prev) => (prev === key ? null : prev));
      }
    },
    [t]
  );

  const patchRow = useCallback(
    async (kind: TaxonomyKind, id: string, patch: Record<string, unknown>) => {
      const res = await fetch("/api/admin/stores/taxonomy", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id, patch }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        row?: StoreTaxonomyCategory | StoreTaxonomyTopic | StoreTaxonomySubtopic;
      };
      if (!res.ok || !j.ok) {
        await dibayAlert({ title: j.error ?? t("admin_stores_app_taxonomy_err_save") });
        return false;
      }
      const row = j.row;
      if (row && typeof row === "object" && "id" in row) {
        setTaxonomy((prev) => {
          if (!prev) return prev;
          if (kind === "category") return upsertCategoryInState(prev, row as StoreTaxonomyCategory);
          if (kind === "topic") return upsertTopicInState(prev, row as StoreTaxonomyTopic);
          return upsertSubtopicInState(prev, row as StoreTaxonomySubtopic);
        });
        clearStoresTaxonomyClientCache();
      }
      return true;
    },
    [t]
  );

  const saveEditing = useCallback(async () => {
    if (!editingKind || !editingId || !editingDraft) return;
    const name = editingDraft.name.trim();
    if (!name) return;
    setRowSaving(true);
    try {
      if (editingDraft.pendingImage) {
        const okUp = await uploadImage(editingKind, editingId, editingDraft.pendingImage);
        if (!okUp) return;
      }
      const ok = await patchRow(editingKind, editingId, {
        name,
        name_en: editingDraft.name_en.trim() || null,
        sort_order: editingDraft.sort_order,
      });
      if (!ok) return;
      onMessage(t("admin_stores_app_taxonomy_msg_saved"));
      cancelEdit();
    } finally {
      setRowSaving(false);
    }
  }, [editingKind, editingId, editingDraft, uploadImage, patchRow, t, onMessage, cancelEdit]);

  const toggleActive = useCallback(
    async (kind: TaxonomyKind, id: string, nextActive: boolean) => {
      const ok = await patchRow(kind, id, { is_active: nextActive });
      if (!ok) return;
      onMessage(t("admin_stores_app_taxonomy_msg_applied"));
    },
    [patchRow, t, onMessage]
  );

  const seedDefaults = useCallback(async () => {
    if (!(await dibayConfirm({ title: t("admin_stores_app_taxonomy_confirm_seed"), confirmTone: "destructive" }))) return;
    setSeeding(true);
    try {
      const res = await fetch("/api/admin/stores/taxonomy", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seed: true }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        seeded?: { categories?: number; topics?: number };
      };
      if (!res.ok || !j.ok) {
        await dibayAlert({ title: j.error ?? t("admin_stores_app_taxonomy_err_seed") });
        return;
      }
      onMessage(
        t("admin_stores_app_taxonomy_msg_seed", {
          categories: j.seeded?.categories ?? 0,
          topics: j.seeded?.topics ?? 0,
        })
      );
      await reloadTaxonomy({ silent: true });
      clearStoresTaxonomyClientCache();
    } finally {
      setSeeding(false);
    }
  }, [t, onMessage, reloadTaxonomy]);

  const createRow = useCallback(
    async (kind: TaxonomyKind, payload: Record<string, unknown>): Promise<string | null> => {
      const res = await fetch("/api/admin/stores/taxonomy", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, ...payload }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        message?: string;
        row?: StoreTaxonomyCategory | StoreTaxonomyTopic | StoreTaxonomySubtopic;
      };
      if (!res.ok || !j.ok) {
        const err = j.error ?? "";
        if (err === "store_subtopics_table_missing") {
          await dibayAlert({ title: t("admin_stores_app_taxonomy_err_subtopics_migration") });
        } else {
          await dibayAlert({ title: j.message ?? err ?? t("admin_stores_app_taxonomy_err_create") });
        }
        return null;
      }
      onMessage(t("admin_stores_app_taxonomy_msg_created"));
      const row = j.row;
      if (row && typeof row === "object" && "id" in row) {
        setTaxonomy((prev) => {
          const base = prev ?? { categories: [], topics: [], subtopics: [] };
          if (kind === "category") return upsertCategoryInState(base, row as StoreTaxonomyCategory);
          if (kind === "topic") return upsertTopicInState(base, row as StoreTaxonomyTopic);
          return upsertSubtopicInState(base, row as StoreTaxonomySubtopic);
        });
        clearStoresTaxonomyClientCache();
        hasTaxonomyDataRef.current = true;
      }
      return typeof row?.id === "string" ? row.id : null;
    },
    [t, onMessage]
  );

  const editingColumnKind: TaxonomyKind | null =
    editingKind === "category" || editingKind === "topic" || editingKind === "subtopic"
      ? editingKind
      : null;

  return (
    <section className="mt-6 rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="sam-text-body font-semibold text-sam-fg">{t("admin_stores_app_taxonomy_title")}</h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void reloadTaxonomy({ silent: true })}
            disabled={refreshing}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary font-semibold text-sam-fg disabled:opacity-50"
          >
            {refreshing ? t("common_loading") : t("admin_stores_fee_refresh")}
          </button>
          <button
            type="button"
            onClick={() => void seedDefaults()}
            disabled={seeding}
            className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 sam-text-body-secondary font-semibold text-sam-fg disabled:opacity-50"
          >
            {seeding ? t("admin_stores_app_taxonomy_seeding") : t("admin_stores_app_taxonomy_seed")}
          </button>
        </div>
      </div>

      {loadError ? (
        <p className="mt-3 sam-text-body-secondary text-red-700">({loadError})</p>
      ) : null}
      {subtopicsTableMissing ? (
        <p className="mt-2 sam-text-helper text-amber-800">{t("admin_stores_app_taxonomy_subtopics_migration")}</p>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <TaxonomyColumn
          title={t("admin_stores_app_taxonomy_tier1")}
          rows={categories}
          selectedId={pickedCategoryId}
          onSelect={(id) => {
            setPickedCategoryId(id);
            setManualTopicId(null);
            cancelEdit();
          }}
          loading={initialLoading}
          emptyLabel={t("admin_stores_app_taxonomy_empty_category")}
          seeding={seeding}
          addLabels={{
            name: t("admin_stores_app_taxonomy_ph_name"),
            nameEn: t("admin_stores_app_taxonomy_ph_name_en"),
            slug: t("admin_stores_app_taxonomy_label_slug"),
            button: t("admin_stores_app_taxonomy_add_tier1"),
          }}
          newRow={newCategory}
          onNewRowChange={(p) => setNewCategory((prev) => ({ ...prev, ...p }))}
          onAdd={() => {
            const name = newCategory.name.trim();
            const slug = slugifyStoreTaxonomyLoose(newCategory.slug || name);
            if (!name || !slug) return;
            const sort_order = categories.reduce((m, c) => Math.max(m, c.sort_order ?? 0), 0) + 10;
            void createRow("category", {
              name,
              name_en: newCategory.nameEn.trim() || null,
              slug,
              sort_order,
            }).then((id) => {
              setNewCategory({ name: "", nameEn: "", slug: "" });
              if (id) setPickedCategoryId(id);
            });
          }}
          addDisabled={!newCategory.name.trim()}
          editingId={editingColumnKind === "category" ? editingId : null}
          editingDraft={editingColumnKind === "category" ? editingDraft : null}
          onStartEdit={(row) => startEdit("category", row)}
          onCancelEdit={cancelEdit}
          onDraftChange={(p) => setEditingDraft((prev) => (prev ? { ...prev, ...p } : prev))}
          onSave={() => void saveEditing()}
          saving={rowSaving}
          onToggleActive={(id, next) => void toggleActive("category", id, next)}
          uploadKeyPrefix="category"
          uploadingKey={imageUploading}
          t={t}
        />

        <TaxonomyColumn
          title={t("admin_stores_app_taxonomy_tier2")}
          rows={topicsForCategory}
          selectedId={activeTopicId}
          onSelect={(id) => {
            setManualTopicId(id);
            cancelEdit();
          }}
          loading={initialLoading}
          emptyLabel={t("admin_stores_app_taxonomy_empty_topic")}
          addLabels={{
            name: t("admin_stores_app_taxonomy_ph_name"),
            nameEn: t("admin_stores_app_taxonomy_ph_name_en"),
            slug: t("admin_stores_app_taxonomy_label_slug"),
            button: t("admin_stores_app_taxonomy_add_tier2"),
          }}
          newRow={newTopic}
          onNewRowChange={(p) => setNewTopic((prev) => ({ ...prev, ...p }))}
          onAdd={() => {
            const name = newTopic.name.trim();
            const slug = slugifyStoreTaxonomyLoose(newTopic.slug || name);
            if (!pickedCategoryId || !name || !slug) return;
            const sort_order = topicsForCategory.reduce((m, r) => Math.max(m, r.sort_order ?? 0), 0) + 10;
            void createRow("topic", {
              store_category_id: pickedCategoryId,
              name,
              name_en: newTopic.nameEn.trim() || null,
              slug,
              sort_order,
            }).then((id) => {
              setNewTopic({ name: "", nameEn: "", slug: "" });
              if (id) setManualTopicId(id);
            });
          }}
          addDisabled={!pickedCategoryId || !newTopic.name.trim()}
          editingId={editingColumnKind === "topic" ? editingId : null}
          editingDraft={editingColumnKind === "topic" ? editingDraft : null}
          onStartEdit={(row) => startEdit("topic", row)}
          onCancelEdit={cancelEdit}
          onDraftChange={(p) => setEditingDraft((prev) => (prev ? { ...prev, ...p } : prev))}
          onSave={() => void saveEditing()}
          saving={rowSaving}
          onToggleActive={(id, next) => void toggleActive("topic", id, next)}
          uploadKeyPrefix="topic"
          uploadingKey={imageUploading}
          t={t}
        />

        <TaxonomyColumn
          title={t("admin_stores_app_taxonomy_tier3")}
          rows={subtopicsForTopic}
          selectedId=""
          onSelect={() => {}}
          selectable={false}
          loading={initialLoading}
          emptyLabel={t("admin_stores_app_taxonomy_empty_subtopic")}
          addLabels={{
            name: t("admin_stores_app_taxonomy_ph_name"),
            nameEn: t("admin_stores_app_taxonomy_ph_name_en"),
            slug: t("admin_stores_app_taxonomy_label_slug"),
            button: t("admin_stores_app_taxonomy_add_tier3"),
          }}
          newRow={newSubtopic}
          onNewRowChange={(p) => setNewSubtopic((prev) => ({ ...prev, ...p }))}
          onAdd={() => {
            const name = newSubtopic.name.trim();
            const slug = slugifyStoreTaxonomyLoose(newSubtopic.slug || name);
            if (!activeTopicId || !name || !slug) return;
            const sort_order = subtopicsForTopic.reduce((m, r) => Math.max(m, r.sort_order ?? 0), 0) + 10;
            void createRow("subtopic", {
              store_topic_id: activeTopicId,
              name,
              name_en: newSubtopic.nameEn.trim() || null,
              slug,
              sort_order,
            }).then(() => setNewSubtopic({ name: "", nameEn: "", slug: "" }));
          }}
          addDisabled={!activeTopicId || !newSubtopic.name.trim()}
          editingId={editingColumnKind === "subtopic" ? editingId : null}
          editingDraft={editingColumnKind === "subtopic" ? editingDraft : null}
          onStartEdit={(row) => startEdit("subtopic", row)}
          onCancelEdit={cancelEdit}
          onDraftChange={(p) => setEditingDraft((prev) => (prev ? { ...prev, ...p } : prev))}
          onSave={() => void saveEditing()}
          saving={rowSaving}
          onToggleActive={(id, next) => void toggleActive("subtopic", id, next)}
          uploadKeyPrefix="subtopic"
          uploadingKey={imageUploading}
          t={t}
        />
      </div>
    </section>
  );
}
