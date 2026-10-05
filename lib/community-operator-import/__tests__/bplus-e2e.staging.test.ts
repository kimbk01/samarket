/**
 * B+ STAGING E2E — runs only in .github/workflows/community-import-staging-e2e.yml against a
 * disposable local Supabase (all migrations replayed, no production data or credentials).
 * Exercises the same library functions the admin API routes call, with real DB writes:
 * register → boards/topic → collect → inbox → detail → draft → publish → duplicate guard →
 * update → RPC rollback → bulk job → scheduled collection → community feed.
 * Results → staging-results.json (printed as CI annotations).
 */
import { writeFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

type Row = { site: string; check: string; result: "PASS" | "FAIL"; detail: string };
const rows: Row[] = [];
const record = (step: string, check: string, ok: boolean, detail: string) => {
  rows.push({ site: step, check, result: ok ? "PASS" : "FAIL", detail: String(detail).slice(0, 600) });
  return ok;
};

const URL_ = process.env.STAGING_SUPABASE_URL || "";
const KEY = process.env.STAGING_SERVICE_ROLE_KEY || "";
let sb: SupabaseClient;
let adminId = "";
let topic: { id: string; slug: string } | null = null;

// The app's own server clients read these — point them at the disposable stack only.
process.env.NEXT_PUBLIC_SUPABASE_URL = URL_;
process.env.SUPABASE_SERVICE_ROLE_KEY = KEY;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.STAGING_ANON_KEY || "";

afterAll(() => writeFileSync("staging-results.json", JSON.stringify(rows, null, 2)));

describe("B+ staging E2E (isolated local Supabase)", () => {
  beforeAll(async () => {
    if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(URL_)) throw new Error(`refusing to run against non-local DB: ${URL_}`);
    sb = createClient(URL_, KEY, { auth: { persistSession: false } });

    const pw = `S-${crypto.randomUUID()}`;
    const admin = await sb.auth.admin.createUser({ email: "bplus-admin@staging.local", password: pw, email_confirm: true });
    adminId = admin.data.user?.id ?? "";
    const principal = await sb.auth.admin.createUser({ email: "import-principal@staging.local", password: `P-${crypto.randomUUID()}`, email_confirm: true });
    const principalId = principal.data.user?.id ?? "";
    await sb.from("community_import_principal").insert({ user_id: principalId });
    const { data: buckets } = await sb.storage.listBuckets();
    if (!buckets?.some((b) => b.id === "post-images")) await sb.storage.createBucket("post-images", { public: true });

    const { data: t } = await sb.from("community_topics").select("id, slug, is_feed_sort, allow_meetup, section_id").eq("slug", "food").maybeSingle();
    if (t) topic = { id: String(t.id), slug: String(t.slug) };
    record("0 setup", "isolated_stack", Boolean(adminId && principalId), `url=${URL_} admin=${!!adminId} principal=${!!principalId} topic=${topic?.slug ?? "none"}`);
  });

  it("1 register: detect → save source and real boards", async () => {
    const { detectSource } = await import("@/lib/community-operator-import/detect");
    const { saveDetectedSource, loadManagedSource } = await import("@/lib/community-operator-import/source-store");
    const d = await detectSource("https://philsuda.com/", { sampleBoards: 2, budgetMs: 60_000 });
    const food = d.boards.find((b) => /맛집/.test(b.displayName));
    const saved = await saveDetectedSource(sb, { detect: d, sourceId: "philsuda", displayName: "필수다", adminUserId: adminId, selectedBoardIds: food ? [food.boardId] : undefined });
    const reread = await loadManagedSource(sb, "philsuda");
    record("1 등록", "source_saved", !!reread && reread.engine === "rss_atom", `engine=${reread?.engine} verification=${reread?.verification} policy=${reread?.contentPolicy}`);
    record("1 등록", "boards_saved", (reread?.boards.length ?? 0) >= 2 && !!reread?.boards.find((b) => /맛집/.test(b.displayName)), reread?.boards.map((b) => `${b.displayName}${b.enabled ? "✓" : ""}`).join(" | ") ?? "");
    record("1 등록", "selected_board_enabled", !!reread?.boards.find((b) => /맛집/.test(b.displayName) && b.enabled), "관리자가 고른 맛집 게시판이 사용 상태로 저장");
    expect(saved.id).toBe("philsuda");
  });

  it("2 board settings: topic mapping + collection on (persisted)", async () => {
    const { loadManagedSource, updateBoard } = await import("@/lib/community-operator-import/source-store");
    const s = await loadManagedSource(sb, "philsuda");
    const food = s!.boards.find((b) => /맛집/.test(b.displayName))!;
    let err = "";
    try {
      await updateBoard(sb, "philsuda", food.boardId, { defaultTopicId: topic?.id ?? null, collectEnabled: true });
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    }
    const after = (await loadManagedSource(sb, "philsuda"))!.boards.find((b) => b.boardId === food.boardId)!;
    record("2 게시판 설정", "topic_and_collect_saved", after.defaultTopicId === (topic?.id ?? null) && after.collectEnabled, `topic=${after.defaultTopicId} collect=${after.collectEnabled} err=${err}`);
  });

  it("3 collect → inbox (and re-collect keeps state, no duplicates)", async () => {
    const { loadManagedSource } = await import("@/lib/community-operator-import/source-store");
    const { collectBoardToInbox } = await import("@/lib/community-operator-import/collect");
    const s = (await loadManagedSource(sb, "philsuda"))!;
    const food = s.boards.find((b) => /맛집/.test(b.displayName))!;
    const r1 = await collectBoardToInbox(sb, s, food, { pages: 1 });
    const { count: c1 } = await sb.from("community_operator_import_inbox").select("*", { count: "exact", head: true }).eq("source_site", "philsuda");
    const r2 = await collectBoardToInbox(sb, (await loadManagedSource(sb, "philsuda"))!, food, { pages: 1 });
    const { count: c2 } = await sb.from("community_operator_import_inbox").select("*", { count: "exact", head: true }).eq("source_site", "philsuda");
    record("3 수집", "inbox_saved", r1.ok && (c1 ?? 0) > 0, `listed=${r1.listed} inbox=${c1} inserted=${r1.inbox?.inserted} err=${r1.error}`);
    record("3 수집", "recollect_no_duplicates", c1 === c2 && r2.inbox?.inserted === 0, `before=${c1} after=${c2} inserted=${r2.inbox?.inserted} unchanged=${r2.inbox?.unchanged}`);
  });

  it("4 detail → draft → publish → duplicate guard → update → rollback", async () => {
    const { fetchArticleForInbox } = await import("@/lib/community-operator-import/collect");
    const { upsertOperatorImportDraft, ensureDraftEdit } = await import("@/lib/community-operator-import/draft-store");
    const { publishImportedArticle } = await import("@/lib/community-operator-import/publish");
    const { data: inbox } = await sb.from("community_operator_import_inbox").select("*").eq("source_site", "philsuda").order("first_seen_at").limit(1);
    const key = { sourceSite: "philsuda", sourceBoard: String(inbox![0]!.source_board), sourceArticleKey: String(inbox![0]!.source_article_key) };

    const { article } = await fetchArticleForInbox(sb, key);
    const q = (await sb.from("community_operator_import_inbox").select("quality, quality_reasons").match({ source_site: key.sourceSite, source_board: key.sourceBoard, source_article_key: key.sourceArticleKey }).single()).data;
    record("4 원문", "detail_and_quality_saved", !!q?.quality, `title="${article.title}" quality=${q?.quality} reasons=${JSON.stringify(q?.quality_reasons)} blocks=${article.orderedContentBlocks.length}`);

    let edit = ensureDraftEdit(article, null);
    edit = { ...edit, displayTitle: `[스테이징] ${article.title}`, topicId: topic?.id ?? null, topicSlug: topic?.slug ?? null };
    const draft = await upsertOperatorImportDraft(sb, { original: article, edit, updatedBy: adminId });
    record("4 편집", "draft_saved", draft.status === "draft" && draft.edit.displayTitle.startsWith("[스테이징]"), `status=${draft.status}`);

    const before = (await sb.from("community_posts").select("*", { count: "exact", head: true })).count ?? 0;
    const pub = await publishImportedArticle(sb, { article, edit, mode: "create", adminUserId: adminId, acceptPartial: true, rules: [] });
    record("4 게시", "publish_create", pub.ok, JSON.stringify(pub).slice(0, 400));
    if (!pub.ok) return;
    const post = (await sb.from("community_posts").select("id, title, images, origin_kind, status, topic_slug, public_attribution_url, content").eq("id", pub.postId).single()).data!;
    const imgRows = (await sb.from("community_post_images").select("image_url, sort_order").eq("post_id", pub.postId).order("sort_order")).data ?? [];
    const sameOrder = JSON.stringify(imgRows.map((r) => r.image_url)) === JSON.stringify(post.images);
    record("4 게시", "post_row", post.origin_kind === "imported" && post.status === "active" && post.title.startsWith("[스테이징]"), `topic=${post.topic_slug} attribution=${post.public_attribution_url} policy=${pub.policy}`);
    record("4 게시", "images_consistent", sameOrder, `images_col=${JSON.stringify(post.images)} rows=${imgRows.length}`);
    const link = (await sb.from("community_import_post_links").select("post_id").match({ source_site: key.sourceSite, source_board: key.sourceBoard, source_article_key: key.sourceArticleKey }).single()).data;
    const ib = (await sb.from("community_operator_import_inbox").select("status, published_post_id").match({ source_site: key.sourceSite, source_board: key.sourceBoard, source_article_key: key.sourceArticleKey }).single()).data;
    record("4 게시", "provenance_and_inbox", link?.post_id === pub.postId && ib?.status === "published" && ib?.published_post_id === pub.postId, `link=${link?.post_id} inbox=${ib?.status}`);

    const dup = await publishImportedArticle(sb, { article, edit, mode: "create", adminUserId: adminId, acceptPartial: true, rules: [] });
    const afterDup = (await sb.from("community_posts").select("*", { count: "exact", head: true })).count ?? 0;
    record("4 중복방지", "second_create_refused", !dup.ok && dup.code === "already_published" && afterDup === before + 1, `code=${dup.ok ? "ok" : dup.code} posts ${before}→${afterDup}`);

    const edit2 = { ...edit, displayTitle: `[스테이징-업데이트] ${article.title}` };
    const upd = await publishImportedArticle(sb, { article, edit: edit2, mode: "update", adminUserId: adminId, acceptPartial: true, rules: [] });
    const post2 = (await sb.from("community_posts").select("title, images").eq("id", pub.postId).single()).data!;
    const imgRows2 = (await sb.from("community_post_images").select("image_url").eq("post_id", pub.postId).order("sort_order")).data ?? [];
    const afterUpd = (await sb.from("community_posts").select("*", { count: "exact", head: true })).count ?? 0;
    record("4 업데이트", "same_post_updated", upd.ok && upd.postId === pub.postId && post2.title.startsWith("[스테이징-업데이트]") && afterUpd === before + 1, `ok=${upd.ok} posts=${afterUpd} title=${post2.title.slice(0, 40)}`);
    record("4 업데이트", "images_replaced_consistent", JSON.stringify(imgRows2.map((r) => r.image_url)) === JSON.stringify(post2.images), `rows=${imgRows2.length} col=${(post2.images as unknown[]).length}`);

    // RPC rollback: a failing call after the image delete must leave the post untouched.
    const { error: rpcErr } = await sb.rpc("community_import_publish", {
      p: {
        mode: "update",
        source_site: key.sourceSite,
        source_board: key.sourceBoard,
        source_article_key: key.sourceArticleKey,
        post: { title: "SHOULD_NOT_STICK", content: "x", topic_id: topic?.id ?? null, topic_slug: topic?.slug ?? null },
        image_rows: [{ image_url: "https://example.invalid/zzz.jpg", sort_order: 0 }],
        draft: { edit: {} },
      },
    });
    const post3 = (await sb.from("community_posts").select("title").eq("id", pub.postId).single()).data!;
    const imgRows3 = (await sb.from("community_post_images").select("image_url").eq("post_id", pub.postId)).data ?? [];
    record("4 롤백", "failed_update_rolled_back", !!rpcErr && post3.title === post2.title && imgRows3.length === imgRows2.length, `err=${rpcErr?.message?.slice(0, 120)} title_kept=${post3.title === post2.title} images=${imgRows3.length}`);

    // Feed + detail through the app's own community queries.
    try {
      const { listNeighborhoodFeed, getNeighborhoodPostDetail } = await import("@/lib/neighborhood/queries");
      const feed = await listNeighborhoodFeed({ allLocations: true, limit: 20 } as Parameters<typeof listNeighborhoodFeed>[0]);
      const posts = ((feed as unknown as { posts?: Array<{ id: string; images?: string[] }> }).posts ?? []);
      const inFeed = posts.find((p) => p.id === pub.postId);
      const detail = await getNeighborhoodPostDetail(pub.postId);
      record("5 커뮤니티", "feed_contains_post", !!inFeed, `feed=${posts.length} thumb=${inFeed?.images?.[0] ?? "none"}`);
      record("5 커뮤니티", "detail_readable", !!detail, `title=${(detail as unknown as { title?: string } | null)?.title?.slice(0, 40)}`);
    } catch (e) {
      record("5 커뮤니티", "feed_query", false, e instanceof Error ? e.message : String(e));
    }
  });

  it("4b concurrent publish of the same article creates exactly one post", async () => {
    const { fetchArticleForInbox } = await import("@/lib/community-operator-import/collect");
    const { ensureDraftEdit } = await import("@/lib/community-operator-import/draft-store");
    const { publishImportedArticle } = await import("@/lib/community-operator-import/publish");
    const { data: pending } = await sb.from("community_operator_import_inbox").select("source_site, source_board, source_article_key").eq("source_site", "philsuda").is("published_post_id", null).order("first_seen_at", { ascending: false }).limit(1);
    const key = { sourceSite: "philsuda", sourceBoard: String(pending![0]!.source_board), sourceArticleKey: String(pending![0]!.source_article_key) };
    const { article } = await fetchArticleForInbox(sb, key);
    const edit = { ...ensureDraftEdit(article, null), topicId: topic?.id ?? null, topicSlug: topic?.slug ?? null };
    const before = (await sb.from("community_posts").select("*", { count: "exact", head: true })).count ?? 0;
    const [a, b] = await Promise.all([
      publishImportedArticle(sb, { article, edit, mode: "create", adminUserId: adminId, acceptPartial: true, rules: [] }),
      publishImportedArticle(sb, { article, edit, mode: "create", adminUserId: adminId, acceptPartial: true, rules: [] }),
    ]);
    const after = (await sb.from("community_posts").select("*", { count: "exact", head: true })).count ?? 0;
    const links = (await sb.from("community_import_post_links").select("post_id").match({ source_site: key.sourceSite, source_board: key.sourceBoard, source_article_key: key.sourceArticleKey })).data ?? [];
    record("4b 동시게시", "exactly_one_post", after === before + 1 && links.length === 1 && [a, b].filter((r) => r.ok).length === 1, `posts ${before}→${after} links=${links.length} results=${[a, b].map((r) => (r.ok ? "ok" : r.code)).join(",")}`);
  });

  it("6 bulk job: publish 2 more, then hide them", async () => {
    const { createJob, runJobChunk } = await import("@/lib/community-operator-import/jobs");
    const { data: pending } = await sb.from("community_operator_import_inbox").select("source_site, source_board, source_article_key").eq("source_site", "philsuda").is("published_post_id", null).limit(2);
    const items = (pending ?? []).map((r) => ({ sourceSite: r.source_site, sourceBoard: r.source_board, sourceArticleKey: r.source_article_key }));
    const job = await createJob(sb, { kind: "publish", items, params: { topicId: topic?.id, topicSlug: topic?.slug, acceptPartial: true }, adminUserId: adminId });
    let j = await runJobChunk(sb, job.id, { budgetMs: 120_000, adminUserId: adminId });
    while (j.status === "running") j = await runJobChunk(sb, job.id, { budgetMs: 120_000, adminUserId: adminId });
    record("6 일괄", "bulk_publish", j.done === items.length, `status=${j.status} done=${j.done} failed=${j.failed} skipped=${j.skipped} err=${j.lastError}`);
    const hide = await createJob(sb, { kind: "hide", items, params: {}, adminUserId: adminId });
    const h = await runJobChunk(sb, hide.id, { budgetMs: 60_000, adminUserId: adminId });
    const { data: links } = await sb.from("community_import_post_links").select("post_id").in("source_article_key", items.map((i) => i.sourceArticleKey));
    const { data: hidden } = await sb.from("community_posts").select("status").in("id", (links ?? []).map((l) => l.post_id));
    record("6 일괄", "bulk_hide", h.done === items.length && (hidden ?? []).every((p) => p.status === "hidden"), `done=${h.done} statuses=${(hidden ?? []).map((p) => p.status).join(",")}`);
  });

  it("7 scheduled collection: due boards only, never publishes; failures recorded", async () => {
    const { runScheduledCollection } = await import("@/lib/community-operator-import/scheduler");
    const { addCustomBoard, updateBoard } = await import("@/lib/community-operator-import/source-store");
    // a broken board to prove error logging + backoff
    const bad = await addCustomBoard(sb, "philsuda", { displayName: "깨진 피드", engineKey: "https://philsuda.com/__no_such_feed__.xml" });
    await sb.from("community_operator_import_source_boards").update({ collect_enabled: true }).match({ source_id: "philsuda", board_id: bad.boardId });
    await sb.from("community_operator_import_source_boards").update({ last_checked_at: null }).eq("source_id", "philsuda");
    const postsBefore = (await sb.from("community_posts").select("*", { count: "exact", head: true })).count ?? 0;
    const run = await runScheduledCollection(sb, { budgetMs: 90_000, verifyLimit: 0 });
    const postsAfter = (await sb.from("community_posts").select("*", { count: "exact", head: true })).count ?? 0;
    const badRow = (await sb.from("community_operator_import_source_boards").select("consecutive_failures, last_error").match({ source_id: "philsuda", board_id: bad.boardId }).single()).data;
    record("7 정기수집", "collected_due_boards", run.collected.some((c) => c.ok), JSON.stringify(run.collected.map((c) => ({ b: c.boardId, ok: c.ok, n: c.listed, e: c.error }))).slice(0, 400));
    record("7 정기수집", "no_auto_publish", postsAfter === postsBefore, `posts ${postsBefore}→${postsAfter}`);
    record("7 정기수집", "failure_recorded", (badRow?.consecutive_failures ?? 0) >= 1 && !!badRow?.last_error, `failures=${badRow?.consecutive_failures} err=${badRow?.last_error}`);
    void updateBoard;
  });
});
