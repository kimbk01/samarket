"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { MeetingAlbumItemDTO } from "@/lib/neighborhood/types";
import { formatKorDate } from "@/lib/ui/format-meeting-date";

function formatDate(iso: string | null | undefined): string {
  return formatKorDate(iso);
}

interface MeetingAlbumTabProps {
  albumItems: MeetingAlbumItemDTO[];
  meetingId: string;
  allowUpload?: boolean;
  currentUserId?: string;
  isHost?: boolean;
}

export function MeetingAlbumTab({
  albumItems,
  meetingId,
  allowUpload = true,
  currentUserId = "",
  isHost = false,
}: MeetingAlbumTabProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const [localItems, setLocalItems] = useState<MeetingAlbumItemDTO[]>(albumItems);
  const [preview, setPreview] = useState<{ url: string; file: File } | null>(null);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const visible = localItems.filter((item) => !item.is_hidden);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setErr("8MB 이하 사진만 업로드할 수 있습니다.");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview({ url, file });
    setErr("");
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm("이 사진을 삭제하시겠어요?")) return;
    setDeletingId(itemId);
    try {
      const res = await fetch(`/api/philife/meetings/${meetingId}/album/${itemId}`, {
        method: "DELETE",
      });
      const j = (await res.json()) as { ok: boolean };
      if (j.ok) {
        setLocalItems((prev) => prev.filter((i) => i.id !== itemId));
      }
    } catch {
      // 무시
    } finally {
      setDeletingId(null);
    }
  };

  const onCancel = () => {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
    setCaption("");
    setErr("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const onUpload = async () => {
    if (!preview) return;
    setUploading(true);
    setErr("");
    try {
      const formData = new FormData();
      formData.append("file", preview.file);
      if (caption.trim()) formData.append("caption", caption.trim());

      const res = await fetch(`/api/philife/meetings/${meetingId}/album`, {
        method: "POST",
        body: formData,
      });
      const j = (await res.json()) as { ok: boolean; item?: MeetingAlbumItemDTO; error?: string };
      if (!j.ok) {
        setErr(j.error ?? "업로드에 실패했습니다.");
        return;
      }
      if (j.item) {
        // 로컬 상태에 추가 + 미리보기 URL을 실제 URL로 교체
        const newItem: MeetingAlbumItemDTO = {
          ...j.item,
          image_url: j.item.image_url ?? preview.url,
        };
        setLocalItems((prev) => [newItem, ...prev]);
      }
      onCancel();
      startTransition(() => router.refresh());
    } catch {
      setErr("네트워크 오류가 발생했습니다.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* 업로드 UI */}
      {allowUpload && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,.heic"
            className="hidden"
            onChange={onFileChange}
          />

          {preview ? (
            /* 미리보기 + 캡션 + 업로드 */
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="relative mx-auto max-w-xs overflow-hidden rounded-xl">
                <img
                  src={preview.url}
                  alt="미리보기"
                  className="h-48 w-full object-cover"
                />
              </div>
              <input
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                maxLength={200}
                placeholder="사진에 한마디 (선택)"
                className="mt-3 w-full rounded-xl border border-gray-200 px-3 py-2 text-[13px] text-gray-800 placeholder-gray-400 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200"
              />
              {err && <p className="mt-1 text-[11px] text-red-500">{err}</p>}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={uploading}
                  className="flex-1 rounded-xl border border-gray-200 py-2.5 text-[13px] font-medium text-gray-600 disabled:opacity-50"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={() => void onUpload()}
                  disabled={uploading}
                  className="flex-1 rounded-xl bg-emerald-500 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
                >
                  {uploading ? "업로드 중…" : "앨범에 올리기"}
                </button>
              </div>
            </div>
          ) : (
            /* 사진 선택 버튼 */
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-[13px] font-semibold text-white shadow-sm hover:bg-emerald-600 active:bg-emerald-700"
            >
              <span className="text-[18px]">📷</span>
              <span>사진 올리기</span>
            </button>
          )}
        </>
      )}

      {/* 앨범 그리드 — 3열 밀집 */}
      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white py-14 text-center">
          <p className="text-[32px]">📷</p>
          <p className="mt-2 text-[14px] text-gray-400">앨범에 사진이 없어요.</p>
          {allowUpload && (
            <p className="mt-1 text-[12px] text-gray-400">첫 사진을 올려보세요.</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1">
          {visible.map((item) => (
            <div key={item.id} className="relative aspect-square overflow-hidden rounded-xl bg-gray-100">
              {item.image_url ? (
                <img
                  src={item.image_url}
                  alt={item.caption ?? "모임 사진"}
                  className="h-full w-full object-cover"
                  loading="lazy"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[24px]">📷</div>
              )}

              {/* 캡션 오버레이 (하단) */}
              {item.caption && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-2 pb-1.5 pt-4">
                  <p className="line-clamp-1 text-[10px] font-medium text-white">{item.caption}</p>
                </div>
              )}

              {/* 삭제 버튼 (업로더 or 모임장) */}
              {(item.uploader_user_id === currentUserId || isHost) && (
                <button
                  type="button"
                  disabled={deletingId === item.id}
                  onClick={() => void handleDeleteItem(item.id)}
                  className="absolute right-1 top-1 rounded-full bg-black/50 p-1 text-[10px] text-white hover:bg-black/70 disabled:opacity-50"
                  title="삭제"
                >
                  🗑
                </button>
              )}

              {/* 업로더 + 날짜 (하단 우측) */}
              {!item.caption && (
                <div className="absolute bottom-1 right-1">
                  <span className="rounded-full bg-black/40 px-1.5 py-0.5 text-[9px] text-white">
                    {item.uploader_name?.charAt(0) ?? "?"}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
