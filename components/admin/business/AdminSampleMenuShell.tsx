"use client";

/**
 * 3-C §9-3 — 관리자 샘플 매장 메뉴·소개 편집.
 * 새 편집기를 만들지 않는다: 오너 메뉴 편집 컴포넌트(상품 허브·상품 폼·메뉴 카테고리)를 API·화면 경로만
 * 관리자 샘플 경로로 바꿔 그대로 렌더한다 (`OwnerCatalogEndpointsProvider`).
 * 서버는 모든 요청에서 business 권한 + store_kind='sample' 을 다시 확인한다 (실매장 → 403 not_sample_store).
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { AdminErrorState, AdminLoadingState, AdminResultBanner } from "@/components/admin/ui/AdminStateViews";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import {
  ADMIN_SAMPLE_CATALOG_ENDPOINTS,
  OwnerCatalogEndpointsProvider,
} from "@/components/business/owner/owner-catalog-endpoints";
import { OwnerProductsHubClient } from "@/components/business/owner/OwnerProductsHubClient";
import { OwnerProductForm } from "@/components/business/owner/OwnerProductForm";
import { OwnerMenuCategoriesClient } from "@/components/business/owner/OwnerMenuCategoriesClient";
import { OwnerToastHost } from "@/components/business/owner/OwnerToastHost";
import { uploadStoreOwnerProductImage } from "@/lib/stores/upload-store-product-image-client";

export type AdminSampleMenuView =
  | { kind: "hub" }
  | { kind: "categories" }
  | { kind: "new"; menuSectionId?: string; draft?: boolean }
  | { kind: "edit"; productId: string };

type SampleStoreInfo = {
  id: string;
  store_name: string | null;
  slug: string | null;
  description: string | null;
  profile_image_url: string | null;
  updated_at: string | null;
};

function SampleStoreIntroCard({
  storeId,
  info,
  ko,
  onSaved,
}: {
  storeId: string;
  info: SampleStoreInfo;
  ko: boolean;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const apiBase = ADMIN_SAMPLE_CATALOG_ENDPOINTS.apiBase(storeId);
  const [description, setDescription] = useState(info.description ?? "");
  const [imageUrl, setImageUrl] = useState(info.profile_image_url ?? "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: true; message: string } | { ok: false; code: string } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDescription(info.description ?? "");
    setImageUrl(info.profile_image_url ?? "");
  }, [info.description, info.profile_image_url]);

  const dirty = description !== (info.description ?? "") || imageUrl !== (info.profile_image_url ?? "");

  const onPickFile = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      const up = await uploadStoreOwnerProductImage(storeId, file, apiBase);
      setImageUrl(up.url);
    } catch (e) {
      setResult({ ok: false, code: e instanceof Error ? e.message : "upload_failed" });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const save = async () => {
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("save"),
      ko,
      title: t("admin_biz_save_sample_store_intro"),
      description: t("admin_biz_shown_on_the_customer_store_page"),
      confirmLabel: adminCta("save", ko),
    });
    if (!confirmed.ok) return;
    setBusy(true);
    setResult(null);
    try {
      const body: Record<string, unknown> = {};
      if (description !== (info.description ?? "")) body.description = description.trim() || null;
      if (imageUrl !== (info.profile_image_url ?? "")) body.profile_image_url = imageUrl.trim() || null;
      if (info.updated_at) body.expected_updated_at = info.updated_at;
      const res = await fetch(apiBase, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!json?.ok) {
        setResult({ ok: false, code: json?.error ?? "update_failed" });
        return;
      }
      setResult({ ok: true, message: t("admin_biz_saved") });
      onSaved();
    } catch {
      setResult({ ok: false, code: "network_error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminCard title={t("admin_biz_store_intro")}>
      <div className="space-y-3" data-admin-sample-intro="1">
        <AdminResultBanner ko={ko} result={result} onClose={() => setResult(null)} />
        <label className="block space-y-1">
          <span className="sam-text-helper font-medium text-sam-fg">{t("admin_biz_description")}</span>
          <textarea
            className="min-h-[96px] w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
            value={description}
            maxLength={4000}
            onChange={(e) => setDescription(e.target.value)}
            disabled={busy}
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" className="h-16 w-16 rounded-ui-rect border border-sam-border object-cover" />
          ) : (
            <span className="sam-text-helper text-sam-muted">{t("admin_biz_no_profile_image")}</span>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
          />
          <AdminActionButton variant="secondary" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
            {t("admin_biz_change_image")}
          </AdminActionButton>
        </div>
        <div className="flex justify-end gap-2">
          <AdminActionButton
            variant="quiet"
            size="sm"
            disabled={busy || !dirty}
            onClick={() => {
              setDescription(info.description ?? "");
              setImageUrl(info.profile_image_url ?? "");
            }}
          >
            {adminCta("cancel", ko)}
          </AdminActionButton>
          <AdminActionButton variant="primary" size="sm" disabled={busy || !dirty} onClick={() => void save()}>
            {adminCta("save", ko)}
          </AdminActionButton>
        </div>
      </div>
    </AdminCard>
  );
}

export function AdminSampleMenuShell({ storeId, view }: { storeId: string; view: AdminSampleMenuView }) {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [info, setInfo] = useState<SampleStoreInfo | null>(null);
  const [loadError, setLoadError] = useState<{ code: string; status?: number } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(ADMIN_SAMPLE_CATALOG_ENDPOINTS.apiBase(storeId), {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; store?: SampleStoreInfo } | null;
      if (!json?.ok || !json.store) {
        setLoadError({ code: json?.error ?? "load_failed", status: res.status });
        return;
      }
      setInfo(json.store);
    } catch {
      setLoadError({ code: "network_error" });
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const detailHref = `/admin/business/${encodeURIComponent(storeId)}?tab=products`;
  const hubHref = ADMIN_SAMPLE_CATALOG_ENDPOINTS.productsHubHref(storeId);
  const categoriesHref = ADMIN_SAMPLE_CATALOG_ENDPOINTS.categoriesHref(storeId);
  const linkBtn =
    "inline-flex rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 sam-text-helper font-medium text-sam-fg hover:bg-sam-surface-muted";

  if (loading && !info) {
    return (
      <div className="space-y-4">
        <AdminPageHeader title={t("admin_biz_sample_menu")} backHref={detailHref} />
        <AdminLoadingState ko={ko} />
      </div>
    );
  }
  if (!info) {
    return (
      <div className="space-y-4">
        <AdminPageHeader title={t("admin_biz_sample_menu")} backHref={detailHref} />
        <AdminErrorState ko={ko} code={loadError?.code ?? "load_failed"} httpStatus={loadError?.status} onRetry={() => void load()} />
      </div>
    );
  }

  const publicHref = info.slug ? `/stores/${encodeURIComponent(info.slug)}` : null;

  return (
    <div className="space-y-4" data-admin-sample-menu={view.kind}>
      <AdminPageHeader title={t("admin_biz_sample_menu")} backHref={detailHref} />
      <div className="flex flex-wrap items-center gap-2 rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3">
        <span className="sam-text-body font-semibold text-sam-fg">{(info.store_name ?? "").trim() || "—"}</span>
        <AdminToneBadge tone="warning">{t("admin_biz_sample")}</AdminToneBadge>
        <span className="sam-text-helper text-sam-muted">
          {t("admin_biz_admins_edit_the_full_menu_for")}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Link href={hubHref} className={linkBtn}>
            {t("admin_biz_menu_list")}
          </Link>
          <Link href={categoriesHref} className={linkBtn}>
            {t("admin_biz_menu_categories")}
          </Link>
          {publicHref ? (
            <a href={publicHref} target="_blank" rel="noopener noreferrer" className={linkBtn} data-admin-open-customer-view="1">
              {t("admin_biz_open_customer_view")}
            </a>
          ) : null}
        </div>
      </div>

      {view.kind === "hub" ? (
        <SampleStoreIntroCard storeId={storeId} info={info} ko={ko} onSaved={() => void load()} />
      ) : null}

      <OwnerCatalogEndpointsProvider value={ADMIN_SAMPLE_CATALOG_ENDPOINTS}>
        <div className="rounded-ui-rect border border-sam-border bg-sam-app">
          {view.kind === "hub" ? <OwnerProductsHubClient storeId={storeId} /> : null}
          {view.kind === "categories" ? <OwnerMenuCategoriesClient storeId={storeId} /> : null}
          {view.kind === "new" ? (
            <OwnerProductForm
              mode="new"
              storeId={storeId}
              defaultDraft={view.draft === true}
              initialMenuSectionId={view.menuSectionId ?? ""}
            />
          ) : null}
          {view.kind === "edit" ? <OwnerProductForm mode="edit" storeId={storeId} productId={view.productId} /> : null}
        </div>
        <OwnerToastHost />
      </OwnerCatalogEndpointsProvider>
    </div>
  );
}
