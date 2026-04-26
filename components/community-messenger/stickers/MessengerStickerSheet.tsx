"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { StickerItemDto, StickerPackDto } from "@/lib/stickers/sticker-dto";
import { readRecentStickerUrls } from "@/lib/stickers/recent-stickers-client";
import { MessengerStickerLazyImage } from "@/components/community-messenger/stickers/MessengerStickerLazyImage";
import { runSingleFlight } from "@/lib/http/run-single-flight";

const RECENT_PACK_ID = "__recent__";

export function MessengerStickerSheet({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (fileUrl: string, stickerItemId?: string) => void;
}) {
  const [packs, setPacks] = useState<StickerPackDto[] | null>(null);
  const [packErr, setPackErr] = useState<string | null>(null);
  const [activePackId, setActivePackId] = useState<string | null>(null);
  const [items, setItems] = useState<StickerItemDto[] | null>(null);
  const [itemsBusy, setItemsBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setActivePackId(RECENT_PACK_ID);
    let cancelled = false;
    setPackErr((prev) => (prev === null ? prev : null));
    void (async () => {
      try {
        const res = await runSingleFlight("messenger:stickers:packs:get", () =>
          fetch("/api/stickers/packs", { cache: "no-store" })
        );
        const json = (await res.clone().json().catch(() => ({}))) as { ok?: boolean; packs?: StickerPackDto[] };
        if (cancelled) return;
        if (res.ok && json.ok && json.packs?.length) {
          setPacks(json.packs);
        } else {
          setPackErr("스티커 목록을 불러오지 못했습니다.");
          setPacks((prev) => (Array.isArray(prev) && prev.length === 0 ? prev : []));
        }
      } catch {
        if (!cancelled) {
          setPackErr("스티커 목록을 불러오지 못했습니다.");
          setPacks((prev) => (Array.isArray(prev) && prev.length === 0 ? prev : []));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !activePackId) return;
    if (activePackId === RECENT_PACK_ID) {
      const recent = readRecentStickerUrls();
      setItems(
        recent.map((fileUrl, i) => ({
          id: `recent:${fileUrl}`,
          packId: RECENT_PACK_ID,
          fileUrl,
          keyword: "recent",
          sortOrder: i,
        }))
      );
      return;
    }
    let cancelled = false;
    setItemsBusy((prev) => (prev ? prev : true));
    void (async () => {
      try {
        const packId = encodeURIComponent(activePackId);
        const res = await runSingleFlight(`messenger:stickers:pack:${packId}:items:get`, () =>
          fetch(`/api/stickers/packs/${packId}/items`, { cache: "no-store" })
        );
        const json = (await res.clone().json().catch(() => ({}))) as { ok?: boolean; items?: StickerItemDto[] };
        if (cancelled) return;
        setItems(res.ok && json.ok && json.items ? json.items : []);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setItemsBusy((prev) => (prev ? false : prev));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, activePackId]);

  const packRow = useMemo(() => {
    const recentUrls = readRecentStickerUrls();
    const recentPack: StickerPackDto = {
      id: RECENT_PACK_ID,
      slug: "recent",
      name: "최근",
      iconUrl: recentUrls[0] ?? "/stickers/packs/basic/1f600.webp",
      sortOrder: -1,
    };
    return [recentPack, ...(packs ?? [])];
  }, [packs, open]);

  const handlePick = useCallback(
    (fileUrl: string, stickerItemId?: string) => {
      onPick(fileUrl, stickerItemId);
    },
    [onPick]
  );

  if (!open) return null;

  return (
    <div
      className="flex max-h-[min(52dvh,420px)] min-h-0 w-full flex-col overflow-hidden rounded-t-[length:var(--ui-radius-rect)] bg-sam-surface shadow-[0_-8px_28px_rgba(17,24,39,0.12)]"
      role="dialog"
      aria-modal="true"
      aria-label="스티커"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-sam-border-soft px-3 py-2">
        <span className="sam-text-body font-semibold text-sam-fg">스티커</span>
        <button
          type="button"
          className="rounded-full px-2 py-1 sam-text-body-secondary font-medium text-sam-muted hover:bg-sam-surface-muted"
          onClick={onClose}
        >
          닫기
        </button>
      </div>
      {packErr ? <p className="px-3 py-2 sam-text-body-secondary text-red-600">{packErr}</p> : null}
      <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-sam-border-soft px-2 py-2">
        {packRow.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setActivePackId(p.id)}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 transition ${
              activePackId === p.id ? "border-[color:var(--cm-room-primary)] bg-[color:var(--cm-room-primary-soft)]" : "border-transparent bg-sam-surface-muted/70"
            }`}
            aria-label={p.name}
            title={p.name}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.iconUrl} alt="" width={28} height={28} loading="lazy" className="h-7 w-7 object-contain" />
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
        {itemsBusy ? (
          <p className="py-6 text-center sam-text-body-secondary text-sam-muted">불러오는 중…</p>
        ) : !items?.length ? (
          <p className="py-6 text-center sam-text-body-secondary text-sam-muted">
            {activePackId === RECENT_PACK_ID ? "최근 사용한 스티커가 없습니다." : "스티커가 없습니다."}
          </p>
        ) : (
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-6">
            {items.map((it) => (
              <MessengerStickerLazyImage
                key={it.id}
                src={it.fileUrl}
                alt={it.keyword || "sticker"}
                onActivate={() => handlePick(it.fileUrl, it.id.startsWith("recent:") ? undefined : it.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
