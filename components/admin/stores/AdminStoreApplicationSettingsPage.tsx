"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminGlobalAlertSoundSection } from "@/components/admin/stores/AdminGlobalAlertSoundSection";
import type { StoreTaxonomyCategory, StoreTaxonomyTopic } from "@/lib/stores/store-taxonomy-types";
import { invalidateStoreDeliveryAlertSoundCache } from "@/lib/business/store-order-alert-sound";
import { bustOrderMatchAlertSoundCache } from "@/lib/notifications/play-order-match-alert";

function slugifyLoose(raw: string): string {
  const t = raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  return t.replace(/-+/g, "-").replace(/^-|-$/g, "");
}

export function AdminStoreApplicationSettingsPage() {
  const searchParams = useSearchParams();
  const menu = (searchParams.get("menu") ?? "").trim().toLowerCase();
  const activeMenu: "alerts" | "stores" = menu === "stores" ? "stores" : "alerts";

  const [taxonomy, setTaxonomy] = useState<{ categories: StoreTaxonomyCategory[]; topics: StoreTaxonomyTopic[] } | null>(
    null
  );
  const [taxonomyLoading, setTaxonomyLoading] = useState(false);
  const [pickedCategoryId, setPickedCategoryId] = useState<string>("");
  const [msg, setMsg] = useState<string | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryDraft, setEditingCategoryDraft] = useState<{ name: string; sort_order: number } | null>(null);
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [editingTopicDraft, setEditingTopicDraft] = useState<{ name: string; sort_order: number } | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategorySlug, setNewCategorySlug] = useState("");
  const [newTopicName, setNewTopicName] = useState("");
  const [newTopicSlug, setNewTopicSlug] = useState("");
  const [riderLocationEnabled, setRiderLocationEnabled] = useState(false);
  const [riderLocationLoading, setRiderLocationLoading] = useState(false);
  const [riderLocationSaving, setRiderLocationSaving] = useState(false);
  const [riderLocationError, setRiderLocationError] = useState<string | null>(null);

  const loadRiderLocationSetting = useCallback(async () => {
    setRiderLocationLoading(true);
    setRiderLocationError(null);
    try {
      const res = await fetch("/api/admin/delivery/settings", { credentials: "include" });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; rider_location_enabled?: unknown };
      if (!res.ok || !j?.ok) {
        setRiderLocationError(typeof j?.error === "string" ? j.error : `HTTP ${res.status}`);
        return;
      }
      setRiderLocationEnabled(j.rider_location_enabled === true);
    } catch {
      setRiderLocationError("network_error");
    } finally {
      setRiderLocationLoading(false);
    }
  }, []);

  const saveRiderLocationSetting = useCallback(async (next: boolean) => {
    setRiderLocationSaving(true);
    setRiderLocationError(null);
    try {
      const res = await fetch("/api/admin/delivery/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rider_location_enabled: next }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; rider_location_enabled?: unknown };
      if (!res.ok || !j?.ok) {
        setRiderLocationError(typeof j?.error === "string" ? j.error : `HTTP ${res.status}`);
        return;
      }
      setRiderLocationEnabled(j.rider_location_enabled === true);
      setMsg("저장했습니다.");
      window.setTimeout(() => setMsg(null), 2800);
    } catch {
      setRiderLocationError("network_error");
    } finally {
      setRiderLocationSaving(false);
    }
  }, []);

  useEffect(() => {
    void loadRiderLocationSetting();
  }, [loadRiderLocationSetting]);

  useEffect(() => {
    if (activeMenu !== "stores") return;
    let cancelled = false;
    setTaxonomyLoading(true);
    void (async () => {
      try {
        const res = await fetch("/api/admin/stores/taxonomy", { cache: "no-store", credentials: "include" });
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          categories?: unknown;
          topics?: unknown;
        };
        if (cancelled) return;
        if (res.ok && j?.ok && Array.isArray(j.categories) && Array.isArray(j.topics)) {
          setTaxonomy({
            categories: j.categories as StoreTaxonomyCategory[],
            topics: j.topics as StoreTaxonomyTopic[],
          });
          const first = (j.categories as StoreTaxonomyCategory[])[0];
          setPickedCategoryId((prev) => prev || first?.id || "");
        } else {
          setTaxonomy(null);
        }
      } catch {
        if (!cancelled) setTaxonomy(null);
      } finally {
        if (!cancelled) setTaxonomyLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeMenu]);

  const categories = useMemo(() => taxonomy?.categories ?? [], [taxonomy]);
  const topics = useMemo(() => taxonomy?.topics ?? [], [taxonomy]);
  const topicsForPicked = useMemo(
    () =>
      topics
        .filter((t) => t.store_category_id === pickedCategoryId)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [topics, pickedCategoryId]
  );

  const reloadTaxonomy = useCallback(async () => {
    setTaxonomyLoading(true);
    try {
      const res = await fetch("/api/admin/stores/taxonomy", { cache: "no-store", credentials: "include" });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; categories?: unknown; topics?: unknown };
      if (res.ok && j?.ok && Array.isArray(j.categories) && Array.isArray(j.topics)) {
        setTaxonomy({ categories: j.categories as StoreTaxonomyCategory[], topics: j.topics as StoreTaxonomyTopic[] });
      }
    } finally {
      setTaxonomyLoading(false);
    }
  }, []);

  const seedDefaults = useCallback(async () => {
    if (!window.confirm("기본 업종/세부 주제를 DB에 생성합니다. 계속할까요?")) return;
    setTaxonomyLoading(true);
    try {
      const res = await fetch("/api/admin/stores/taxonomy", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        seeded?: { categories?: number; topics?: number };
      };
      if (!res.ok || !j.ok) {
        window.alert(j.error ?? "시드 생성에 실패했습니다.");
        return;
      }
      setMsg(`기본 업종을 생성했습니다. (1차 ${j.seeded?.categories ?? 0} / 2차 ${j.seeded?.topics ?? 0})`);
      window.setTimeout(() => setMsg(null), 4000);
      await reloadTaxonomy();
    } finally {
      setTaxonomyLoading(false);
    }
  }, [reloadTaxonomy]);

  const createCategory = useCallback(async () => {
    const name = newCategoryName.trim();
    const slug = slugifyLoose(newCategorySlug || name);
    if (!name || !slug) return;
    const sort_order = categories.reduce((m, c) => Math.max(m, c.sort_order ?? 0), 0) + 10;
    const res = await fetch("/api/admin/stores/taxonomy", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "category", name, slug, sort_order }),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !j.ok) {
      window.alert(j.error ?? "생성에 실패했습니다.");
      return;
    }
    setNewCategoryName("");
    setNewCategorySlug("");
    setMsg("생성했습니다. /stores 에 반영됩니다.");
    window.setTimeout(() => setMsg(null), 4000);
    await reloadTaxonomy();
  }, [newCategoryName, newCategorySlug, categories, reloadTaxonomy]);

  const createTopic = useCallback(async () => {
    const name = newTopicName.trim();
    const slug = slugifyLoose(newTopicSlug || name);
    if (!pickedCategoryId || !name || !slug) return;
    const sort_order =
      topicsForPicked.reduce((m, t) => Math.max(m, t.sort_order ?? 0), 0) + 10;
    const res = await fetch("/api/admin/stores/taxonomy", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "topic",
        store_category_id: pickedCategoryId,
        name,
        slug,
        sort_order,
      }),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !j.ok) {
      window.alert(j.error ?? "생성에 실패했습니다.");
      return;
    }
    setNewTopicName("");
    setNewTopicSlug("");
    setMsg("생성했습니다. /stores 에 반영됩니다.");
    window.setTimeout(() => setMsg(null), 4000);
    await reloadTaxonomy();
  }, [newTopicName, newTopicSlug, pickedCategoryId, topicsForPicked, reloadTaxonomy]);

  const saveCategory = useCallback(async () => {
    if (!editingCategoryId || !editingCategoryDraft) return;
    const name = editingCategoryDraft.name.trim();
    if (!name) return;
    const res = await fetch("/api/admin/stores/taxonomy", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "category",
        id: editingCategoryId,
        patch: { name, sort_order: editingCategoryDraft.sort_order },
      }),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !j.ok) {
      window.alert(j.error ?? "저장에 실패했습니다.");
      return;
    }
    setMsg("저장했습니다. /stores 에 반영됩니다.");
    window.setTimeout(() => setMsg(null), 4000);
    setEditingCategoryId(null);
    setEditingCategoryDraft(null);
    await reloadTaxonomy();
  }, [editingCategoryId, editingCategoryDraft, reloadTaxonomy]);

  const saveTopic = useCallback(async () => {
    if (!editingTopicId || !editingTopicDraft) return;
    const name = editingTopicDraft.name.trim();
    if (!name) return;
    const res = await fetch("/api/admin/stores/taxonomy", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "topic",
        id: editingTopicId,
        patch: { name, sort_order: editingTopicDraft.sort_order },
      }),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !j.ok) {
      window.alert(j.error ?? "저장에 실패했습니다.");
      return;
    }
    setMsg("저장했습니다. /stores 에 반영됩니다.");
    window.setTimeout(() => setMsg(null), 4000);
    setEditingTopicId(null);
    setEditingTopicDraft(null);
    await reloadTaxonomy();
  }, [editingTopicId, editingTopicDraft, reloadTaxonomy]);

  const toggleCategoryActive = useCallback(
    async (id: string, nextActive: boolean) => {
      const res = await fetch("/api/admin/stores/taxonomy", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "category",
          id,
          patch: { is_active: nextActive },
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        window.alert(j.error ?? "변경에 실패했습니다.");
        return;
      }
      setMsg("반영했습니다. /stores 에 반영됩니다.");
      window.setTimeout(() => setMsg(null), 4000);
      await reloadTaxonomy();
    },
    [reloadTaxonomy]
  );

  const toggleTopicActive = useCallback(
    async (id: string, nextActive: boolean) => {
      const res = await fetch("/api/admin/stores/taxonomy", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "topic",
          id,
          patch: { is_active: nextActive },
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        window.alert(j.error ?? "변경에 실패했습니다.");
        return;
      }
      setMsg("반영했습니다. /stores 에 반영됩니다.");
      window.setTimeout(() => setMsg(null), 4000);
      await reloadTaxonomy();
    },
    [reloadTaxonomy]
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <AdminPageHeader
        title="매장 설정 (매장 신청 연동)"
        description="매장 신청 폼과 매장 둘러보기에 쓰는 1·2차 업종(DB: store_categories / store_topics)을 관리합니다."
      />

      <nav className="mt-5 flex items-center gap-2">
        <Link
          href="/admin/stores/application-settings?menu=alerts"
          className={`rounded-full border px-3 py-1.5 sam-text-body-secondary font-semibold transition ${
            activeMenu === "alerts"
              ? "border-sam-primary/40 bg-sam-primary-soft text-sam-primary"
              : "border-sam-border bg-sam-surface text-sam-muted hover:bg-sam-app"
          }`}
          aria-current={activeMenu === "alerts" ? "page" : undefined}
        >
          알림 설정
        </Link>
        <Link
          href="/admin/stores/application-settings?menu=stores"
          className={`rounded-full border px-3 py-1.5 sam-text-body-secondary font-semibold transition ${
            activeMenu === "stores"
              ? "border-sam-primary/40 bg-sam-primary-soft text-sam-primary"
              : "border-sam-border bg-sam-surface text-sam-muted hover:bg-sam-app"
          }`}
          aria-current={activeMenu === "stores" ? "page" : undefined}
        >
          매장 설정
        </Link>
      </nav>

      {activeMenu === "alerts" ? (
        <>
          <section className="mt-6 rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
            <h2 className="sam-text-body font-semibold text-sam-fg">배송 추적 적용</h2>
            <p className="mt-1 sam-text-helper text-sam-muted">
              필리핀 배송 시스템이 별도 운영되는 경우를 위해, 라이더 위치 업데이트(외부 webhook)의 DB 반영을 on/off 할 수 있습니다.
            </p>
            <p className="mt-1 sam-text-xxs text-sam-meta">
              <code className="rounded bg-sam-surface-muted px-1">admin_settings.delivery_rider_location_enabled</code>
            </p>
            {riderLocationError ? (
              <p className="mt-2 sam-text-body-secondary text-red-700">({riderLocationError})</p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={riderLocationLoading || riderLocationSaving}
                onClick={() => void saveRiderLocationSetting(!riderLocationEnabled)}
                className={`rounded-ui-rect border px-4 py-2 sam-text-body-secondary font-semibold disabled:opacity-50 ${
                  riderLocationEnabled
                    ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                    : "border-sam-border bg-sam-app text-sam-fg"
                }`}
              >
                {riderLocationLoading
                  ? "불러오는 중…"
                  : riderLocationSaving
                    ? "저장 중…"
                    : riderLocationEnabled
                      ? "ON (위치 업데이트 적용)"
                      : "OFF (위치 업데이트 미적용)"}
              </button>
              <button
                type="button"
                disabled={riderLocationLoading || riderLocationSaving}
                onClick={() => void loadRiderLocationSetting()}
                className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-helper text-sam-fg disabled:opacity-50"
              >
                새로고침
              </button>
            </div>
          </section>

          <AdminGlobalAlertSoundSection
            title="매장 알림음 (배달 신규 주문)"
            description={
              <>
                아래에서 <strong className="text-sam-fg">프리셋을 고르거나</strong>,{" "}
                <strong className="text-sam-fg">내 PC에서 오디오 파일을 업로드</strong>하면 전역 기본 알림으로
                저장됩니다. (매장별로는 &quot;매장 설정&quot; 프로필에서 따로 지정 가능)
              </>
            }
            codeKey="admin_settings.store_delivery_alert_sound"
            apiPath="/api/admin/store-delivery-alert-sound"
            onAfterMutation={invalidateStoreDeliveryAlertSoundCache}
          />

          <AdminGlobalAlertSoundSection
            title="배달채팅 알림음 (일치 확인)"
            description={
              <>
                구매자가 「주문 내용이 일치합니다」를 보낼 때{" "}
                <strong className="text-sam-fg">입점 측</strong> 배달채팅에서 재생되는 소리입니다. 프리셋·PC
                업로드·미리듣기는 위 배달 알림음과 동일합니다.
              </>
            }
            codeKey="admin_settings.order_match_chat_alert_sound"
            apiPath="/api/admin/order-match-chat-alert-sound"
            onAfterMutation={bustOrderMatchAlertSoundCache}
          />
        </>
      ) : null}

      {activeMenu === "stores" ? (
        <>
          <section className="mt-6 rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
            <h2 className="sam-text-body font-semibold text-sam-fg">연동 여부</h2>
            <ul className="mt-3 space-y-2 sam-text-body-secondary text-sam-fg">
              <li className="flex flex-wrap items-center gap-2">
                <span className="text-green-600">✓</span>
                <span>매장 신청</span>
                <Link href="/my/business/apply" className="text-signature underline">
                  /my/business/apply
                </Link>
                <span className="text-sam-muted">
                  — 1차·2차 업종 각각 선택, 슬러그는 아래 병합 목록과 동일. DB에 같은 slug 행이 있으면 신청 시
                  연결되어 승인 후 /stores/browse 에 노출됩니다.
                </span>
              </li>
              <li className="flex flex-wrap items-center gap-2">
                <span className="text-green-600">✓</span>
                <span>매장 둘러보기</span>
                <Link href="/stores" className="text-signature underline">
                  /stores
                </Link>
                <span className="text-sam-muted">
                  — 1·2차 업종·링크 슬러그 동일 소스(
                  <code className="rounded bg-sam-surface-muted px-1">/stores/browse/[primary]/[sub]</code>)
                </span>
              </li>
              <li className="flex flex-wrap items-center gap-2">
                <span className="text-amber-600">△</span>
                <span>매장 심사(DB)</span>
                <Link href="/admin/stores" className="text-signature underline">
                  /admin/stores
                </Link>
                <span className="text-sam-muted">— 별도 DB 흐름; 이 화면의 목록과 자동 동기화되지 않음</span>
              </li>
            </ul>
            <p className="mt-2 sam-text-helper text-sam-muted">이 화면에서 저장하면 DB에 반영되며 모든 사용자에게 동일하게 적용됩니다.</p>
          </section>
        </>
      ) : null}

      {msg && (
        <p className="mt-4 rounded-ui-rect border border-green-200 bg-green-50 px-3 py-2 sam-text-body-secondary text-green-800">
          {msg}
        </p>
      )}

      {activeMenu === "stores" ? (
        <>
          <section className="mt-6 rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="sam-text-body font-semibold text-sam-fg">업종 관리</h2>
                <p className="mt-1 sam-text-helper text-sam-muted">
                  DB에 있는 업종(1차)·세부 주제(2차)를 수정/숨김 처리합니다. 숨김 처리(is_active=false) 시 /stores 에서 노출되지 않습니다.
                </p>
              </div>
              <button type="button" onClick={() => void reloadTaxonomy()} className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary font-semibold text-sam-fg">
                새로고침
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* 1차 업종 */}
              <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
                <div className="flex items-end justify-between gap-2">
                  <div>
                    <h3 className="sam-text-body font-semibold text-sam-fg">1차 업종</h3>
                    <p className="mt-0.5 sam-text-helper text-sam-muted">행 단위로 이름/정렬 수정, 숨김(삭제)할 수 있어요.</p>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <label className="flex flex-col sam-text-helper text-sam-muted">
                    이름
                    <input
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      className="mt-1 rounded border border-sam-border px-2 py-2 sam-text-body text-sam-fg"
                      placeholder="예: 약국"
                    />
                  </label>
                  <label className="flex flex-col sam-text-helper text-sam-muted">
                    슬러그 (선택)
                    <input
                      value={newCategorySlug}
                      onChange={(e) => setNewCategorySlug(e.target.value)}
                      className="mt-1 rounded border border-sam-border px-2 py-2 sam-text-body text-sam-fg"
                      placeholder="비우면 자동"
                    />
                  </label>
                  <div className="flex items-end justify-end">
                    <button
                      type="button"
                      onClick={() => void createCategory()}
                      className="w-full rounded-ui-rect bg-signature px-4 py-2 sam-text-body-secondary font-semibold text-white disabled:opacity-50"
                      disabled={!newCategoryName.trim()}
                    >
                      1차 추가
                    </button>
                  </div>
                </div>

                <div className="mt-3 overflow-hidden rounded-ui-rect border border-sam-border">
                  <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-0 border-b border-sam-border bg-sam-app px-3 py-2 sam-text-helper font-semibold text-sam-muted">
                    <span>업종</span>
                    <span className="text-right">작업</span>
                  </div>
                  <ul className="divide-y divide-sam-border-soft">
                    {taxonomyLoading && categories.length === 0 ? (
                      <li className="px-3 py-3 sam-text-body-secondary text-sam-muted">불러오는 중…</li>
                    ) : categories.length === 0 ? (
                      <li className="px-3 py-3">
                        <p className="sam-text-body-secondary text-sam-muted">업종이 없습니다.</p>
                        <button
                          type="button"
                          onClick={() => void seedDefaults()}
                          className="mt-2 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary font-semibold text-sam-fg"
                        >
                          기본 업종 생성(시드)
                        </button>
                      </li>
                    ) : (
                      categories.map((c) => {
                        const isEditing = editingCategoryId === c.id && editingCategoryDraft != null;
                      return (
                        <li key={c.id} className="px-3 py-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              {isEditing ? (
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                  <input
                                    value={editingCategoryDraft.name}
                                    onChange={(e) =>
                                      setEditingCategoryDraft((prev) => (prev ? { ...prev, name: e.target.value } : prev))
                                    }
                                    className="rounded border border-sam-border px-2 py-1.5 sam-text-body text-sam-fg"
                                    placeholder="이름"
                                  />
                                  <input
                                    value={String(editingCategoryDraft.sort_order)}
                                    onChange={(e) =>
                                      setEditingCategoryDraft((prev) =>
                                        prev ? { ...prev, sort_order: Number(e.target.value) || 0 } : prev
                                      )
                                    }
                                    className="rounded border border-sam-border px-2 py-1.5 sam-text-body text-sam-fg"
                                    placeholder="sort_order"
                                  />
                                </div>
                              ) : (
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-semibold text-sam-fg">{c.name}</span>
                                    <span className="rounded-full bg-sam-surface-muted px-2 py-0.5 sam-text-xxs font-semibold text-sam-muted">
                                      {c.is_active ? "활성" : "숨김"}
                                    </span>
                                  </div>
                                  <p className="mt-0.5 truncate sam-text-xxs text-sam-meta">slug: {c.slug}</p>
                                </div>
                              )}
                            </div>

                            <div className="shrink-0">
                              {isEditing ? (
                                <div className="flex items-center gap-2">
                                  <button type="button" onClick={() => void saveCategory()} className="sam-text-helper font-semibold text-signature underline">
                                    저장
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingCategoryId(null);
                                      setEditingCategoryDraft(null);
                                    }}
                                    className="sam-text-helper font-semibold text-sam-muted underline"
                                  >
                                    취소
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingTopicId(null);
                                      setEditingTopicDraft(null);
                                      setEditingCategoryId(c.id);
                                      setEditingCategoryDraft({ name: c.name, sort_order: c.sort_order });
                                    }}
                                    className="sam-text-helper font-semibold text-signature underline"
                                  >
                                    수정
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const nextActive = !c.is_active;
                                      const label = nextActive ? "다시 노출할까요?" : "숨김 처리할까요? (/stores에서 사라짐)";
                                      if (!window.confirm(label)) return;
                                      void toggleCategoryActive(c.id, nextActive);
                                    }}
                                    className="sam-text-helper font-semibold text-red-600 underline"
                                  >
                                    {c.is_active ? "삭제" : "복구"}
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                      })
                    )}
                  </ul>
                </div>
              </div>

              {/* 2차 업종 */}
              <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
                <div className="flex items-end justify-between gap-2">
                  <div>
                    <h3 className="sam-text-body font-semibold text-sam-fg">2차 업종</h3>
                    <p className="mt-0.5 sam-text-helper text-sam-muted">
                      1차를 선택하면 해당 2차 목록이 나옵니다. 행 단위로 수정/숨김할 수 있어요.
                    </p>
                  </div>
                </div>

                <label className="mt-3 block sam-text-helper text-sam-muted">
                  1차 선택
                  <select
                    value={pickedCategoryId}
                    onChange={(e) => setPickedCategoryId(e.target.value)}
                    className="mt-1 w-full rounded border border-sam-border px-2 py-2 sam-text-body text-sam-fg"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.slug})
                      </option>
                    ))}
                  </select>
                </label>

                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <label className="flex flex-col sam-text-helper text-sam-muted">
                    하위 이름
                    <input
                      value={newTopicName}
                      onChange={(e) => setNewTopicName(e.target.value)}
                      className="mt-1 rounded border border-sam-border px-2 py-2 sam-text-body text-sam-fg"
                      placeholder="예: 한의원"
                      disabled={!pickedCategoryId}
                    />
                  </label>
                  <label className="flex flex-col sam-text-helper text-sam-muted">
                    슬러그 (선택)
                    <input
                      value={newTopicSlug}
                      onChange={(e) => setNewTopicSlug(e.target.value)}
                      className="mt-1 rounded border border-sam-border px-2 py-2 sam-text-body text-sam-fg"
                      placeholder="비우면 자동"
                      disabled={!pickedCategoryId}
                    />
                  </label>
                  <div className="flex items-end justify-end">
                    <button
                      type="button"
                      onClick={() => void createTopic()}
                      className="w-full rounded-ui-rect bg-signature px-4 py-2 sam-text-body-secondary font-semibold text-white disabled:opacity-50"
                      disabled={!pickedCategoryId || !newTopicName.trim()}
                    >
                      2차 추가
                    </button>
                  </div>
                </div>

                <div className="mt-3 overflow-hidden rounded-ui-rect border border-sam-border">
                  <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-0 border-b border-sam-border bg-sam-app px-3 py-2 sam-text-helper font-semibold text-sam-muted">
                    <span>하위 업종</span>
                    <span className="text-right">작업</span>
                  </div>
                  <ul className="divide-y divide-sam-border-soft">
                    {taxonomyLoading && topicsForPicked.length === 0 ? (
                      <li className="px-3 py-3 sam-text-body-secondary text-sam-muted">불러오는 중…</li>
                    ) : topicsForPicked.length === 0 ? (
                      <li className="px-3 py-3">
                        <p className="sam-text-body-secondary text-sam-muted">하위 업종이 없습니다.</p>
                        <button
                          type="button"
                          onClick={() => void seedDefaults()}
                          className="mt-2 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary font-semibold text-sam-fg"
                        >
                          기본 2차 업종 생성(시드)
                        </button>
                      </li>
                    ) : (
                      topicsForPicked.map((t) => {
                        const isEditing = editingTopicId === t.id && editingTopicDraft != null;
                        return (
                          <li key={t.id} className="px-3 py-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                {isEditing ? (
                                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    <input
                                      value={editingTopicDraft.name}
                                      onChange={(e) =>
                                        setEditingTopicDraft((prev) => (prev ? { ...prev, name: e.target.value } : prev))
                                      }
                                      className="rounded border border-sam-border px-2 py-1.5 sam-text-body text-sam-fg"
                                      placeholder="이름"
                                    />
                                    <input
                                      value={String(editingTopicDraft.sort_order)}
                                      onChange={(e) =>
                                        setEditingTopicDraft((prev) =>
                                          prev ? { ...prev, sort_order: Number(e.target.value) || 0 } : prev
                                        )
                                      }
                                      className="rounded border border-sam-border px-2 py-1.5 sam-text-body text-sam-fg"
                                      placeholder="sort_order"
                                    />
                                  </div>
                                ) : (
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="font-semibold text-sam-fg">{t.name}</span>
                                      <span className="rounded-full bg-sam-surface-muted px-2 py-0.5 sam-text-xxs font-semibold text-sam-muted">
                                        {t.is_active ? "활성" : "숨김"}
                                      </span>
                                    </div>
                                    <p className="mt-0.5 truncate sam-text-xxs text-sam-meta">slug: {t.slug}</p>
                                  </div>
                                )}
                              </div>
                              <div className="shrink-0">
                                {isEditing ? (
                                  <div className="flex items-center gap-2">
                                    <button type="button" onClick={() => void saveTopic()} className="sam-text-helper font-semibold text-signature underline">
                                      저장
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingTopicId(null);
                                        setEditingTopicDraft(null);
                                      }}
                                      className="sam-text-helper font-semibold text-sam-muted underline"
                                    >
                                      취소
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingCategoryId(null);
                                        setEditingCategoryDraft(null);
                                        setEditingTopicId(t.id);
                                        setEditingTopicDraft({ name: t.name, sort_order: t.sort_order });
                                      }}
                                      className="sam-text-helper font-semibold text-signature underline"
                                    >
                                      수정
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const nextActive = !t.is_active;
                                        const label = nextActive ? "다시 노출할까요?" : "숨김 처리할까요? (/stores에서 사라짐)";
                                        if (!window.confirm(label)) return;
                                        void toggleTopicActive(t.id, nextActive);
                                      }}
                                      className="sam-text-helper font-semibold text-red-600 underline"
                                    >
                                      {t.is_active ? "삭제" : "복구"}
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </li>
                        );
                      })
                    )}
                  </ul>
                </div>
              </div>
            </div>
          </section>
        </>
      ) : null}

    </div>
  );
}
