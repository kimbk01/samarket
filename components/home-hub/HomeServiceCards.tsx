"use client";

import { ArrowLeftRight, Coins, Gift, Headset, Heart, LayoutGrid, MessagesSquare, Phone, Receipt, type LucideIcon } from "lucide-react";
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
import { homePressFromClick } from "@/lib/ui/home-press-feedback";

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
 * 서비스 입구 — 슈퍼앱 개편 (Owner 「제안대로 승인」 2026-11-26 · 설계 §1③, 이전 시안 R3 telRING 대표 칸 + 같은 크기 칸).
 * ③ 서비스 칸 = 보이는 서비스(어드민 순서) + 「환율 계산」 + 「전체」 — **모두 같은 크기**, 휴대폰 4열.
 * telRING 대표 칸은 ④ 자리로 옮겼다(`HomeTelringCard`) — 서비스 칸에는 telRING 도 같은 크기 칸으로 들어간다.
 */
export function HomeServiceCards({
  services,
  catalog,
  onOpen,
  onOpenRateCalc,
}: {
  services: HomeServiceCardConfig[];
  catalog: HomeCatalog;
  onOpen: (key: HomeMenuKey) => void;
  onOpenRateCalc: () => void;
}) {
  const { t, language } = useI18n();
  const visible = services.filter((s) => s.visible);
  if (visible.length === 0) return null;
  const title = (c: HomeServiceCardConfig) => pickHomeText(c.title, language) || t(HOME_MENU_CATALOG[c.key].labelKey);

  return (
    <section className="home-svc" data-home-services>
      <div className="home-svc-grid">
        {visible.map((c) => {
          const Icon = LINE_ICON[c.key];
          const desc = resolveServiceDescLines(c, catalog, language, t)[0] ?? "";
          return (
            <button
              key={c.key}
              type="button"
              onClick={(e) => {
                homePressFromClick("tap", e);
                onOpen(c.key);
              }}
              className="home-press home-svc-tile [-webkit-tap-highlight-color:transparent]"
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
          onClick={(e) => {
            homePressFromClick("tap", e);
            onOpenRateCalc();
          }}
          className="home-press home-svc-tile [-webkit-tap-highlight-color:transparent]"
          data-home-service="rate_calc"
        >
          <span className="home-svc-ic">
            <ArrowLeftRight className="h-[24px] w-[24px] text-sam-primary" strokeWidth={1.8} aria-hidden />
          </span>
          <span className="home-svc-name">{t("home_menu_rate_calc")}</span>
          <span className="home-svc-desc">{t("home_menu_desc_rate_calc")}</span>
        </button>
        <button
          type="button"
          onClick={(e) => {
            homePressFromClick("tap", e);
            onOpen("all");
          }}
          className="home-press home-svc-tile [-webkit-tap-highlight-color:transparent]"
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

/**
 * ④ telRING 칸 — 슈퍼앱 개편 설계 §1④. 최근 통화·대화 목록(P4, 통화 단독 단계)이 들어오기 전까지는
 * 지금의 telRING 대표 칸(채팅·통화 바로가기)을 이 자리에 그대로 둔다 (설계 §8 P1 「④ 자리에 그대로 둠」).
 * 비로그인 = 누르면 기존 로그인 안내(`messenger_open`).
 */
export function HomeTelringCard({
  config,
  catalog,
  onOpen,
  onOpenHref,
}: {
  config: HomeServiceCardConfig | null;
  catalog: HomeCatalog;
  onOpen: (key: HomeMenuKey) => void;
  onOpenHref: (key: HomeServiceKey, href: string) => void;
}) {
  const { t, language } = useI18n();
  const customTitle = config ? pickHomeText(config.title, language) : "";
  const desc = config ? resolveServiceDescLines(config, catalog, language, t)[0] ?? "" : t(HOME_MENU_CATALOG.chat.descKey);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        homePressFromClick("tap", e);
        onOpen("chat");
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen("chat");
      }}
      className="home-press home-ring [-webkit-tap-highlight-color:transparent]"
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
        {customTitle ? (
          <span className="block truncate text-[21px] font-extrabold leading-tight">{customTitle}</span>
        ) : (
          <TelRingWordmark />
        )}
        {desc ? <span className="mt-0.5 block truncate text-[12px] text-white/85">{desc}</span> : null}
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
              homePressFromClick("tap", e);
              onOpenHref("chat", href);
            }}
            className={`home-press home-ring-cta${kind === "chat" ? " home-ring-cta--chat" : ""}`}
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
