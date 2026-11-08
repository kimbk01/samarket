"use client";

import { describeDestinationForAdmin } from "@/lib/destination/optional-destination-href";
import { externalUrlHadNonAsciiHost, type DestinationError } from "@/lib/destination/destination-contract";
import type { MessageKey } from "@/lib/i18n/messages";
import { safeTranslate } from "@/lib/i18n/safe-translate";

const KIND_LABEL: Record<string, MessageKey> = {
  internal_route: "admin_destination_hint_kind_internal_route",
  event: "admin_destination_hint_kind_event",
  external_url: "admin_destination_hint_kind_external_url",
  none: "admin_destination_hint_kind_none",
};

const ERROR_KEY: Record<DestinationError, MessageKey> = {
  destination_empty: "admin_destination_error_destination_empty",
  invalid_internal_path: "admin_destination_error_invalid_internal_path",
  internal_path_forbidden: "admin_destination_error_internal_path_forbidden",
  invalid_url: "admin_destination_error_invalid_url",
  https_required: "admin_destination_error_https_required",
  event_id_required: "admin_destination_error_event_id_required",
  external_url_credentials: "admin_destination_error_external_url_credentials",
  external_url_private_host: "admin_destination_error_external_url_private_host",
  external_url_too_long: "admin_destination_error_external_url_too_long",
  external_url_shortener: "admin_destination_error_external_url_shortener",
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
          {safeTranslate(lang, "admin_destination_hint_invalid")}
        </span>{" "}
        {/* D-4: 코드값 대신 이유 문구 (단축 주소 → 「최종 주소를 넣어 주세요」) */}
        <span data-admin-destination-error={d.error ?? ""}>
          {d.error ? safeTranslate(lang, ERROR_KEY[d.error]) : null}
        </span>
      </p>
    );
  }
  const label = KIND_LABEL[d.kind ?? "none"] ?? KIND_LABEL.none;
  // D-4 ④: 한글·특수 문자 도메인은 저장되는 실제 주소(punycode)를 따로 강조한다(닮은 주소 속임 방지)
  const nonAsciiHost = d.kind === "external_url" && externalUrlHadNonAsciiHost(href);
  return (
    <p className={className} data-admin-destination-kind={d.kind ?? "none"}>
      <span className="font-medium text-sam-fg">
        {safeTranslate(lang, label)}
      </span>
      {d.href ? <> · <span className="break-all">{d.href}</span></> : null}
      {nonAsciiHost ? (
        <span className="mt-1 block text-sam-warning" data-admin-destination-punycode="">
          {safeTranslate(lang, "admin_destination_hint_real_address")}:{" "}
          <span className="break-all font-mono">{d.href}</span>
          <span className="block">
            {safeTranslate(lang, "admin_destination_hint_real_address_note")}
          </span>
        </span>
      ) : null}
    </p>
  );
}
