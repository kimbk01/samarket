"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { AdminListItemButton } from "@/components/admin/ui/AdminListItemButton";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import {
  prepareImageFileForFunctionUpload,
  readFunctionUploadJson,
} from "@/lib/media/client-image-upload-prepare";
import { OWNER_PRODUCT_IMAGE_MAX_BYTES } from "@/lib/stores/owner-product-images";

type Section = { id: string; name: string; sort_order: number; is_hidden: boolean };
type Product = {
  id: string;
  title: string;
  summary: string | null;
  price: number;
  discount_percent: number | null;
  product_status: string;
  item_type: string;
  menu_section_id: string | null;
  sort_order: number;
  thumbnail_url: string | null;
  options_json: unknown[] | null;
  updated_at: string;
};
type StoreInfo = {
  id: string;
  slug: string;
  store_name: string;
  is_visible: boolean;
  delivery_available?: boolean;
  pickup_available?: boolean;
  business_hours_json?: Record<string, unknown> | null;
};

/** HC-1 — 운영 설정 입력 (사장님 매장 운영 설정과 같은 칸) */
type OpsDraft = {
  deliveryAvailable: boolean;
  pickupAvailable: boolean;
  deliveryFeePhp: string;
  minOrderPhp: string;
  freeDeliveryOverPhp: string;
  prepTimeMinutes: string;
  openTime: string;
  closeTime: string;
};

function opsDraftFromStore(s: StoreInfo): OpsDraft {
  const h = (s.business_hours_json ?? {}) as Record<string, unknown>;
  const auto = (h.auto_business_hours ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (v == null ? "" : String(v));
  return {
    deliveryAvailable: s.delivery_available === true,
    pickupAvailable: s.pickup_available !== false,
    deliveryFeePhp: str(h.delivery_fee_php),
    minOrderPhp: str(h.min_order_php),
    freeDeliveryOverPhp: str(h.free_delivery_over_php),
    prepTimeMinutes: str(h.prep_time_minutes),
    openTime: str(auto.open) || "09:00",
    closeTime: str(auto.close) || "21:00",
  };
}

type Draft = {
  id: string | null;
  title: string;
  summary: string;
  price: string;
  discountPercent: string;
  itemType: string;
  sectionId: string;
  status: string;
  sortOrder: string;
  thumbnailUrl: string;
  optionsJson: string;
  expectedUpdatedAt: string | null;
};

const EMPTY_DRAFT: Draft = {
  id: null,
  title: "",
  summary: "",
  price: "",
  discountPercent: "",
  itemType: "menu",
  sectionId: "",
  status: "active",
  sortOrder: "0",
  thumbnailUrl: "",
  optionsJson: "[]",
  expectedUpdatedAt: null,
};

function sampleProductStatusLabel(status: string, ko: boolean): string {
  if (status === "active") return ko ? "판매중(표시)" : "Active";
  if (status === "sold_out") return ko ? "품절" : "Sold out";
  if (status === "hidden") return ko ? "숨김" : "Hidden";
  return status;
}

async function uploadSampleImage(storeId: string, file: File): Promise<{ ok: boolean; url?: string; error?: string }> {
  const prepared = await prepareImageFileForFunctionUpload(file, OWNER_PRODUCT_IMAGE_MAX_BYTES);
  if (!prepared.ok) return { ok: false, error: prepared.error };
  const fd = new FormData();
  fd.append("file", prepared.file, prepared.file.name || "image.jpg");
  const res = await fetch(`/api/admin/stores/samples/${encodeURIComponent(storeId)}/upload-image`, {
    method: "POST",
    body: fd,
    credentials: "include",
  });
  const json = await readFunctionUploadJson<{ ok?: boolean; url?: string; error?: string }>(res);
  return json.ok && json.url ? { ok: true, url: json.url } : { ok: false, error: json.error ?? "upload_failed" };
}

/**
 * 샘플 매장 메뉴·구역·이미지·노출 관리 — 저장은 오너와 같은 카탈로그 코어(관리자 샘플 정책).
 * 옵션은 오너 화면과 같은 `options_json` 형식(서버가 같은 검증).
 */
export function AdminSampleStoreCatalogPage({ storeId }: { storeId: string }) {
  const { language } = useI18n();
  const ko = language !== "en";
  const base = `/api/admin/stores/samples/${encodeURIComponent(storeId)}`;
  const [store, setStore] = useState<StoreInfo | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [newSection, setNewSection] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ops, setOps] = useState<OpsDraft | null>(null);

  const load = useCallback(async () => {
    const j = await fetch(`${base}/products`, { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .catch(() => null);
    if (!j?.ok) {
      setMsg(String(j?.error ?? "load_failed"));
      return;
    }
    setStore(j.store as StoreInfo);
    setOps(opsDraftFromStore(j.store as StoreInfo));
    setSections(j.sections as Section[]);
    setProducts(j.products as Product[]);
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  const call = async (url: string, method: string, body: unknown): Promise<boolean> => {
    setBusy(true);
    setMsg(null);
    const res = await fetch(url, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => null);
    setBusy(false);
    if (!j?.ok) {
      setMsg(String(j?.message ?? j?.error ?? "save_failed"));
      return false;
    }
    await load();
    return true;
  };

  const saveProduct = async () => {
    let options: unknown;
    try {
      options = JSON.parse(draft.optionsJson || "[]");
    } catch {
      setMsg(ko ? "옵션 JSON 형식 오류" : "Invalid options JSON");
      return;
    }
    const payload: Record<string, unknown> = {
      title: draft.title,
      summary: draft.summary,
      price: Number(draft.price),
      discount_percent: draft.discountPercent.trim() ? Number(draft.discountPercent) : null,
      item_type: draft.itemType,
      menu_section_id: draft.sectionId || null,
      product_status: draft.status,
      sort_order: Number(draft.sortOrder) || 0,
      thumbnail_url: draft.thumbnailUrl,
      options_json: options,
    };
    if (draft.id) {
      payload.expected_updated_at = draft.expectedUpdatedAt;
      if (await call(`${base}/products/${encodeURIComponent(draft.id)}`, "PATCH", payload)) setDraft(EMPTY_DRAFT);
    } else if (await call(`${base}/products`, "POST", payload)) {
      setDraft({ ...EMPTY_DRAFT, sectionId: draft.sectionId, itemType: draft.itemType });
    }
  };

  const toggleStoreVisible = async () => {
    if (!store) return;
    const next = !store.is_visible;
    const confirmed = await confirmAdminAction({
      level: adminActionLevel(next ? "exposeStart" : "exposeStop"),
      ko,
      title: next ? (ko ? "이 샘플 매장을 노출할까요?" : "Show this sample store?") : ko ? "이 샘플 매장을 숨길까요?" : "Hide this sample store?",
      confirmLabel: next ? (ko ? "노출" : "Show") : ko ? "숨김" : "Hide",
    });
    if (!confirmed.ok) return;
    const reason = confirmed.reason;
    await call(`/api/admin/stores/${encodeURIComponent(storeId)}`, "PATCH", {
      action: "set_store_visible",
      enabled: next,
      reason,
    });
  };

  const uploadInto = async (file: File | undefined, apply: (url: string) => Promise<void> | void) => {
    if (!file) return;
    setBusy(true);
    const up = await uploadSampleImage(storeId, file);
    setBusy(false);
    if (!up.ok || !up.url) {
      setMsg(up.error ?? "upload_failed");
      return;
    }
    await apply(up.url);
  };

  return (
    <div className="space-y-4 p-4" data-admin-sample-catalog="1">
      <AdminPageHeader title={store?.store_name ?? (ko ? "샘플 매장" : "Sample store")} backHref="/admin/stores/samples" />

      <section className="flex flex-wrap items-center gap-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <AdminToneBadge tone="progress">{ko ? "샘플 매장" : "Sample store"}</AdminToneBadge>
        <AdminToneBadge tone={store?.is_visible ? "success" : "neutral"}>
          {store?.is_visible ? (ko ? "고객 노출" : "Visible") : ko ? "숨김" : "Hidden"}
        </AdminToneBadge>
        <AdminActionButton variant="secondary" disabled={busy || !store} onClick={() => void toggleStoreVisible()}>
          {store?.is_visible ? (ko ? "숨기기" : "Hide") : ko ? "노출하기" : "Show"}
        </AdminActionButton>
        <label className="text-[13px] text-sam-fg">
          {ko ? "대표 이미지" : "Profile image"}{" "}
          <input type="file" accept="image/*" onChange={(e) => void uploadInto(e.target.files?.[0], (url) => void call(base, "PATCH", { profileImageUrl: url }))} />
        </label>
        <label className="text-[13px] text-sam-fg">
          {ko ? "커버 이미지" : "Cover image"}{" "}
          <input type="file" accept="image/*" onChange={(e) => void uploadInto(e.target.files?.[0], (url) => void call(base, "PATCH", { coverImageUrl: url }))} />
        </label>
        {store ? (
          <a className="text-[13px] text-sam-muted hover:underline" href={`/stores/${encodeURIComponent(store.slug)}`} target="_blank" rel="noreferrer">
            {ko ? "고객 화면" : "Customer view"}
          </a>
        ) : null}
      </section>
      {msg ? <p className="text-[13px] text-sam-danger" role="alert">{msg}</p> : null}

      {ops ? (
        <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4" data-admin-sample-ops="1">
          <h2 className="text-[14px] font-bold text-sam-fg">{ko ? "운영 설정" : "Operations"}</h2>
          <div className="flex flex-wrap gap-4 text-[13px] text-sam-fg">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={ops.deliveryAvailable} onChange={(e) => setOps({ ...ops, deliveryAvailable: e.target.checked })} />
              {ko ? "배달" : "Delivery"}
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={ops.pickupAvailable} onChange={(e) => setOps({ ...ops, pickupAvailable: e.target.checked })} />
              {ko ? "포장·방문" : "Pickup / visit"}
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                ["deliveryFeePhp", ko ? "배달비 (₱)" : "Delivery fee (₱)"],
                ["minOrderPhp", ko ? "최소 주문 (₱)" : "Min order (₱)"],
                ["freeDeliveryOverPhp", ko ? "무료배달 기준 (₱)" : "Free delivery over (₱)"],
                ["prepTimeMinutes", ko ? "조리·준비 시간 (분)" : "Prep time (min)"],
                ["openTime", ko ? "영업 시작" : "Opens"],
                ["closeTime", ko ? "영업 종료" : "Closes"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block text-[12px] font-medium text-sam-muted">
                {label}
                <input
                  type={key === "openTime" || key === "closeTime" ? "time" : "number"}
                  min={0}
                  className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[13px] text-sam-fg"
                  value={ops[key]}
                  onChange={(e) => setOps({ ...ops, [key]: e.target.value })}
                />
              </label>
            ))}
          </div>
          <AdminActionButton
            variant="primary"
            disabled={busy}
            onClick={() =>
              void call(base, "PATCH", {
                deliveryAvailable: ops.deliveryAvailable,
                pickupAvailable: ops.pickupAvailable,
                deliveryFeePhp: ops.deliveryFeePhp.trim() === "" ? null : ops.deliveryFeePhp,
                minOrderPhp: ops.minOrderPhp.trim() === "" ? null : ops.minOrderPhp,
                freeDeliveryOverPhp: ops.freeDeliveryOverPhp.trim() === "" ? null : ops.freeDeliveryOverPhp,
                ...(ops.prepTimeMinutes.trim() !== "" ? { prepTimeMinutes: ops.prepTimeMinutes } : {}),
                openTime: ops.openTime,
                closeTime: ops.closeTime,
              })
            }
          >
            {ko ? "운영 설정 저장" : "Save operations"}
          </AdminActionButton>
        </section>
      ) : null}

      <section className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h2 className="text-[14px] font-bold text-sam-fg">{ko ? "메뉴 구역" : "Menu sections"}</h2>
        {sections.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] text-sam-fg">{s.name}</span>
            <AdminToneBadge tone={s.is_hidden ? "neutral" : "success"}>{s.is_hidden ? (ko ? "숨김" : "Hidden") : ko ? "노출" : "Shown"}</AdminToneBadge>
            <AdminActionButton size="sm" variant="ghost" disabled={busy} onClick={() => void call(`${base}/menu-sections/${encodeURIComponent(s.id)}`, "PATCH", { is_hidden: !s.is_hidden })}>
              {s.is_hidden ? (ko ? "노출" : "Show") : ko ? "숨김" : "Hide"}
            </AdminActionButton>
          </div>
        ))}
        <div className="flex gap-2">
          <input className="sam-input rounded-ui-rect" placeholder={ko ? "새 구역 이름" : "New section"} value={newSection} onChange={(e) => setNewSection(e.target.value)} />
          <AdminActionButton variant="primary" disabled={busy || !newSection.trim()} onClick={() => void call(`${base}/menu-sections`, "POST", { name: newSection, sort_order: sections.length }).then((ok) => ok && setNewSection(""))}>
            {ko ? "추가" : "Add"}
          </AdminActionButton>
        </div>
      </section>

      <section className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h2 className="text-[14px] font-bold text-sam-fg">{draft.id ? (ko ? "메뉴 수정" : "Edit item") : ko ? "메뉴 추가" : "Add item"}</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <input className="sam-input rounded-ui-rect" placeholder={ko ? "메뉴명" : "Title"} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          <input className="sam-input rounded-ui-rect" placeholder={ko ? "설명" : "Summary"} value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} />
          <input className="sam-input rounded-ui-rect" inputMode="numeric" placeholder={ko ? "가격 (₱)" : "Price (₱)"} value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} />
          <input className="sam-input rounded-ui-rect" inputMode="numeric" placeholder={ko ? "할인율 % (선택)" : "Discount % (optional)"} value={draft.discountPercent} onChange={(e) => setDraft({ ...draft, discountPercent: e.target.value })} />
          <select className="sam-input rounded-ui-rect" value={draft.sectionId} onChange={(e) => setDraft({ ...draft, sectionId: e.target.value })}>
            <option value="">{ko ? "구역 선택" : "Section"}</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <select className="sam-input rounded-ui-rect" value={draft.itemType} onChange={(e) => setDraft({ ...draft, itemType: e.target.value })}>
            <option value="menu">menu</option>
            <option value="product">product</option>
            <option value="service">service</option>
          </select>
          <select className="sam-input rounded-ui-rect" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
            <option value="active">{ko ? "판매중(표시)" : "Active"}</option>
            <option value="sold_out">{ko ? "품절" : "Sold out"}</option>
            <option value="hidden">{ko ? "숨김" : "Hidden"}</option>
            {draft.id ? <option value="deleted">{ko ? "삭제" : "Deleted"}</option> : null}
          </select>
          <input className="sam-input rounded-ui-rect" inputMode="numeric" placeholder={ko ? "정렬" : "Sort"} value={draft.sortOrder} onChange={(e) => setDraft({ ...draft, sortOrder: e.target.value })} />
          <label className="text-[13px] text-sam-fg sm:col-span-2">
            {ko ? "메뉴 이미지" : "Image"}{" "}
            <input type="file" accept="image/*" onChange={(e) => void uploadInto(e.target.files?.[0], (url) => setDraft((d) => ({ ...d, thumbnailUrl: url })))} />
            {draft.thumbnailUrl ? <span className="ml-2 text-sam-muted">✓</span> : null}
          </label>
          <textarea
            className="sam-input min-h-[120px] rounded-ui-rect font-mono text-[12px] sm:col-span-2"
            placeholder='options_json — [{"nameKo":"맵기","isRequired":true,"inputType":"radio","minSelect":1,"maxSelect":1,"options":[{"name":"보통","priceDelta":0}]}]'
            value={draft.optionsJson}
            onChange={(e) => setDraft({ ...draft, optionsJson: e.target.value })}
          />
        </div>
        <div className="flex gap-2">
          <AdminActionButton variant="primary" disabled={busy || !draft.title.trim()} onClick={() => void saveProduct()}>
            {ko ? "저장" : "Save"}
          </AdminActionButton>
          {draft.id ? (
            <AdminActionButton variant="ghost" disabled={busy} onClick={() => setDraft(EMPTY_DRAFT)}>
              {ko ? "새로 만들기" : "New"}
            </AdminActionButton>
          ) : null}
        </div>
      </section>

      <section className="overflow-hidden rounded-ui-rect border border-sam-border bg-white">
        {products.map((p) => (
          <AdminListItemButton
            key={p.id}
            selected={draft.id === p.id}
            className="flex w-full flex-wrap items-center gap-2 border-b border-sam-border px-4 py-2 text-left last:border-b-0"
            onClick={() =>
              setDraft({
                id: p.id,
                title: p.title,
                summary: p.summary ?? "",
                price: String(p.price),
                discountPercent: p.discount_percent != null ? String(p.discount_percent) : "",
                itemType: p.item_type,
                sectionId: p.menu_section_id ?? "",
                status: p.product_status,
                sortOrder: String(p.sort_order ?? 0),
                thumbnailUrl: p.thumbnail_url ?? "",
                optionsJson: JSON.stringify(p.options_json ?? [], null, 2),
                expectedUpdatedAt: p.updated_at,
              })
            }
          >
            <span className="text-[13px] font-semibold text-sam-fg">{p.title}</span>
            <span className="text-[12px] text-sam-muted">₱{p.price}</span>
            <AdminToneBadge tone={p.product_status === "active" ? "success" : "neutral"}>
              {sampleProductStatusLabel(p.product_status, ko)}
            </AdminToneBadge>
            <span className="text-[12px] text-sam-muted">{sections.find((s) => s.id === p.menu_section_id)?.name ?? ""}</span>
          </AdminListItemButton>
        ))}
      </section>
    </div>
  );
}
