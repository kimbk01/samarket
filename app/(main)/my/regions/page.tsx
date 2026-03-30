import { redirect } from "next/navigation";

/** 동네 설정은 `주소 관리`로 통합되었습니다. */
export default function MyRegionsRedirectPage() {
  redirect("/my/addresses");
}
