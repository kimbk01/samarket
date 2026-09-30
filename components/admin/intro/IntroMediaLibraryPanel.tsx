"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AdminActionButton,
  AdminActionLabel,
} from "@/components/admin/ui/AdminActionButton";

type MediaKind = "IMAGE" | "LOGO" | "GIF" | "VIDEO";

type MediaItem = {
  mediaId: string;
  mediaKind: MediaKind;
  originalName: string;
  displayName: string;
  previewUrl: string | null;
  width: number | null;
  height: number | null;
};

function formatDimensions(width: number | null, height: number | null): string {
  if (width != null && height != null) return `${width}×${height}`;
  return "—";
}

function mediaSubtitle(item: MediaItem): string {
  return `${item.mediaKind} · ${formatDimensions(item.width, item.height)}`;
}

/**
 * Media library — asset delete ≠ canvas element delete.
 */
export function IntroMediaLibraryPanel() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const reload = useCallback(async () => {
    const res = await fetch("/api/admin/intro/media", { cache: "no-store" });
    const json = (await res.json()) as {
      ok: boolean;
      items?: MediaItem[];
      error?: string;
    };
    if (!json.ok) {
      setError(json.error ?? "목록을 불러오지 못했습니다.");
      return;
    }
    setItems(json.items ?? []);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function upload(file: File, asLogo: boolean) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const form = new FormData();
      form.set("file", file);
      if (asLogo) form.set("asLogo", "1");
      const res = await fetch("/api/admin/intro/media", {
        method: "POST",
        body: form,
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) {
        setError(json.error ?? "업로드에 실패했습니다.");
        return;
      }
      setMessage("업로드 완료");
      await reload();
    } finally {
      setBusy(false);
    }
  }

  function startRename(item: MediaItem) {
    setEditingId(item.mediaId);
    setEditName(item.displayName);
    setError(null);
    setMessage(null);
  }

  function cancelRename() {
    setEditingId(null);
    setEditName("");
  }

  async function commitRename(mediaId: string) {
    const next = editName.trim();
    if (!next) {
      setError("이름을 입력해 주세요.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/intro/media", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaId, displayName: next }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) {
        setError(json.error ?? "이름 변경에 실패했습니다.");
        return;
      }
      setMessage("이름을 변경했습니다.");
      setEditingId(null);
      setEditName("");
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function deleteAsset(mediaId: string, displayName: string) {
    if (
      !window.confirm(
        `「${displayName}」을(를) 미디어 라이브러리에서 삭제할까요?\n씬에서 사용 중이면 삭제되지 않습니다.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/admin/intro/media?mediaId=${encodeURIComponent(mediaId)}`,
        { method: "DELETE" },
      );
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) {
        setError(json.error ?? "삭제에 실패했습니다.");
        return;
      }
      setMessage("자산을 삭제했습니다.");
      if (editingId === mediaId) cancelRename();
      await reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4" data-intro13-media="1">
      <div>
        <h2 className="text-lg font-semibold text-sam-fg">미디어</h2>
        <p className="mt-1 text-sm text-sam-muted">
          공용 자산 라이브러리입니다. Canvas에서 요소를 삭제하는 것과 다릅니다.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <AdminActionLabel variant="secondary">
          이미지/영상 업로드
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f, false);
              e.target.value = "";
            }}
          />
        </AdminActionLabel>
        <AdminActionLabel variant="secondary">
          로고 업로드
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f, true);
              e.target.value = "";
            }}
          />
        </AdminActionLabel>
      </div>

      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      {items.length === 0 ? (
        <p className="text-sm text-sam-muted">업로드된 미디어가 없습니다.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {items.map((m) => {
            const isEditing = editingId === m.mediaId;
            return (
              <li
                key={m.mediaId}
                className="flex flex-col overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface"
              >
                <div className="relative aspect-[4/3] w-full bg-[var(--admin-console-hover,#eef1f6)]">
                  {m.previewUrl && m.mediaKind === "VIDEO" ? (
                    // eslint-disable-next-line jsx-a11y/media-has-caption
                    <video
                      src={m.previewUrl}
                      className="h-full w-full object-contain"
                      muted
                      loop
                      playsInline
                      preload="metadata"
                    />
                  ) : m.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.previewUrl}
                      alt=""
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs font-medium text-sam-muted">
                      {m.mediaKind === "VIDEO" ? "VIDEO" : "미리보기 없음"}
                    </div>
                  )}
                </div>

                <div className="flex flex-1 flex-col gap-2 p-3">
                  {isEditing ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={editName}
                        disabled={busy}
                        className="w-full rounded-ui-rect border border-sam-border bg-white px-2 py-1.5 text-sm text-sam-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--admin-console-accent,#1d4ed8)]"
                        aria-label="미디어 표시 이름"
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void commitRename(m.mediaId);
                          if (e.key === "Escape") cancelRename();
                        }}
                      />
                      <div className="flex flex-wrap gap-2">
                        <AdminActionButton
                          variant="primary"
                          className="min-h-8 px-2 text-xs"
                          disabled={busy}
                          onClick={() => void commitRename(m.mediaId)}
                        >
                          저장
                        </AdminActionButton>
                        <AdminActionButton
                          variant="neutral"
                          className="min-h-8 px-2 text-xs"
                          disabled={busy}
                          onClick={cancelRename}
                        >
                          취소
                        </AdminActionButton>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="truncate text-sm font-semibold text-sam-fg" title={m.displayName}>
                        {m.displayName}
                      </p>
                      <p className="text-xs text-sam-muted">{mediaSubtitle(m)}</p>
                    </>
                  )}

                  {!isEditing ? (
                    <div className="mt-auto flex flex-wrap gap-2 pt-1">
                      <AdminActionButton
                        variant="quiet"
                        className="min-h-8 px-2 text-xs"
                        disabled={busy}
                        onClick={() => startRename(m)}
                      >
                        이름 변경
                      </AdminActionButton>
                      <AdminActionButton
                        variant="danger"
                        className="min-h-8 px-2 text-xs"
                        disabled={busy}
                        onClick={() => void deleteAsset(m.mediaId, m.displayName)}
                      >
                        삭제
                      </AdminActionButton>
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
