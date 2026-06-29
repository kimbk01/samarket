# Notification Sound SSOT — 실기기 QA

## Admin

- [ ] `/admin/settings/notifications` SSOT 테이블 전 eventKey 노출
- [ ] 변경 미리보기 → 적용 → toast
- [ ] preview-resolver sample 2건 PASS
- [ ] legacy 섹션 접기/펼치기 (mirror 유지)

## Web foreground

- [ ] 1:1 메시지 수신음 (`messenger_direct_message_received`)
- [ ] 그룹 메시지 (`messenger_group_message_received`)
- [ ] 거래 채팅 (`trade_chat_message_received`)
- [ ] 배달 주문자 채팅 (`delivery_chat_message_received_user`)
- [ ] 오너 신규 주문 (`delivery_order_created_owner`)
- [ ] room mute → 무음

## Call (Web)

- [ ] 음성 수신 벨 (`call_incoming_voice`)
- [ ] 영상 수신 벨 (`call_incoming_video`)
- [ ] 발신 연결음 (`call_outgoing_voice` / video)
- [ ] 통화 종료음 (`call_ended`)

## Android (non-LOCK)

- [ ] FCM payload `eventKey`, `androidChannelId` 수신
- [ ] 잠금화면 통화 수신 기존 동작 유지 (Call LOCK bundle 미변경)
- [ ] Admin sound 변경 후 **새 알림부터** 반영

## Red-Team

```bash
npm run verify:notification-sound-ssot-contract
vitest run lib/notifications/__tests__/notification-sound-registry.test.ts lib/notifications/__tests__/notification-sound-resolver.test.ts lib/notifications/__tests__/notification-sound-legacy-mirror.test.ts
npm run verify:call-v4-incoming-fsi-fallback-boundary
```
