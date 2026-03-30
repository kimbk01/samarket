import { redirect } from "next/navigation";

/** 인증은 루트 `proxy.ts`에서 처리. 로그인된 경우에만 이 라우트에 도달합니다. */
export default function Page() {
  redirect("/home");
}