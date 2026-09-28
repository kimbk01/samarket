"use client";

import { introCtaTypeLabel } from "@/lib/startup/intro-v2/admin-labels";
import { isIntroCtaEntityKind } from "@/lib/startup/intro-v2/admin-cta-entity-client";
import { applyOperatorCtaDestination } from "@/lib/startup/intro-v2/admin-operator-ux";
import type { IntroEntityHit } from "@/lib/startup/intro-v2/admin-entity-search";
import {
  INTRO_CTA_DESTINATION_TYPES,
  type IntroCta,
  type IntroCtaDestinationType,
} from "@/lib/startup/intro-v2/types";

const FIELD =
  "mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-sm text-sam-fg";

export function AdminIntroCmsCtaDestinationFields({
  cta,
  lang,
  hits,
  onSearch,
  onChange,
}: {
  cta: IntroCta;
  lang: "ko" | "en";
  hits: IntroEntityHit[];
  onSearch: (kind: string, q: string) => void;
  onChange: (cta: IntroCta) => void;
}) {
  const dest = cta.destination;
  return (
    <>
      <label className="mt-3 block text-sm">
        {lang === "en" ? "Destination" : "이동 위치"}
        <select
          className={FIELD}
          value={dest.type}
          onChange={(e) => {
            const type = e.target.value as IntroCtaDestinationType;
            onChange(applyOperatorCtaDestination(cta, type));
            onSearch(type, "");
          }}
        >
          {INTRO_CTA_DESTINATION_TYPES.map((type) => (
            <option key={type} value={type}>
              {introCtaTypeLabel(type, lang)}
            </option>
          ))}
        </select>
      </label>
      {isIntroCtaEntityKind(dest.type) ? (
        <label className="mt-3 block text-sm">
          {lang === "en" ? "Search" : "검색"}
          <input
            className={FIELD}
            onChange={(e) => onSearch(dest.type, e.target.value)}
          />
          <ul className="mt-1 space-y-1">
            {hits.map((hit) => (
              <li key={hit.id}>
                <button
                  type="button"
                  className="text-left underline"
                  onClick={() =>
                    onChange({
                      ...cta,
                      destination: { type: dest.type, id: hit.id, label: hit.label },
                    })
                  }
                >
                  {hit.label}
                  {hit.subtitle ? (
                    <span className="ml-1 text-[12px] text-sam-muted">{hit.subtitle}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
          {dest.label ? (
            <p className="mt-1 text-[12px] text-sam-fg">{dest.label}</p>
          ) : dest.id ? (
            <p className="mt-1 text-[12px] text-sam-muted">
              {lang === "en" ? "Label is loading." : "이름을 불러오는 중입니다."}
            </p>
          ) : null}
        </label>
      ) : null}
      {dest.type === "INTERNAL_PATH" ? (
        <label className="mt-3 block text-sm">
          {lang === "en" ? "Path" : "경로"}
          <input
            className={FIELD}
            value={dest.path ?? ""}
            onChange={(e) =>
              onChange({ ...cta, destination: { type: dest.type, path: e.target.value } })
            }
          />
        </label>
      ) : null}
      {dest.type === "EXTERNAL_URL" ? (
        <label className="mt-3 block text-sm">
          {lang === "en" ? "https URL" : "https 주소"}
          <input
            className={FIELD}
            value={dest.url ?? ""}
            onChange={(e) =>
              onChange({ ...cta, destination: { type: dest.type, url: e.target.value } })
            }
          />
        </label>
      ) : null}
    </>
  );
}
