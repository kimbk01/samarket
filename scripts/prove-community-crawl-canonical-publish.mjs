/**
 * Step-1 live proof: canonical publish RPC writes posts+link+images in one txn.
 * Usage: node --env-file=.env.local scripts/prove-community-crawl-canonical-publish.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      let v = line.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (k && process.env[k] == null) process.env[k] = v;
    }
  } catch {
    /* ignore */
  }
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) {
  console.error("missing supabase env");
  process.exit(2);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

const PROOF_MARKER = `crawler-canonical-proof-${Date.now()}`;
const CANONICAL_URL = `https://example.com/dibay-crawler-proof/${PROOF_MARKER}`;

async function main() {
  const { data: boards, error: bErr } = await sb
    .from("community_crawl_boards")
    .select("id, source_id, dibay_topic_id, ingest_mode")
    .eq("enabled", true)
    .limit(20);
  if (bErr) throw bErr;

  let board = null;
  let source = null;
  let topic = null;
  let section = null;
  let principal = null;

  for (const b of boards ?? []) {
    const { data: src } = await sb
      .from("community_crawl_sources")
      .select("*")
      .eq("id", b.source_id)
      .maybeSingle();
    // RPC blocks DISABLED only; REVIEW_REQUIRED is fine for transactional proof.
    if (!src || src.status !== "ACTIVE" || src.policy_status === "DISABLED") continue;
    const { data: t } = await sb
      .from("community_topics")
      .select("id, slug, section_id")
      .eq("id", b.dibay_topic_id)
      .maybeSingle();
    if (!t) continue;
    const { data: sec } = await sb
      .from("community_sections")
      .select("id, slug")
      .eq("id", t.section_id)
      .maybeSingle();
    if (!sec) continue;
    board = b;
    source = src;
    topic = t;
    section = sec;
    break;
  }

  const { data: prin } = await sb.from("community_import_principal").select("user_id").limit(1).maybeSingle();
  principal = prin?.user_id;
  if (!board || !source || !topic || !section || !principal) {
    console.log(
      JSON.stringify({
        ok: false,
        error: "no_ALLOWED_board_or_principal",
        boardFound: Boolean(board),
        principalFound: Boolean(principal),
      })
    );
    process.exit(1);
  }

  const imgA = {
    image_url: "https://cdn.example.com/proof/a.jpg",
    storage_path: `crawl-proof/${PROOF_MARKER}/a.jpg`,
    sort_order: 0,
  };
  const imgB = {
    image_url: "https://cdn.example.com/proof/b.jpg",
    storage_path: `crawl-proof/${PROOF_MARKER}/b.jpg`,
    sort_order: 1,
  };

  const basePayload = {
    board_id: board.id,
    source_post_id: PROOF_MARKER,
    canonical_url: CANONICAL_URL,
    source_published_at: new Date().toISOString(),
    principal_user_id: principal,
    section_id: section.id,
    section_slug: section.slug,
    topic_id: topic.id,
    topic_slug: topic.slug,
    title: `Canonical proof ${PROOF_MARKER}`,
    content:
      "This is a canonical crawler publish proof body with enough characters for validation.",
    summary: "canonical proof",
    region_label: "필리핀",
    category: "etc",
    display_author_name: "Proof Author",
    display_author_avatar_url: null,
    created_at: new Date().toISOString(),
    view_count: 3,
    images: [imgA, imgB],
  };

  const { data: first, error: e1 } = await sb.rpc("community_crawl_publish_full_content", {
    p_payload: basePayload,
  });
  if (e1) throw e1;
  if (!first?.ok) {
    console.log(JSON.stringify({ ok: false, phase: "first", first }));
    process.exit(1);
  }

  const postId = first.community_post_id;
  const { data: imgs1 } = await sb
    .from("community_post_images")
    .select("image_url, storage_path, sort_order")
    .eq("post_id", postId)
    .order("sort_order", { ascending: true });

  const { data: second, error: e2 } = await sb.rpc("community_crawl_publish_full_content", {
    p_payload: {
      ...basePayload,
      title: `Canonical proof UPDATED ${PROOF_MARKER}`,
      images: [imgB],
    },
  });
  if (e2) throw e2;

  const { data: imgs2 } = await sb
    .from("community_post_images")
    .select("image_url, storage_path, sort_order")
    .eq("post_id", postId)
    .order("sort_order", { ascending: true });

  const { data: post } = await sb
    .from("community_posts")
    .select("id, title")
    .eq("id", postId)
    .maybeSingle();

  // cleanup proof rows
  await sb.from("community_post_images").delete().eq("post_id", postId);
  await sb.from("community_crawl_post_links").delete().eq("community_post_id", postId);
  await sb.from("community_posts").delete().eq("id", postId);

  console.log(
    JSON.stringify(
      {
        ok:
          first.ok === true &&
          second?.ok === true &&
          second.updated === true &&
          second.community_post_id === postId &&
          (imgs1?.length ?? 0) === 2 &&
          (imgs2?.length ?? 0) === 1 &&
          imgs2?.[0]?.image_url === imgB.image_url &&
          post?.title?.includes("UPDATED"),
        first: {
          postId,
          mediaDelta: first.media_delta,
          updated: first.updated,
          imageCount: imgs1?.length ?? 0,
        },
        second: {
          postId: second.community_post_id,
          mediaDelta: second.media_delta,
          updated: second.updated,
          imageCount: imgs2?.length ?? 0,
          title: post?.title,
        },
        boardId: board.id,
        sourceId: source.id,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
