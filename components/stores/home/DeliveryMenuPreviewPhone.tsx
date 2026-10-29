"use client";

/**
 * 어드민 「메뉴 관리」 앱 미리보기 — 고객 배달 홈·메뉴 페이지와 같은 모양(배민 미러링 실측값)을 휴대폰 틀에 그린다.
 * 미리보기의 탭·아이콘·대표 카드·바로가기 줄·페이지 탭·매장 목록을 누르면 `onPick` 으로 편집 대상을 알린다.
 * 고객 화면 부품 폴더에 두는 이유: 고객 앱 모양(색·크기)을 그대로 재현하는 앱 UI 이기 때문 (관리자 표준 래칫 대상 밖).
 */

import { DeliveryMediaImage } from "@/components/dibay/DeliveryMediaImage";
import { DELIVERY_MENU_ICON_BG, DeliveryMenuGlyph, DeliveryMenuGlyphOrInitial } from "@/components/stores/home/DeliveryMenuGlyph";

export type DeliveryMenuPreviewItem = {
  id: string;
  slug: string;
  parentId: string | null;
  nameKo: string;
  iconUrl: string | null;
  sortOrder: number;
  homeSortOrder: number;
  showOnHome: boolean;
  showInPageTab: boolean;
  isActive: boolean;
  linkTarget: string | null;
  pickupOnly: boolean;
  badgeText: string | null;
  feature: { title: string; imageUrl: string | null; bg: string | null } | null;
  /** 2단 매장 수 (고객에게 보이는 매장) */
  storeCount: number;
};

export type DeliveryMenuPreviewStore = { id: string; name: string; imageUrl: string | null; caption?: string | null };

export type DeliveryMenuPreviewPick =
  | { kind: "root"; id: string }
  | { kind: "add-root" }
  | { kind: "menu"; id: string }
  | { kind: "add-menu"; rootId: string }
  | { kind: "feature"; rootId: string }
  | { kind: "shortcuts"; rootId: string }
  | { kind: "stores"; id: string };

export type DeliveryMenuPreviewScreen = { kind: "home"; rootId: string | null } | { kind: "page"; rootId: string; menuId: string | null };

const GOLD = "#EAC784";
const GREEN = "#0B421A";
const BROWN = "#362415";
const MUTED = "#7E8082";
const TOP_MUTED = "#B1B3B5";
const DIVIDER = "#E4E6E8";
const BAND = "#F3F5F7";
const SELECT = "#1F6FFF";

function sel(on: boolean): string {
  return on ? "outline outline-2 outline-offset-2 outline-[#1F6FFF] rounded-[8px]" : "";
}

function Tile({ slug, label, iconUrl, dim }: { slug: string; label: string; iconUrl: string | null; dim?: boolean }) {
  return (
    <span className={`flex min-w-0 flex-col items-center gap-[4px] ${dim ? "opacity-35" : ""}`}>
      <span
        className="relative flex h-[40px] w-[40px] items-center justify-center overflow-hidden rounded-[11px]"
        style={{ background: iconUrl ? BAND : DELIVERY_MENU_ICON_BG }}
      >
        {iconUrl ?
          <DeliveryMediaImage src={iconUrl} alt="" fill sizes="40px" className="object-contain p-[3px]" />
        : <DeliveryMenuGlyphOrInitial slug={slug} label={label} />}
      </span>
      <span className="w-full truncate text-center text-[11px]" style={{ color: BROWN }}>{label}</span>
    </span>
  );
}

function AddTile({ label }: { label: string }) {
  return (
    <span className="flex min-w-0 flex-col items-center gap-[4px]" style={{ color: SELECT }}>
      <span className="flex h-[40px] w-[40px] items-center justify-center rounded-[11px] border border-dashed text-[18px]" style={{ borderColor: SELECT }}>
        +
      </span>
      <span className="w-full truncate text-center text-[11px]">{label}</span>
    </span>
  );
}

export function DeliveryMenuPreviewPhone({
  items,
  screen,
  picked,
  shortcutsByRoot,
  storesByMenu,
  onPick,
  onScreen,
}: {
  items: DeliveryMenuPreviewItem[];
  screen: DeliveryMenuPreviewScreen;
  picked: DeliveryMenuPreviewPick | null;
  shortcutsByRoot: Record<string, DeliveryMenuPreviewStore[]>;
  storesByMenu: Record<string, DeliveryMenuPreviewStore[]>;
  onPick: (p: DeliveryMenuPreviewPick) => void;
  onScreen: (s: DeliveryMenuPreviewScreen) => void;
}) {
  const roots = items.filter((m) => m.parentId == null).sort((a, b) => a.sortOrder - b.sortOrder);
  const rootId = screen.rootId ?? roots[0]?.id ?? null;
  const root = roots.find((r) => r.id === rootId) ?? null;
  const children = items.filter((m) => m.parentId === rootId);
  const isPicked = (p: DeliveryMenuPreviewPick) => JSON.stringify(p) === JSON.stringify(picked);

  return (
    <div
      className="w-[320px] shrink-0 overflow-hidden rounded-[28px] border-[8px] bg-white"
      style={{ borderColor: "#222222" }}
      data-delivery-menu-preview={screen.kind}
    >
      <div className="flex h-[20px] items-center px-3 text-[10px]" style={{ color: BROWN }}>
        9:41
      </div>
      {screen.kind === "home" ?
        <div className="max-h-[600px] overflow-y-auto">
          <div className="flex h-[44px] items-center justify-between px-3">
            <span className="text-[15px] font-bold" style={{ color: BROWN }}>913 Ongpin St ▾</span>
            <span className="text-[14px]" style={{ color: BROWN }}>🔔 🛒</span>
          </div>
          <div className="mx-3 mb-2 flex h-[38px] items-center justify-between rounded-full border-[1.5px] px-3 text-[12px]" style={{ borderColor: GREEN, color: MUTED }}>
            매장·메뉴 검색 <span style={{ color: BROWN }}>🔍</span>
          </div>
          <div className="flex items-end gap-[12px] overflow-x-auto border-b px-3 pt-[12px] [scrollbar-width:none]" style={{ borderColor: DIVIDER }}>
            {roots.map((r) => {
              const on = r.id === rootId;
              return (
                <button
                  key={r.id}
                  type="button"
                  className={`relative shrink-0 pb-[6px] text-[14px] font-bold ${sel(isPicked({ kind: "root", id: r.id }))} ${r.isActive ? "" : "line-through opacity-50"}`}
                  style={{ color: on ? BROWN : TOP_MUTED }}
                  onClick={() => {
                    onScreen({ kind: "home", rootId: r.id });
                    onPick({ kind: "root", id: r.id });
                  }}
                >
                  {r.badgeText ?
                    <span className="absolute -top-[10px] left-0 whitespace-nowrap text-[9px] font-bold" style={{ color: "#D45252" }}>
                      {r.badgeText}
                    </span>
                  : null}
                  {r.nameKo}
                  {on ? <span className="absolute inset-x-0 bottom-0 h-[3px]" style={{ background: GREEN }} /> : null}
                </button>
              );
            })}
            <button
              type="button"
              className={`mb-[6px] shrink-0 rounded-[4px] border border-dashed px-1 text-[10px] ${sel(isPicked({ kind: "add-root" }))}`}
              style={{ color: SELECT, borderColor: SELECT }}
              onClick={() => onPick({ kind: "add-root" })}
            >
              + 탭
            </button>
          </div>
          {root ?
            <>
              <div className={`${root.feature ? "grid grid-cols-[78px_minmax(0,1fr)] gap-2" : ""} px-2 py-3`}>
                {root.feature ?
                  <button
                    type="button"
                    className={`flex h-[104px] flex-col justify-between overflow-hidden rounded-[9px] p-2 text-left ${sel(isPicked({ kind: "feature", rootId: root.id }))}`}
                    style={{ background: root.feature.bg ?? GOLD }}
                    onClick={() => onPick({ kind: "feature", rootId: root.id })}
                  >
                    <span className="text-[11px] font-extrabold leading-snug" style={{ color: BROWN }}>{root.feature.title}</span>
                    {root.feature.imageUrl ?
                      <span className="relative ml-auto h-[34px] w-[34px]">
                        <DeliveryMediaImage src={root.feature.imageUrl} alt="" fill sizes="34px" className="object-contain" />
                      </span>
                    : null}
                  </button>
                : null}
                <div className={`grid ${root.feature ? "grid-cols-4" : "grid-cols-5"} gap-x-1 gap-y-3`}>
                  {children
                    .filter((m) => m.showOnHome)
                    .sort((a, b) => a.homeSortOrder - b.homeSortOrder)
                    .map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className={sel(isPicked({ kind: "menu", id: m.id }))}
                        onClick={() => onPick({ kind: "menu", id: m.id })}
                      >
                        <Tile slug={m.slug} label={m.nameKo} iconUrl={m.iconUrl} dim={!m.isActive || (!m.linkTarget && m.storeCount === 0)} />
                      </button>
                    ))}
                  <button
                    type="button"
                    onClick={() => {
                      if (children.some((m) => !m.linkTarget)) onScreen({ kind: "page", rootId: root.id, menuId: null });
                    }}
                  >
                    <span className="flex min-w-0 flex-col items-center gap-[4px]">
                      <span className="flex h-[40px] w-[40px] items-center justify-center rounded-[11px]" style={{ background: DELIVERY_MENU_ICON_BG }}>
                        <DeliveryMenuGlyph slug="__more" />
                      </span>
                      <span className="text-[11px]" style={{ color: BROWN }}>더보기</span>
                    </span>
                  </button>
                  <button type="button" className={sel(isPicked({ kind: "add-menu", rootId: root.id }))} onClick={() => onPick({ kind: "add-menu", rootId: root.id })}>
                    <AddTile label="+ 메뉴" />
                  </button>
                </div>
              </div>
              <button
                type="button"
                className={`flex w-full gap-2 overflow-x-auto border-t px-3 py-2 text-left ${sel(isPicked({ kind: "shortcuts", rootId: root.id }))}`}
                style={{ borderColor: DIVIDER }}
                onClick={() => onPick({ kind: "shortcuts", rootId: root.id })}
              >
                {(shortcutsByRoot[root.id] ?? []).map((s) => (
                  <span key={s.id} className="flex w-[48px] shrink-0 flex-col items-center gap-[2px]">
                    <span className="relative h-[42px] w-[42px] overflow-hidden rounded-[10px] border" style={{ borderColor: DIVIDER, background: BAND }}>
                      {s.imageUrl ? <DeliveryMediaImage src={s.imageUrl} alt="" fill sizes="42px" className="object-cover" /> : null}
                    </span>
                    <span className="w-full truncate text-center text-[9px]" style={{ color: BROWN }}>{s.name}</span>
                    {s.caption ? <span className="w-full truncate text-center text-[9px] font-bold" style={{ color: "#D45252" }}>{s.caption}</span> : null}
                  </span>
                ))}
                <span className="flex w-[48px] shrink-0 flex-col items-center gap-[2px]" style={{ color: SELECT }}>
                  <span className="flex h-[42px] w-[42px] items-center justify-center rounded-[10px] border border-dashed text-[16px]" style={{ borderColor: SELECT }}>
                    +
                  </span>
                  <span className="text-[9px]">+ 매장</span>
                </span>
              </button>
              <div className="h-2 w-full" style={{ background: BAND }} />
              <div className="mx-3 my-3 flex h-[64px] items-center justify-center rounded-[8px] text-[11px]" style={{ background: BAND, color: MUTED }}>
                배너 · 선반 (배달 화면 구성)
              </div>
            </>
          : <div className="px-3 py-10 text-center text-[12px]" style={{ color: MUTED }}>상단 탭이 없습니다 — 「+ 탭」</div>}
        </div>
      : <PagePreview
          root={root}
          menus={children}
          menuId={screen.menuId}
          storesByMenu={storesByMenu}
          picked={picked}
          isPicked={isPicked}
          onPick={onPick}
          onScreen={onScreen}
        />}
      <div className="flex justify-around border-t py-1 text-[9px]" style={{ borderColor: DIVIDER, color: MUTED }}>
        <span>커뮤니티</span>
        <span>거래</span>
        <b style={{ color: GREEN }}>배달</b>
        <span>채팅</span>
        <span>내정보</span>
      </div>
    </div>
  );
}

function PagePreview({
  root,
  menus,
  menuId,
  storesByMenu,
  isPicked,
  onPick,
  onScreen,
}: {
  root: DeliveryMenuPreviewItem | null;
  menus: DeliveryMenuPreviewItem[];
  menuId: string | null;
  storesByMenu: Record<string, DeliveryMenuPreviewStore[]>;
  picked: DeliveryMenuPreviewPick | null;
  isPicked: (p: DeliveryMenuPreviewPick) => boolean;
  onPick: (p: DeliveryMenuPreviewPick) => void;
  onScreen: (s: DeliveryMenuPreviewScreen) => void;
}) {
  if (!root) return <div className="h-[560px]" />;
  const tabs = menus.filter((m) => m.showInPageTab && !m.linkTarget).sort((a, b) => a.sortOrder - b.sortOrder);
  const current = tabs.find((m) => m.id === menuId) ?? null;
  const stores = current
    ? (storesByMenu[current.id] ?? [])
    : tabs.flatMap((m) => storesByMenu[m.id] ?? []).filter((s, i, arr) => arr.findIndex((x) => x.id === s.id) === i);
  return (
    <div className="h-[600px] overflow-y-auto">
      <div className="flex h-[48px] items-center gap-2 px-3">
        <button type="button" className="text-[16px]" style={{ color: BROWN }} onClick={() => onScreen({ kind: "home", rootId: root.id })}>
          ←
        </button>
        <span className="flex-1 truncate text-[17px] font-extrabold" style={{ color: BROWN }}>{root.nameKo}</span>
        <span className="text-[13px]" style={{ color: BROWN }}>🔍 🛒</span>
      </div>
      <div className="px-3 pb-1 text-[12px]" style={{ color: BROWN }}>913 Ongpin St ▾</div>
      <div className="flex overflow-x-auto border-b [scrollbar-width:none]" style={{ borderColor: DIVIDER }}>
        <button
          type="button"
          className="relative h-[36px] shrink-0 px-[9px] text-[13px]"
          style={{ color: current ? MUTED : BROWN, fontWeight: current ? 400 : 700 }}
          onClick={() => onScreen({ kind: "page", rootId: root.id, menuId: null })}
        >
          홈
          {!current ? <span className="absolute inset-x-[9px] bottom-0 h-[2px]" style={{ background: GREEN }} /> : null}
        </button>
        {tabs.map((m) => {
          const on = current?.id === m.id;
          return (
            <button
              key={m.id}
              type="button"
              className={`relative h-[36px] shrink-0 px-[9px] text-[13px] ${sel(isPicked({ kind: "menu", id: m.id }))}`}
              style={{ color: on ? BROWN : MUTED, fontWeight: on ? 700 : 400 }}
              onClick={() => {
                onScreen({ kind: "page", rootId: root.id, menuId: m.id });
                onPick({ kind: "menu", id: m.id });
              }}
            >
              {m.nameKo}
              {on ? <span className="absolute inset-x-[9px] bottom-0 h-[2px]" style={{ background: GREEN }} /> : null}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2 overflow-hidden border-b px-3 py-2" style={{ borderColor: DIVIDER }}>
        {["⇅ 기본순", "⚡ 할인·쿠폰", root.pickupOnly ? null : "배달방식 ⌄", "★ 별점 ⌄"].filter(Boolean).map((c) => (
          <span key={c} className="shrink-0 rounded-full border-[1.5px] px-2 py-1 text-[11px]" style={{ borderColor: DIVIDER, color: BROWN }}>
            {c}
          </span>
        ))}
      </div>
      <button
        type="button"
        className={`block w-full text-left ${current ? sel(isPicked({ kind: "stores", id: current.id })) : ""}`}
        onClick={() => {
          if (current) onPick({ kind: "stores", id: current.id });
        }}
      >
        {stores.length === 0 ?
          <span className="block px-3 py-8 text-center text-[12px]" style={{ color: MUTED }}>
            매장 없음 — 고객 화면에서 자동 숨김
          </span>
        : stores.slice(0, 12).map((s) => (
            <span key={s.id} className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: DIVIDER }}>
              <span className="relative h-[40px] w-[40px] shrink-0 overflow-hidden rounded-[8px]" style={{ background: BAND }}>
                {s.imageUrl ? <DeliveryMediaImage src={s.imageUrl} alt="" fill sizes="40px" className="object-cover" /> : null}
              </span>
              <span className="truncate text-[12px] font-bold" style={{ color: BROWN }}>{s.name}</span>
            </span>
          ))}
        {current ? <span className="block py-2 text-center text-[11px]" style={{ color: SELECT }}>매장 목록을 누르면 매장 지정</span> : null}
      </button>
    </div>
  );
}
