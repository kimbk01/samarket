"use client";

import { DibaySpinner } from "@/components/ui/DibaySpinner";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Pin } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayActionSheet, dibayConfirm, type DibayActionSheetItem } from "@/components/ui/dibay-overlay";
import { DibayImageViewer, dibayImageViewerItemsFromUrls } from "@/components/common/media/DibayImageViewer";
import type { MessageKey } from "@/lib/i18n/messages";
import { moimApi, moimErrorKey } from "@/lib/moim/moim-client-api";
import type { MoimAlbumItemDto, MoimDetailDto } from "@/lib/moim/moim-api-types";
import type { MoimReportTarget } from "@/components/moim/MoimReportSheet";
import { useMoimImageUpload } from "@/components/moim/use-moim-image-upload";
import { MoimEmptyState, MoimErrorState, moimCls } from "@/components/moim/moim-ui";

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
    onToast(t(res.added === 1 ? "moim_album_added_toast_one" : "moim_album_added_toast", { count: res.added }), "success");
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

/**
 * 사진 크게 보기 — 공용 뷰어(`DibayImageViewer`) + 「⋯」 시트 (R5 B8·B9).
 * 시트 항목 순서 = 일반 → 신고 → 위험(R3 1-1): 고정/해제(pin_notice) → 신고(남의 사진) → 삭제(내 사진) 또는 숨기기(hide_post).
 * 뒤로 키: 시트가 열린 채 ◁ → 시트만 닫힘, 다시 ◁ → 뷰어 닫힘(뷰어 = 히스토리 1칸, 시트 = 오버레이 뒤로 스택).
 */
function MoimAlbumPhotos({
  moim,
  items,
  index,
  onClose,
  onPatched,
  onRemoved,
  onReport,
  onToast,
  onIndex,
}: {
  moim: MoimDetailDto;
  items: MoimAlbumItemDto[];
  index: number | null;
  /** 「⋯」를 누른 칸을 부모 번호에 맞춘다 — 넘겨 본 사진을 지운 뒤 옆 사진으로 가게(R5 재감사) */
  onIndex: (index: number) => void;
  onClose: () => void;
  onPatched: (item: MoimAlbumItemDto) => void;
  onRemoved: (id: string) => void;
  onReport: (target: MoimReportTarget) => void;
  onToast: Toast;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [sheetIndex, setSheetIndex] = useState<number | null>(null);
  const urls = useMemo(() => items.map((x) => x.url), [items]);
  const viewerItems = useMemo(() => dibayImageViewerItemsFromUrls(urls), [urls]);
  const open = index != null && items.length > 0;
  const item = sheetIndex != null ? items[Math.max(0, Math.min(items.length - 1, sheetIndex))] ?? null : null;

  const togglePin = async (it: MoimAlbumItemDto) => {
    setBusy(true);
    const r = await moimApi.pinAlbum(it.id, !it.isPinned);
    setBusy(false);
    if (!r.ok) return onToast(t(moimErrorKey(r.error)), "error");
    onPatched({ ...it, isPinned: !it.isPinned });
    onToast(it.isPinned ? t("moim_album_unpinned_toast") : t("moim_album_pinned_toast"));
  };

  const remove = async (it: MoimAlbumItemDto) => {
    const own = it.viewerIsUploader;
    const ok = await dibayConfirm({
      title: own ? t("moim_album_delete_confirm_title") : t("moim_album_hide_confirm_title"),
      confirmLabel: own ? t("common_delete") : t("moim_post_hide_btn"),
      cancelLabel: t("common_cancel"),
      confirmTone: "destructive",
    });
    if (!ok) return;
    setBusy(true);
    const r = await moimApi.removeAlbum(it.id);
    setBusy(false);
    if (!r.ok) return onToast(t(moimErrorKey(r.error)), "error");
    onToast(r.result === "hidden" ? t("moim_album_hidden_toast") : t("moim_album_deleted_toast"));
    onRemoved(it.id);
  };

  const sheetItems: DibayActionSheetItem[] = item ? moimAlbumSheetActions(moim, item, t, {
    pin: () => void togglePin(item),
    report: () => onReport({ type: "album", id: item.id }),
    remove: () => void remove(item),
    busy,
  }) : [];

  return (
    <>
      <DibayImageViewer
        open={open}
        items={viewerItems}
        index={index ?? 0}
        onClose={() => {
          setSheetIndex(null);
          onClose();
        }}
        onMore={(i) => {
          onIndex(i);
          setSheetIndex(i);
        }}
        moreLabel={t("moim_album_more_aria")}
      />
      <DibayActionSheet
        open={open && item != null}
        onClose={() => setSheetIndex(null)}
        cancelLabel={t("common_cancel")}
        notice={
          item ? t("moim_album_uploader_note", { name: item.uploader.isActiveMember ? item.uploader.nickname : t("moim_screen_left_member") }) : undefined
        }
        items={sheetItems}
      />
    </>
  );
}

/** 「⋯」 시트 항목 — 일반(고정) → 신고 → 위험(삭제·숨기기) */
export function moimAlbumSheetActions(
  moim: Pick<MoimDetailDto, "can" | "viewer">,
  item: Pick<MoimAlbumItemDto, "isPinned" | "viewerIsUploader">,
  t: (key: MessageKey) => string,
  on: { pin: () => void; report: () => void; remove: () => void; busy?: boolean }
): DibayActionSheetItem[] {
  const out: DibayActionSheetItem[] = [];
  if (moim.can.pin_notice) out.push({ key: "pin", label: item.isPinned ? t("moim_album_unpin_btn") : t("moim_album_pin_btn"), disabled: on.busy, onClick: on.pin });
  if (!item.viewerIsUploader && moim.viewer.loggedIn) out.push({ key: "report", label: t("moim_menu_report"), onClick: on.report });
  if (item.viewerIsUploader) out.push({ key: "delete", label: t("common_delete"), danger: true, disabled: on.busy, onClick: on.remove });
  else if (moim.can.hide_post) out.push({ key: "hide", label: t("moim_post_hide_btn"), danger: true, disabled: on.busy, onClick: on.remove });
  return out;
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
      const left = (items ?? []).filter((x) => x.id !== id).length;
      setItems((prev) => (prev ? prev.filter((x) => x.id !== id) : prev));
      /** 남은 사진이 있으면 뷰어를 그대로 두고(옆 사진), 0장이면 닫는다 */
      setIndex((i) => (left === 0 || i == null ? null : Math.min(i, left - 1)));
    },
    [items, setItems]
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
                {list.more ? <DibaySpinner size="sm" tone="current" label={t("common_loading")} /> : t("moim_home_more_btn")}
              </button>
            </div>
          ) : null}
        </>
      )}
      <MoimAlbumPhotos
        moim={moim}
        items={viewer.items}
        index={viewer.index}
        onClose={() => viewer.setIndex(null)}
        onIndex={viewer.setIndex}
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
        <button type="button" className={moimCls.sectionLinkBtn} onClick={onSeeAll}>
          {t("moim_home_see_all")}
        </button>
      </div>
      <MoimAlbumGrid items={shown} onOpen={viewer.setIndex} />
      <MoimAlbumPhotos
        moim={moim}
        items={shown}
        index={viewer.index}
        onClose={() => viewer.setIndex(null)}
        onIndex={viewer.setIndex}
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
                {list.more ? <DibaySpinner size="sm" tone="current" label={t("common_loading")} /> : t("moim_home_more_btn")}
              </button>
            </div>
          ) : null}
        </>
      )}
      <MoimAlbumPhotos
        moim={moim}
        items={viewer.items}
        index={viewer.index}
        onClose={() => viewer.setIndex(null)}
        onIndex={viewer.setIndex}
        onPatched={viewer.onPatched}
        onRemoved={viewer.onRemoved}
        onReport={onReport}
        onToast={onToast}
      />
    </section>
  );
}
