"use client";

import Link from "next/link";
import type { CategoryWithSettings } from "@/lib/categories/types";
import { APP_TOP_MENU_ROW2_BASE, APP_TOP_MENU_ROW2_INACTIVE_SKY } from "@/lib/ui/app-top-menu";

/** 동네생활 주제 칩 기본 강조색과 동일 */
const TOPIC_ACTIVE_BG = "#0284c7";

interface TradeTopicChipsRowProps {
  /** 예: /market/ukay */
  marketBasePath: string;
  topics: CategoryWithSettings[];
  /** URL ?topic= 값 (slug 또는 id). 없으면 피드는 부모+하위 전체(「전체」칩 없음, 1단에서 동일 메뉴 재선택 등으로 쿼리 제거) */
  selectedTopicKey: string | null;
  /** topic 링크에 함께 붙일 쿼리(알바 `jk` 등) */
  extraQuery?: Record<string, string>;
}

/**
 * 마켓 2행 주제 칩 — 동네생활 2단과 동일 필 스타일. 「전체」칩은 두지 않고, topic 미지정이 곧 전체 조회.
 */
export function TradeTopicChipsRow({
  marketBasePath,
  topics,
  selectedTopicKey,
  extraQuery,
}: TradeTopicChipsRowProps) {
  const base = marketBasePath.replace(/\/$/, "");

  return (
    <>
      {topics.map((t) => {
        const raw = t.slug?.trim() ? t.slug.trim() : t.id;
        const params = new URLSearchParams();
        params.set("topic", raw);
        if (extraQuery) {
          for (const [k, v] of Object.entries(extraQuery)) {
            if (v) params.set(k, v);
          }
        }
        const href = `${base}?${params.toString()}`;
        const keyTrim = (selectedTopicKey?.trim() ?? "").normalize("NFC");
        const slugN = t.slug?.trim().normalize("NFC") ?? "";
        const on = keyTrim !== "" && (keyTrim === slugN || keyTrim === t.id);
        return (
          <Link
            key={t.id}
            href={href}
            className={`${APP_TOP_MENU_ROW2_BASE} ${on ? "text-white" : APP_TOP_MENU_ROW2_INACTIVE_SKY}`}
            style={on ? { backgroundColor: TOPIC_ACTIVE_BG } : undefined}
          >
            {t.name}
          </Link>
        );
      })}
    </>
  );
}
