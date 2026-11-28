import { redirect } from "next/navigation";

export default function FavoriteUsersPage() {
  /** 옛 「모아보는 사용자」 → 관심이웃 (관심이웃 설계 B) */
  redirect("/mypage/section/community/community-friends");
}
