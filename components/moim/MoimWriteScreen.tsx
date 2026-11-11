"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useRegisterMainTier1Header } from "@/lib/layout/use-register-main-tier1-header";
import { moimApi, moimErrorKey, moimRoutes } from "@/lib/moim/moim-client-api";
import { useMoimDetail } from "@/components/moim/MoimDetailScreen";
import { activeMoimBoards, canWriteMoimBoard } from "@/components/moim/MoimMemberView";
import { useMoimImageUpload } from "@/components/moim/use-moim-image-upload";
import { MoimEmptyState, MoimErrorState, MoimListSkeleton, chipClass, moimCls, useMoimBoardLabel, useMoimToast } from "@/components/moim/moim-ui";

const MAX_IMAGES = 10;

/** 글쓰기·수정 /moim/[id]/write?board= | ?edit=postId */
export function MoimWriteScreen({ moimId }: { moimId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const sp = useSearchParams();
  const editId = sp.get("edit");
  const boardParam = sp.get("board");
  const toast = useMoimToast();
  const boardLabel = useMoimBoardLabel();
  const { uploading, upload } = useMoimImageUpload();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const { moim, error, reload } = useMoimDetail(moimId);

  const [boardId, setBoardId] = useState<string | null>(boardParam);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<"members" | "public">("members");
  const [editLoaded, setEditLoaded] = useState(!editId);
  const [editError, setEditError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const header = useMemo(
    () => ({ titleText: editId ? t("moim_write_edit_title") : t("moim_write_title"), backHref: moimRoutes.home(moimId) }),
    [editId, moimId, t]
  );
  useRegisterMainTier1Header(header);

  useEffect(() => {
    if (!editId) return;
    let alive = true;
    void moimApi.post(editId).then((r) => {
      if (!alive) return;
      if (!r.ok) {
        setEditError(r.error);
        return;
      }
      setBoardId(r.post.boardId);
      setTitle(r.post.title);
      setBody(r.post.body);
      setImages(r.post.images);
      setVisibility(r.post.visibility);
      setEditLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [editId]);

  const writable = useMemo(() => (moim ? activeMoimBoards(moim).filter((b) => canWriteMoimBoard(moim, b)) : []), [moim]);
  useEffect(() => {
    if (editId || !moim) return;
    if (!boardId || !writable.some((b) => b.id === boardId)) setBoardId(writable[0]?.id ?? null);
  }, [editId, moim, writable, boardId]);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    const room = MAX_IMAGES - images.length;
    if (room <= 0) return toast.show(t("moim_err_moim_post_images_invalid"), "error");
    const r = await upload(files.slice(0, room));
    if (r.urls.length) setImages((xs) => [...xs, ...r.urls].slice(0, MAX_IMAGES));
    if (r.failed) toast.show(t("moim_screen_upload_failed"), "error");
    if (files.length > room) toast.show(t("moim_err_moim_post_images_invalid"), "error");
  };

  const submit = async () => {
    if (!boardId || !body.trim() || busy || uploading) return;
    setBusy(true);
    setSubmitError(null);
    if (editId) {
      const r = await moimApi.updatePost(editId, { title: title.trim(), body: body.trim(), images, visibility });
      setBusy(false);
      if (!r.ok) return setSubmitError(t(moimErrorKey(r.error)));
      router.replace(moimRoutes.post(moimId, editId));
      return;
    }
    const r = await moimApi.createPost(moimId, { boardId, title: title.trim(), body: body.trim(), images, visibility });
    setBusy(false);
    if (!r.ok) return setSubmitError(t(moimErrorKey(r.error)));
    router.replace(moimRoutes.post(moimId, r.post_id));
  };

  if (error || editError) {
    const e = (error ?? editError) as string;
    return (
      <div className={moimCls.page}>
        <MoimErrorState messageKey={moimErrorKey(e)} onRetry={error ? reload : undefined} />
      </div>
    );
  }
  if (!moim || !editLoaded) {
    return (
      <div className={`${moimCls.page} pt-3`}>
        <MoimListSkeleton rows={2} />
      </div>
    );
  }
  if (moim.viewer.status !== "active") {
    return (
      <div className={moimCls.page}>
        <MoimEmptyState>{t("moim_err_moim_not_member")}</MoimEmptyState>
      </div>
    );
  }
  if (!editId && writable.length === 0) {
    return (
      <div className={moimCls.page}>
        <MoimEmptyState>{t("moim_write_no_board")}</MoimEmptyState>
      </div>
    );
  }

  const editBoard = editId ? moim.boards.find((b) => b.id === boardId) : null;

  return (
    <div className={`${moimCls.page} flex flex-col`}>
      <div className={`${moimCls.column} grid flex-1 content-start gap-4 px-4 pb-28 pt-3`}>
        <div className="grid gap-1.5">
          <span className={moimCls.label}>{t("moim_write_board_label")}</span>
          {editId ? (
            <span className="text-[14px] text-sam-fg">{editBoard ? boardLabel(editBoard) : ""}</span>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {writable.map((b) => (
                <button key={b.id} type="button" aria-pressed={boardId === b.id} className={chipClass(boardId === b.id)} onClick={() => setBoardId(b.id)}>
                  {boardLabel(b)}
                </button>
              ))}
            </div>
          )}
        </div>
        <input className={moimCls.input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("moim_write_title_placeholder")} aria-label={t("moim_write_title_label")} />
        <textarea
          className={`${moimCls.textarea} min-h-[200px]`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t("moim_write_body_placeholder")}
          aria-label={t("moim_write_body_label")}
        />
        <div className="grid gap-1.5">
          <span className={moimCls.label}>{t("moim_write_photos_label", { count: images.length, max: MAX_IMAGES })}</span>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {images.length < MAX_IMAGES ? (
              <button
                type="button"
                disabled={uploading}
                className={`${moimCls.card} flex h-20 w-20 shrink-0 flex-col items-center justify-center gap-1 text-[11px] text-sam-muted`}
                onClick={() => fileRef.current?.click()}
                aria-label={t("moim_write_add_photo_aria")}
              >
                <ImagePlus className="h-5 w-5" aria-hidden />
                {uploading ? t("common_loading") : null}
              </button>
            ) : null}
            {images.map((u, i) => (
              <div key={`${u}-${i}`} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-ui-rect">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-sam-surface text-sam-fg shadow"
                  aria-label={t("moim_write_remove_photo_aria")}
                  onClick={() => setImages((xs) => xs.filter((_, j) => j !== i))}
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            ))}
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={onPick} />
        </div>
        <div className="grid gap-1.5">
          <span className={moimCls.label}>{t("moim_write_visibility_label")}</span>
          <div className="flex overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface" role="radiogroup">
            {(["members", "public"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={visibility === v}
                className={`flex-1 py-2.5 text-[13px] ${visibility === v ? "bg-sam-primary-soft font-bold text-sam-primary" : "text-sam-fg"}`}
                onClick={() => setVisibility(v)}
              >
                {v === "members" ? t("moim_write_visibility_members_segment") : t("moim_write_visibility_public_segment")}
              </button>
            ))}
          </div>
          <span className={moimCls.hint}>{visibility === "members" ? t("moim_write_visibility_members_hint") : t("moim_write_visibility_public_hint")}</span>
        </div>
        {submitError ? <p className={moimCls.noticeBad}>{submitError}</p> : null}
      </div>
      <div className="sticky bottom-0 border-t border-sam-border bg-sam-surface px-4 pb-[calc(12px+var(--safe-bottom,0px))] pt-2.5">
        <div className={moimCls.column}>
          <button type="button" className={`${moimCls.btnPrimary} w-full`} disabled={!boardId || !body.trim() || busy || uploading} onClick={submit}>
            {editId ? t("common_save") : t("moim_write_submit_btn")}
          </button>
        </div>
      </div>
      {toast.node}
    </div>
  );
}
