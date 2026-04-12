# `lib/chat-domain`

도메인 **포트(인터페이스)**와 **유스케이스**만 둔다. Postgres·Supabase·HTTP는 **`lib/chat-infra-supabase`** 등 어댑터에서 주입한다.

## 현재

- `ports/community-messenger-read.ts` — 방 스냅샷 조회
- `use-cases/community-messenger-bootstrap.ts` — 부트스트랩 유스케이스

## 다음 단계 (별 PR)

- 메시지 전송·히스토리·멤버 페이지 포트 추가
- `lib/community-messenger/service.ts`에서 구현을 한 줄씩 어댑터로 이전
