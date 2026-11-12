"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { WriteSelectSheetField } from "@/components/write/shared/WriteSelectSheetField";
import type { MoimCategoryDto } from "@/lib/moim/moim-api-types";
import { moimCategoryLabel, moimCls } from "@/components/moim/moim-ui";

export const MOIM_TOPIC_MIN = 2;
export const MOIM_TOPIC_MAX = 20;

/** 서버 `moim__topic_resolve` 와 같은 정리 — 앞뒤 공백 제거·연속 공백 하나로 */
export function normalizeMoimTopic(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/** 고른 카테고리가 직접 주제를 받으면 주제 길이까지 맞아야 다음으로 갈 수 있다 */
export function isMoimCategoryInputValid(categories: MoimCategoryDto[] | null, categoryId: string | null, topic: string): boolean {
  if (!categoryId) return false;
  const cat = categories?.find((c) => c.id === categoryId);
  if (!cat) return false;
  if (!cat.allowCustomTopic) return true;
  const n = normalizeMoimTopic(topic).length;
  return n >= MOIM_TOPIC_MIN && n <= MOIM_TOPIC_MAX;
}

/**
 * 모임 카테고리 선택 칸 (Owner 2026-11-12 「드롭다운 · 기타 직접 주제」 —
 * docs/design/moim/moim-category-dropdown-custom-topic-2026-11-12.md §2·§3).
 * 칸 한 줄 + 바텀시트(글쓰기 선택 칸과 같은 부품). 「직접 주제」 카테고리를 고르면 아래에 주제 입력칸.
 */
export function MoimCategoryField({
  categories,
  categoryId,
  onCategoryChange,
  topic,
  onTopicChange,
  disabled = false,
  labelClassName = moimCls.label,
}: {
  categories: MoimCategoryDto[];
  categoryId: string | null;
  onCategoryChange: (id: string) => void;
  topic: string;
  onTopicChange: (next: string) => void;
  disabled?: boolean;
  /** 화면마다 다른 라벨 모양 (운영 화면 등) */
  labelClassName?: string;
}) {
  const { t, language } = useI18n();
  const selected = categories.find((c) => c.id === categoryId) ?? null;
  const topicLen = normalizeMoimTopic(topic).length;
  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <span className={labelClassName}>{t("moim_category_field_label")}</span>
        <WriteSelectSheetField
          value={categoryId ?? ""}
          onChange={onCategoryChange}
          options={categories.map((c) => ({ value: c.id, label: moimCategoryLabel(c, language) || c.slug }))}
          placeholder={t("moim_category_field_placeholder")}
          sheetTitle={t("moim_create_category_title")}
          disabled={disabled}
          className={moimCls.input}
          ariaLabel={t("moim_category_field_label")}
        />
      </div>
      {selected?.allowCustomTopic ? (
        <label className="grid gap-1.5">
          <span className={labelClassName}>{t("moim_topic_label")}</span>
          <input
            className={moimCls.input}
            value={topic}
            maxLength={MOIM_TOPIC_MAX + 10}
            disabled={disabled}
            onChange={(e) => onTopicChange(e.target.value)}
            placeholder={t("moim_topic_placeholder")}
          />
          <span className={`${moimCls.hint} flex justify-between gap-2`}>
            <span>{t("moim_topic_hint")}</span>
            <span className={topicLen > MOIM_TOPIC_MAX ? "text-sam-danger" : undefined}>
              {topicLen}/{MOIM_TOPIC_MAX}
            </span>
          </span>
        </label>
      ) : null}
    </div>
  );
}
