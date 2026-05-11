"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import { Biz } from "@/lib/ui/biz-component-classes";
import { invalidateStoreBannersPublicCache } from "@/lib/stores/store-delivery-api-client";
import { fetchMeStoresListDeduped } from "@/lib/me/fetch-me-stores-deduped";

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

function mergePickList(list: LinkPickRow[], currentId: string | null | undefined): LinkPickRow[] {
  const id = currentId?.trim() || "";
  if (!id) return list;
  if (list.some((r) => r.id === id)) return list;
  return [{ id, title: "(목록에 없음) 이전에 연결된 항목" }, ...list];
}

/** 사장 화면: 메뉴 상세(product) 연결은 비노출 — 매장에서는 기존 product 배너는 유지 가능, 저장하면 none 으로 정리 */
const LINK_OPTS = [
  { v: "none", label: "이동 없음 (이미지만 보여요)" },
  { v: "notice", label: "공지 내용으로 이동" },
  { v: "coupon", label: "쿠폰 (준비 중)" },
] as const;

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

function formatBannerSaveError(code: string): string {
  switch (code) {
    case "invalid_link_target":
      return "연결이 깨졌거나 삭제된 메뉴·공지일 수 있습니다. 링크 타입을 확인한 뒤 목록에서 다시 선택해 주세요.";
    case "invalid_link_target_id":
      return "연결 대상이 올바르지 않습니다. 메뉴·공지를 목록에서 다시 선택해 주세요.";
    case "image_url_required":
      return "배너 이미지를 업로드해 주세요.";
    case "storage_bucket_missing":
      return "이미지 저장소 버킷이 없습니다. 안내에 따라 Supabase에 store-product-images 버킷을 만든 뒤 다시 시도해 주세요.";
    case "store_not_editable":
      return "매장 상태상 이미지를 올릴 수 없습니다.";
    default:
      return code;
  }
}

export function OwnerStoreBannersView() {
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
              title: String(x.title ?? "").trim() || "(제목 없음)",
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
              ? formatBannerSaveError(j.error.trim())
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
          setErr("배너 이미지를 업로드해 주세요.");
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
          setErr(formatBannerSaveError(raw));
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
          setErr(formatBannerSaveError(raw));
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

  const deleteBanner = async (id: string) => {
    if (!window.confirm("이 배너를 삭제할까요?")) return;
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
    return <p className="px-3 sam-text-body text-sam-muted">매장을 불러오는 중…</p>;
  }

  const q = `storeId=${encodeURIComponent(resolvedStoreId)}`;

  return (
    <div className={`px-3 py-2 ${OWNER_STORE_STACK_Y_CLASS}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className={Biz.textTitle}>배너 관리</h1>
        <Link href={`/stores/owner?${q}`} className={Biz.textMuted}>
          ← 대시보드
        </Link>
      </div>
      <p className={`mt-1 ${Biz.textMuted}`}>고객 매장 상단에 가로 스와이프 배너로 노출됩니다.</p>

      {err ? <p className="mt-2 text-sm text-red-600">{err}</p> : null}

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
        className={`mt-4 ${Biz.btnPrimary}`}
      >
        배너 추가
      </button>

      {loading ? <p className="mt-3 text-sm text-sam-muted">불러오는 중…</p> : null}

      <ul className="mt-4 space-y-3">
        {banners.map((b) => (
          <li key={b.id} className={Biz.card}>
            <div className="flex gap-3">
              <div className="h-20 w-28 shrink-0 overflow-hidden rounded-[12px] bg-[var(--biz-app-bg)]">
                <img src={b.image_url} alt="" className="h-full w-full object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[var(--biz-text)]">{b.title?.trim() || "(제목 없음)"}</p>
                <p className="text-[12px] text-[var(--biz-text-muted)]">
                  {b.is_active ? "사용" : "숨김"} · 정렬 {b.sort_order} · {b.link_type}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setErr(null);
                      setEditor({ mode: "edit", row: { ...b } });
                    }}
                    className={Biz.btnOutline}
                  >
                    수정
                  </button>
                  <button type="button" disabled={busy} onClick={() => void deleteBanner(b.id)} className={Biz.btnOutline}>
                    삭제
                  </button>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {editor ? (
        <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/45 p-3 sm:items-center">
          <div className={`max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-[16px] bg-[var(--biz-card-bg)] p-4 sm:rounded-[16px] ${Biz.card}`}>
            <h2 className={Biz.textCardTitle}>{editor.mode === "new" ? "배너 등록" : "배너 수정"}</h2>
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
                  <span className={`${Biz.textMuted}`}>배너 사진</span>
                  <span className="text-[11px] text-[var(--biz-text-muted)]">JPG · PNG · WEBP · 최대 5MB</span>
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
                              <span className="text-[15px] font-medium text-[var(--biz-text)]">여기를 눌러 사진 추가</span>
                              <span className="text-[12px] text-[var(--biz-text-muted)]">
                                매장 상단에 넓게 보이는 가로형 이미지를 권장해요.
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
                              사진 바꾸기
                            </button>
                          </div>
                        ) : null}
                      </div>
                      {has ? (
                        <p className="text-center text-[11px] text-[var(--biz-text-muted)]">
                          가로로 긴 이미지가 배너에 더 잘 맞아요.
                        </p>
                      ) : null}
                    </div>
                  );
                })()}
              </div>

              <label className="block">
                <span className={Biz.textMuted}>제목</span>
                <input
                  className="mt-1 w-full rounded-[14px] border border-[var(--biz-card-border)] px-3 py-2 text-[14px]"
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
                <span className={Biz.textMuted}>설명</span>
                <textarea
                  className="mt-1 w-full rounded-[14px] border border-[var(--biz-card-border)] px-3 py-2 text-[14px]"
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
              <div className="rounded-[14px] border border-[var(--biz-card-border)] bg-[var(--biz-app-bg)]/50 p-3.5">
                <p className="text-[14px] font-semibold text-[var(--biz-text)]">배너를 눌렀을 때</p>
                <p className="mt-1 text-[12px] leading-snug text-[var(--biz-text-muted)]">
                  손님이 배너를 탭하면 열릴 화면을 골라 주세요. 공지 연결 시 아래에서 제목으로 선택하면 됩니다.
                </p>
                <label htmlFor="owner-banner-link-action" className="mt-3 block">
                  <span className="sr-only">동작 선택</span>
                  <select
                    id="owner-banner-link-action"
                    className="w-full rounded-[14px] border border-[var(--biz-card-border)] bg-[var(--biz-card-bg)] px-3 py-2.5 text-[14px] text-[var(--biz-text)]"
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
                    {LINK_OPTS.map((o) => (
                      <option key={o.v} value={o.v}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>

                {(editor.mode === "new" ? editor.draft.link_type : editor.row.link_type) === "notice" ? (
                  <label className="mt-3 block border-t border-[var(--biz-card-border)] pt-3">
                    <span className={`${Biz.textMuted} mb-1.5 block text-[13px]`}>열어 줄 공지</span>
                    <select
                      className="w-full rounded-[14px] border border-[var(--biz-card-border)] bg-[var(--biz-card-bg)] px-3 py-2.5 text-[14px]"
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
                      <option value="">선택하지 않음</option>
                      {mergePickList(
                        linkPick.notices,
                        editor.mode === "new" ? editor.draft.link_target_id : editor.row.link_target_id
                      ).map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.title}
                        </option>
                      ))}
                    </select>
                    {linkPick.loading ? (
                      <p className="mt-1.5 text-[11px] text-[var(--biz-text-muted)]">공지 목록을 불러오는 중…</p>
                    ) : linkPick.notices.length === 0 &&
                      !(editor.mode === "new" ? editor.draft.link_target_id : editor.row.link_target_id) ? (
                      <p className="mt-1.5 text-[11px] text-amber-800">
                        등록된 공지가 없어요. 공지를 만든 뒤 다시 시도해 주세요.
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
                <span className={Biz.textBody}>노출 사용</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className={Biz.textMuted}>시작(선택)</span>
                  <input
                    type="datetime-local"
                    className="mt-1 w-full rounded-[14px] border border-[var(--biz-card-border)] px-2 py-1 text-[12px]"
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
                  <span className={Biz.textMuted}>종료(선택)</span>
                  <input
                    type="datetime-local"
                    className="mt-1 w-full rounded-[14px] border border-[var(--biz-card-border)] px-2 py-1 text-[12px]"
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
            <div className="mt-5 flex gap-2 border-t border-[var(--biz-card-border)] pt-4">
              <button type="button" disabled={busy} onClick={() => setEditor(null)} className={Biz.btnOutline}>
                닫기
              </button>
              <button type="button" disabled={busy} onClick={() => void saveEditor()} className={Biz.btnPrimaryLg}>
                {busy ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
