import { redirect } from "next/navigation";

/** 레거시 /community/{board}/write → 피드 글쓰기 (게시판 slug는 노출·매핑하지 않음) */
export default async function LegacyCommunityWriteRoute() {
  redirect("/community/write");
}
