"use client";

import { Coins, Gift, Headset, Heart, LayoutGrid, MessagesSquare, Phone, Receipt, type LucideIcon } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { serviceBrandIconSlot, type ServiceBrandIconSlotProps } from "@/components/brand/ServiceBrandIcon";
import {
  HOME_MENU_CATALOG,
  pickHomeText,
  type HomeMenuKey,
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


/**
 * 서비스 입구 — 시안 R3 (Owner 「계획대로 진행」 2026-11-18 · 계획서 B3, 이전 v4 큰 칸/작은 칸 대체).
 * ① telRING(chat) = 대표 칸(초록 바탕 · 워드마크 · 채팅·통화 바로가기) ② 그 밖 보이는 서비스 + 「전체」 = **같은 크기 칸**.
 * 칸 수: 휴대폰 3열 · 태블릿 6열 · PC(배너 옆) 3열 — `app/home-hub.css` `.home-svc-grid`.
 * 홈에는 개인 숫자를 두지 않는다(안 읽음 = 하단 탭 배지만).
 */
export function HomeServiceCards({
  services,
  catalog,
  onOpen,
  onOpenHref,
}: {
  services: HomeServiceCardConfig[];
  catalog: HomeCatalog;
  onOpen: (key: HomeMenuKey) => void;
  /** telRING 대표 칸의 채팅·통화 바로가기 — 비로그인 안내는 부르는 쪽(`openMenu`)과 같은 규칙 */
  onOpenHref: (key: HomeServiceKey, href: string) => void;
}) {
  const { t, language } = useI18n();
  const visible = services.filter((s) => s.visible);
  if (visible.length === 0) return null;
  const hero = visible.find((s) => s.key === "chat") ?? null;
  const rest = visible.filter((s) => s.key !== "chat");

  const title = (c: HomeServiceCardConfig) => pickHomeText(c.title, language) || t(HOME_MENU_CATALOG[c.key].labelKey);
  const heroCustomTitle = hero ? pickHomeText(hero.title, language) : "";
  const heroDesc = hero ? resolveServiceDescLines(hero, catalog, language, t)[0] ?? "" : "";

  return (
    <section className="home-svc" data-home-services>
      {hero ? (
        /* telRING 대표 칸 — 시안 R4 수정안 #4: 낮은 초록 카드 · 반투명 원 아이콘 · 노란 「채팅」 + 흰 「통화」(아이콘+글자) */
        <div
          role="button"
          tabIndex={0}
          onClick={() => onOpen("chat")}
          onKeyDown={(e) => {
            if (e.key === "Enter") onOpen("chat");
          }}
          className="home-ring [-webkit-tap-highlight-color:transparent]"
          data-home-service="chat"
          data-home-telring-hero
        >
          <span className="home-ring-badge" aria-hidden>
            {(() => {
              const Icon = LINE_ICON.chat;
              return <Icon className="h-[26px] w-[26px] text-white" aria-hidden />;
            })()}
          </span>
          <span className="relative min-w-0 flex-1">
            {heroCustomTitle ? (
              <span className="block truncate text-[21px] font-extrabold leading-tight">{heroCustomTitle}</span>
            ) : (
              <TelRingWordmark />
            )}
            {heroDesc ? <span className="mt-0.5 block truncate text-[12px] text-white/85">{heroDesc}</span> : null}
          </span>
          <span className="relative z-[1] flex shrink-0 items-center gap-1.5">
            {(
              [
                ["home_telring_chat", "/community-messenger?section=chats", "chat"],
                ["home_telring_call", "/community-messenger?section=call_logs", "call"],
              ] as const
            ).map(([k, href, kind]) => (
              <button
                key={k}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenHref("chat", href);
                }}
                className={`home-ring-cta${kind === "chat" ? " home-ring-cta--chat" : ""}`}
                data-home-telring-cta={kind}
              >
                {kind === "chat" ? (
                  <MessagesSquare className="h-[15px] w-[15px]" strokeWidth={2.2} aria-hidden />
                ) : (
                  <Phone className="h-[15px] w-[15px]" strokeWidth={2.4} aria-hidden />
                )}
                {t(k)}
              </button>
            ))}
          </span>
        </div>
      ) : null}
      <div className="home-svc-grid">
        {rest.map((c) => {
          const Icon = LINE_ICON[c.key];
          const desc = resolveServiceDescLines(c, catalog, language, t)[0] ?? "";
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => onOpen(c.key)}
              className="home-svc-tile [-webkit-tap-highlight-color:transparent]"
              data-home-service={c.key}
            >
              <span className="home-svc-ic">
                <Icon className="h-[24px] w-[24px] text-sam-primary" strokeWidth={1.8} aria-hidden />
              </span>
              <span className="home-svc-name">{title(c)}</span>
              {desc ? <span className="home-svc-desc">{desc}</span> : null}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => onOpen("all")}
          className="home-svc-tile [-webkit-tap-highlight-color:transparent]"
          data-home-service="all"
        >
          <span className="home-svc-ic">
            <LayoutGrid className="h-[24px] w-[24px] text-sam-primary" strokeWidth={1.8} aria-hidden />
          </span>
          <span className="home-svc-name">{t(HOME_MENU_CATALOG.all.labelKey)}</span>
          <span className="home-svc-desc">{t(HOME_MENU_CATALOG.all.descKey)}</span>
        </button>
      </div>
    </section>
  );
}

/** telRING 워드마크 — tel 보통 · RING 굵게 노랑 (시안 v4). 브랜드 표시값은 SSOT 상수 그대로 나눠 그린다. */
function TelRingWordmark() {
  const name = DIBAY_SERVICE_BRAND.LETARING;
  const i = name.indexOf("RING");
  return (
    <span className="block text-[21px] leading-tight tracking-[-0.01em]" aria-label={name}>
      {i > 0 ? (
        <>
          <span className="font-medium">{name.slice(0, i)}</span>
          <span className="font-black text-[#FFC933]">{name.slice(i)}</span>
        </>
      ) : (
        <span className="font-extrabold">{name}</span>
      )}
    </span>
  );
}
