"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { useState } from "react";
import type { StoreNoticePublicRow } from "@/lib/stores/store-banners-notices-public";
import { parseNoticeImages } from "@/lib/stores/store-banners-notices-public";

function previewOneLine(body: string): string {
  const t = body.replace(/\s+/g, " ").trim();
  if (t.length <= 72) return t;
  return `${t.slice(0, 72)}…`;
}

export function StoreOwnerNoticeCards({
  notices,
  infoHrefBase,
}: {
  notices: StoreNoticePublicRow[];
  infoHrefBase: string;
}) {
  const { t } = useI18n();
  const [openId, setOpenId] = useState<string | null>(null);
  if (!notices.length) return null;

  return (
    <ul className="flex flex-col gap-2">
      {notices.map((n) => {
        const imgs = parseNoticeImages(n.images_json);
        const open = openId === n.id;
        return (
          <li
            key={n.id}
            id={`store-notice-${n.id}`}
            className="rounded-[14px] border border-neutral-200 bg-white/95 px-3 py-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
          >
            <button
              type="button"
              className="flex w-full min-w-0 items-start gap-2 text-left"
              onClick={() => setOpenId(open ? null : n.id)}
              aria-expanded={open}
            >
              <span className="mt-0.5 text-[16px]" aria-hidden>
                📣
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-bold text-neutral-900">{n.title}</span>
                <span className="mt-0.5 block text-[13px] text-neutral-600">{previewOneLine(n.body)}</span>
              </span>
              <span className="shrink-0 text-[12px] font-semibold text-neutral-400">
                {open ? t("common_close") : t("store_show_more")}
              </span>
            </button>
            {open ? (
              <div className="mt-2 border-t border-neutral-100 pt-2">
                {imgs.length ? (
                  <div className="mb-2 flex gap-2 overflow-x-auto">
                    {imgs.map((u) => (
                      <img
                        key={u}
                        src={u}
                        alt=""
                        className="h-20 w-28 shrink-0 rounded-[10px] object-cover"
                        loading="lazy"
                      />
                    ))}
                  </div>
                ) : null}
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-neutral-800">{n.body}</p>
                <a
                  href={`${infoHrefBase}#store-notice-${encodeURIComponent(n.id)}`}
                  className="mt-2 inline-block text-[12px] font-semibold text-[#1C8DB8] underline-offset-2 hover:underline"
                >
                  {t("store_info_title")}
                </a>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
