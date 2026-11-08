-- 언어 SSOT B3 정정 (2026-11-08) — 운영 주문 사건 메시지에 저장된 message_key 13종 중 12종은 11-04 주문 단계 정본 통일
-- (9be69643f)로 카탈로그에서 정리됐다. 대화방은 키가 아니라 주문 상태 값으로 문장을 다시 만든다
-- (`resolveStoreOrderOpsBodyText`: domain·lineKind·orderStatus·orderFlow·cancel_kind·cancel_reason·deliveryStatus).
-- 목록도 같은 함수를 쓰도록 방 메타에 이 값들을 함께 담는다. 다른 동작 변경 없음.

create or replace function public.cm_room_last_system_meta_from_message(p_content text, p_metadata jsonb)
returns jsonb
language sql
immutable
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'text', btrim(split_part(replace(left(coalesce(p_content, ''), 200), E'\r', ''), E'\n', 1)),
    'message_key', p_metadata -> 'message_key',
    'message_vars', p_metadata -> 'message_vars',
    'kind', p_metadata -> 'kind',
    'listingState', p_metadata -> 'listingState',
    'domain', p_metadata -> 'domain',
    'lineKind', p_metadata -> 'lineKind',
    'orderStatus', p_metadata -> 'orderStatus',
    'orderFlow', p_metadata -> 'orderFlow',
    'deliveryStatus', p_metadata -> 'deliveryStatus',
    'cancel_kind', p_metadata -> 'cancel_kind',
    'cancel_reason', p_metadata -> 'cancel_reason'
  ));
$$;
