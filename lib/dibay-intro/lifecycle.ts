export type IntroOperatorLifecycle = "draft" | "published" | "live";

export type IntroAuthoritySnapshot = {
  hasDraft: boolean;
  publishedRevisionId: string | null;
  liveRevisionId: string | null;
  liveIntroId: string | null;
  introId: string;
};

export function resolveIntroOperatorLifecycle(snapshot: IntroAuthoritySnapshot): IntroOperatorLifecycle {
  if (snapshot.liveIntroId === snapshot.introId && snapshot.liveRevisionId) return "live";
  if (snapshot.publishedRevisionId) return "published";
  return "draft";
}

export function introOperatorLabelKo(lifecycle: IntroOperatorLifecycle): string {
  if (lifecycle === "live") return "앱 노출 중";
  if (lifecycle === "published") return "게시됨";
  return "초안";
}

export function introOperatorLabelEn(lifecycle: IntroOperatorLifecycle): string {
  if (lifecycle === "live") return "Live on app";
  if (lifecycle === "published") return "Published";
  return "Draft";
}
