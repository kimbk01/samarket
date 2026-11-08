"use client";

import { Coins, Gift, Headset, Heart, MessageCircle, Newspaper, Receipt, Tag, type LucideIcon } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  HOME_MENU_CATALOG,
  pickHomeText,
  type HomeServiceCardConfig,
  type HomeServiceKey,
} from "@/lib/home/home-layout-contract";
import { homeCatalogName, type HomeCatalog } from "@/lib/home/home-catalog-types";

/** 그림을 올리지 않은 큰 카드의 선 그림 — 단색(색 칸 없음, Owner 2026-11-09 「아이콘 컬러 원하지 않음」) */
const LINE_ICON: Record<HomeServiceKey, LucideIcon> = {
  trade: Tag,
  stores: Receipt,
  philife: Newspaper,
  chat: MessageCircle,
  events: Gift,
  orders: Receipt,
  points: Coins,
  favorites: Heart,
  support: Headset,
};

/** 자동 설명 줄 — 거래 = 거래 카테고리 앞 4개(2줄), 배달 = 업종 앞 3개 + 「매장 주문」, 그 밖 = 기본 설명 */
export function resolveServiceDescLines(
  card: HomeServiceCardConfig,
  catalog: HomeCatalog,
  language: string,
  t: (k: import("@/lib/i18n/message-key").MessageKey) => string
): string[] {
  if (card.descMode === "custom") {
    const v = pickHomeText(card.desc, language);
    return v ? [v] : [];
  }
  const sep = " · ";
  if (card.key === "trade" && catalog.tradeCategories.length > 0) {
    const names = catalog.tradeCategories.slice(0, 4).map((c) => homeCatalogName(c, language));
    return [names.slice(0, 2).join(sep), names.slice(2, 4).join(sep)].filter(Boolean);
  }
  if (card.key === "stores" && catalog.storeCategories.length > 0) {
    const names = catalog.storeCategories.slice(0, 3).map((c) => homeCatalogName(c, language));
    return [names.join(sep), t("home_menu_desc_store_order")];
  }
  return [t(HOME_MENU_CATALOG[card.key].descKey)];
}

export function HomeServiceCards({
  services,
  catalog,
  chatUnread,
  isMember,
  onOpen,
}: {
  services: HomeServiceCardConfig[];
  catalog: HomeCatalog;
  chatUnread: number;
  isMember: boolean;
  onOpen: (key: HomeServiceKey) => void;
}) {
  const { t, language } = useI18n();
  const visible = services.filter((s) => s.visible);
  const large = visible.filter((s) => s.size === "large");
  const small = visible.filter((s) => s.size === "small");
  if (visible.length === 0) return null;

  const title = (c: HomeServiceCardConfig) => pickHomeText(c.title, language) || t(HOME_MENU_CATALOG[c.key].labelKey);
  const badgeOf = (c: HomeServiceCardConfig) => (c.showBadge && c.key === "chat" && isMember && chatUnread > 0 ? chatUnread : 0);
  const autoImage = (c: HomeServiceCardConfig): string | null => {
    if (c.imageUrl) return c.imageUrl;
    if (c.key === "stores") return catalog.storeCategories.find((x) => x.imageUrl)?.imageUrl ?? null;
    return null;
  };

  return (
    <section className="px-3" data-home-services>
      {large.length > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          {large.map((c) => {
            const img = autoImage(c);
            const Icon = LINE_ICON[c.key];
            const badge = badgeOf(c);
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => onOpen(c.key)}
                className="relative min-h-[112px] overflow-hidden rounded-ui-rect bg-white px-3.5 pb-3 pt-3.5 text-left shadow-[0_1px_3px_rgba(20,40,25,0.06)] transition-transform active:scale-[0.98]"
                data-home-service={c.key}
              >
                <span className="block text-[17px] font-bold tracking-[-0.02em] text-[#141a16]">{title(c)}</span>
                <span className="mt-1 block max-w-[72%] text-[13px] leading-[1.45] text-[#767676]">
                  {resolveServiceDescLines(c, catalog, language, t).map((line) => (
                    <span key={line} className="block truncate">
                      {line}
                    </span>
                  ))}
                </span>
                {img ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 어드민 업종·카드 그림
                  <img src={img} alt="" className="absolute bottom-1.5 right-2 object-contain" style={{ width: 50, height: 50 }} />
                ) : (
                  <Icon className="absolute bottom-3 right-3 h-9 w-9 text-[#2f4a35]" strokeWidth={1.5} aria-hidden />
                )}
                {badge > 0 ? <ServiceBadge n={badge} /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
      {small.length > 0 ? (
        <div className={`grid grid-cols-3 gap-2 ${large.length > 0 ? "mt-2" : ""}`}>
          {small.map((c) => {
            const badge = badgeOf(c);
            const desc = resolveServiceDescLines(c, catalog, language, t)[0] ?? "";
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => onOpen(c.key)}
                className="relative rounded-ui-rect bg-white px-3 py-3 text-left shadow-[0_1px_3px_rgba(20,40,25,0.06)] transition-transform active:scale-[0.98]"
                data-home-service={c.key}
              >
                <span className="block truncate text-[15px] font-semibold text-[#141a16]">{title(c)}</span>
                {desc ? <span className="mt-0.5 block truncate text-[12px] text-[#767676]">{desc}</span> : null}
                {badge > 0 ? <ServiceBadge n={badge} /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function ServiceBadge({ n }: { n: number }) {
  return (
    <span className="absolute right-2 top-2 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[#F03A2E] px-1 text-[11px] font-bold leading-none text-white tabular-nums">
      {n > 99 ? "99+" : n}
    </span>
  );
}
