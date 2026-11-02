"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import { OwnerStoreAdminConfirmModal } from "@/components/business/owner/OwnerStoreAdminConfirmModal";
import { OwnerStoreAdminDashSection } from "@/components/business/owner/OwnerStoreAdminDashSection";
import { invalidateStoreNoticesPublicCache } from "@/lib/stores/store-delivery-api-client";
import { fetchMeStoresListDeduped } from "@/lib/me/fetch-me-stores-deduped";
import { resolveOwnerActiveStoreIdFromOwnedList } from "@/lib/delivery/owner/resolve-owner-active-store";
import { parseNoticeImages } from "@/lib/stores/store-banners-notices-public";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { resolveOwnerApiErrorMessage } from "@/lib/business/owner-api-error-i18n";
import {
  OWNER_ADMIN_LIST_CARD_CLASS,
  OWNER_ADMIN_OUTLINE_BTN_CLASS,
  OWNER_ADMIN_PRIMARY_BTN_CLASS,
} from "@/lib/business/owner-admin-list-ui";
import { DibayBottomSheet, DibayOverlayButton } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import { useOwnerAdminBottomSheetKeyboard } from "@/lib/business/use-owner-admin-bottom-sheet-keyboard";
import { postStoreOwnerImageUpload } from "@/lib/stores/upload-store-product-image-client";

/** 편집 시트 안 입력 — 팝업 SSOT (페이지 공용 `OWNER_ADMIN_FIELD_*` 는 그대로) */
const SHEET_FIELD_LABEL_CLASS =
  "text-[length:var(--overlay-body-2-size)] text-[color:var(--overlay-text-secondary)]";
const SHEET_FIELD_INPUT_CLASS =
  "mt-1 w-full rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-surface)] px-3 py-2 text-[length:var(--overlay-body-1-size)] text-[color:var(--overlay-text-primary)]";

type NoticeRow = {
  id: string;
  title: string;
  body: string;
  images_json: unknown;
  placement: string;
  is_active: boolean;
  sort_order: number;
  start_at?: string | null;
  end_at?: string | null;
};

const PLACEMENT_VALUES = ["store_top", "menu_top", "review_top", "info_tab"] as const;

const PLACEMENT_I18N: Record<(typeof PLACEMENT_VALUES)[number], MessageKey> = {
  store_top: "business_phase7_432",
  menu_top: "business_phase7_433",
  review_top: "business_phase7_434",
  info_tab: "business_phase7_435",
};

export function OwnerStoreNoticesView() {
  const { t } = useI18n();
  const placementLabel = (v: string) => {
    const key = PLACEMENT_I18N[v as (typeof PLACEMENT_VALUES)[number]];
    return key ? t(key) : v;
  };
  const sp = useSearchParams();
  const storeId = sp.get("storeId")?.trim() ?? "";
  const [resolvedStoreId, setResolvedStoreId] = useState<string>(storeId);
  const [notices, setNotices] = useState<NoticeRow[]>([]);
  const [slug, setSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [editor, setEditor] = useState<
    | { mode: "new"; draft: Partial<NoticeRow> & { images: string[] } }
    | { mode: "edit"; row: NoticeRow & { images: string[] } }
    | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const { contentPaddingBottomPx } = useOwnerAdminBottomSheetKeyboard(editor != null);

  useEffect(() => {
    if (storeId) {
      setResolvedStoreId(storeId);
      return;
    }
    void (async () => {
      const { json } = await fetchMeStoresListDeduped();
      const j = json as { ok?: boolean; stores?: { id: string }[] };
      const id =
        j?.ok && Array.isArray(j.stores)
          ? resolveOwnerActiveStoreIdFromOwnedList(j.stores, null) ?? ""
          : "";
      setResolvedStoreId(id);
    })();
  }, [storeId]);

  const load = useCallback(async () => {
    const sid = resolvedStoreId.trim();
    if (!sid) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/me/stores/${encodeURIComponent(sid)}/notices`, {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json()) as {
        ok?: boolean;
        notices?: NoticeRow[];
        error?: string;
        meta?: { slug?: string | null };
      };
      if (!j?.ok) {
        setErr(typeof j?.error === "string" ? j.error : "load_failed");
        setNotices([]);
      } else {
        setNotices(Array.isArray(j.notices) ? j.notices : []);
        const s = j.meta?.slug;
        if (typeof s === "string" && s.trim()) setSlug(s.trim());
      }
    } catch {
      setErr("network_error");
      setNotices([]);
    } finally {
      setLoading(false);
    }
  }, [resolvedStoreId]);

  useEffect(() => {
    void load();
  }, [load]);

  const uploadImage = async (file: File): Promise<string | null> => {
    const sid = resolvedStoreId.trim();
    // IMG-02: 압축 후 전송 · 413(비 JSON)에서 예외 없이 실패 처리
    const { ok, json: j } = await postStoreOwnerImageUpload(sid, file);
    return ok && j.url ? String(j.url) : null;
  };

  const saveEditor = async () => {
    if (!editor) return;
    const sid = resolvedStoreId.trim();
    setBusy(true);
    setErr(null);
    try {
      const imgs = editor.mode === "new" ? editor.draft.images ?? [] : editor.row.images;
      if (editor.mode === "new") {
        const title = String(editor.draft.title ?? "").trim();
        if (!title) {
          setErr(t("business_phase7_439"));
          setBusy(false);
          return;
        }
        const res = await fetch(`/api/me/stores/${encodeURIComponent(sid)}/notices`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            body: String(editor.draft.body ?? ""),
            images_json: imgs.slice(0, 3),
            placement: editor.draft.placement ?? "store_top",
            sort_order: editor.draft.sort_order ?? notices.length,
            is_active: editor.draft.is_active !== false,
            start_at: editor.draft.start_at ?? null,
            end_at: editor.draft.end_at ?? null,
          }),
        });
        const j = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !j?.ok) {
          setErr(typeof j?.error === "string" ? j.error : "save_failed");
          return;
        }
      } else {
        const res = await fetch(`/api/me/stores/${encodeURIComponent(sid)}/notices/${encodeURIComponent(editor.row.id)}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: editor.row.title,
            body: editor.row.body,
            images_json: imgs.slice(0, 3),
            placement: editor.row.placement,
            sort_order: editor.row.sort_order,
            is_active: editor.row.is_active,
            start_at: editor.row.start_at ?? null,
            end_at: editor.row.end_at ?? null,
          }),
        });
        const j = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !j?.ok) {
          setErr(typeof j?.error === "string" ? j.error : "save_failed");
          return;
        }
      }
      if (slug) invalidateStoreNoticesPublicCache(slug);
      setEditor(null);
      await load();
    } catch {
      setErr("network_error");
    } finally {
      setBusy(false);
    }
  };

  const performDeleteNotice = async (id: string) => {
    const sid = resolvedStoreId.trim();
    setBusy(true);
    try {
      const res = await fetch(`/api/me/stores/${encodeURIComponent(sid)}/notices/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const j = (await res.json()) as { ok?: boolean };
      if (res.ok && j?.ok && slug) invalidateStoreNoticesPublicCache(slug);
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (!resolvedStoreId) {
    return <p className="sam-text-body text-sam-muted">{t("business_phase7_088")}</p>;
  }

  return (
    <div className={OWNER_STORE_STACK_Y_CLASS}>
      <OwnerStoreAdminDashSection>
        {err ? <p className="text-sm text-sam-danger">{resolveOwnerApiErrorMessage(err, t)}</p> : null}

        <button
          type="button"
          disabled={busy || !!editor}
          onClick={() =>
            setEditor({
              mode: "new",
              draft: {
                title: "",
                body: "",
                placement: "store_top",
                sort_order: notices.length,
                is_active: true,
                images: [],
              },
            })
          }
          className={`mt-2 ${OWNER_ADMIN_PRIMARY_BTN_CLASS}`}
        >
          {t("business_phase7_431")}
        </button>

        {loading ? <p className="sam-text-body text-sam-muted">{t("common_loading")}</p> : null}
      </OwnerStoreAdminDashSection>

      <OwnerStoreAdminDashSection className="mt-3">
        <ul className="space-y-3">
        {notices.map((n) => (
          <li key={n.id} className={OWNER_ADMIN_LIST_CARD_CLASS}>
            <p className="font-semibold text-sam-fg">{n.title}</p>
            <p className="sam-text-xxs text-sam-muted">
              {t("business_phase7_486", {
                v1: placementLabel(n.placement),
                v2: n.is_active ? t("business_phase7_135") : t("business_phase7_418"),
                v3: String(n.sort_order),
              })}
            </p>
            <p className="mt-1 line-clamp-2 sam-text-body text-sam-fg">{n.body}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  setEditor({
                    mode: "edit",
                    row: { ...n, images: parseNoticeImages(n.images_json) },
                  })
                }
                className={OWNER_ADMIN_OUTLINE_BTN_CLASS}
              >
                {t("common_edit")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setDeleteConfirmId(n.id)}
                className={`${OWNER_ADMIN_OUTLINE_BTN_CLASS} text-sam-danger`}
              >
                {t("common_delete")}
              </button>
            </div>
          </li>
        ))}
        </ul>
      </OwnerStoreAdminDashSection>

      {editor ? (
        <DibayBottomSheet
          open
          onClose={() => {
            if (!busy) setEditor(null);
          }}
          title={editor.mode === "new" ? t("business_phase7_437") : t("business_phase7_438")}
          contentPaddingBottomPx={contentPaddingBottomPx}
          footer={
            <div className={`${OverlayUi.actionsRow} mt-4 border-t border-[color:var(--overlay-border)] pt-4`}>
              <DibayOverlayButton roleTone="secondary" type="button" disabled={busy} onClick={() => setEditor(null)}>
                {t("common_close")}
              </DibayOverlayButton>
              <DibayOverlayButton
                roleTone="primary"
                type="button"
                disabled={busy}
                loading={busy}
                onClick={() => void saveEditor()}
              >
                {busy ? t("business_phase7_384") : t("business_phase7_385")}
              </DibayOverlayButton>
            </div>
          }
        >
            <div className="space-y-3">
              <label className="block">
                <span className={SHEET_FIELD_LABEL_CLASS}>{t("business_phase7_254")}</span>
                <input
                  className={SHEET_FIELD_INPUT_CLASS}
                  value={editor.mode === "new" ? String(editor.draft.title ?? "") : editor.row.title}
                  onChange={(e) => {
                    if (editor.mode === "new") {
                      setEditor({ mode: "new", draft: { ...editor.draft, title: e.target.value } });
                    } else {
                      setEditor({ mode: "edit", row: { ...editor.row, title: e.target.value } });
                    }
                  }}
                />
              </label>
              <label className="block">
                <span className={SHEET_FIELD_LABEL_CLASS}>{t("business_phase7_045")}</span>
                <textarea
                  rows={4}
                  className={SHEET_FIELD_INPUT_CLASS}
                  value={editor.mode === "new" ? String(editor.draft.body ?? "") : editor.row.body}
                  onChange={(e) => {
                    if (editor.mode === "new") {
                      setEditor({ mode: "new", draft: { ...editor.draft, body: e.target.value } });
                    } else {
                      setEditor({ mode: "edit", row: { ...editor.row, body: e.target.value } });
                    }
                  }}
                />
              </label>
              <label className="block">
                <span className={SHEET_FIELD_LABEL_CLASS}>{t("business_phase7_049")}</span>
                <select
                  className={SHEET_FIELD_INPUT_CLASS}
                  value={editor.mode === "new" ? String(editor.draft.placement ?? "store_top") : editor.row.placement}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (editor.mode === "new") {
                      setEditor({ mode: "new", draft: { ...editor.draft, placement: v } });
                    } else {
                      setEditor({ mode: "edit", row: { ...editor.row, placement: v } });
                    }
                  }}
                >
                  {PLACEMENT_VALUES.map((v) => (
                    <option key={v} value={v}>
                      {placementLabel(v)}
                    </option>
                  ))}
                </select>
              </label>
              <div>
                <span className={SHEET_FIELD_LABEL_CLASS}>{t("business_phase7_236")}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={busy || (editor.mode === "new" ? editor.draft.images!.length >= 3 : editor.row.images.length >= 3)}
                  className="mt-1 block w-full text-[length:var(--overlay-body-2-size)] text-[color:var(--overlay-text-primary)]"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    const url = await uploadImage(f);
                    if (!url) {
                      setErr(t("business_phase7_440"));
                      return;
                    }
                    if (editor.mode === "new") {
                      const next = [...(editor.draft.images ?? []), url].slice(0, 3);
                      setEditor({ mode: "new", draft: { ...editor.draft, images: next } });
                    } else {
                      const next = [...editor.row.images, url].slice(0, 3);
                      setEditor({ mode: "edit", row: { ...editor.row, images: next } });
                    }
                  }}
                />
                <ul className="mt-1 flex flex-wrap gap-2">
                  {(editor.mode === "new" ? editor.draft.images! : editor.row.images).map((u) => (
                    <li key={u} className="relative h-16 w-24 overflow-hidden rounded-[length:var(--overlay-radius-sm)] border border-[color:var(--overlay-border)]">
                      <img src={u} alt="" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        className="dibay-overlay-icon-btn absolute right-0 top-0"
                        onClick={() => {
                          if (editor.mode === "new") {
                            setEditor({
                              mode: "new",
                              draft: {
                                ...editor.draft,
                                images: editor.draft.images!.filter((x) => x !== u),
                              },
                            });
                          } else {
                            setEditor({
                              mode: "edit",
                              row: { ...editor.row, images: editor.row.images.filter((x) => x !== u) },
                            });
                          }
                        }}
                      >
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[color:var(--overlay-surface)] text-[length:var(--overlay-caption-size)] font-bold text-[color:var(--overlay-text-primary)] shadow-sm">
                          ×
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editor.mode === "new" ? editor.draft.is_active !== false : editor.row.is_active}
                  onChange={(e) => {
                    if (editor.mode === "new") {
                      setEditor({ mode: "new", draft: { ...editor.draft, is_active: e.target.checked } });
                    } else {
                      setEditor({ mode: "edit", row: { ...editor.row, is_active: e.target.checked } });
                    }
                  }}
                />
                <span className="text-[length:var(--overlay-body-1-size)] text-[color:var(--overlay-text-primary)]">{t("business_phase7_135")}</span>
              </label>
            </div>
        </DibayBottomSheet>
      ) : null}

      <OwnerStoreAdminConfirmModal
        open={deleteConfirmId != null}
        titleId="owner-store-notices-delete-title"
        title={t("popup_q_delete_notice")}
        description={t("popup_note_cannot_restore")}
        confirmLabel={t("common_delete")}
        confirmBusyLabel={t("business_phase7_442")}
        busy={busy}
        disableActions={busy}
        confirmTone="danger"
        onCancel={() => setDeleteConfirmId(null)}
        onConfirm={async () => {
          if (!deleteConfirmId) return;
          const id = deleteConfirmId;
          setDeleteConfirmId(null);
          await performDeleteNotice(id);
        }}
      />
    </div>
  );
}
