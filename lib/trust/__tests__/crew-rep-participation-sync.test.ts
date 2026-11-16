import { describe, expect, it } from "vitest";
import {
  diffParticipationEvents,
  planParticipationEvents,
  type ExistingParticipationEvent,
  type LoungeComment,
  type LoungeLike,
  type LoungePost,
  type ParticipationSources,
  type StoreReviewSource,
} from "@/lib/trust/crew-rep-participation-sync";

const AS_OF = new Date("2026-11-25T04:00:00.000Z");
const H = 3_600_000;
const hoursAgo = (h: number) => new Date(AS_OF.getTime() - h * H).toISOString();
const BEFORE_START = "2026-11-10T00:00:00.000Z";

const post = (over: Partial<LoungePost> = {}): LoungePost => ({
  id: "p1",
  user_id: "author",
  created_at: hoursAgo(100),
  status: "active",
  is_hidden: false,
  is_deleted: false,
  is_sample_data: false,
  is_notice: false,
  origin_kind: "member",
  ...over,
});
const comment = (over: Partial<LoungeComment> = {}): LoungeComment => ({
  id: "c1",
  post_id: "p1",
  user_id: "reader",
  content: "좋은 정보 감사합니다 덕분에 알았어요",
  created_at: hoursAgo(30),
  status: "active",
  is_hidden: false,
  is_deleted: false,
  ...over,
});
const like = (over: Partial<LoungeLike> = {}): LoungeLike => ({
  id: "l1",
  target_id: "p1",
  user_id: "fan",
  created_at: hoursAgo(50),
  kind: "post",
  ...over,
});
const review = (over: Partial<StoreReviewSource> = {}): StoreReviewSource => ({
  id: "r1",
  buyer_user_id: "buyer",
  content: "음식이 따뜻하게 잘 왔어요",
  image_urls: [],
  status: "visible",
  created_at: hoursAgo(20),
  order_buyer_user_id: "buyer",
  order_status: "completed",
  order_completed_at: hoursAgo(40),
  store_owner_user_id: "owner",
  ...over,
});
const src = (over: Partial<ParticipationSources> = {}): ParticipationSources => ({
  posts: [],
  comments: [],
  likes: [],
  storeReviews: [],
  ...over,
});
const types = (s: ParticipationSources) => planParticipationEvents(s, AS_OF).map((e) => `${e.event_type}:${e.member_id}`).sort();

describe("CREW REP 참여도 동기화 — 인정 조건 (S3)", () => {
  it("글: 72시간 유지 + 다른 회원 반응 → 인정 · 반응 없음/72시간 전/자기 좋아요만 → 불인정", () => {
    expect(types(src({ posts: [post()], likes: [like()] }))).toContain("participation_post:author");
    expect(types(src({ posts: [post()] }))).not.toContain("participation_post:author");
    expect(types(src({ posts: [post({ created_at: hoursAgo(50) })], likes: [like()] }))).not.toContain(
      "participation_post:author"
    );
    expect(types(src({ posts: [post()], likes: [like({ user_id: "author" })] }))).toEqual([]);
  });

  it("글: 가져온 글·숨김·삭제·공지·기록 시작 이전 → 불인정", () => {
    for (const p of [
      post({ origin_kind: "imported" }),
      post({ is_hidden: true }),
      post({ status: "deleted" }),
      post({ is_notice: true }),
      post({ created_at: BEFORE_START }),
    ]) {
      expect(types(src({ posts: [p], likes: [like()] }))).not.toContain("participation_post:author");
    }
  });

  it("댓글: 남의 글·10자 이상·24시간 유지 → 작성자 +작성, 글 주인 +받음", () => {
    expect(types(src({ posts: [post()], comments: [comment()] }))).toEqual([
      "participation_comment_received:author",
      "participation_comment_written:reader",
      "participation_post:author",
    ]);
  });

  it("댓글: 10자 미만·24시간 전·자기 글·숨김 → 불인정", () => {
    for (const c of [
      comment({ content: "좋아요 ^^" }),
      comment({ created_at: hoursAgo(5) }),
      comment({ user_id: "author" }),
      comment({ is_hidden: true }),
    ]) {
      const t = types(src({ posts: [post()], comments: [c] }));
      expect(t.filter((x) => x.startsWith("participation_comment"))).toEqual([]);
    }
  });

  it("기록 시작 이전 글에 새로 단 댓글·좋아요는 인정(글 점수는 없음)", () => {
    const t = types(
      src({
        posts: [post({ created_at: BEFORE_START })],
        comments: [comment()],
        likes: [like()],
      })
    );
    expect(t).toEqual([
      "participation_comment_received:author",
      "participation_comment_written:reader",
      "participation_like_received:author",
    ]);
  });

  it("받은 좋아요: 댓글 좋아요는 댓글 주인에게, 자기 좋아요 제외", () => {
    const t = types(
      src({
        posts: [post()],
        comments: [comment()],
        likes: [
          like({ id: "l2", kind: "comment", target_id: "c1", user_id: "author" }),
          like({ id: "l3", kind: "comment", target_id: "c1", user_id: "reader" }),
        ],
      })
    );
    expect(t.filter((x) => x.startsWith("participation_like"))).toEqual(["participation_like_received:reader"]);
  });

  it("매장 후기: 완료 주문·14일 안·10자 이상 또는 사진·본인 매장 제외·숨김 제외", () => {
    expect(types(src({ storeReviews: [review()] }))).toEqual(["participation_store_review:buyer"]);
    expect(types(src({ storeReviews: [review({ content: "", image_urls: ["https://x/a.jpg"] })] }))).toHaveLength(1);
    for (const r of [
      review({ content: "맛있음" }),
      review({ order_status: "refunded" }),
      review({ order_status: "cancelled" }),
      review({ status: "hidden" }),
      review({ store_owner_user_id: "buyer" }),
      review({ order_buyer_user_id: "someone" }),
      review({ order_completed_at: hoursAgo(20 + 15 * 24) }),
      review({ created_at: BEFORE_START }),
    ]) {
      expect(types(src({ storeReviews: [r] }))).toEqual([]);
    }
  });

  it("멱등 키 = 종류:원천:회원 (같은 입력 → 같은 키)", () => {
    const a = planParticipationEvents(src({ posts: [post()], likes: [like()] }), AS_OF);
    const b = planParticipationEvents(src({ posts: [post()], likes: [like()] }), AS_OF);
    expect(a.map((e) => e.idempotency_key)).toEqual(b.map((e) => e.idempotency_key));
    expect(a.find((e) => e.event_type === "participation_post")?.idempotency_key).toBe("participation_post:p1:author");
  });
});

describe("CREW REP 참여도 동기화 — 원장 비교", () => {
  const desired = planParticipationEvents(src({ posts: [post()], likes: [like()] }), AS_OF);
  const ex = (key: string, status: string, reason?: string): ExistingParticipationEvent => ({
    id: key,
    member_id: "author",
    idempotency_key: key,
    status,
    metadata: reason ? { reverse_reason: reason } : {},
  });

  it("없는 것은 기록, 더는 인정 안 되는 confirmed 는 되돌림", () => {
    const d = diffParticipationEvents(desired, [ex("participation_like_received:gone:author", "confirmed")]);
    expect(d.insert.map((x) => x.idempotency_key).sort()).toEqual(desired.map((x) => x.idempotency_key).sort());
    expect(d.reverse.map((x) => x.idempotency_key)).toEqual(["participation_like_received:gone:author"]);
  });

  it("동기화기가 되돌린 사건이 다시 인정되면 confirmed 로, 다른 사유로 되돌린 것은 그대로", () => {
    const key = desired[0]!.idempotency_key;
    expect(diffParticipationEvents(desired, [ex(key, "reversed", "participation_source_invalid")]).reconfirm).toHaveLength(1);
    expect(diffParticipationEvents(desired, [ex(key, "reversed", "admin_decision")]).reconfirm).toHaveLength(0);
    expect(diffParticipationEvents(desired, [ex(key, "reversed", "admin_decision")]).insert.map((x) => x.idempotency_key)).not.toContain(key);
  });

  it("이미 있는 confirmed 는 아무것도 안 함", () => {
    const d = diffParticipationEvents(
      desired,
      desired.map((x) => ex(x.idempotency_key, "confirmed"))
    );
    expect(d).toEqual({ insert: [], reverse: [], reconfirm: [] });
  });
});
