import { redirect } from "next/navigation";
import { NEIGHBOR_FOLLOW_MYPAGE_HREF } from "@/lib/community/neighbor-follow-contract";

export default function FavoriteUsersPage() {
  /** 옛 「모아보는 사용자」 → 관심이웃 (관심이웃 설계 B) */
  redirect(NEIGHBOR_FOLLOW_MYPAGE_HREF);
}
