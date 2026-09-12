import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const raw = readFileSync(".env.local", "utf8");
for (const line of raw.split("\n")) {
  if (!line || line.startsWith("#") || !line.includes("=")) continue;
  const i = line.indexOf("=");
  const k = line.slice(0, i).trim();
  let v = line.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (process.env[k] == null) process.env[k] = v;
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// 1. Isolate/deactivate legacy QA fixture source
const { data: existingSources } = await sb.from("community_crawl_sources").select("*");
for (const s of existingSources || []) {
  if (s.name.includes("QA Crawl Fixture")) {
    console.log("Deactivating legacy QA fixture source:", s.id, s.name);
    await sb.from("community_crawl_sources").update({ status: "INACTIVE" }).eq("id", s.id);
  }
}

// 2. Fetch topic for mapping
const { data: topics } = await sb.from("community_topics").select("id, name, slug");
const travelTopic = (topics || []).find((t) => t.slug === "travel" || t.name === "여행정보") || topics[0];
console.log("Target topic:", travelTopic?.id, travelTopic?.name);

// 3. Register Positive Source
const baseUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/post-images/positive-source/`;
const listUrl = `${baseUrl}index.html`;

let source = (existingSources || []).find((s) => s.name === "DIBAY 필리핀 생활 가이드 (공식 매거진)");
if (!source) {
  const { data: newSource, error } = await sb
    .from("community_crawl_sources")
    .insert({
      name: "DIBAY 필리핀 생활 가이드 (공식 매거진)",
      base_url: baseUrl,
      status: "ACTIVE",
      crawler_type: "generic_html",
      policy_status: "ALLOWED",
      media_policy: "MEDIA_ALLOWED",
      publish_mode: "FULL_CONTENT",
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw error;
  source = newSource;
  console.log("Created positive source:", source.id);
} else {
  const { data: updated, error } = await sb
    .from("community_crawl_sources")
    .update({
      status: "ACTIVE",
      policy_status: "ALLOWED",
      media_policy: "MEDIA_ALLOWED",
      updated_at: new Date().toISOString(),
    })
    .eq("id", source.id)
    .select("*")
    .single();
  if (error) throw error;
  source = updated;
  console.log("Updated positive source:", source.id);
}

// 4. Register Board for positive source
const { data: existingBoards } = await sb.from("community_crawl_boards").select("*").eq("source_id", source.id);
let board = existingBoards?.[0];
const adapterConfig = {
  listLinkSelector: "ul.article-list a",
  titleSelector: "h1",
  contentSelector: "article .article-content",
  coverImageSelector: "article img.cover",
};

if (!board) {
  const { data: newBoard, error } = await sb
    .from("community_crawl_boards")
    .insert({
      source_id: source.id,
      name: "필리핀 정착/생활 가이드",
      list_url: listUrl,
      dibay_topic_id: travelTopic.id,
      enabled: true,
      crawl_mode: "generic_html",
      adapter_config: adapterConfig,
      update_policy: "CREATE_ONLY",
      author_policy: "SOURCE_AUTHOR",
      author_config: {},
      date_policy: "SOURCE_DATE",
      date_config: {},
      view_policy: "RANDOM_RANGE",
      view_config: { min: 100, max: 800 },
      schedule_enabled: true,
      crawl_interval_minutes: 60,
      max_pages: 3,
      max_posts: 20,
      ingest_mode: "AUTO_PUBLISH",
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw error;
  board = newBoard;
  console.log("Created positive board:", board.id);
} else {
  const { data: updated, error } = await sb
    .from("community_crawl_boards")
    .update({
      enabled: true,
      schedule_enabled: true,
      ingest_mode: "AUTO_PUBLISH",
      adapter_config: adapterConfig,
      updated_at: new Date().toISOString(),
    })
    .eq("id", board.id)
    .select("*")
    .single();
  if (error) throw error;
  board = updated;
  console.log("Updated positive board:", board.id);
}

console.log("ONBOARDING RESULT:", {
  sourceId: source.id,
  sourceName: source.name,
  policyStatus: source.policy_status,
  mediaPolicy: source.media_policy,
  boardId: board.id,
  boardName: board.name,
  ingestMode: board.ingest_mode,
  scheduleEnabled: board.schedule_enabled,
  listUrl: board.list_url,
});
