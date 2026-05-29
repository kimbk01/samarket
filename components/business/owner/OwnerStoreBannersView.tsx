"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import { OwnerStoreAdminConfirmModal } from "@/components/business/owner/OwnerStoreAdminConfirmModal";
import { OwnerStoreAdminDashSection } from "@/components/business/owner/OwnerStoreAdminDashSection";
import { invalidateStoreBannersPublicCache } from "@/lib/stores/store-delivery-api-client";
import { fetchMeStoresListDeduped } from "@/lib/me/fetch-me-stores-deduped";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { resolveOwnerApiErrorMessage } from "@/lib/business/owner-api-error-i18n";
import {
  OWNER_ADMIN_FIELD_INPUT_CLASS,
  OWNER_ADMIN_FIELD_LABEL_CLASS,
  OWNER_ADMIN_LIST_CARD_CLASS,
  OWNER_ADMIN_MODAL_PANEL_CLASS,
  OWNER_ADMIN_OUTLINE_BTN_CLASS,
  OWNER_ADMIN_PRIMARY_BTN_CLASS,
} from "@/lib/business/owner-admin-list-ui";

type BannerRow = {
  id: string;
  image_url: string;
  title: string | null;
  description: string | null;
  link_type: string;
  link_target_id: string | null;
  is_active: boolean;
  sort_order: number;
  start_at?: string | null;
  end_at?: string | null;
};

type LinkPickRow = { id: string; title: string };

function mergePickList(
  list: LinkPickRow[],
  currentId: string | null | undefined,
  missingLabel: string
): LinkPickRow[] {
  const id = currentId?.trim() || "";
  if (!id) return list;
  if (list.some((r) => r.id === id)) return list;
  return [{ id, title: missingLabel }, ...list];
}

/** 사장 화면: 메뉴 상세(product) 연결은 비노출 — 매장에서는 기존 product 배너는 유지 가능, 저장하면 none 으로 정리 */
const LINK_VALUES = ["none", "notice", "coupon"] as const;

function bannerLinkPayload(linkType: string | undefined, target: string | null | undefined) {
  const lt =
    linkType === "product" || linkType === "notice" || linkType === "coupon" || linkType === "none"
      ? linkType
      : "none";
  if (lt === "product") return { link_type: "none" as const, link_target_id: null as string | null };
  if (lt === "none" || lt === "coupon") return { link_type: lt, link_target_id: null as string | null };
  const t = target && String(target).trim() ? String(target).trim() : null;
  return { link_type: lt, link_target_id: t };
}

function bannerLinkSelectValue(linkType: string | undefined): string {
  const lt = linkType ?? "none";
  return lt === "product" ? "none" : lt;
}

function formatBannerSaveError(
  code: string,
  tr: ReturnType<typeof useI18n>["t"],
): string {
  switch (code) {
    case "invalid_link_target":
      return tr("business_phase7_447");
    case "invalid_link_target_id":
      return tr("business_phase7_448");
    case "image_url_required":
      return tr("business_phase7_485");
    case "storage_bucket_missing":
      return tr("business_phase7_449");
    case "store_not_editable":
      return tr("business_phase7_450");
    default:
      return code;
  }
}

export function OwnerStoreBannersView() {
  const { t } = useI18n();
  const linkLabel = (v: string) => {
    if (v === "none") return t("business_phase7_444");
    if (v === "notice") return t("business_phase7_445");
    if (v === "coupon") return t("business_phase7_446");
    return v;
  };
  const sp = useSearchParams();
  const storeId = sp.get("storeId")?.trim() ?? "";
  const [resolvedStoreId, setResolvedStoreId] = useState<string>(storeId);
  const [banners, setBanners] = useState<BannerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [editor, setEditor] = useState<
    | { mode: "new"; draft: Partial<BannerRow> }
    | { mode: "edit"; row: BannerRow }
    | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const bannerFileRef = useRef<HTMLInputElement | null>(null);
  const [linkPick, setLinkPick] = useState<{ notices: LinkPickRow[]; loading: boolean }>({
    notices: [],
    loading: false,
  });

  useEffect(() => {
    if (storeId) {
      setResolvedStoreId(storeId);
      return;
    }
    void (async () => {
      const { json } = await fetchMeStoresListDeduped();
      const j = json as { ok?: boolean; stores?: { id: string }[] };
      const id = j?.ok && j.stores?.[0]?.id ? String(j.stores[0].id) : "";
      setResolvedStoreId(id);
    })();
  }, [storeId]);

  const load = useCallback(async () => {
    const sid = resolvedStoreId.trim();
    if (!sid) return;
    setLoading(true);
    setErr(null);
    try {
      const bRes = await fetch(`/api/me/stores/${encodeURIComponent(sid)}/banners`, {
        credentials: "include",
        cache: "no-store",
      });
      const bj = (await bRes.json()) as {
        ok?: boolean;
        banners?: BannerRow[];
        error?: string;
        meta?: { slug?: string | null };
      };
      if (!bj?.ok) {
        setErr(typeof bj?.error === "string" ? bj.error : "load_failed");
        setBanners([]);
      } else {
        setBanners(Array.isArray(bj.banners) ? bj.banners : []);
        const s = bj.meta?.slug;
        if (typeof s === "string" && s.trim()) setSlug(s.trim());
      }
    } catch {
      setErr("network_error");
      setBanners([]);
    } finally {
      setLoading(false);
    }
  }, [resolvedStoreId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!editor) {
      setLinkPick({ notices: [], loading: false });
      return;
    }
    const lt = editor.mode === "new" ? (editor.draft.link_type ?? "none") : editor.row.link_type;
    if (lt !== "notice") {
      setLinkPick({ notices: [], loading: false });
      return;
    }
    const sid = resolvedStoreId.trim();
    if (!sid) return;
    let cancelled = false;
    setLinkPick((p) => ({ ...p, loading: true }));
    void (async () => {
      try {
        const nr = await fetch(`/api/me/stores/${encodeURIComponent(sid)}/notices`, {
          credentials: "include",
          cache: "no-store",
        });
        const nj = (await nr.json()) as { ok?: boolean; notices?: { id?: string; title?: string }[] };
        if (cancelled) return;
        const toRows = (rows: { id?: string; title?: string }[] | undefined): LinkPickRow[] =>
          (Array.isArray(rows) ? rows : [])
            .map((x) => ({
              id: String(x.id ?? "").trim(),
              title: String(x.title ?? "").trim() || t("business_phase7_451"),
            }))
            .filter((x) => x.id)
            .sort((a, b) => a.title.localeCompare(b.title, "ko"));
        setLinkPick({
          notices: toRows(nj?.notices),
          loading: false,
        });
      } catch {
        if (!cancelled) setLinkPick({ notices: [], loading: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editor, resolvedStoreId]);

  const uploadImage = async (file: File): Promise<string | null> => {
    const sid = resolvedStoreId.trim();
    const fd = new FormData();
    fd.set("file", file);
    try {
      const res = await fetch(`/api/me/stores/${encodeURIComponent(sid)}/upload-image`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const j = (await res.json()) as { ok?: boolean; url?: string; error?: string; message?: string };
      if (!j?.ok) {
        const msg =
          typeof j?.message === "string" && j.message.trim()
            ? j.message.trim()
            : typeof j?.error === "string" && j.error.trim()
              ? formatBannerSaveError(j.error.trim(), t)
              : "upload_failed";
        setErr(msg);
        return null;
      }
      return j.url ? String(j.url) : null;
    } catch {
      setErr("network_error");
      return null;
    }
  };

  const saveEditor = async () => {
    if (!editor) return;
    const sid = resolvedStoreId.trim();
    setBusy(true);
    setErr(null);
    try {
      if (editor.mode === "new") {
        const d = editor.draft;
        const image_url = String(d.image_url ?? "").trim();
        if (!image_url) {
          setErr(t("business_phase7_485"));
          setBusy(false);
          return;
        }
        const link = bannerLinkPayload(d.link_type, d.link_target_id);
        const res = await fetch(`/api/me/stores/${encodeURIComponent(sid)}/banners`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image_url,
            title: d.title ?? null,
            description: d.description ?? null,
            ...link,
            sort_order: d.sort_order ?? 0,
            is_active: d.is_active !== false,
            start_at: d.start_at ?? null,
            end_at: d.end_at ?? null,
          }),
        });
        const j = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !j?.ok) {
          const raw = typeof j?.error === "string" ? j.error : "save_failed";
          setErr(formatBannerSaveError(raw, t));
          return;
        }
      } else {
        const row = editor.row;
        const link = bannerLinkPayload(row.link_type, row.link_target_id);
        const res = await fetch(`/api/me/stores/${encodeURIComponent(sid)}/banners/${encodeURIComponent(row.id)}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image_url: row.image_url,
            title: row.title,
            description: row.description,
            ...link,
            sort_order: row.sort_order,
            is_active: row.is_active,
            start_at: row.start_at ?? null,
            end_at: row.end_at ?? null,
          }),
        });
        const j = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !j?.ok) {
          const raw = typeof j?.error === "string" ? j.error : "save_failed";
          setErr(formatBannerSaveError(raw, t));
          return;
        }
      }
      if (slug) invalidateStoreBannersPublicCache(slug);
      setEditor(null);
      await load();
    } catch {
      setErr("network_error");
    } finally {
      setBusy(false);
    }
  };

  const performDeleteBanner = async (id: string) => {
    const sid = resolvedStoreId.trim();
    setBusy(true);
    try {
      const res = await fetch(`/api/me/stores/${encodeURIComponent(sid)}/banners/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const j = (await res.json()) as { ok?: boolean };
      if (res.ok && j?.ok && slug) invalidateStoreBannersPublicCache(slug);
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
        <p className="sam-text-body text-sam-muted">{t("business_phase7_018")}</p>

        {err ? <p className="text-sm text-red-600">{resolveOwnerApiErrorMessage(err, t)}</p> : null}

        <button
          type="button"
          disabled={busy || !!editor}
          onClick={() => {
            setErr(null);
            setEditor({
              mode: "new",
              draft: {
                image_url: "",
                title: "",
                description: "",
                link_type: "none",
                link_target_id: null,
                sort_order: banners.length,
                is_active: true,
              },
            });
          }}
          className={`mt-2 ${OWNER_ADMIN_PRIMARY_BTN_CLASS}`}
        >
          {t("business_phase7_452")}
        </button>

        {loading ? <p className="sam-text-body text-sam-muted">{t("common_loading")}</p> : null}
      </OwnerStoreAdminDashSection>

      <OwnerStoreAdminDashSection className="mt-3">
        <ul className="space-y-3">
        {banners.map((b) => (
          <li key={b.id} className={OWNER_ADMIN_LIST_CARD_CLASS}>
            <div className="flex gap-3">
              <div className="h-20 w-28 shrink-0 overflow-hidden rounded-ui-rect bg-sam-surface-muted">
                <img src={b.image_url} alt="" className="h-full w-full object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sam-fg">{b.title?.trim() || t("business_phase7_451")}</p>
                <p className="sam-text-xxs text-sam-muted">
                  {t("business_phase7_436", {
                    v1: b.is_active ? t("business_phase7_135") : t("business_phase7_418"),
                    v2: String(b.sort_order),
                    v3: linkLabel(b.link_type),
                  })}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setErr(null);
                      setEditor({ mode: "edit", row: { ...b } });
                    }}
                    className={OWNER_ADMIN_OUTLINE_BTN_CLASS}
                  >
                    {t("common_edit")}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setDeleteConfirmId(b.id)}
                    className={`${OWNER_ADMIN_OUTLINE_BTN_CLASS} text-red-600`}
                  >
                    {t("common_delete")}
                  </button>
                </div>
              </div>
            </div>
          </li>
        ))}
        </ul>
      </OwnerStoreAdminDashSection>

      {editor ? (
        <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/45 p-3 sm:items-center">
          <div className={OWNER_ADMIN_MODAL_PANEL_CLASS}>
            <h2 className="sam-text-body font-semibold text-sam-fg">
              {editor.mode === "new" ? t("business_phase7_453") : t("business_phase7_454")}
            </h2>
            <div className="mt-4 space-y-5">
              <input
                ref={bannerFileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                tabIndex={-1}
                disabled={busy}
                onChange={async (e) => {
                  const input = e.currentTarget;
                  const f = input.files?.[0];
                  input.value = "";
                  if (!f) return;
                  const url = await uploadImage(f);
                  if (!url) return;
                  if (editor.mode === "new") {
                    setEditor({ mode: "new", draft: { ...editor.draft, image_url: url } });
                  } else {
                    setEditor({ mode: "edit", row: { ...editor.row, image_url: url } });
                  }
                }}
              />

              <div>
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <span className={OWNER_ADMIN_FIELD_LABEL_CLASS}>{t("business_phase7_103")}</span>
                  <span className="text-[11px] text-[var(--biz-text-muted)]">{t("business_phase7_338")}</span>
                </div>
                {(() => {
                  const src =
                    editor.mode === "new"
                      ? String(editor.draft.image_url ?? "").trim()
                      : String(editor.row.image_url ?? "").trim();
                  const has = Boolean(src);
                  return (
                    <div className="space-y-2">
                      <div
                        className={`relative w-full overflow-hidden rounded-[12px] ${
                          has
                            ? "border border-[var(--biz-card-border)] bg-black/[0.03]"
                            : "border-2 border-dashed border-[var(--biz-card-border)] bg-[var(--biz-app-bg)]"
                        }`}
                      >
                        <div className="aspect-[5/2] w-full max-h-[min(40vw,200px)] sm:max-h-[200px]">
                          {has ? (
                            <img src={src} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => bannerFileRef.current?.click()}
                              className="flex h-full w-full flex-col items-center justify-center gap-1 px-4 text-center transition hover:bg-black/[0.04] disabled:opacity-50"
                            >
                              <span className="text-[15px] font-medium text-[var(--biz-text)]">{t("business_phase7_192")}</span>
                              <span className="text-[12px] text-[var(--biz-text-muted)]">
                                {t("business_phase7_455")}
                              </span>
                            </button>
                          )}
                        </div>
                        {has ? (
                          <div className="absolute bottom-0 left-0 right-0 flex justify-end bg-gradient-to-t from-black/55 to-transparent p-2 pt-8">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => bannerFileRef.current?.click()}
                              className="rounded-[10px] bg-white/95 px-3 py-1.5 text-[12px] font-semibold text-[var(--biz-text)] shadow-sm backdrop-blur-sm transition hover:bg-white disabled:opacity-50"
                            >
                              {t("business_phase7_456")}
                            </button>
                          </div>
                        ) : null}
                      </div>
                      {has ? (
                        <p className="text-center text-[11px] text-[var(--biz-text-muted)]">
                          {t("business_phase7_457")}
                        </p>
                      ) : null}
                    </div>
                  );
                })()}
              </div>

              <label className="block">
                <span className={OWNER_ADMIN_FIELD_LABEL_CLASS}>{t("business_phase7_254")}</span>
                <input
                  className={OWNER_ADMIN_FIELD_INPUT_CLASS}
                  value={editor.mode === "new" ? String(editor.draft.title ?? "") : String(editor.row.title ?? "")}
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
                <span className={OWNER_ADMIN_FIELD_LABEL_CLASS}>{t("business_phase7_165")}</span>
                <textarea
                  className={OWNER_ADMIN_FIELD_INPUT_CLASS}
                  rows={2}
                  value={editor.mode === "new" ? String(editor.draft.description ?? "") : String(editor.row.description ?? "")}
                  onChange={(e) => {
                    if (editor.mode === "new") {
                      setEditor({ mode: "new", draft: { ...editor.draft, description: e.target.value } });
                    } else {
                      setEditor({ mode: "edit", row: { ...editor.row, description: e.target.value } });
                    }
                  }}
                />
              </label>
              <div className="rounded-ui-rect border border-sam-border bg-sam-surface-muted/50 p-3.5">
                <p className="sam-text-body font-semibold text-sam-fg">{t("business_phase7_105")}</p>
                <p className="mt-1 sam-text-xxs leading-snug text-sam-muted">
                  {t("business_phase7_458")}
                </p>
                <label htmlFor="owner-banner-link-action" className="mt-3 block">
                  <span className="sr-only">{t("business_phase7_054")}</span>
                  <select
                    id="owner-banner-link-action"
                    className={`${OWNER_ADMIN_FIELD_INPUT_CLASS} py-2.5`}
                    value={
                      editor.mode === "new"
                        ? bannerLinkSelectValue(editor.draft.link_type)
                        : bannerLinkSelectValue(editor.row.link_type)
                    }
                    onChange={(e) => {
                      const v = e.target.value;
                      if (editor.mode === "new") {
                        setEditor({ mode: "new", draft: { ...editor.draft, link_type: v, link_target_id: null } });
                      } else {
                        setEditor({ mode: "edit", row: { ...editor.row, link_type: v, link_target_id: null } });
                      }
                    }}
                  >
                    {LINK_VALUES.map((v) => (
                      <option key={v} value={v}>
                        {linkLabel(v)}
                      </option>
                    ))}
                  </select>
                </label>

                {(editor.mode === "new" ? editor.draft.link_type : editor.row.link_type) === "notice" ? (
                  <label className="mt-3 block border-t border-[var(--biz-card-border)] pt-3">
                    <span className={`${OWNER_ADMIN_FIELD_LABEL_CLASS} mb-1.5 block`}>{t("business_phase7_197")}</span>
                    <select
                      className={`${OWNER_ADMIN_FIELD_INPUT_CLASS} py-2.5`}
                      disabled={busy || linkPick.loading}
                      value={
                        editor.mode === "new"
                          ? String(editor.draft.link_target_id ?? "")
                          : String(editor.row.link_target_id ?? "")
                      }
                      onChange={(e) => {
                        const v = e.target.value.trim() || null;
                        if (editor.mode === "new") {
                          setEditor({ mode: "new", draft: { ...editor.draft, link_target_id: v } });
                        } else {
                          setEditor({ mode: "edit", row: { ...editor.row, link_target_id: v } });
                        }
                      }}
                    >
                      <option value="">{t("business_phase7_164")}</option>
                      {mergePickList(
                        linkPick.notices,
                        editor.mode === "new" ? editor.draft.link_target_id : editor.row.link_target_id,
                        t("business_phase7_443")
                      ).map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.title}
                        </option>
                      ))}
                    </select>
                    {linkPick.loading ? (
                      <p className="mt-1.5 text-[11px] text-[var(--biz-text-muted)]">{t("business_phase7_031")}</p>
                    ) : linkPick.notices.length === 0 &&
                      !(editor.mode === "new" ? editor.draft.link_target_id : editor.row.link_target_id) ? (
                      <p className="mt-1.5 text-[11px] text-amber-800">
                        {t("business_phase7_459")}
                      </p>
                    ) : null}
                  </label>
                ) : null}
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
                <span className="sam-text-body text-sam-fg">{t("business_phase7_048")}</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className={OWNER_ADMIN_FIELD_LABEL_CLASS}>{t("business_phase7_174")}</span>
                  <input
                    type="datetime-local"
                    className={`${OWNER_ADMIN_FIELD_INPUT_CLASS} sam-text-xxs`}
                    value={
                      (editor.mode === "new" ? editor.draft.start_at : editor.row.start_at)?.slice(0, 16) ?? ""
                    }
                    onChange={(e) => {
                      const v = e.target.value ? new Date(e.target.value).toISOString() : null;
                      if (editor.mode === "new") {
                        setEditor({ mode: "new", draft: { ...editor.draft, start_at: v } });
                      } else {
                        setEditor({ mode: "edit", row: { ...editor.row, start_at: v } });
                      }
                    }}
                  />
                </label>
                <label className="block">
                  <span className={OWNER_ADMIN_FIELD_LABEL_CLASS}>{t("business_phase7_258")}</span>
                  <input
                    type="datetime-local"
                    className={`${OWNER_ADMIN_FIELD_INPUT_CLASS} sam-text-xxs`}
                    value={(editor.mode === "new" ? editor.draft.end_at : editor.row.end_at)?.slice(0, 16) ?? ""}
                    onChange={(e) => {
                      const v = e.target.value ? new Date(e.target.value).toISOString() : null;
                      if (editor.mode === "new") {
                        setEditor({ mode: "new", draft: { ...editor.draft, end_at: v } });
                      } else {
                        setEditor({ mode: "edit", row: { ...editor.row, end_at: v } });
                      }
                    }}
                  />
                </label>
              </div>
            </div>
            <div className="mt-5 flex gap-2 border-t border-sam-border pt-4">
              <button type="button" disabled={busy} onClick={() => setEditor(null)} className={`min-h-[44px] flex-1 ${OWNER_ADMIN_OUTLINE_BTN_CLASS}`}>
                {t("common_close")}
              </button>
              <button type="button" disabled={busy} onClick={() => void saveEditor()} className={`min-h-[44px] flex-1 ${OWNER_ADMIN_PRIMARY_BTN_CLASS}`}>
                {busy ? t("business_phase7_384") : t("business_phase7_385")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <OwnerStoreAdminConfirmModal
        open={deleteConfirmId != null}
        titleId="owner-store-banners-delete-title"
        title={t("business_phase7_104")}
        description={t("business_phase7_460")}
        confirmBusyLabel={t("business_phase7_442")}
        busy={busy}
        disableActions={busy}
        confirmTone="danger"
        onCancel={() => setDeleteConfirmId(null)}
        onConfirm={async () => {
          if (!deleteConfirmId) return;
          const id = deleteConfirmId;
          setDeleteConfirmId(null);
          await performDeleteBanner(id);
        }}
      />
    </div>
  );
}
