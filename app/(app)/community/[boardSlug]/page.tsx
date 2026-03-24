import { redirect } from "next/navigation";

/** 레거시 게시판 URL → 피드 단일 진입 */
export default async function LegacyCommunityBoardRoute() {
  redirect("/community");
}
