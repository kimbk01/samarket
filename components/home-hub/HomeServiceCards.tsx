"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { HomeServiceIconDuo, HomeServiceIconLine, type HomeTileKey } from "@/components/home-hub/home-service-icons";
import {
  HOME_MENU_CATALOG,
  pickHomeText,
  resolveHomeServiceTiles,
  type HomeMenuKey,
  type HomeServiceCardConfig,
  type HomeServiceKey,
} from "@/lib/home/home-layout-contract";

/**
 * ③ 서비스 4×2 — 시안 v2 §3-4 (Owner 「v2대로 구현」 2026-11-26).
 * 순서 = 시안 고정(정보 공유·마켓·모임·DIPICK / telRING·이벤트·환율 계산·전체) · 어드민은 보이기만 · 이름만(설명 없음).
 * 휴대폰 = 따로 떨어진 흰 칸 + 두 색 아이콘 · 태블릿 = 한 판 + 구분선 + 연초록 동그라미 선 아이콘 (`app/home-hub.css` `.home-svc*`).
 * 누름 피드백은 홈 전체 위임(`HomeScreen` `onClickCapture`).
 */
export function HomeServiceCards({
  services,
  onOpen,
  onOpenRateCalc,
}: {
  services: HomeServiceCardConfig[];
  onOpen: (key: HomeMenuKey) => void;
  onOpenRateCalc: () => void;
}) {
  const { t, language } = useI18n();
  const keys = resolveHomeServiceTiles(services);
  const byKey = new Map(services.map((s) => [s.key, s]));
  const name = (k: HomeServiceKey) => pickHomeText(byKey.get(k)?.title, language) || t(HOME_MENU_CATALOG[k].labelKey);
  const tiles: { key: HomeTileKey; label: string; onClick: () => void }[] = [
    ...keys.map((k) => ({ key: k as HomeTileKey, label: name(k), onClick: () => onOpen(k) })),
    { key: "rate_calc", label: t("home_menu_rate_calc"), onClick: onOpenRateCalc },
    { key: "all", label: t(HOME_MENU_CATALOG.all.labelKey), onClick: () => onOpen("all") },
  ];

  return (
    <section className="home-svc" data-home-services>
      <div className="home-svc-grid">
        {tiles.map((tile) => (
          <button
            key={tile.key}
            type="button"
            onClick={tile.onClick}
            className="home-press home-svc-tile"
            data-home-service={tile.key}
          >
            <span className="home-svc-ic">
              <HomeServiceIconDuo tile={tile.key} className="home-svc-ic-duo" />
              <HomeServiceIconLine tile={tile.key} className="home-svc-ic-line" />
            </span>
            <span className="home-svc-name">{tile.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
