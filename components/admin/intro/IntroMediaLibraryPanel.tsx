"use client";

import { useCallback, useEffect, useState } from "react";
import { Sam } from "@/lib/ui/css-vars";

type MediaItem = {
  mediaId: string;
  mediaKind: string;
  originalName: string;
  previewUrl: string | null;
  width: number | null;
  height: number | null;
};

/**
 * Media library — asset delete ≠ canvas element delete.
 */
export function IntroMediaLibraryPanel() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const res = await fetch("/api/admin/intro/media", { cache: "no-store" });
    const json = (await res.json()) as {
      ok: boolean;
      items?: MediaItem[];
      error?: string;
    };
    if (!json.ok) {
      setError(json.error ?? "list_failed");
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
        setError(json.error ?? "upload_failed");
        return;
      }
      setMessage("업로드 완료");
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function deleteAsset(mediaId: string) {
    if (
      !window.confirm(
        "미디어 라이브러리에서 이 자산을 삭제할까요?\n씬에서 사용하는 요소는 별도로 제거해야 합니다.",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/intro/media?mediaId=${encodeURIComponent(mediaId)}`, {
        method: "DELETE",
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) {
        setError(json.error ?? "delete_failed");
        return;
      }
      setMessage("자산 삭제됨");
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
        <label className={`${Sam.btn.secondary} cursor-pointer`}>
          이미지 업로드
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f, false);
              e.target.value = "";
            }}
          />
        </label>
        <label className={`${Sam.btn.secondary} cursor-pointer`}>
          로고 업로드
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f, true);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6">
        {items.map((m) => (
          <li
            key={m.mediaId}
            className="overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface"
          >
            {m.previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={m.previewUrl}
                alt=""
                className="h-28 w-full object-cover"
              />
            ) : (
              <div className="flex h-28 items-center justify-center text-xs text-sam-muted">
                READY
              </div>
            )}
            <div className="space-y-1 p-2">
              <p className="truncate text-[11px] text-sam-muted">{m.originalName}</p>
              <p className="text-[10px] text-sam-muted">{m.mediaKind}</p>
              <button
                type="button"
                className="text-[11px] text-red-600 hover:underline"
                disabled={busy}
                onClick={() => void deleteAsset(m.mediaId)}
              >
                자산 삭제
              </button>
            </div>
          </li>
        ))}
      </ul>
      {items.length === 0 ? (
        <p className="text-sm text-sam-muted">업로드된 미디어가 없습니다.</p>
      ) : null}
    </div>
  );
}
