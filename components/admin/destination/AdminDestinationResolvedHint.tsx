"use client";

import { describeDestinationForAdmin } from "@/lib/destination/optional-destination-href";

const KIND_LABEL: Record<string, { ko: string; en: string }> = {
  internal_route: { ko: "앱 내부 화면", en: "In-app page" },
  event: { ko: "이벤트", en: "Event" },
  external_url: { ko: "외부 링크 · 인앱 브라우저", en: "External · in-app browser" },
  none: { ko: "링크 없음", en: "No link" },
};

/**
 * Scope B — admin preview of how a link input resolves (DestinationRef kind + canonical href).
 * Same parser the save path and the app use (`parseDestinationHref`).
 */
export function AdminDestinationResolvedHint({
  href,
  language = "ko",
  className = "mt-1 text-xs text-sam-muted",
}: {
  href: string | null | undefined;
  language?: "ko" | "en";
  className?: string;
}) {
  const d = describeDestinationForAdmin(href);
  const lang = language === "en" ? "en" : "ko";
  if (!d.ok) {
    return (
      <p className={className} data-admin-destination-kind="invalid">
        <span className="font-medium text-sam-danger">
          {lang === "en" ? "Invalid link" : "유효하지 않은 링크"}
        </span>{" "}
        ({d.error})
      </p>
    );
  }
  const label = KIND_LABEL[d.kind ?? "none"] ?? KIND_LABEL.none;
  return (
    <p className={className} data-admin-destination-kind={d.kind ?? "none"}>
      <span className="font-medium text-sam-fg">{label[lang]}</span>
      {d.href ? <> · <span className="break-all">{d.href}</span></> : null}
    </p>
  );
}
