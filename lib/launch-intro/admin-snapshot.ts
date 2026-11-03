import "server-only";
import {
  listLaunchIntroPublications,
  loadLatestLaunchIntroDraft,
  loadLaunchIntroLive,
  loadLaunchIntroPublicationForAdmin,
  signLaunchIntroDraftImage,
  type Sb,
} from "@/lib/launch-intro/server";
import { LAUNCH_INTRO_PUBLIC_BUCKET, launchIntroDocumentAllRefs } from "@/lib/launch-intro/document";

/** 재감사 R3 (I-7): 게시본 목록 기본 20건 · 어드민 「더 보기」로 20건씩 최대 200건 */
export const LAUNCH_INTRO_PUBLICATIONS_PAGE = 20;
export const LAUNCH_INTRO_PUBLICATIONS_MAX = 200;

/** 요청 주소의 `publicationsLimit` (없거나 틀리면 20) — 저장·게시·상태 변경 응답도 화면이 보던 건수를 유지 */
export function launchIntroPublicationsLimitFromUrl(url: string | URL): number {
  const raw = Number(new URL(url).searchParams.get("publicationsLimit"));
  if (!Number.isFinite(raw) || raw < LAUNCH_INTRO_PUBLICATIONS_PAGE) return LAUNCH_INTRO_PUBLICATIONS_PAGE;
  return Math.min(LAUNCH_INTRO_PUBLICATIONS_MAX, Math.floor(raw));
}

/** Admin snapshot: working draft (+ signed preview URLs), Live, publication history. */
export async function launchIntroAdminSnapshot(sb: Sb, publicationsLimit = LAUNCH_INTRO_PUBLICATIONS_PAGE) {
  const [draftRes, liveRes, pubsRes] = await Promise.all([
    loadLatestLaunchIntroDraft(sb),
    loadLaunchIntroLive(sb),
    listLaunchIntroPublications(sb, publicationsLimit),
  ]);
  if (!draftRes.ok) return draftRes;
  if (!liveRes.ok) return liveRes;
  if (!pubsRes.ok) return pubsRes;
  // 광고 감사 I-7: Live 게시본이 최근 목록(20건) 밖이면 따로 읽어 목록 끝에 붙인다 — 상태판·게시 폼이 Live 값을 잃지 않게
  let publications = pubsRes.publications;
  // 광고 감사 (인트로): 손상된 게시본은 목록에서 빼지 않고 표시만 한다(재게시 불가) — 목록 전체 500 금지
  let invalidPublications = pubsRes.invalidPublications;
  const liveId = liveRes.live.publication_id;
  if (liveId && !publications.some((p) => p.id === liveId) && !invalidPublications.some((p) => p.id === liveId)) {
    const livePub = await loadLaunchIntroPublicationForAdmin(sb, liveId);
    if (!livePub.ok) return livePub;
    if (livePub.publication) publications = [...publications, livePub.publication];
    if (livePub.invalid) invalidPublications = [...invalidPublications, livePub.invalid];
  }
  const draftImageUrls: Record<string, string> = {};
  for (const ref of draftRes.draft ? launchIntroDocumentAllRefs(draftRes.draft.document) : []) {
    if (ref.draftPath && !draftImageUrls[ref.sha256]) {
      const url = await signLaunchIntroDraftImage(sb, ref.draftPath);
      if (url) draftImageUrls[ref.sha256] = url;
    }
  }
  const publicBase = sb.storage.from(LAUNCH_INTRO_PUBLIC_BUCKET).getPublicUrl("pub").data.publicUrl.replace(/\/pub$/, "");
  return {
    ok: true as const,
    draft: draftRes.draft,
    draftImageUrls,
    live: liveRes.live,
    publications,
    /** 문서가 손상돼 읽을 수 없는 게시본 (id·만든 시각·검사 오류) — 어드민에 「손상됨」으로 표시 */
    invalidPublications,
    /** 전체 게시본 수 — 목록이 그보다 적으면 「더 보기」 */
    publicationsTotal: pubsRes.total,
    publicAssetBase: publicBase,
  };
}

