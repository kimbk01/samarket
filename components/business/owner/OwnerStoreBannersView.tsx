"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
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

const LINK_OPTS = [
  { v: "none", label: "없음" },
  { v: "product", label: "메뉴로 이동" },
  { v: "notice", label: "공지로 이동" },
  { v: "coupon", label: "쿠폰(준비중)" },
] as const;

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

  const uploadImage = async (file: File): Promise<string | null> => {
    const sid = resolvedStoreId.trim();
    const fd = new FormData();
    fd.set("file", file);
    const res = await fetch(`/api/me/stores/${encodeURIComponent(sid)}/upload-image`, {
      method: "POST",
      credentials: "include",
      body: fd,
    });
    const j = (await res.json()) as { ok?: boolean; url?: string };
    return j?.ok && j.url ? String(j.url) : null;
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
        const res = await fetch(`/api/me/stores/${encodeURIComponent(sid)}/banners`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image_url,
            title: d.title ?? null,
            description: d.description ?? null,
            link_type: d.link_type ?? "none",
            link_target_id: d.link_target_id ?? null,
            sort_order: d.sort_order ?? 0,
            is_active: d.is_active !== false,
            start_at: d.start_at ?? null,
            end_at: d.end_at ?? null,
          }),
        });
        const j = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !j?.ok) {
          setErr(typeof j?.error === "string" ? j.error : "save_failed");
          return;
        }
      } else {
        const row = editor.row;
        const res = await fetch(`/api/me/stores/${encodeURIComponent(sid)}/banners/${encodeURIComponent(row.id)}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image_url: row.image_url,
            title: row.title,
            description: row.description,
            link_type: row.link_type,
            link_target_id: row.link_target_id,
            sort_order: row.sort_order,
            is_active: row.is_active,
            start_at: row.start_at ?? null,
            end_at: row.end_at ?? null,
          }),
        });
        const j = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !j?.ok) {
          setErr(typeof j?.error === "string" ? j.error : "save_failed");
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
        <Link href={`/my/business?${q}`} className={Biz.textMuted}>
          ← 대시보드
        </Link>
      </div>
      <p className={`mt-1 ${Biz.textMuted}`}>고객 매장 상단에 가로 스와이프 배너로 노출됩니다.</p>

      {err ? <p className="mt-2 text-sm text-red-600">{err}</p> : null}

      <button
        type="button"
        disabled={busy || !!editor}
        onClick={() =>
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
          })
        }
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
                    onClick={() => setEditor({ mode: "edit", row: { ...b } })}
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
            <div className="mt-3 space-y-3">
              <label className="block">
                <span className={Biz.textMuted}>이미지 URL (업로드)</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={busy}
                  className="mt-1 block w-full text-sm"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const url = await uploadImage(f);
                    if (!url) {
                      setErr("이미지 업로드 실패");
                      return;
                    }
                    if (editor.mode === "new") {
                      setEditor({ mode: "new", draft: { ...editor.draft, image_url: url } });
                    } else {
                      setEditor({ mode: "edit", row: { ...editor.row, image_url: url } });
                    }
                  }}
                />
                {editor.mode === "new" ? (
                  <p className="mt-1 break-all text-[11px] text-[var(--biz-text-muted)]">{editor.draft.image_url}</p>
                ) : (
                  <p className="mt-1 break-all text-[11px] text-[var(--biz-text-muted)]">{editor.row.image_url}</p>
                )}
              </label>
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
              <label className="block">
                <span className={Biz.textMuted}>링크 타입</span>
                <select
                  className="mt-1 w-full rounded-[14px] border border-[var(--biz-card-border)] px-3 py-2 text-[14px]"
                  value={editor.mode === "new" ? String(editor.draft.link_type ?? "none") : editor.row.link_type}
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
              {(editor.mode === "new" ? editor.draft.link_type : editor.row.link_type) === "product" ||
              (editor.mode === "new" ? editor.draft.link_type : editor.row.link_type) === "notice" ? (
                <label className="block">
                  <span className={Biz.textMuted}>연결 대상 UUID</span>
                  <input
                    className="mt-1 w-full rounded-[14px] border border-[var(--biz-card-border)] px-3 py-2 font-mono text-[12px]"
                    placeholder="메뉴/공지 id"
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
                  />
                </label>
              ) : null}
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
            <div className="mt-4 flex gap-2">
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
