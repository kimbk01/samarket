"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, ImagePlus, Pin, X } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { dibayConfirm } from "@/components/ui/dibay-overlay";
import { useRegisterOpenOverlay } from "@/lib/ui/use-register-open-overlay";
import { moimApi, moimErrorKey } from "@/lib/moim/moim-client-api";
import type { MoimAlbumItemDto, MoimDetailDto } from "@/lib/moim/moim-api-types";
import type { MoimReportTarget } from "@/components/moim/MoimReportSheet";
import { useMoimImageUpload } from "@/components/moim/use-moim-image-upload";
import { MoimAvatar, MoimEmptyState, MoimErrorState, moimCls } from "@/components/moim/moim-ui";

/** 한 번에 올릴 수 있는 사진 수 */
export const MOIM_ALBUM_PICK_MAX = 10;

type Toast = (message: string, tone?: "default" | "success" | "error") => void;

/** 앨범 목록 상태 — 처음 불러오기 · 이어 불러오기 · 바꾼 항목 반영 */
function useMoimAlbumList(moimId: string, q: { pinned?: boolean; scheduleId?: string | null }) {
  const [items, setItems] = useState<MoimAlbumItemDto[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [key, setKey] = useState(0);
  const pinned = !!q.pinned;
  const scheduleId = q.scheduleId ?? null;

  useEffect(() => {
    let alive = true;
    setFailed(false);
    void moimApi.album(moimId, { pinned, scheduleId }).then((r) => {
      if (!alive) return;
      if (!r.ok) {
        setFailed(true);
        return;
      }
      setItems(r.items);
      setNextBefore(r.nextBefore);
    });
    return () => {
      alive = false;
    };
  }, [moimId, pinned, scheduleId, key]);

  const loadMore = useCallback(async () => {
    if (!nextBefore || more) return;
    setMore(true);
    const r = await moimApi.album(moimId, { pinned, scheduleId, before: nextBefore });
    setMore(false);
    if (!r.ok) return;
    setItems((prev) => {
      const base = prev ?? [];
      return [...base, ...r.items.filter((x) => !base.some((p) => p.id === x.id))];
    });
    setNextBefore(r.nextBefore);
  }, [moimId, more, nextBefore, pinned, scheduleId]);

  const reload = useCallback(() => setKey((k) => k + 1), []);
  return { items, setItems, failed, nextBefore, more, loadMore, reload };
}

/** 사진 고르기 → 올리기 → 앨범에 넣기 (최대 10장) */
function useMoimAlbumAdd(moimId: string, scheduleId: string | null, onAdded: () => void, onToast: Toast) {
  const { t } = useI18n();
  const { uploading, upload } = useMoimImageUpload();
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    if (files.length > MOIM_ALBUM_PICK_MAX) onToast(t("moim_album_pick_limit_toast", { max: MOIM_ALBUM_PICK_MAX }), "error");
    const r = await upload(files.slice(0, MOIM_ALBUM_PICK_MAX));
    if (r.failed) onToast(t("moim_screen_upload_failed"), "error");
    if (!r.urls.length) return;
    setSaving(true);
    const res = await moimApi.addAlbum(moimId, r.urls, scheduleId);
    setSaving(false);
    if (!res.ok) {
      onToast(t(moimErrorKey(res.error)), "error");
      return;
    }
    onToast(t("moim_album_added_toast", { count: res.added }), "success");
    onAdded();
  };

  const busy = uploading || saving;
  const input = <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={onPick} />;
  const open = () => {
    if (!busy) fileRef.current?.click();
  };
  return { busy, input, open };
}

/** 사진 3칸 격자 */
function MoimAlbumGrid({ items, onOpen }: { items: MoimAlbumItemDto[]; onOpen: (index: number) => void }) {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-3 gap-0.5 px-4">
      {items.map((it, i) => (
        <button
          key={it.id}
          type="button"
          className="relative aspect-square overflow-hidden bg-sam-surface-muted"
          aria-label={t("moim_album_open_aria")}
          onClick={() => onOpen(i)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={it.url} alt="" loading="lazy" className="h-full w-full object-cover" />
          {it.isPinned ? (
            <span className="absolute left-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-sam-surface text-sam-primary shadow" aria-hidden>
              <Pin className="h-3 w-3" strokeWidth={2.4} />
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

/** 전체 화면 사진 보기 — 고정/해제 · 삭제/숨기기 · 신고 */
function MoimAlbumViewer({
  moim,
  items,
  index,
  onIndex,
  onClose,
  onPatched,
  onRemoved,
  onReport,
  onToast,
}: {
  moim: MoimDetailDto;
  items: MoimAlbumItemDto[];
  index: number | null;
  onIndex: (i: number) => void;
  onClose: () => void;
  onPatched: (item: MoimAlbumItemDto) => void;
  onRemoved: (id: string) => void;
  onReport: (target: MoimReportTarget) => void;
  onToast: Toast;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);
  const touchX = useRef<number | null>(null);
  const open = index != null && items.length > 0;
  useRegisterOpenOverlay(open);
  useEffect(() => setMounted(true), []);

  const safe = index == null ? 0 : Math.max(0, Math.min(items.length - 1, index));
  const item = open ? items[safe] : null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted || !open || !item) return null;

  const go = (d: number) => {
    const n = safe + d;
    if (n >= 0 && n < items.length) onIndex(n);
  };

  const togglePin = async () => {
    setBusy(true);
    const r = await moimApi.pinAlbum(item.id, !item.isPinned);
    setBusy(false);
    if (!r.ok) return onToast(t(moimErrorKey(r.error)), "error");
    onPatched({ ...item, isPinned: !item.isPinned });
    onToast(item.isPinned ? t("moim_album_unpinned_toast") : t("moim_album_pinned_toast"));
  };

  const remove = async () => {
    const own = item.viewerIsUploader;
    const ok = await dibayConfirm({
      title: own ? t("moim_album_delete_confirm_title") : t("moim_album_hide_confirm_title"),
      confirmLabel: own ? t("common_delete") : t("moim_post_hide_btn"),
      cancelLabel: t("common_cancel"),
      confirmTone: "destructive",
    });
    if (!ok) return;
    setBusy(true);
    const r = await moimApi.removeAlbum(item.id);
    setBusy(false);
    if (!r.ok) return onToast(t(moimErrorKey(r.error)), "error");
    onToast(r.result === "hidden" ? t("moim_album_hidden_toast") : t("moim_album_deleted_toast"));
    onRemoved(item.id);
  };

  const canPin = moim.can.pin_notice;
  const canRemove = item.viewerIsUploader || moim.can.hide_post;
  const canReport = !item.viewerIsUploader && moim.viewer.loggedIn;
  const actionBtn = "inline-flex min-h-[40px] flex-1 items-center justify-center rounded-ui-rect border border-white/30 px-3 text-[13px] font-bold text-white disabled:opacity-50";

  const node = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("moim_album_viewer_aria")}
      className="fixed inset-0 z-[1290] flex flex-col bg-black"
      onTouchStart={(e) => {
        touchX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const start = touchX.current;
        touchX.current = null;
        const end = e.changedTouches[0]?.clientX;
        if (start == null || end == null) return;
        const dx = end - start;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
      }}
    >
      <div className="flex items-center justify-between gap-2 px-2 pt-[calc(8px+var(--safe-top,0px))] text-white">
        <button type="button" className="grid h-10 w-10 place-items-center" aria-label={t("common_close")} onClick={onClose}>
          <X className="h-6 w-6" aria-hidden />
        </button>
        <span className="text-[13px]">
          {safe + 1} / {items.length}
        </span>
        <span className="h-10 w-10" aria-hidden />
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.url} alt="" className="max-h-full max-w-full object-contain" />
        {safe > 0 ? (
          <button type="button" className="absolute left-1 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center text-white" aria-label={t("moim_album_prev_aria")} onClick={() => go(-1)}>
            <ChevronLeft className="h-7 w-7" aria-hidden />
          </button>
        ) : null}
        {safe < items.length - 1 ? (
          <button type="button" className="absolute right-1 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center text-white" aria-label={t("moim_album_next_aria")} onClick={() => go(1)}>
            <ChevronRight className="h-7 w-7" aria-hidden />
          </button>
        ) : null}
      </div>
      <div className="grid gap-2 px-4 pb-[calc(12px+var(--safe-bottom,0px))] pt-2 text-white">
        <div className="flex items-center gap-2 text-[12px]">
          <MoimAvatar url={item.uploader.avatarUrl} name={item.uploader.nickname} size={24} />
          <span className="min-w-0 break-words">{item.uploader.nickname}</span>
        </div>
        {canPin || canRemove || canReport ? (
          <div className="flex gap-2">
            {canPin ? (
              <button type="button" disabled={busy} className={actionBtn} onClick={togglePin}>
                {item.isPinned ? t("moim_album_unpin_btn") : t("moim_album_pin_btn")}
              </button>
            ) : null}
            {canRemove ? (
              <button type="button" disabled={busy} className={actionBtn} onClick={remove}>
                {item.viewerIsUploader ? t("common_delete") : t("moim_post_hide_btn")}
              </button>
            ) : null}
            {canReport ? (
              <button type="button" disabled={busy} className={actionBtn} onClick={() => onReport({ type: "album", id: item.id })}>
                {t("moim_menu_report")}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
  return createPortal(node, document.body);
}

/** 보기 상태 + 바뀐 항목 반영을 한 번에 묶는다 */
function useAlbumViewerState(
  items: MoimAlbumItemDto[] | null,
  setItems: React.Dispatch<React.SetStateAction<MoimAlbumItemDto[] | null>>,
  opts: { dropUnpinned?: boolean }
) {
  const [index, setIndex] = useState<number | null>(null);
  const onPatched = useCallback(
    (item: MoimAlbumItemDto) => {
      setItems((prev) => {
        if (!prev) return prev;
        if (opts.dropUnpinned && !item.isPinned) return prev.filter((x) => x.id !== item.id);
        return prev.map((x) => (x.id === item.id ? item : x));
      });
      if (opts.dropUnpinned && !item.isPinned) setIndex(null);
    },
    [opts.dropUnpinned, setItems]
  );
  const onRemoved = useCallback(
    (id: string) => {
      setItems((prev) => (prev ? prev.filter((x) => x.id !== id) : prev));
      setIndex(null);
    },
    [setItems]
  );
  return { index, setIndex, onPatched, onRemoved, items: items ?? [] };
}

/** 앨범 탭 — 3칸 격자 · 이어 불러오기 · 사진 올리기 */
export function MoimAlbumTab({ moim, onReport, onToast }: { moim: MoimDetailDto; onReport: (t: MoimReportTarget) => void; onToast: Toast }) {
  const { t } = useI18n();
  const list = useMoimAlbumList(moim.id, {});
  const add = useMoimAlbumAdd(moim.id, null, list.reload, onToast);
  const viewer = useAlbumViewerState(list.items, list.setItems, {});
  const sentinel = useRef<HTMLDivElement | null>(null);
  const { loadMore, nextBefore } = list;
  const canAdd = moim.status === "active" && moim.platformState !== "blocked";

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !nextBefore || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) void loadMore();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, nextBefore]);

  return (
    <div className="pt-3">
      {canAdd ? (
        <div className="px-4 pb-3">
          <button type="button" disabled={add.busy} className={`${moimCls.btnSecondary} ${moimCls.btnSm} w-full gap-1.5`} onClick={add.open}>
            <ImagePlus className="h-4 w-4" aria-hidden />
            {add.busy ? t("common_uploading") : t("moim_album_upload_btn")}
          </button>
          {add.input}
        </div>
      ) : null}
      {list.failed ? (
        <MoimErrorState onRetry={list.reload} />
      ) : list.items === null ? (
        <div className="grid grid-cols-3 gap-0.5 px-4" aria-hidden>
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="aspect-square animate-pulse bg-sam-surface-muted" />
          ))}
        </div>
      ) : list.items.length === 0 ? (
        <MoimEmptyState>{t("moim_album_empty")}</MoimEmptyState>
      ) : (
        <>
          <MoimAlbumGrid items={list.items} onOpen={viewer.setIndex} />
          {nextBefore ? (
            <div ref={sentinel} className="px-4 pt-3">
              <button type="button" disabled={list.more} className={`${moimCls.btnSecondary} ${moimCls.btnSm} w-full`} onClick={() => void loadMore()}>
                {list.more ? t("common_loading") : t("moim_home_more_btn")}
              </button>
            </div>
          ) : null}
        </>
      )}
      <MoimAlbumViewer
        moim={moim}
        items={viewer.items}
        index={viewer.index}
        onIndex={viewer.setIndex}
        onClose={() => viewer.setIndex(null)}
        onPatched={viewer.onPatched}
        onRemoved={viewer.onRemoved}
        onReport={onReport}
        onToast={onToast}
      />
    </div>
  );
}

/** 모임 홈 — 고정 사진 (최대 6장, 없으면 숨김) */
export function MoimPinnedAlbumSection({
  moim,
  onSeeAll,
  onReport,
  onToast,
}: {
  moim: MoimDetailDto;
  onSeeAll: () => void;
  onReport: (t: MoimReportTarget) => void;
  onToast: Toast;
}) {
  const { t } = useI18n();
  const list = useMoimAlbumList(moim.id, { pinned: true });
  const shown = (list.items ?? []).slice(0, 6);
  const viewer = useAlbumViewerState(list.items, list.setItems, { dropUnpinned: true });
  if (!list.items || shown.length === 0) return null;
  return (
    <section>
      <div className={moimCls.sectionHead}>
        <h2 className={moimCls.sectionTitle}>{t("moim_album_pinned_title")}</h2>
        <button type="button" className={moimCls.sectionLink} onClick={onSeeAll}>
          {t("moim_home_see_all")}
        </button>
      </div>
      <MoimAlbumGrid items={shown} onOpen={viewer.setIndex} />
      <MoimAlbumViewer
        moim={moim}
        items={shown}
        index={viewer.index}
        onIndex={viewer.setIndex}
        onClose={() => viewer.setIndex(null)}
        onPatched={viewer.onPatched}
        onRemoved={viewer.onRemoved}
        onReport={onReport}
        onToast={onToast}
      />
    </section>
  );
}

/** 일정 상세 — 이 일정 사진 + 사진 올리기(일정 표시) */
export function MoimScheduleAlbumSection({
  moim,
  scheduleId,
  canAdd,
  onReport,
  onToast,
}: {
  moim: MoimDetailDto;
  scheduleId: string;
  canAdd: boolean;
  onReport: (t: MoimReportTarget) => void;
  onToast: Toast;
}) {
  const { t } = useI18n();
  const list = useMoimAlbumList(moim.id, { scheduleId });
  const add = useMoimAlbumAdd(moim.id, scheduleId, list.reload, onToast);
  const viewer = useAlbumViewerState(list.items, list.setItems, {});
  return (
    <section>
      <div className={moimCls.sectionHead}>
        <h2 className={moimCls.sectionTitle}>{t("moim_schedule_photos_title")}</h2>
      </div>
      {canAdd ? (
        <div className="px-4 pb-3">
          <button type="button" disabled={add.busy} className={`${moimCls.btnSecondary} ${moimCls.btnSm} w-full gap-1.5`} onClick={add.open}>
            <ImagePlus className="h-4 w-4" aria-hidden />
            {add.busy ? t("common_uploading") : t("moim_album_upload_btn")}
          </button>
          {add.input}
        </div>
      ) : null}
      {list.failed ? (
        <MoimErrorState onRetry={list.reload} />
      ) : list.items === null ? null : list.items.length === 0 ? (
        <p className="px-4 text-[13px] text-sam-muted">{t("moim_schedule_photos_empty")}</p>
      ) : (
        <>
          <MoimAlbumGrid items={list.items} onOpen={viewer.setIndex} />
          {list.nextBefore ? (
            <div className="px-4 pt-3">
              <button type="button" disabled={list.more} className={`${moimCls.btnSecondary} ${moimCls.btnSm} w-full`} onClick={() => void list.loadMore()}>
                {list.more ? t("common_loading") : t("moim_home_more_btn")}
              </button>
            </div>
          ) : null}
        </>
      )}
      <MoimAlbumViewer
        moim={moim}
        items={viewer.items}
        index={viewer.index}
        onIndex={viewer.setIndex}
        onClose={() => viewer.setIndex(null)}
        onPatched={viewer.onPatched}
        onRemoved={viewer.onRemoved}
        onReport={onReport}
        onToast={onToast}
      />
    </section>
  );
}
