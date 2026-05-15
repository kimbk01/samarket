"use client";

import { DeliveryMediaImage } from "@/components/dibay/DeliveryMediaImage";

type DeliverySearchStore = {
  id: string;
  slug: string;
  store_name: string;
  description: string | null;
  profile_image_url: string | null;
  rating_avg: number | null;
  review_count: number | null;
  district: string | null;
  city: string | null;
  region: string | null;
};

type DeliverySearchMenu = {
  id: string;
  store_id: string;
  store_slug: string;
  store_name: string;
  title: string;
  summary: string | null;
  price: number;
  discount_price: number | null;
  thumbnail_url: string | null;
};

function priceLabel(menu: DeliverySearchMenu): string {
  const price = Number(menu.discount_price ?? menu.price);
  if (!Number.isFinite(price)) return "";
  return `₱${price.toLocaleString("en-PH")}`;
}

export function DeliverySearchResults({
  q,
  loading,
  stores,
  menus,
  resultCount,
  onClickStore,
  onClickMenu,
}: {
  q: string;
  loading: boolean;
  stores: DeliverySearchStore[];
  menus: DeliverySearchMenu[];
  resultCount: number;
  onClickStore: (slug: string) => void;
  onClickMenu: (menu: DeliverySearchMenu) => void;
}) {
  const hasAny = (stores?.length ?? 0) + (menus?.length ?? 0) > 0;

  if (loading && !hasAny) {
    return (
      <div className="py-10 text-center">
        <p className="sam-text-body text-sam-muted">검색 중…</p>
      </div>
    );
  }

  if (!hasAny && q.trim().length > 0) {
    return (
      <div className="py-10 text-center">
        <p className="sam-text-body font-semibold text-sam-fg">검색 결과가 없습니다</p>
        <p className="mt-1 sam-text-body text-sam-muted">다른 키워드로 다시 시도해 보세요.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="sam-text-body text-sam-muted">
          <span className="font-semibold text-sam-fg">{q}</span> · 결과 {Math.max(0, resultCount)}
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="sam-text-body-secondary font-semibold text-sam-fg">가게</h2>
        {stores.length === 0 ? (
          <p className="sam-text-body text-sam-muted">가게 결과가 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {stores.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onClickStore(s.slug)}
                  className="flex w-full items-center gap-3 rounded-ui-rect border border-sam-border bg-sam-surface p-3 text-left hover:bg-sam-surface-muted"
                >
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-ui-rect bg-sam-surface-muted">
                    {s.profile_image_url ? (
                      <DeliveryMediaImage
                        src={s.profile_image_url}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="48px"
                        surface="search-store-thumb"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate sam-text-body font-semibold text-sam-fg">{s.store_name}</p>
                    {s.description ? (
                      <p className="mt-0.5 line-clamp-1 sam-text-body text-sam-muted">{s.description}</p>
                    ) : null}
                    <p className="mt-1 sam-text-helper text-sam-meta">
                      {(s.district || s.city || s.region || "").trim()}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="sam-text-body-secondary font-semibold text-sam-fg">메뉴</h2>
        {menus.length === 0 ? (
          <p className="sam-text-body text-sam-muted">메뉴 결과가 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {menus.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => onClickMenu(m)}
                  className="flex w-full items-center gap-3 rounded-ui-rect border border-sam-border bg-sam-surface p-3 text-left hover:bg-sam-surface-muted"
                >
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-ui-rect bg-sam-surface-muted">
                    {m.thumbnail_url ? (
                      <DeliveryMediaImage
                        src={m.thumbnail_url}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="48px"
                        surface="search-menu-thumb"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate sam-text-body font-semibold text-sam-fg">{m.title}</p>
                    <p className="mt-0.5 truncate sam-text-body text-sam-muted">{m.store_name}</p>
                    {m.summary ? (
                      <p className="mt-0.5 line-clamp-1 sam-text-helper text-sam-meta">{m.summary}</p>
                    ) : null}
                  </div>
                  <div className="shrink-0 sam-text-body-secondary font-semibold text-sam-fg">{priceLabel(m)}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

