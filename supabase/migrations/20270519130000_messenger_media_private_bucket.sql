-- C-4 (O-C3 승인) — 메신저 첨부 비공개 버킷 `messenger-media`.
-- 설계: docs/admin/dibay-admin-chat-audit-design.md §1.2 · §7 · §8 C-4.
--
-- 목적: 신규 채팅 첨부(이미지·파일·음성·동영상 파일, 1:1/그룹/거래/주문 공통)를 URL 만으로 열람할 수 없게 한다.
--   - public = false → `/storage/v1/object/public/messenger-media/...` 직접 접근 불가.
--   - anon/authenticated 의 storage.objects 접근을 이 버킷에 한해 RESTRICTIVE 정책으로 전면 차단
--     (다른 버킷의 PERMISSIVE 정책이 bucket 조건 없이 열려 있더라도 AND 로 막힌다).
--   - 업로드·서명 URL 발급·삭제는 서버(service_role, RLS 우회)만 한다. 클라이언트 직접 업로드는
--     서버가 발급한 signed upload URL(토큰) 로만 가능 — RLS 정책이 필요 없다.
--   - 열람은 `GET /api/community-messenger/rooms/{roomId}/messages/{messageId}/media` 가
--     참가자(또는 `chats` 권한 관리자 + audit_logs) 확인 후 10분 서명 URL 로 302.
--
-- 비파괴: 기존 `post-images` 버킷·파일·정책은 건드리지 않는다(이동·삭제 없음). 레거시 첨부는 공개 상태로 남으며
-- 별도 승인된 이전 마이그레이션에서 다룬다.
-- 코드 호환: 앱 서버는 이 버킷이 **존재하고 public=false** 일 때만 신규 업로드를 보낸다(미적용 시 post-images 유지).
-- 롤백 스위치: env `MESSENGER_PRIVATE_MEDIA_BUCKET=off` → 신규 업로드를 다시 post-images 로(이미 올라간 비공개 파일은
-- 조회 라우트로 계속 열람 가능).

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('messenger-media', 'messenger-media', false, 52428800, null)
on conflict (id) do update set public = false;

drop policy if exists "messenger-media: deny client access" on storage.objects;
create policy "messenger-media: deny client access"
  on storage.objects
  as restrictive
  for all
  to anon, authenticated
  using (bucket_id <> 'messenger-media')
  with check (bucket_id <> 'messenger-media');

commit;
