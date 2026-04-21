"use client";

import { useCallback, useState } from "react";
import { saveChatImagesBundle } from "@/lib/chats/save-chat-images-bundle";

function DownloadGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
    </svg>
  );
}

/**
 * 이미지 묶음 저장 — 원형 테두리·반투명 배경. 부모 flex에서 `items-center`로 이미지 세로 중앙에 맞춤.
 */
export function ChatImageBundleDownload({ urls }: { urls: string[] }) {
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const onClick = useCallback(async () => {
    if (!urls.length || busy) return;
    setBusy(true);
    setHint(null);
    const { okCount, failCount } = await saveChatImagesBundle(urls);
    setBusy(false);
    if (failCount === 0) setHint(`${okCount}장 저장`);
    else setHint(okCount ? `일부 실패 ${okCount}/${urls.length}` : "저장 실패");
    window.setTimeout(() => setHint(null), 2200);
  }, [busy, urls]);

  if (!urls.length) return null;

  return (
    <div className="relative flex size-10 shrink-0 items-center justify-center self-center rounded-full">
      {hint ? (
        <span className="pointer-events-none absolute -top-6 left-1/2 z-10 max-w-[5.5rem] -translate-x-1/2 whitespace-nowrap text-center sam-text-xxs font-medium leading-tight text-muted">
          {hint}
        </span>
      ) : null}
      <button
        type="button"
        data-kasama-round-full
        disabled={busy}
        className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-sam-fg/20 bg-sam-surface/30 text-foreground shadow-[0_1px_4px_rgba(0,0,0,0.06)] backdrop-blur-md outline-none transition active:scale-95 focus-visible:ring-2 focus-visible:ring-signature/35 focus-visible:ring-offset-2 disabled:opacity-45 dark:border-sam-surface/28 dark:bg-sam-surface/14 dark:text-white dark:focus-visible:ring-offset-[#121212] [&::-moz-focus-inner]:border-0"
        style={{ borderRadius: "50%", WebkitBackdropFilter: "blur(12px)" }}
        aria-label="사진 저장"
        onClick={() => void onClick()}
      >
        <DownloadGlyph className="h-[18px] w-[18px]" />
      </button>
    </div>
  );
}
