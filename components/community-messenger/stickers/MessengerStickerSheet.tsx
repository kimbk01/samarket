"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { StickerItemDto, StickerPackDto } from "@/lib/stickers/sticker-dto";
import { readRecentStickerUrls } from "@/lib/stickers/recent-stickers-client";
import { MessengerStickerLazyImage } from "@/components/community-messenger/stickers/MessengerStickerLazyImage";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

const RECENT_PACK_ID = "__recent__";

/**
 * Sticker picker panel — hosted inside CM room sheet shell (already overlay-backed).
 * Uses OverlayUi tokens; do not wrap DibayBottomSheet (would double-portal).
 */
export function MessengerStickerSheet({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (fileUrl: string, stickerItemId?: string) => void;
}) {
  const { t } = useI18n();
  const [packs, setPacks] = useState<StickerPackDto[] | null>(null);
  const [packErr, setPackErr] = useState<string | null>(null);
  const [activePackId, setActivePackId] = useState<string | null>(null);
  const [items, setItems] = useState<StickerItemDto[] | null>(null);
  const [itemsBusy, setItemsBusy] = useState(false);
  const [brokenSrc, setBrokenSrc] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!open) return;
    setActivePackId(RECENT_PACK_ID);
    setBrokenSrc(new Set());
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
          setPackErr(t("cm_ui_sticker_load_failed"));
          setPacks((prev) => (Array.isArray(prev) && prev.length === 0 ? prev : []));
        }
      } catch {
        if (!cancelled) {
          setPackErr(t("cm_ui_sticker_load_failed"));
          setPacks((prev) => (Array.isArray(prev) && prev.length === 0 ? prev : []));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, t]);

  useEffect(() => {
    if (!open || !activePackId) return;
    setBrokenSrc(new Set());
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
      name: t("cm_ui_recent"),
      iconUrl: recentUrls[0] ?? "/stickers/packs/basic/1f600.webp",
      sortOrder: -1,
    };
    return [recentPack, ...(packs ?? [])];
  }, [packs, t]);

  const handlePick = useCallback(
    (fileUrl: string, stickerItemId?: string) => {
      onPick(fileUrl, stickerItemId);
    },
    [onPick]
  );

  const markBroken = useCallback((src: string) => {
    setBrokenSrc((prev) => {
      const next = new Set(prev);
      next.add(src);
      return next;
    });
  }, []);

  const allItemsBroken =
    Boolean(items?.length) && !itemsBusy && brokenSrc.size >= (items?.length ?? 0);

  if (!open) return null;

  return (
    <div
      className="flex max-h-[min(52dvh,420px)] min-h-0 w-full flex-col overflow-hidden rounded-t-[length:var(--overlay-radius-xl)] bg-[color:var(--overlay-surface)]"
      role="dialog"
      aria-modal="true"
      aria-label={t("cm_ui_sticker")}
      data-dibay-overlay="messenger-sticker-panel"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-[color:var(--overlay-border)] px-3 py-2">
        <span className={`${OverlayUi.title} ${OverlayUi.titleSheet} !text-left`}>{t("cm_ui_sticker")}</span>
        <button
          type="button"
          className="rounded-[length:var(--overlay-radius-sm)] px-2 py-1 text-[color:var(--overlay-text-secondary)] hover:bg-[color:var(--overlay-secondary)]"
          onClick={onClose}
        >
          {t("nav_close")}
        </button>
      </div>
      {packErr ? <p className={`px-3 py-2 ${OverlayUi.caption} text-[color:var(--overlay-danger)]`}>{packErr}</p> : null}
      {allItemsBroken ? (
        <p className={`px-3 py-2 ${OverlayUi.caption} text-[color:var(--overlay-danger)]`}>
          {t("cm_ui_sticker_assets_missing")}
        </p>
      ) : null}
      <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-[color:var(--overlay-border)] px-2 py-2">
        {packRow.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setActivePackId(p.id)}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 transition ${
              activePackId === p.id
                ? "border-[color:var(--overlay-primary)] bg-[color:var(--overlay-secondary)]"
                : "border-transparent bg-[color:var(--overlay-secondary)]"
            }`}
            aria-label={p.name}
            title={p.name}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.iconUrl} alt="" width={28} height={28} loading="lazy" className="h-7 w-7 object-contain" />
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-[max(0.75rem,var(--safe-bottom))] pt-2">
        {itemsBusy ? (
          <p className={`py-6 text-center ${OverlayUi.caption}`}>{t("common_loading")}</p>
        ) : !items?.length ? (
          <p className={`py-6 text-center ${OverlayUi.caption}`}>
            {activePackId === RECENT_PACK_ID ? t("cm_ui_no_recent_stickers") : t("cm_ui_no_stickers")}
          </p>
        ) : allItemsBroken ? null : (
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-6">
            {items.map((it) => (
              <MessengerStickerLazyImage
                key={it.id}
                src={it.fileUrl}
                alt={it.keyword || "sticker"}
                onBroken={markBroken}
                onActivate={() => handlePick(it.fileUrl, it.id.startsWith("recent:") ? undefined : it.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
