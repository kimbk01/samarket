-- 언어 SSOT B6 / 발견 목록 L20 (Owner 「권장대로 승인」·「남은 부분은 모두 완료 해라」 2026-11-08)
-- 알림음 이벤트 이름은 휴대폰 알림 설정의 채널 이름으로 보인다(S8-4a). 내부 표현·뜻이 줄어든 9개를 고친다.
-- 용어집: 사장님 = Owner(「오너」 금지). 지금 값이 아래 「이전 값」과 같을 때만 바꾼다(다른 사람이 바꿨으면 그대로).
--
-- 이전 값(백업)                                   →  새 값
-- delivery_chat_message_received_owner  오너 주문 채팅 / Owner order chat        → 사장님 주문 채팅 / Order chat (Owner)
-- delivery_order_cancelled_owner        오너 주문 취소 / Owner order cancelled   → 사장님 주문 취소 / Order cancelled (Owner)
-- delivery_order_created_owner          오너 신규 주문 / Owner new order         → 사장님 신규 주문 / New order (Owner)
-- delivery_order_delayed_owner          오너 주문 지연 / Owner order delayed     → 사장님 주문 지연 / Order delayed (Owner)
-- delivery_order_sold_out_owner         오너 품절 / Owner sold out               → 사장님 품절 / Sold out (Owner)
-- item_admin_notice_legacy              옛 관리자 공지 / Legacy admin notice     → 이전 관리자 공지 / Admin notice (old)
-- admin_report_received                 관리자 신고 / Admin report               → 신고 접수 / Report received
-- item_community_meeting                모임 가입·승인·내보내기 / Meeting        → (한국어 그대로) / Meeting join and approval
-- item_community_moderation             게시글 조치·제재 / Post action           → (한국어 그대로) / Post actions and sanctions

update public.notification_sound_events e
   set label_ko = v.new_ko, label_en = v.new_en, updated_at = now()
  from (values
    ('delivery_chat_message_received_owner', '오너 주문 채팅', 'Owner order chat', '사장님 주문 채팅', 'Order chat (Owner)'),
    ('delivery_order_cancelled_owner', '오너 주문 취소', 'Owner order cancelled', '사장님 주문 취소', 'Order cancelled (Owner)'),
    ('delivery_order_created_owner', '오너 신규 주문', 'Owner new order', '사장님 신규 주문', 'New order (Owner)'),
    ('delivery_order_delayed_owner', '오너 주문 지연', 'Owner order delayed', '사장님 주문 지연', 'Order delayed (Owner)'),
    ('delivery_order_sold_out_owner', '오너 품절', 'Owner sold out', '사장님 품절', 'Sold out (Owner)'),
    ('item_admin_notice_legacy', '옛 관리자 공지', 'Legacy admin notice', '이전 관리자 공지', 'Admin notice (old)'),
    ('admin_report_received', '관리자 신고', 'Admin report', '신고 접수', 'Report received'),
    ('item_community_meeting', '모임 가입·승인·내보내기', 'Meeting', '모임 가입·승인·내보내기', 'Meeting join and approval'),
    ('item_community_moderation', '게시글 조치·제재', 'Post action', '게시글 조치·제재', 'Post actions and sanctions')
  ) as v(event_key, old_ko, old_en, new_ko, new_en)
 where e.event_key = v.event_key
   and e.label_ko = v.old_ko
   and e.label_en = v.old_en;
