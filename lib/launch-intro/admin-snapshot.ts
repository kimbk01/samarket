import "server-only";
import {
  listLaunchIntroPublications,
  loadLatestLaunchIntroDraft,
  loadLaunchIntroLive,
  signLaunchIntroDraftImage,
  type Sb,
} from "@/lib/launch-intro/server";
import { LAUNCH_INTRO_PUBLIC_BUCKET, launchIntroDocumentImageRefs } from "@/lib/launch-intro/document";

/** Admin snapshot: working draft (+ signed preview URLs), Live, publication history. */
export async function launchIntroAdminSnapshot(sb: Sb) {
  const [draftRes, liveRes, pubsRes] = await Promise.all([
    loadLatestLaunchIntroDraft(sb),
    loadLaunchIntroLive(sb),
    listLaunchIntroPublications(sb),
  ]);
  if (!draftRes.ok) return draftRes;
  if (!liveRes.ok) return liveRes;
  if (!pubsRes.ok) return pubsRes;
  const draftImageUrls: Record<string, string> = {};
  for (const ref of draftRes.draft ? launchIntroDocumentImageRefs(draftRes.draft.document) : []) {
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
    publications: pubsRes.publications,
    publicAssetBase: publicBase,
  };
}

