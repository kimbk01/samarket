"use client";

import { dibayAlert } from "@/components/ui/dibay-overlay";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { formatAdminPhp } from "@/lib/admin/ui-standard/admin-format";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import {
  TRADE_SHOWCASE_MAX_IMAGES,
  type TradeShowcaseItem,
} from "@/lib/trade/showcase/trade-showcase-model";

type Category = { id: string; name: string; slug: string };

type Draft = {
  id: string | null;
  trade_category_id: string;
  title: string;
  price: string;
  price_note: string;
  region_label: string;
  description: string;
  image_urls: string[];
  sort_order: string;
  is_active: boolean;
};

const EMPTY_DRAFT: Draft = {
  id: null,
  trade_category_id: "",
  title: "",
  price: "",
  price_note: "",
  region_label: "",
  description: "",
  image_urls: [],
  sort_order: "0",
  is_active: true,
};

function toDraft(item: TradeShowcaseItem): Draft {
  return {
    id: item.id,
    trade_category_id: item.trade_category_id ?? "",
    title: item.title,
    price: item.price == null ? "" : String(item.price),
    price_note: item.price_note ?? "",
    region_label: item.region_label ?? "",
    description: item.description ?? "",
    image_urls: item.image_urls ?? [],
    sort_order: String(item.sort_order ?? 0),
    is_active: item.is_active,
  };
}

const INPUT_CLASS =
  "h-10 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 text-[14px] text-sam-fg outline-none focus:border-sam-primary";

/**
 * P-7 (2026-10-27) 어드민 「샘플 상품」 — 실제 거래 글과 분리된 예시 카탈로그 관리.
 * 사용자 화면: 실제 글이 적을 때 목록 하단 「예시로 둘러보기」에 「샘플 · 거래 불가」 배지로만 노출(검색 제외).
 */
export function TradeShowcaseAdminPage() {
  const { language } = useI18n();
  const ko = language !== "en";
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<{ code: string; httpStatus: number } | null>(null);
  const [items, setItems] = useState<TradeShowcaseItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    void (async () => {
      const res = await fetch("/api/admin/trade/showcase", { credentials: "include", cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        items?: TradeShowcaseItem[];
        categories?: Category[];
      };
      if (cancelled) return;
      if (!res.ok || !data.ok) {
        setErr({ code: data.error ?? "load_failed", httpStatus: res.status });
      } else {
        setItems(data.items ?? []);
        setCategories(data.categories ?? []);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  const categoryName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  const uploadImages = useCallback(
    async (files: FileList | null) => {
      if (!files || !draft) return;
      const room = TRADE_SHOWCASE_MAX_IMAGES - draft.image_urls.length;
      const picked = Array.from(files).slice(0, Math.max(0, room));
      if (picked.length === 0) return;
      setUploading(true);
      const urls: string[] = [];
      for (const file of picked) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/posts/upload-image", { method: "POST", body: fd, credentials: "include" });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string };
        if (res.ok && data.url) {
          urls.push(data.url);
        } else {
          await dibayAlert({ title: data.error ?? (ko ? "사진 업로드 실패" : "Upload failed") });
          break;
        }
      }
      setDraft((d) => (d ? { ...d, image_urls: [...d.image_urls, ...urls] } : d));
      setUploading(false);
    },
    [draft, ko]
  );

  const moveImage = (from: number, to: number) => {
    setDraft((d) => {
      if (!d || to < 0 || to >= d.image_urls.length) return d;
      const next = [...d.image_urls];
      const [x] = next.splice(from, 1);
      next.splice(to, 0, x);
      return { ...d, image_urls: next };
    });
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    const body = {
      trade_category_id: draft.trade_category_id || null,
      title: draft.title,
      price: draft.price.trim() === "" ? null : draft.price,
      price_note: draft.price_note,
      region_label: draft.region_label,
      description: draft.description,
      image_urls: draft.image_urls,
      sort_order: Number(draft.sort_order) || 0,
      is_active: draft.is_active,
    };
    const res = await fetch(draft.id ? `/api/admin/trade/showcase/${draft.id}` : "/api/admin/trade/showcase", {
      method: draft.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setSaving(false);
    if (!res.ok || !data.ok) {
      await dibayAlert({ title: data.error ?? (ko ? "저장 실패" : "Save failed") });
      return;
    }
    setDraft(null);
    setTick((n) => n + 1);
  };

  const remove = async (item: TradeShowcaseItem) => {
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("delete"),
      ko,
      title: ko ? `「${item.title}」 샘플을 삭제할까요?` : `Delete sample “${item.title}”?`,
      description: ko ? "삭제하면 되돌릴 수 없습니다. 잠시 내리려면 「숨기기」를 쓰세요." : "This cannot be undone. Use “Hide” to take it down temporarily.",
      confirmLabel: ko ? "삭제" : "Delete",
      destructive: true,
      retypeValue: item.title,
    });
    if (!confirmed.ok) return;
    const res = await fetch(`/api/admin/trade/showcase/${item.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ reason: confirmed.reason }),
    });
    if (!res.ok) {
      await dibayAlert({ title: ko ? "삭제 실패" : "Delete failed" });
      return;
    }
    setTick((n) => n + 1);
  };

  const toggleActive = async (item: TradeShowcaseItem) => {
    const res = await fetch(`/api/admin/trade/showcase/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ ...item, is_active: !item.is_active }),
    });
    if (!res.ok) await dibayAlert({ title: ko ? "변경 실패" : "Update failed" });
    setTick((n) => n + 1);
  };

  return (
    <div className="flex flex-col gap-4">
      <AdminPageHeader
        title={ko ? "샘플 상품" : "Sample listings"}
        description={
          ko
            ? "실제 거래 글과 분리된 예시입니다. 실제 글이 적을 때 목록 아래 「예시로 둘러보기」에 「샘플 · 거래 불가」 배지로만 보이며, 검색·찜·채팅·신고 대상이 아닙니다."
            : "Examples kept apart from real listings. Shown only under “Browse examples” with a “Sample · Not for sale” badge when real listings are few; never in search, favorites, chat or reports."
        }
      />

      {err?.code === "table_missing" ? (
        <AdminCard>
          <p className="text-[14px] text-sam-fg">
            {ko
              ? "샘플 상품 테이블이 아직 운영 DB 에 없습니다(마이그레이션 20270703120000 적용 대기)."
              : "The sample table is not in the production DB yet (migration 20270703120000 pending)."}
          </p>
        </AdminCard>
      ) : err ? (
        <AdminErrorState ko={ko} code={err.code} httpStatus={err.httpStatus} onRetry={() => setTick((n) => n + 1)} />
      ) : loading ? (
        <AdminLoadingState ko={ko} />
      ) : (
        <>
          <div className="flex justify-end">
            <AdminActionButton variant="primary" onClick={() => setDraft({ ...EMPTY_DRAFT })}>
              {ko ? "샘플 추가" : "Add sample"}
            </AdminActionButton>
          </div>

          {draft ? (
            <AdminCard title={draft.id ? (ko ? "샘플 수정" : "Edit sample") : ko ? "샘플 추가" : "Add sample"}>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-1 text-[13px] font-medium text-sam-fg">
                  {ko ? "주제" : "Topic"}
                  <select
                    className={INPUT_CLASS}
                    value={draft.trade_category_id}
                    onChange={(e) => setDraft({ ...draft, trade_category_id: e.target.value })}
                  >
                    <option value="">{ko ? "전체(주제 없음)" : "All (no topic)"}</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-[13px] font-medium text-sam-fg">
                  {ko ? "제목 *" : "Title *"}
                  <input className={INPUT_CLASS} maxLength={80} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                </label>
                <label className="flex flex-col gap-1 text-[13px] font-medium text-sam-fg">
                  {ko ? "가격(₱, 비우면 표시 안 함)" : "Price (₱, optional)"}
                  <input className={INPUT_CLASS} inputMode="decimal" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} />
                </label>
                <label className="flex flex-col gap-1 text-[13px] font-medium text-sam-fg">
                  {ko ? "가격 보조 문구(예: /월, 시급)" : "Price note (e.g. /month)"}
                  <input className={INPUT_CLASS} maxLength={40} value={draft.price_note} onChange={(e) => setDraft({ ...draft, price_note: e.target.value })} />
                </label>
                <label className="flex flex-col gap-1 text-[13px] font-medium text-sam-fg">
                  {ko ? "지역 표기(예: Quezon City › Diliman)" : "Region label"}
                  <input className={INPUT_CLASS} maxLength={60} value={draft.region_label} onChange={(e) => setDraft({ ...draft, region_label: e.target.value })} />
                </label>
                <label className="flex flex-col gap-1 text-[13px] font-medium text-sam-fg">
                  {ko ? "노출 순서(작을수록 먼저)" : "Order (lower first)"}
                  <input className={INPUT_CLASS} inputMode="numeric" value={draft.sort_order} onChange={(e) => setDraft({ ...draft, sort_order: e.target.value })} />
                </label>
                <label className="flex flex-col gap-1 text-[13px] font-medium text-sam-fg md:col-span-2">
                  {ko ? "설명" : "Description"}
                  <textarea
                    className="min-h-24 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-[14px] text-sam-fg outline-none focus:border-sam-primary"
                    maxLength={2000}
                    value={draft.description}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  />
                </label>
              </div>

              <div className="mt-4 flex flex-col gap-2">
                <p className="text-[13px] font-medium text-sam-fg">
                  {ko ? `사진 ${draft.image_urls.length}/${TRADE_SHOWCASE_MAX_IMAGES} · 첫 장이 대표` : `Photos ${draft.image_urls.length}/${TRADE_SHOWCASE_MAX_IMAGES} · first is cover`}
                </p>
                <div className="flex flex-wrap gap-2">
                  {draft.image_urls.map((url, i) => (
                    <div key={url} className="flex w-24 flex-col gap-1">
                      <div className="relative h-24 w-24 overflow-hidden rounded-ui-rect bg-sam-surface-muted">
                        <SamarketThumbnail src={url} fill roundedClassName="rounded-ui-rect" fallbackSrc="" />
                        {i === 0 ? (
                          <span className="absolute left-1 top-1 rounded-ui-rect bg-sam-primary px-1 text-[12px] font-bold text-sam-on-primary">
                            {ko ? "대표" : "Cover"}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex justify-between">
                        <AdminActionButton
                          size="sm"
                          variant="ghost"
                          disabled={i === 0}
                          aria-label={ko ? "앞으로" : "Move earlier"}
                          onClick={() => moveImage(i, i - 1)}
                        >
                          ◀
                        </AdminActionButton>
                        <AdminActionButton
                          size="sm"
                          variant="ghost"
                          aria-label={ko ? "사진 빼기" : "Remove photo"}
                          onClick={() => setDraft({ ...draft, image_urls: draft.image_urls.filter((_, j) => j !== i) })}
                        >
                          ✕
                        </AdminActionButton>
                        <AdminActionButton
                          size="sm"
                          variant="ghost"
                          disabled={i === draft.image_urls.length - 1}
                          aria-label={ko ? "뒤로" : "Move later"}
                          onClick={() => moveImage(i, i + 1)}
                        >
                          ▶
                        </AdminActionButton>
                      </div>
                    </div>
                  ))}
                  {draft.image_urls.length < TRADE_SHOWCASE_MAX_IMAGES ? (
                    <label className="flex h-24 w-24 cursor-pointer items-center justify-center rounded-ui-rect border border-dashed border-sam-border text-[12px] text-sam-muted">
                      {uploading ? (ko ? "올리는 중…" : "Uploading…") : ko ? "사진 추가" : "Add photo"}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                        multiple
                        className="hidden"
                        disabled={uploading}
                        onChange={(e) => {
                          void uploadImages(e.target.files);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  ) : null}
                </div>
              </div>

              <label className="mt-3 flex items-center gap-2 text-[14px] text-sam-fg">
                <input type="checkbox" checked={draft.is_active} onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} />
                {ko ? "사용자 화면에 노출" : "Show to users"}
              </label>

              <div className="mt-4 flex justify-end gap-2">
                <AdminActionButton variant="secondary" onClick={() => setDraft(null)} disabled={saving}>
                  {ko ? "취소" : "Cancel"}
                </AdminActionButton>
                <AdminActionButton variant="primary" onClick={() => void save()} disabled={saving || uploading || !draft.title.trim()}>
                  {saving ? (ko ? "저장 중…" : "Saving…") : ko ? "저장" : "Save"}
                </AdminActionButton>
              </div>
            </AdminCard>
          ) : null}

          {items.length === 0 ? (
            <AdminEmptyState ko={ko} message={ko ? "등록된 샘플 상품이 없습니다." : "No sample listings yet."} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <AdminCard key={item.id}>
                  <div className="flex gap-3">
                    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-ui-rect bg-sam-surface-muted">
                      {item.image_urls[0] ? (
                        <SamarketThumbnail src={item.image_urls[0]} fill roundedClassName="rounded-ui-rect" fallbackSrc="" />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold text-sam-fg">{item.title}</p>
                      <p className="text-[12px] text-sam-muted">
                        {(item.trade_category_id && categoryName.get(item.trade_category_id)) || (ko ? "전체" : "All")}
                        {" · "}
                        {item.price != null ? formatAdminPhp(item.price) : ko ? "가격 없음" : "No price"}
                        {" · "}
                        {ko ? `사진 ${item.image_urls.length}` : `${item.image_urls.length} photos`}
                      </p>
                      <p className={`mt-1 text-[12px] font-semibold ${item.is_active ? "text-sam-primary" : "text-sam-muted"}`}>
                        {item.is_active ? (ko ? "노출 중" : "Visible") : ko ? "숨김" : "Hidden"} · {ko ? `순서 ${item.sort_order}` : `Order ${item.sort_order}`}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <AdminActionButton size="sm" variant="secondary" onClick={() => setDraft(toDraft(item))}>
                      {ko ? "수정" : "Edit"}
                    </AdminActionButton>
                    <AdminActionButton size="sm" variant="neutral" onClick={() => void toggleActive(item)}>
                      {item.is_active ? (ko ? "숨기기" : "Hide") : ko ? "노출" : "Show"}
                    </AdminActionButton>
                    <AdminActionButton size="sm" variant="danger" onClick={() => void remove(item)}>
                      {ko ? "삭제" : "Delete"}
                    </AdminActionButton>
                  </div>
                </AdminCard>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
