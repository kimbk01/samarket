"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";

type SampleStoreRow = {
  id: string;
  slug: string;
  store_name: string;
  is_visible: boolean;
  product_count: number;
  store_categories?: { name?: string | null } | null;
  store_topics?: { name?: string | null } | null;
};
type Category = { id: string; name: string };
type Topic = { id: string; name: string; store_category_id: string };

/**
 * 관리자 샘플(체험용) 매장 — 목록 · 생성 · 전체 노출/숨김 (2026-10-28 배달 감사 §F S-5·S-7).
 * 고객 노출은 매장별 `is_visible`. 전체 노출/숨김은 그 값을 일괄로 바꾼다.
 */
export function AdminSampleStoresPage() {
  const { language } = useI18n();
  const ko = language !== "en";
  const [rows, setRows] = useState<SampleStoreRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [description, setDescription] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [s, tx] = await Promise.all([
      fetch("/api/admin/stores/samples", { credentials: "include", cache: "no-store" }).then((r) => r.json()).catch(() => null),
      fetch("/api/stores/taxonomy", { credentials: "include" }).then((r) => r.json()).catch(() => null),
    ]);
    if (s?.ok) setRows(s.stores as SampleStoreRow[]);
    else setMsg(String(s?.error ?? "load_failed"));
    if (tx?.ok) {
      setCategories(((tx.categories ?? []) as Category[]).map((c) => ({ id: c.id, name: c.name })));
      setTopics(((tx.topics ?? []) as Topic[]).map((t) => ({ id: t.id, name: t.name, store_category_id: t.store_category_id })));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const topicOptions = useMemo(() => topics.filter((t) => t.store_category_id === categoryId), [topics, categoryId]);
  const visibleCount = rows.filter((r) => r.is_visible).length;

  const create = async () => {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/admin/stores/samples", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeName: name, storeCategoryId: categoryId, storeTopicId: topicId || null, description }),
    });
    const j = await res.json().catch(() => null);
    setBusy(false);
    if (!j?.ok) {
      setMsg(String(j?.error ?? "save_failed"));
      return;
    }
    setName("");
    setDescription("");
    setMsg(ko ? "샘플 매장을 만들었습니다 (숨김 상태)." : "Sample store created (hidden).");
    void load();
  };

  const setAllVisible = async (visible: boolean) => {
    const confirmed = await confirmAdminAction({
      level: adminActionLevel(visible ? "exposeStart" : "exposeStop"),
      ko,
      title: visible
        ? ko ? "샘플 매장을 모두 고객에게 노출할까요?" : "Show all sample stores to customers?"
        : ko ? "샘플 매장을 모두 숨길까요?" : "Hide all sample stores?",
      description: ko
        ? "샘플 매장마다 고객 노출(is_visible)을 한 번에 바꿉니다."
        : "Updates customer visibility (is_visible) of every sample store at once.",
      confirmLabel: visible ? (ko ? "전체 노출" : "Show all") : ko ? "전체 숨김" : "Hide all",
    });
    if (!confirmed.ok) return;
    const reason = confirmed.reason;
    setBusy(true);
    const res = await fetch("/api/admin/stores/samples/visibility", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visible, reason }),
    });
    const j = await res.json().catch(() => null);
    setBusy(false);
    setMsg(j?.ok ? (ko ? `${j.changed}곳 변경했습니다.` : `${j.changed} stores updated.`) : String(j?.error ?? "save_failed"));
    void load();
  };

  return (
    <div className="space-y-4 p-4" data-admin-sample-stores="1">
      <AdminPageHeader
        title={ko ? "샘플 매장 관리" : "Sample stores"}
        description={
          ko
            ? "서비스 체험용 매장 — 주소와 무관하게 모든 고객에게 보이고 실제 주문·결제는 되지 않습니다."
            : "Demo stores shown to every customer regardless of address. Real orders and payments are disabled."
        }
        backHref="/admin/stores"
      />

      <section className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14px] font-bold text-sam-fg">
            {ko ? `전체 ${rows.length}곳 · 고객 노출 ${visibleCount}곳` : `${rows.length} stores · ${visibleCount} visible`}
          </span>
          <AdminActionButton variant="primary" disabled={busy || rows.length === 0} onClick={() => void setAllVisible(true)}>
            {ko ? "샘플 전체 노출" : "Show all samples"}
          </AdminActionButton>
          <AdminActionButton variant="secondary" disabled={busy || rows.length === 0} onClick={() => void setAllVisible(false)}>
            {ko ? "샘플 전체 숨김" : "Hide all samples"}
          </AdminActionButton>
        </div>
        {msg ? <p className="text-[13px] text-sam-muted" role="status">{msg}</p> : null}
      </section>

      <section className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h2 className="text-[14px] font-bold text-sam-fg">{ko ? "샘플 매장 추가" : "Add sample store"}</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <input className="sam-input rounded-ui-rect" placeholder={ko ? "매장명" : "Store name"} value={name} onChange={(e) => setName(e.target.value)} />
          <select className="sam-input rounded-ui-rect" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setTopicId(""); }}>
            <option value="">{ko ? "업종 선택" : "Category"}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select className="sam-input rounded-ui-rect" value={topicId} onChange={(e) => setTopicId(e.target.value)} disabled={!categoryId}>
            <option value="">{ko ? "하위 업종 (선택)" : "Sub category (optional)"}</option>
            {topicOptions.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <input className="sam-input rounded-ui-rect" placeholder={ko ? "소개 (선택)" : "Description (optional)"} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <AdminActionButton variant="primary" disabled={busy || !name.trim() || !categoryId} onClick={() => void create()}>
          {ko ? "추가" : "Add"}
        </AdminActionButton>
      </section>

      <section className="overflow-hidden rounded-ui-rect border border-sam-border bg-white">
        {loading ? (
          <p className="p-4 text-[13px] text-sam-muted">…</p>
        ) : rows.length === 0 ? (
          <p className="p-4 text-[13px] text-sam-muted">{ko ? "샘플 매장이 없습니다." : "No sample stores."}</p>
        ) : (
          rows.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-2 border-b border-sam-border px-4 py-3 last:border-b-0">
              <span className="text-[14px] font-semibold text-sam-fg">{r.store_name}</span>
              <span className="text-[12px] text-sam-muted">
                {[r.store_categories?.name, r.store_topics?.name].filter(Boolean).join(" · ")}
              </span>
              <AdminToneBadge tone={r.is_visible ? "success" : "neutral"}>
                {r.is_visible ? (ko ? "고객 노출" : "Visible") : ko ? "숨김" : "Hidden"}
              </AdminToneBadge>
              <span className="text-[12px] text-sam-muted">{ko ? `메뉴 ${r.product_count}개` : `${r.product_count} items`}</span>
              <span className="flex-1" />
              <Link className="text-[13px] font-semibold text-sam-primary hover:underline" href={`/admin/stores/samples/${encodeURIComponent(r.id)}`}>
                {ko ? "메뉴·이미지 관리" : "Manage menu"}
              </Link>
              <a className="text-[13px] text-sam-muted hover:underline" href={`/stores/${encodeURIComponent(r.slug)}`} target="_blank" rel="noreferrer">
                {ko ? "고객 화면" : "Customer view"}
              </a>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
