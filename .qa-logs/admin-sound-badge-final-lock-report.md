# DIBAY Admin Sound + Badge Final Lock

Generated: 2026-07-09

## Verdict Summary

| Verdict | Count |
|---|---:|
| PASS_ACTUAL | 26 |
| CLIENT_ONLY | 2 |
| NATIVE_SCOPE | 7 |
| SOUND_FAIL | 0 |
| BADGE_FAIL | 0 |
| UNWIRED | 0 |

## Admin 36 EventKey Final Table

| eventKey | Admin fileUrl | Producer exists | notification_events or client direct path | Badge target | Sound target | fixture/test | verdict |
|---|---|---|---|---|---|---|---|
| system_default | yes | fallback | resolver fallback | no | yes | registry/contract fallback | PASS_ACTUAL |
| messenger_message_sent | yes | yes | client direct ACK | no | yes | ACK vitest | CLIENT_ONLY |
| messenger_direct_message_received | yes | yes | notification_events | yes | yes | fixture + gate vitest | PASS_ACTUAL |
| messenger_group_message_received | yes | yes | notification_events | yes | yes | fixture | PASS_ACTUAL |
| friend_request_received | yes | yes | notification_events/legacy adapter | yes | yes | fixture + gate vitest | PASS_ACTUAL |
| friend_request_accepted | yes | yes | notification_events/legacy adapter | yes | yes | fixture | PASS_ACTUAL |
| trade_chat_message_received | yes | yes | notification_events | yes | yes | fixture + prior APK audit | PASS_ACTUAL |
| trade_offer_received | yes | yes | notification_events | yes | yes | fixture | PASS_ACTUAL |
| trade_reserved | yes | yes | notification_events/legacy adapter | yes | yes | fixture | PASS_ACTUAL |
| trade_completed | yes | yes | notification_events/legacy adapter | yes | yes | fixture | PASS_ACTUAL |
| delivery_order_status_changed_user | yes | yes | notification_events/legacy adapter | yes | yes | fixture | PASS_ACTUAL |
| delivery_chat_message_received_user | yes | yes | notification_events | yes | yes | fixture + P1-B vitest | PASS_ACTUAL |
| delivery_order_created_owner | yes | yes | notification_events | yes | yes | fixture + duplicate test | PASS_ACTUAL |
| delivery_chat_message_received_owner | yes | yes | notification_events | yes | yes | fixture + P1-B vitest | PASS_ACTUAL |
| delivery_order_cancelled_owner | yes | yes | notification_events | yes | yes | fixture | PASS_ACTUAL |
| delivery_order_delayed_owner | yes | yes | notification_events/legacy adapter | yes | yes | fixture | PASS_ACTUAL |
| delivery_order_sold_out_owner | yes | yes | notification_events/legacy adapter | yes | yes | fixture | PASS_ACTUAL |
| delivery_review_received_owner | yes | yes | notification_events/legacy adapter | yes | yes | fixture | PASS_ACTUAL |
| delivery_inquiry_received_owner | yes | yes | notification_events/legacy adapter | yes | yes | fixture | PASS_ACTUAL |
| delivery_order_match_chat | yes | yes | client direct | no | yes | play-order-match vitest | CLIENT_ONLY |
| call_incoming_voice | yes | yes | Native/FCM call runtime | native | yes | native scope audit | NATIVE_SCOPE |
| call_incoming_video | yes | yes | Native/FCM call runtime | native | yes | native scope audit | NATIVE_SCOPE |
| call_outgoing_voice | yes | yes | Native/client ringback | no | yes | native scope audit | NATIVE_SCOPE |
| call_outgoing_video | yes | yes | Native/client ringback | no | yes | native scope audit | NATIVE_SCOPE |
| call_missed | yes | yes | notification_events + native push | yes | yes | native scope audit | NATIVE_SCOPE |
| call_ended | yes | yes | Native/client call UI | no | yes | native scope audit | NATIVE_SCOPE |
| call_rejected | yes | yes | Native/client call UI | no | yes | native scope audit | NATIVE_SCOPE |
| admin_report_received | yes | yes | notification_events/legacy adapter | yes | yes | fixture | PASS_ACTUAL |
| admin_notice_received | yes | yes | notification_events/legacy adapter | yes | yes | fixture | PASS_ACTUAL |
| settlement_balance_low | yes | yes | notification_events/legacy adapter | yes | yes | fixture | PASS_ACTUAL |
| settlement_charge_approved | yes | yes | notification_events/legacy adapter | yes | yes | fixture | PASS_ACTUAL |
| settlement_charge_rejected | yes | yes | notification_events/legacy adapter | yes | yes | fixture | PASS_ACTUAL |
| settlement_charge_requested | yes | yes | notification_events/legacy adapter | yes | yes | fixture | PASS_ACTUAL |
| community_comment_received | yes | yes | notification_events/legacy adapter | yes | yes | fixture | PASS_ACTUAL |
| community_mention_received | yes | yes | notification_events | yes | yes | fixture | PASS_ACTUAL |
| community_like_received | yes | yes | notification_events/legacy adapter | yes | yes | fixture | PASS_ACTUAL |
