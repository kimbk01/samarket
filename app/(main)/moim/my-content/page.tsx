import { MoimMyContentScreen } from "@/components/moim/MoimMyContentScreen";

type Props = { searchParams: Promise<{ moim?: string | string[] }> };

/** R5 B1: 내가 쓴 글·댓글·사진 /moim/my-content (?moim={id} = 그 모임만) */
export default async function MoimMyContentPage({ searchParams }: Props) {
  const raw = (await searchParams).moim;
  const moimId = typeof raw === "string" && /^[0-9a-f-]{36}$/i.test(raw) ? raw : null;
  return <MoimMyContentScreen moimId={moimId} />;
}
