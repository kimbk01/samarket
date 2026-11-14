"use client";

import { Coins, Gift, Headset, Heart, Receipt, type LucideIcon } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { serviceBrandIconSlot, type ServiceBrandIconSlotProps } from "@/components/brand/ServiceBrandIcon";
import {
  HOME_MENU_CATALOG,
  pickHomeText,
  type HomeServiceCardConfig,
  type HomeServiceKey,
} from "@/lib/home/home-layout-contract";
import { homeCatalogName, type HomeCatalog } from "@/lib/home/home-catalog-types";
import { DIBAY_SERVICE_BRAND } from "@/lib/brand/dibay-service-brand";

/** 그림을 올리지 않은 큰 카드의 선 그림 — 단색(색 칸 없음, Owner 2026-11-09 「아이콘 컬러 원하지 않음」) */
const LINE_ICON: Record<HomeServiceKey, LucideIcon | ((p: ServiceBrandIconSlotProps) => React.JSX.Element)> = {
  /** 서비스 4개 = 브랜드 대표 아이콘 (Owner 2026-11-13) — 기능(주문·포인트 등)은 선 아이콘 그대로 */
  trade: serviceBrandIconSlot("MARKET"),
  stores: serviceBrandIconSlot("DIPICK"),
  philife: serviceBrandIconSlot("FEED"),
  moim: serviceBrandIconSlot("CREW"),
  chat: serviceBrandIconSlot("LETARING"),
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

const PRESS =
  "transition-[transform,background-color,box-shadow,opacity] duration-100 ease-out [-webkit-tap-highlight-color:transparent] active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100";

/**
 * 서비스 입구 — 홈 시안 v4 (Owner 「이 시안으로 진행」 2026-11-14 · 「중요한 도메인이 telRING」).
 * ① telRING(chat) = 맨 위 대표 칸(초록 바탕 · 워드마크 tel + 굵은 RING · 채팅·통화 바로가기)
 * ② 큰 칸(size large) 2열 ③ 작은 칸(size small) = 동그란 아이콘 줄.
 * 홈에는 개인 숫자를 두지 않는다(안 읽음 = 하단 탭 배지만) — 지역이 같으면 모두 같은 화면.
 * 누름 효과 (Owner 2026-11-09): 누르는 동안 살짝 작아짐(0.97) · 「동작 줄이기」면 크기 변화 없음.
 */
export function HomeServiceCards({
  services,
  catalog,
  onOpen,
  onOpenHref,
}: {
  services: HomeServiceCardConfig[];
  catalog: HomeCatalog;
  onOpen: (key: HomeServiceKey) => void;
  /** telRING 대표 칸의 채팅·통화 바로가기 — 비로그인 안내는 부르는 쪽(`openMenu`)과 같은 규칙 */
  onOpenHref: (key: HomeServiceKey, href: string) => void;
}) {
  const { t, language } = useI18n();
  const visible = services.filter((s) => s.visible);
  if (visible.length === 0) return null;
  const hero = visible.find((s) => s.key === "chat") ?? null;
  const rest = visible.filter((s) => s.key !== "chat");
  const large = rest.filter((s) => s.size === "large");
  const small = rest.filter((s) => s.size === "small");

  const title = (c: HomeServiceCardConfig) => pickHomeText(c.title, language) || t(HOME_MENU_CATALOG[c.key].labelKey);
  const autoImage = (c: HomeServiceCardConfig): string | null => {
    if (c.imageUrl) return c.imageUrl;
    if (c.key === "stores") return catalog.storeCategories.find((x) => x.imageUrl)?.imageUrl ?? null;
    return null;
  };
  const heroCustomTitle = hero ? pickHomeText(hero.title, language) : "";
  const heroDesc = hero ? resolveServiceDescLines(hero, catalog, language, t)[0] ?? "" : "";

  return (
    <section className="bg-white px-3 pb-4 pt-3" data-home-services>
      {hero ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => onOpen("chat")}
          onKeyDown={(e) => {
            if (e.key === "Enter") onOpen("chat");
          }}
          className={`relative flex items-center gap-3 overflow-hidden rounded-ui-rect bg-sam-primary px-3.5 py-3.5 text-white ${PRESS} active:opacity-90`}
          data-home-service="chat"
          data-home-telring-hero
        >
          <span aria-hidden className="pointer-events-none absolute -right-8 -top-8 h-[120px] w-[120px] rounded-full bg-[#E0A800]/20" />
          <span className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-full bg-white">
            {(() => {
              const Icon = LINE_ICON.chat;
              return <Icon className="h-[26px] w-[26px] text-sam-primary" aria-hidden />;
            })()}
          </span>
          <span className="min-w-0 flex-1">
            {heroCustomTitle ? (
              <span className="block truncate text-[22px] font-extrabold leading-tight">{heroCustomTitle}</span>
            ) : (
              <TelRingWordmark />
            )}
            {heroDesc ? <span className="mt-0.5 block truncate text-[12px] text-white/90">{heroDesc}</span> : null}
          </span>
          <span className="relative z-[1] flex shrink-0 items-center gap-1.5">
            {(
              [
                ["home_telring_chat", "/community-messenger?section=chats"],
                ["home_telring_call", "/community-messenger?section=call_logs"],
              ] as const
            ).map(([k, href]) => {
              const btn = (
                <button
                  key={k}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenHref("chat", href);
                  }}
                  className={`relative rounded-full bg-white px-3 py-1.5 text-[12.5px] font-bold text-sam-primary ${PRESS}`}
                  data-home-telring-cta={k === "home_telring_chat" ? "chat" : "call"}
                >
                  {t(k)}
                </button>
              );
              // 「채팅」 = 흐르는 그라데이션 테두리 + 퍼지는 빛 (Owner 2026-11-14 「누르고 싶은 충동이 생기게」) · 동작 줄이기면 멈춤
              return k === "home_telring_chat" ? (
                <span key={k} className="home-telring-cta-glow">
                  {btn}
                </span>
              ) : (
                btn
              );
            })}
          </span>
        </div>
      ) : null}
      {large.length > 0 ? (
        <div className={`grid grid-cols-2 gap-2 ${hero ? "mt-2" : ""}`}>
          {large.map((c) => {
            const img = autoImage(c);
            const Icon = LINE_ICON[c.key];
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => onOpen(c.key)}
                className={`relative min-h-[100px] overflow-hidden rounded-ui-rect bg-sam-primary-soft px-3.5 pb-3 pt-3.5 text-left ${PRESS}`}
                data-home-service={c.key}
              >
                <span className="block text-[17px] font-bold tracking-[-0.02em] text-[#141a16]">{title(c)}</span>
                <span className="mt-1 block max-w-[72%] text-[12.5px] leading-[1.45] text-[#5f6661]">
                  {resolveServiceDescLines(c, catalog, language, t).map((line) => (
                    <span key={line} className="block truncate">
                      {line}
                    </span>
                  ))}
                </span>
                {img ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 어드민 업종·카드 그림
                  <img src={img} alt="" className="absolute bottom-1.5 right-2 object-contain" style={{ width: 46, height: 46 }} />
                ) : (
                  <Icon className="absolute bottom-3 right-3 h-8 w-8 text-sam-primary" strokeWidth={1.5} aria-hidden />
                )}
              </button>
            );
          })}
        </div>
      ) : null}
      {small.length > 0 ? (
        <div
          className="mt-3 grid"
          style={{ gridTemplateColumns: `repeat(${Math.min(small.length, 5)}, minmax(0, 1fr))` }}
        >
          {small.map((c) => {
            const Icon = LINE_ICON[c.key];
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => onOpen(c.key)}
                className={`flex flex-col items-center gap-1.5 py-1 text-[12px] font-semibold text-[#333] ${PRESS}`}
                data-home-service={c.key}
              >
                <span className="grid h-11 w-11 place-items-center rounded-full bg-[#F1F3F0]">
                  <Icon className="h-[22px] w-[22px] text-sam-primary" strokeWidth={1.8} aria-hidden />
                </span>
                <span className="max-w-full truncate">{title(c)}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

/** telRING 워드마크 — tel 보통 · RING 굵게 노랑 (시안 v4). 브랜드 표시값은 SSOT 상수 그대로 나눠 그린다. */
function TelRingWordmark() {
  const name = DIBAY_SERVICE_BRAND.LETARING;
  const i = name.indexOf("RING");
  return (
    <span className="block text-[22px] leading-tight tracking-[-0.01em]" aria-label={name}>
      {i > 0 ? (
        <>
          <span className="font-medium">{name.slice(0, i)}</span>
          <span className="font-extrabold text-[#FFD23F]">{name.slice(i)}</span>
        </>
      ) : (
        <span className="font-extrabold">{name}</span>
      )}
    </span>
  );
}
