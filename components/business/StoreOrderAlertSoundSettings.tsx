"use client";

import { useEffect, useRef, useState } from "react";
import {
  invalidateStoreDeliveryAlertSoundCache,
  previewStoreDeliveryBuiltinSound,
} from "@/lib/business/store-order-alert-sound";

type Props = {
  storeId: string;
  initialUrl?: string | null;
};

export function StoreOrderAlertSoundSettings({ storeId, initialUrl }: Props) {
  const [url, setUrl] = useState<string | null>(() => {
    const u = typeof initialUrl === "string" ? initialUrl.trim() : "";
    return u || null;
  });
  const [busy, setBusy] = useState<"upload" | "delete" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const u = typeof initialUrl === "string" ? initialUrl.trim() : "";
    setUrl(u || null);
  }, [initialUrl, storeId]);

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setErr(null);
    setBusy("upload");
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch(`/api/me/stores/${encodeURIComponent(storeId)}/order-alert-sound`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        message?: string;
        url?: string;
      };
      if (!j?.ok) {
        setErr(
          typeof j?.message === "string"
            ? j.message
            : typeof j?.error === "string"
              ? j.error
              : "업로드에 실패했습니다."
        );
        return;
      }
      const u = typeof j.url === "string" ? j.url.trim() : "";
      setUrl(u || null);
      invalidateStoreDeliveryAlertSoundCache();
    } catch {
      setErr("네트워크 오류입니다.");
    } finally {
      setBusy(null);
    }
  };

  const onDelete = async () => {
    setErr(null);
    setBusy("delete");
    try {
      const res = await fetch(`/api/me/stores/${encodeURIComponent(storeId)}/order-alert-sound`, {
        method: "DELETE",
        credentials: "include",
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!j?.ok) {
        setErr(typeof j?.error === "string" ? j.error : "삭제에 실패했습니다.");
        return;
      }
      setUrl(null);
      invalidateStoreDeliveryAlertSoundCache();
    } catch {
      setErr("네트워크 오류입니다.");
    } finally {
      setBusy(null);
    }
  };

  const preview = () => {
    if (url) {
      const a = new Audio(url);
      a.volume = 0.55;
      void a.play().catch(() => {
        previewStoreDeliveryBuiltinSound();
      });
    } else {
      previewStoreDeliveryBuiltinSound();
    }
  };

  return (
    <div className="rounded-lg border border-gray-100 bg-white px-3 py-3">
      <h3 className="text-[14px] font-semibold text-gray-900">신규 주문 알림음 (배달)</h3>
      <p className="mt-1 text-[12px] leading-relaxed text-gray-500">
        PC에 있는 MP3·WAV·OGG·WebM 파일을 올리면 이 매장 주문 알림에만 사용됩니다. 지정하지 않으면 사이트
        전역 알림음(또는 비프)이 재생됩니다. 최대 2MB.
      </p>
      {err ? (
        <p className="mt-2 rounded-md bg-red-50 px-2 py-1.5 text-[12px] text-red-800" role="alert">
          {err}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/ogg,audio/webm"
          className="sr-only"
          onChange={onPickFile}
        />
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => inputRef.current?.click()}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-[13px] font-medium text-gray-800 shadow-sm disabled:opacity-50"
        >
          {busy === "upload" ? "업로드 중…" : "내 PC에서 찾기"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => preview()}
          className="rounded-lg bg-signature px-3 py-2 text-[13px] font-medium text-white shadow-sm disabled:opacity-50"
        >
          미리듣기
        </button>
        {url ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void onDelete()}
            className="rounded-lg border border-red-200 bg-white px-3 py-2 text-[13px] font-medium text-red-700 disabled:opacity-50"
          >
            {busy === "delete" ? "삭제 중…" : "매장 전용 해제"}
          </button>
        ) : null}
      </div>
      <p className="mt-2 text-[11px] text-gray-400">
        {url ? "이 매장에 사용자 지정 알림이 적용 중입니다." : "전역 설정 또는 기본 비프가 사용됩니다."}
      </p>
    </div>
  );
}
