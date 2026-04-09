import Link from "next/link";
import { CommunityPostCard } from "@/components/community/CommunityPostCard";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { listCommunityPostsForUser } from "@/lib/community-feed/queries";

export default async function MypageCommunityPostsPage() {
  const uid = await getOptionalAuthenticatedUserId();
  const posts = uid ? await listCommunityPostsForUser(uid) : [];

  return (
    <div className="min-h-screen bg-[#f3f4f6] pb-24">
      <MySubpageHeader
        title="내 활동"
        subtitle="내가 남긴 커뮤니티 글"
        backHref="/mypage"
        section="board"
      />

      <div className="mx-auto max-w-4xl space-y-3 px-4 py-4">
        {!uid ? (
          <div className="rounded-2xl border border-gray-100 bg-white px-4 py-8 text-center text-[14px] text-gray-600">
            로그인 후 내 활동을 확인할 수 있어요.
            <div className="mt-4">
              <Link href="/login" className="font-medium text-blue-600 hover:underline">
                로그인
              </Link>
            </div>
          </div>
        ) : posts.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-12 text-center text-[14px] text-gray-500">
            아직 남긴 활동이 없어요.
          </p>
        ) : (
          <div className="space-y-2.5">
            {posts.map((p) => (
              <CommunityPostCard key={p.id} post={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
