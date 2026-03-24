import Link from "next/link";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { CommunityPostCard } from "@/components/community/CommunityPostCard";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { listCommunityPostsForUser } from "@/lib/community-feed/queries";

export default async function MypageCommunityPostsPage() {
  const uid = await getOptionalAuthenticatedUserId();
  const posts = uid ? await listCommunityPostsForUser(uid) : [];

  return (
    <div className="min-h-screen bg-[#f3f4f6] pb-24">
      <header className="sticky top-0 z-10 flex items-center border-b border-gray-100 bg-white px-2 py-3">
        <AppBackButton backHref="/mypage" ariaLabel="뒤로" />
        <h1 className="flex-1 text-center text-[16px] font-semibold text-gray-900">내 동네생활 글</h1>
        <span className="w-11 shrink-0" />
      </header>

      <div className="mx-auto max-w-lg space-y-3 px-3 py-4">
        {!uid ? (
          <div className="rounded-2xl border border-gray-100 bg-white px-4 py-8 text-center text-[14px] text-gray-600">
            로그인 후 내가 쓴 동네생활 글을 볼 수 있어요.
            <div className="mt-4">
              <Link href="/login" className="font-medium text-blue-600 hover:underline">
                로그인
              </Link>
            </div>
          </div>
        ) : posts.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-12 text-center text-[14px] text-gray-500">
            아직 작성한 글이 없어요.
          </p>
        ) : (
          posts.map((p) => <CommunityPostCard key={p.id} post={p} />)
        )}
      </div>
    </div>
  );
}
