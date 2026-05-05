"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminGlobalAlertSoundSection } from "@/components/admin/stores/AdminGlobalAlertSoundSection";
import {
  BROWSE_PRIMARY_INDUSTRIES,
  BROWSE_SUB_INDUSTRIES,
} from "@/lib/stores/browse-mock/mock-store-categories";
import {
  clearBrowseIndustryOverrides,
  getBrowseIndustryOverrides,
  persistBrowseIndustryOverrides,
  type BrowseIndustryOverridesPayload,
  isSeedPrimaryIndustry,
  isSeedSubIndustry,
} from "@/lib/stores/browse-mock/browse-industry-merge";
import type { BrowsePrimaryIndustry, BrowseSubIndustry } from "@/lib/stores/browse-mock/types";
import { invalidateStoreDeliveryAlertSoundCache } from "@/lib/business/store-order-alert-sound";
import { bustOrderMatchAlertSoundCache } from "@/lib/notifications/play-order-match-alert";

function nextPrimarySortOrder(merged: BrowsePrimaryIndustry[]): number {
  const max = merged.reduce((m, p) => Math.max(m, p.sortOrder), 0);
  return max + 10;
}

function nextSubSortOrderFor(
  primarySlug: string,
  p: BrowseIndustryOverridesPayload
): number {
  const slug = primarySlug.trim();
  const base = BROWSE_SUB_INDUSTRIES.filter((s) => s.primarySlug === slug);
  const extra = p.addedSubs.filter((s) => s.primarySlug === slug);
  const max = [...base, ...extra].reduce((m, s) => Math.max(m, s.sortOrder), 0);
  return max + 10;
}

function slugifyLoose(raw: string): string {
  const t = raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  return t.replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function uniquePrimarySlug(candidate: string, taken: Set<string>): string {
  if (candidate && !taken.has(candidate)) return candidate;
  return `p-${Date.now().toString(36)}`;
}

function uniqueSubSlug(candidate: string, taken: Set<string>): string {
  if (candidate && !taken.has(candidate)) return candidate;
  return `s-${Date.now().toString(36)}`;
}

export function AdminStoreApplicationSettingsPage() {
  const searchParams = useSearchParams();
  const menu = (searchParams.get("menu") ?? "").trim().toLowerCase();
  const activeMenu: "alerts" | "stores" = menu === "stores" ? "stores" : "alerts";

  const [payload, setPayload] = useState<BrowseIndustryOverridesPayload>({
    addedPrimaries: [],
    addedSubs: [],
  });
  const [primaryName, setPrimaryName] = useState("");
  const [primarySlugInput, setPrimarySlugInput] = useState("");
  const [subPrimarySlug, setSubPrimarySlug] = useState("");
  const [subName, setSubName] = useState("");
  const [subSlugInput, setSubSlugInput] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [editingPrimaryId, setEditingPrimaryId] = useState<string | null>(null);
  const [editingPrimaryDraft, setEditingPrimaryDraft] = useState<{ nameKo: string; slug: string } | null>(
    null
  );
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [editingSubDraft, setEditingSubDraft] = useState<{ nameKo: string; slug: string } | null>(null);

  useEffect(() => {
    const o = getBrowseIndustryOverrides();
    setPayload(o);
    const merged = [...BROWSE_PRIMARY_INDUSTRIES, ...o.addedPrimaries].sort(
      (a, b) => a.sortOrder - b.sortOrder
    );
    setSubPrimarySlug((prev) => prev || merged[0]?.slug || "");
  }, []);

  const commit = useCallback((next: BrowseIndustryOverridesPayload) => {
    setPayload(next);
    persistBrowseIndustryOverrides(next);
    setMsg("저장했습니다. 매장 신청·둘러보기 화면을 새로고침하면 반영됩니다.");
    window.setTimeout(() => setMsg(null), 4000);
  }, []);

  const mergedPrimaries = useMemo(
    () => [...BROWSE_PRIMARY_INDUSTRIES, ...payload.addedPrimaries].sort(
      (a, b) => a.sortOrder - b.sortOrder
    ),
    [payload.addedPrimaries]
  );

  const addPrimary = () => {
    const nameKo = primaryName.trim();
    if (!nameKo) return;
    const taken = new Set(mergedPrimaries.map((p) => p.slug));
    const fromInput = slugifyLoose(primarySlugInput);
    const slug = uniquePrimarySlug(fromInput || slugifyLoose(nameKo), taken);
    const id = `add-p-${Date.now().toString(36)}`;
    const row: BrowsePrimaryIndustry = {
      id,
      slug,
      nameKo,
      sortOrder: nextPrimarySortOrder(mergedPrimaries),
      symbol: "📦",
    };
    commit({
      ...payload,
      addedPrimaries: [...payload.addedPrimaries, row],
    });
    setPrimaryName("");
    setPrimarySlugInput("");
    setSubPrimarySlug(slug);
  };

  const removeAddedPrimary = (id: string) => {
    const p = payload.addedPrimaries.find((x) => x.id === id);
    if (!p) return;
    const nextSubs = payload.addedSubs.filter((s) => s.primarySlug !== p.slug);
    commit({
      addedPrimaries: payload.addedPrimaries.filter((x) => x.id !== id),
      addedSubs: nextSubs,
    });
  };

  const beginEditPrimary = (p: BrowsePrimaryIndustry) => {
    setEditingSubId(null);
    setEditingSubDraft(null);
    setEditingPrimaryId(p.id);
    setEditingPrimaryDraft({ nameKo: p.nameKo, slug: p.slug });
  };

  const cancelEditPrimary = () => {
    setEditingPrimaryId(null);
    setEditingPrimaryDraft(null);
  };

  const saveEditPrimary = () => {
    if (!editingPrimaryId || !editingPrimaryDraft) return;
    const nameKo = editingPrimaryDraft.nameKo.trim();
    const slug = slugifyLoose(editingPrimaryDraft.slug);
    if (!nameKo || !slug) return;
    const taken = new Set(mergedPrimaries.map((p) => p.slug));
    const original = payload.addedPrimaries.find((x) => x.id === editingPrimaryId);
    if (original) {
      taken.delete(original.slug);
      if (taken.has(slug)) {
        window.alert("이미 사용 중인 슬러그입니다.");
        return;
      }
      // primary slug 변경 시 해당 slug를 참조하는 추가 sub도 같이 이동
      const nextAddedPrimaries = payload.addedPrimaries.map((p) =>
        p.id === editingPrimaryId ? { ...p, nameKo, slug } : p
      );
      const nextAddedSubs =
        original.slug === slug
          ? payload.addedSubs
          : payload.addedSubs.map((s) => (s.primarySlug === original.slug ? { ...s, primarySlug: slug } : s));
      commit({ ...payload, addedPrimaries: nextAddedPrimaries, addedSubs: nextAddedSubs });
      if (subPrimarySlug === original.slug) setSubPrimarySlug(slug);
      cancelEditPrimary();
      return;
    }

    // 기본(코드) 업종 패치: slug는 변경 금지(링크/DB 연동 안전).
    const seed = BROWSE_PRIMARY_INDUSTRIES.find((p) => p.id === editingPrimaryId);
    if (!seed) return;
    const patch = {
      id: seed.id,
      nameKo,
    };
    const patchedPrimaries = Array.isArray(payload.patchedPrimaries) ? payload.patchedPrimaries : [];
    const nextPatched = [...patchedPrimaries.filter((x) => x?.id !== seed.id), patch];
    commit({ ...payload, patchedPrimaries: nextPatched });
    cancelEditPrimary();
  };

  const addSub = () => {
    const nameKo = subName.trim();
    const pslug = subPrimarySlug.trim();
    if (!nameKo || !pslug) return;
    const baseSubs = BROWSE_SUB_INDUSTRIES.filter((s) => s.primarySlug === pslug);
    const extraSubs = payload.addedSubs.filter((s) => s.primarySlug === pslug);
    const subs = [...baseSubs, ...extraSubs];
    const taken = new Set(subs.map((s) => s.slug));
    const fromInput = slugifyLoose(subSlugInput);
    const slug = uniqueSubSlug(fromInput || slugifyLoose(nameKo), taken);
    const row: BrowseSubIndustry = {
      id: `add-s-${Date.now().toString(36)}`,
      slug,
      nameKo,
      primarySlug: pslug,
      sortOrder: nextSubSortOrderFor(pslug, payload),
    };
    commit({
      ...payload,
      addedSubs: [...payload.addedSubs, row],
    });
    setSubName("");
    setSubSlugInput("");
  };

  const removeAddedSub = (id: string) => {
    commit({
      ...payload,
      addedSubs: payload.addedSubs.filter((s) => s.id !== id),
    });
  };

  const beginEditSub = (s: BrowseSubIndustry) => {
    setEditingPrimaryId(null);
    setEditingPrimaryDraft(null);
    setEditingSubId(s.id);
    setEditingSubDraft({ nameKo: s.nameKo, slug: s.slug });
  };

  const cancelEditSub = () => {
    setEditingSubId(null);
    setEditingSubDraft(null);
  };

  const saveEditSub = () => {
    if (!editingSubId || !editingSubDraft) return;
    const nameKo = editingSubDraft.nameKo.trim();
    const slug = slugifyLoose(editingSubDraft.slug);
    if (!nameKo || !slug) return;
    const baseSubs = BROWSE_SUB_INDUSTRIES.filter((s) => s.primarySlug === subPrimarySlug);
    const extraSubs = payload.addedSubs.filter((s) => s.primarySlug === subPrimarySlug);
    const all = [...baseSubs, ...extraSubs];
    const taken = new Set(all.map((x) => x.slug));
    const original = payload.addedSubs.find((x) => x.id === editingSubId);
    if (original) {
      taken.delete(original.slug);
      if (taken.has(slug)) {
        window.alert("이미 사용 중인 슬러그입니다.");
        return;
      }
      const nextAddedSubs = payload.addedSubs.map((s) => (s.id === editingSubId ? { ...s, nameKo, slug } : s));
      commit({ ...payload, addedSubs: nextAddedSubs });
      cancelEditSub();
      return;
    }

    // 기본(코드) 2차 패치: slug 변경 금지(링크/DB 연동 안전).
    const seed = BROWSE_SUB_INDUSTRIES.find((s) => s.id === editingSubId);
    if (!seed) return;
    const patch = {
      id: seed.id,
      nameKo,
    };
    const patchedSubs = Array.isArray(payload.patchedSubs) ? payload.patchedSubs : [];
    const nextPatched = [...patchedSubs.filter((x) => x?.id !== seed.id), patch];
    commit({ ...payload, patchedSubs: nextPatched });
    cancelEditSub();
  };

  const resetOverrides = () => {
    if (!window.confirm("추가한 업종만 삭제합니다. 계속할까요?")) return;
    clearBrowseIndustryOverrides();
    setPayload(getBrowseIndustryOverrides());
    setMsg("추가 업종을 비웠습니다.");
    window.setTimeout(() => setMsg(null), 4000);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <AdminPageHeader
        title="매장 설정 (매장 신청 연동)"
        description="매장 신청 폼과 매장 둘러보기에 쓰는 1·2차 업종을 관리합니다. 추가분은 이 브라우저 localStorage에만 저장됩니다."
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
            <p className="mt-2 sam-text-helper text-sam-muted">
              저장 키: <code className="rounded bg-sam-surface-muted px-1">kasama-browse-industry-overrides-v1</code>
            </p>
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
                  기본 업종은 코드에 고정(읽기 전용)이며, 추가 업종만 수정·삭제할 수 있습니다. (이 화면의 추가분은
                  브라우저 localStorage 저장)
                </p>
              </div>
              <button
                type="button"
                onClick={resetOverrides}
                className="rounded-ui-rect border border-amber-300 bg-amber-50 px-3 py-2 sam-text-body-secondary font-semibold text-amber-950"
              >
                추가 업종 초기화
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* 1차 업종 */}
              <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
                <div className="flex items-end justify-between gap-2">
                  <div>
                    <h3 className="sam-text-body font-semibold text-sam-fg">1차 업종</h3>
                    <p className="mt-0.5 sam-text-helper text-sam-muted">추가 업종은 행 단위로 수정/삭제할 수 있어요.</p>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <label className="flex flex-col sam-text-helper text-sam-muted">
                    이름
                    <input
                      value={primaryName}
                      onChange={(e) => setPrimaryName(e.target.value)}
                      className="mt-1 rounded border border-sam-border px-2 py-2 sam-text-body text-sam-fg"
                      placeholder="예: 약국"
                    />
                  </label>
                  <label className="flex flex-col sam-text-helper text-sam-muted">
                    슬러그 (선택)
                    <input
                      value={primarySlugInput}
                      onChange={(e) => setPrimarySlugInput(e.target.value)}
                      className="mt-1 rounded border border-sam-border px-2 py-2 sam-text-body text-sam-fg"
                      placeholder="비우면 자동"
                    />
                  </label>
                </div>
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={addPrimary}
                    className="rounded-ui-rect bg-signature px-4 py-2 sam-text-body-secondary font-semibold text-white"
                  >
                    1차 추가
                  </button>
                </div>

                <div className="mt-3 overflow-hidden rounded-ui-rect border border-sam-border">
                  <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-0 border-b border-sam-border bg-sam-app px-3 py-2 sam-text-helper font-semibold text-sam-muted">
                    <span>업종</span>
                    <span className="text-right">작업</span>
                  </div>
                  <ul className="divide-y divide-sam-border-soft">
                    {mergedPrimaries.map((p) => {
                      const isAdded = payload.addedPrimaries.some((x) => x.id === p.id);
                      const isSeed = isSeedPrimaryIndustry(p.id);
                      const isEditing = editingPrimaryId === p.id && editingPrimaryDraft != null;
                      return (
                        <li key={p.id} className="px-3 py-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              {isEditing ? (
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                  <input
                                    value={editingPrimaryDraft.nameKo}
                                    onChange={(e) =>
                                      setEditingPrimaryDraft((prev) => (prev ? { ...prev, nameKo: e.target.value } : prev))
                                    }
                                    className="rounded border border-sam-border px-2 py-1.5 sam-text-body text-sam-fg"
                                    placeholder="이름"
                                  />
                                  <input
                                    value={editingPrimaryDraft.slug}
                                    onChange={(e) =>
                                      setEditingPrimaryDraft((prev) => (prev ? { ...prev, slug: e.target.value } : prev))
                                    }
                                    className="rounded border border-sam-border px-2 py-1.5 sam-text-body text-sam-fg disabled:opacity-60"
                                    placeholder="slug"
                                    disabled={isSeed}
                                  />
                                </div>
                              ) : (
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span aria-hidden>{p.symbol}</span>
                                    <span className="font-semibold text-sam-fg">{p.nameKo}</span>
                                    <span className="rounded-full bg-sam-surface-muted px-2 py-0.5 sam-text-xxs font-semibold text-sam-muted">
                                      {isAdded ? "추가" : "기본"}
                                    </span>
                                  </div>
                                  <p className="mt-0.5 truncate sam-text-xxs text-sam-meta">slug: {p.slug}</p>
                                </div>
                              )}
                            </div>

                            <div className="shrink-0">
                              {isAdded || isSeed ? (
                                isEditing ? (
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={saveEditPrimary}
                                      className="sam-text-helper font-semibold text-signature underline"
                                    >
                                      저장
                                    </button>
                                    <button
                                      type="button"
                                      onClick={cancelEditPrimary}
                                      className="sam-text-helper font-semibold text-sam-muted underline"
                                    >
                                      취소
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => beginEditPrimary(p)}
                                      className="sam-text-helper font-semibold text-signature underline"
                                    >
                                      수정
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (isAdded) {
                                          removeAddedPrimary(p.id);
                                          return;
                                        }
                                        if (!window.confirm("기본 업종을 숨길까요? (이 브라우저에서만 적용)")) return;
                                        const removedPrimaryIds = Array.isArray(payload.removedPrimaryIds)
                                          ? payload.removedPrimaryIds
                                          : [];
                                        const nextRemoved = [...new Set([...removedPrimaryIds, p.id])];
                                        commit({ ...payload, removedPrimaryIds: nextRemoved });
                                      }}
                                      className="sam-text-helper font-semibold text-red-600 underline"
                                    >
                                      삭제
                                    </button>
                                  </div>
                                )
                              ) : (
                                <span className="sam-text-xxs text-sam-meta">—</span>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>

              {/* 2차 업종 */}
              <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
                <div className="flex items-end justify-between gap-2">
                  <div>
                    <h3 className="sam-text-body font-semibold text-sam-fg">2차 업종</h3>
                    <p className="mt-0.5 sam-text-helper text-sam-muted">
                      1차를 선택하면 해당 2차 목록이 나옵니다. 추가 2차는 행 단위로 수정/삭제할 수 있어요.
                    </p>
                  </div>
                </div>

                <label className="mt-3 block sam-text-helper text-sam-muted">
                  1차 선택
                  <select
                    value={subPrimarySlug}
                    onChange={(e) => setSubPrimarySlug(e.target.value)}
                    className="mt-1 w-full rounded border border-sam-border px-2 py-2 sam-text-body text-sam-fg"
                  >
                    {mergedPrimaries.map((p) => (
                      <option key={p.id} value={p.slug}>
                        {p.symbol} {p.nameKo} ({p.slug})
                      </option>
                    ))}
                  </select>
                </label>

                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="flex flex-col sam-text-helper text-sam-muted">
                    하위 이름
                    <input
                      value={subName}
                      onChange={(e) => setSubName(e.target.value)}
                      className="mt-1 rounded border border-sam-border px-2 py-2 sam-text-body text-sam-fg"
                      placeholder="예: 한의원"
                    />
                  </label>
                  <label className="flex flex-col sam-text-helper text-sam-muted">
                    슬러그 (선택)
                    <input
                      value={subSlugInput}
                      onChange={(e) => setSubSlugInput(e.target.value)}
                      className="mt-1 rounded border border-sam-border px-2 py-2 sam-text-body text-sam-fg"
                      placeholder="비우면 자동"
                    />
                  </label>
                </div>
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={addSub}
                    className="rounded-ui-rect bg-signature px-4 py-2 sam-text-body-secondary font-semibold text-white"
                  >
                    2차 추가
                  </button>
                </div>

                <div className="mt-3 overflow-hidden rounded-ui-rect border border-sam-border">
                  <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-0 border-b border-sam-border bg-sam-app px-3 py-2 sam-text-helper font-semibold text-sam-muted">
                    <span>하위 업종</span>
                    <span className="text-right">작업</span>
                  </div>
                  <ul className="divide-y divide-sam-border-soft">
                    {(() => {
                      const base = BROWSE_SUB_INDUSTRIES.filter((s) => s.primarySlug === subPrimarySlug).sort(
                        (a, b) => a.sortOrder - b.sortOrder
                      );
                      const extra = payload.addedSubs
                        .filter((s) => s.primarySlug === subPrimarySlug)
                        .sort((a, b) => a.sortOrder - b.sortOrder);
                      const rows = [...base, ...extra];
                      if (rows.length === 0) {
                        return (
                          <li className="px-3 py-3 sam-text-body-secondary text-sam-muted">
                            하위 업종이 없습니다.
                          </li>
                        );
                      }
                      return rows.map((s) => {
                        const isAdded = payload.addedSubs.some((x) => x.id === s.id);
                        const isSeed = isSeedSubIndustry(s.id);
                        const isEditing = editingSubId === s.id && editingSubDraft != null;
                        return (
                          <li key={s.id} className="px-3 py-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                {isEditing ? (
                                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    <input
                                      value={editingSubDraft.nameKo}
                                      onChange={(e) =>
                                        setEditingSubDraft((prev) => (prev ? { ...prev, nameKo: e.target.value } : prev))
                                      }
                                      className="rounded border border-sam-border px-2 py-1.5 sam-text-body text-sam-fg"
                                      placeholder="이름"
                                    />
                                    <input
                                      value={editingSubDraft.slug}
                                      onChange={(e) =>
                                        setEditingSubDraft((prev) => (prev ? { ...prev, slug: e.target.value } : prev))
                                      }
                                      className="rounded border border-sam-border px-2 py-1.5 sam-text-body text-sam-fg disabled:opacity-60"
                                      placeholder="slug"
                                      disabled={isSeed}
                                    />
                                  </div>
                                ) : (
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="font-semibold text-sam-fg">{s.nameKo}</span>
                                      <span className="rounded-full bg-sam-surface-muted px-2 py-0.5 sam-text-xxs font-semibold text-sam-muted">
                                        {isAdded ? "추가" : "기본"}
                                      </span>
                                    </div>
                                    <p className="mt-0.5 truncate sam-text-xxs text-sam-meta">slug: {s.slug}</p>
                                  </div>
                                )}
                              </div>
                              <div className="shrink-0">
                                {isAdded || isSeed ? (
                                  isEditing ? (
                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={saveEditSub}
                                        className="sam-text-helper font-semibold text-signature underline"
                                      >
                                        저장
                                      </button>
                                      <button
                                        type="button"
                                        onClick={cancelEditSub}
                                        className="sam-text-helper font-semibold text-sam-muted underline"
                                      >
                                        취소
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => beginEditSub(s)}
                                        className="sam-text-helper font-semibold text-signature underline"
                                      >
                                        수정
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (isAdded) {
                                            removeAddedSub(s.id);
                                            return;
                                          }
                                          if (!window.confirm("기본 하위 업종을 숨길까요? (이 브라우저에서만 적용)")) return;
                                          const removedSubIds = Array.isArray(payload.removedSubIds) ? payload.removedSubIds : [];
                                          const nextRemoved = [...new Set([...removedSubIds, s.id])];
                                          commit({ ...payload, removedSubIds: nextRemoved });
                                        }}
                                        className="sam-text-helper font-semibold text-red-600 underline"
                                      >
                                        삭제
                                      </button>
                                    </div>
                                  )
                                ) : (
                                  <span className="sam-text-xxs text-sam-meta">—</span>
                                )}
                              </div>
                            </div>
                          </li>
                        );
                      });
                    })()}
                  </ul>
                </div>
              </div>
            </div>
          </section>

      <section className="mt-6 rounded-ui-rect border border-amber-200 bg-amber-50/80 p-4">
        <h2 className="sam-text-body font-semibold text-sam-fg">초기화</h2>
        <p className="mt-1 sam-text-helper text-sam-muted">
          추가 1·2차 업종만 삭제합니다. 코드에 있는 기본 업종은 그대로입니다.
        </p>
        <button
          type="button"
          onClick={resetOverrides}
          className="mt-3 rounded-ui-rect border border-amber-300 bg-sam-surface px-4 py-2 sam-text-body-secondary font-medium text-sam-fg"
        >
          추가 업종 전부 제거
        </button>
      </section>
        </>
      ) : null}

    </div>
  );
}
