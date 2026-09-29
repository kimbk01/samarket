/**
 * Human-facing Intro authority labels (client-safe).
 * No supabase / service imports.
 */

export type AuthorityRevisionLabelInput = {
  sourceDraftVersion: number;
  createdAt: string;
};

export function humanPublishedVersionLabel(
  rev: AuthorityRevisionLabelInput,
  locale: "ko" | "en" = "ko",
): string {
  const when = formatAuthorityTime(rev.createdAt, locale);
  if (locale === "ko") {
    return `게시 v${rev.sourceDraftVersion} · ${when}`;
  }
  return `Published v${rev.sourceDraftVersion} · ${when}`;
}

export function humanLiveVersionLabel(
  rev: AuthorityRevisionLabelInput | null,
  liveKind: string,
  locale: "ko" | "en" = "ko",
): string {
  if (liveKind !== "COMMITTED_LIVE" || !rev) {
    return locale === "ko" ? "서비스 미적용" : "No service version";
  }
  const when = formatAuthorityTime(rev.createdAt, locale);
  if (locale === "ko") {
    return `서비스 v${rev.sourceDraftVersion} · ${when}`;
  }
  return `Service v${rev.sourceDraftVersion} · ${when}`;
}

export function humanDraftVersionLabel(
  draftVersion: number,
  dirty: boolean,
  locale: "ko" | "en" = "ko",
): string {
  if (locale === "ko") {
    return dirty
      ? `초안 v${draftVersion} · 미저장`
      : `초안 v${draftVersion} · 저장됨`;
  }
  return dirty
    ? `Draft v${draftVersion} · Unsaved`
    : `Draft v${draftVersion} · Saved`;
}

function formatAuthorityTime(iso: string, locale: "ko" | "en"): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(locale === "ko" ? "ko-KR" : "en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
