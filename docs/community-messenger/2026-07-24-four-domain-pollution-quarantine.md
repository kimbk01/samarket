# Four-domain pollution quarantine (2026-07-24)

Baseline commit: `0adc8166d`

## Summary

Earlier “11건” counted product_chat links. Read-only dry-run of rooms with `chat_domain=trade` but pair-style `direct_key` found **4 rooms** (type `trade_domain_with_pair_key`).

Source: `.qa-logs/four-domain-pollution/pollution-dry-run.json`

## Quarantine rows (do not auto-merge)

| room_id | chat_domain | domain_identity_key (current) | issue | fixable? |
|---|---|---|---|---|
| `661e27ad-7c8c-4d9d-a16d-ccab83bc1507` | trade | trade:b20395a2-…:e709…:0c4b… | pair `direct_key` + **8** product_chats / items on one room | **quarantine** — multi-PC merge unsafe |
| `30f97067-27f6-4bfa-8dfb-27f4f4f6ca13` | trade | trade:a18a7178-…:1111…:0c4b… | pair `direct_key` | possible direct_key → trade ledger key once single PC verified |
| `901e97e5-81d0-4e13-ae90-993f7aa962d7` | trade | trade:1a8e88ff-…:1111…:e709… | pair `direct_key` | same |
| `6d9f98b7-539c-4271-8e79-de7594422465` | trade | trade:c9a3cce5-…:83ce…:0c4b… | pair `direct_key` | same |

## Principles

- Do **not** delete messages, call events, participants, or unread.
- Do **not** merge rooms that share multiple product_chats.
- Prefer quarantine + app writers that never re-emit pair keys for trade.
- Apply `direct_key` rewrite only after per-room dry-run SQL + rollback.

## Status

**DATA MIGRATION PENDING** — code path must stop new pollution; historical 4 rooms remain quarantined until explicit migration approval.
