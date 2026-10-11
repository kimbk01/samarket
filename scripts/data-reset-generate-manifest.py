#!/usr/bin/env python3
"""Generate lib/admin/data-reset/full/manifest.json from docs/data-reset/p1_classification_matrix.csv.

The manifest is the single input of the full data reset plan builder (public.data_reset_full_build_plan).
Every public table must appear in it (the builder refuses to plan on schema drift).

Class mapping (p1_proposed → manifest class):
  DELETE → DELETE, KEEP → KEEP, LEGAL_HOLD → LEGAL_HOLD, COND → COND (TESTER-owned rows only),
  UNRESOLVED → UNRESOLVED (never deleted), "DELETE(행 분할)" → SPLIT with an explicit row predicate.

Usage: python3 scripts/data-reset-generate-manifest.py [--check]
"""
import csv
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "docs/data-reset/p1_classification_matrix.csv"
OUT = ROOT / "lib/admin/data-reset/full/manifest.json"
VERSION = "p1-proposed-2026-10-11"

CLASS = {"DELETE": "DELETE", "KEEP": "KEEP", "LEGAL_HOLD": "LEGAL_HOLD", "COND": "COND",
         "UNRESOLVED": "UNRESOLVED", "DELETE(행 분할)": "SPLIT"}

# SPLIT predicates select the deletable part of the table (owner rule still applies on top).
SPLIT = {
    # security / reset / purge records stay; member activity rows of TESTER actors go
    "audit_logs": "action IS NULL OR action !~ '^(admin_destructive_|data_reset|user_purge|user_withdraw)'",
    # platform defaults (store_id NULL) stay; per-store rows follow their store
    "gift_certificate_products": "store_id IS NOT NULL",
    "store_fee_policies": "store_id IS NOT NULL",
    "store_point_policies": "store_id IS NOT NULL",
}

# COND tables that must stay whole until the Owner releases them (data_reset_release_flags).
HOLD_ALL = {"point_action_logs", "point_reward_executions", "point_reward_logs", "point_expire_executions",
            "point_expire_logs", "community_messenger_admin_oversight_logs"}

# Derived caches / migration work tables: regenerable, every row goes (DELETE class only).
WHOLESALE_RE = re.compile(r"(^_.*backfill|_snapshots$)")

# Message-like rows stay with a kept container (a TESTER's message inside a real member's room).
FOLLOW_PARENTS_RE = re.compile(r"(_messages$|_attachments$)")

# Non-FK references: a kept row pointing at a candidate keeps the candidate (and is re-checked under lock).
SOFT_REFS = [
    {"from": "reports", "col": "product_id", "to": ["posts"]},
    {"from": "reports", "col": "room_id", "to": ["chat_rooms", "product_chats"]},
    {"from": "reports", "col": "target_id", "to": ["posts", "community_posts", "comments", "community_comments", "stores"]},
    {"from": "chat_reports", "col": "item_id", "to": ["posts"]},
    {"from": "community_reports", "col": "post_id", "to": ["community_posts"]},
    {"from": "community_reports", "col": "target_id", "to": ["community_posts", "community_comments"]},  # text column
    {"from": "moderation_actions", "col": "target_id", "to": ["posts", "community_posts", "community_comments"]},
    {"from": "meeting_reports", "col": "target_id", "to": ["meetings", "meeting_feed_posts"]},
    {"from": "transaction_reviews", "col": "product_id", "to": ["posts"]},
    {"from": "transaction_reviews", "col": "room_id", "to": ["chat_rooms", "product_chats"]},
    {"from": "store_reports", "col": "target_id", "to": ["stores", "store_products", "store_reviews"]},
    {"from": "community_post_images", "col": "post_id", "to": ["community_posts"]},
    {"from": "post_images", "col": "post_id", "to": ["posts"]},
    {"from": "chat_event_logs", "col": "room_id", "to": ["chat_rooms"]},
    {"from": "favorite_audit_log", "col": "post_id", "to": ["posts"]},
    {"from": "delivery_ad_impression_events", "col": "store_id", "to": ["stores"]},
    {"from": "delivery_ad_partner_memberships", "col": "store_id", "to": ["stores"]},
]

PATH_COLUMNS = [
    {"table": "community_post_images", "col": "storage_path", "bucket": "post-images"},
    {"table": "post_images", "col": "storage_path", "bucket": "post-images"},
]

OWNER_INCLUDE = ["test_users.id", "users.id", "favorite_audit_log.user_id", "audit_logs.actor_id"]
OWNER_EXCLUDE: list = []


def build() -> dict:
    rows = list(csv.DictReader(SRC.open(encoding="utf-8-sig")))
    tables = {}
    for r in rows:
        name = r["table"].strip()
        if not name or name.startswith("data_reset_"):
            continue
        proposed = r["p1_proposed"].strip()
        if proposed not in CLASS:
            raise SystemExit(f"unknown class {proposed!r} for {name}")
        entry = {"class": CLASS[proposed]}
        if entry["class"] == "SPLIT":
            if name not in SPLIT:
                raise SystemExit(f"SPLIT table without predicate: {name}")
            entry["split"] = SPLIT[name]
        if name in HOLD_ALL:
            entry["holdAll"] = True
        if entry["class"] == "DELETE" and WHOLESALE_RE.search(name):
            entry["wholesale"] = True
        if entry["class"] in ("DELETE", "COND") and FOLLOW_PARENTS_RE.search(name):
            entry["followParents"] = True
        tables[name] = entry
    for t in SPLIT:
        if tables.get(t, {}).get("class") != "SPLIT":
            raise SystemExit(f"predicate for non-SPLIT table {t}")
    return {"version": VERSION, "source": str(SRC.relative_to(ROOT)), "tables": dict(sorted(tables.items())),
            "softRefs": SOFT_REFS, "pathColumns": PATH_COLUMNS,
            "ownerInclude": OWNER_INCLUDE, "ownerExclude": OWNER_EXCLUDE}


if __name__ == "__main__":
    text = json.dumps(build(), ensure_ascii=False, indent=2) + "\n"
    if "--check" in sys.argv:
        if not OUT.exists() or OUT.read_text(encoding="utf-8") != text:
            raise SystemExit("manifest.json is stale — run scripts/data-reset-generate-manifest.py")
        print("manifest.json up to date")
    else:
        OUT.write_text(text, encoding="utf-8")
        print(f"wrote {OUT.relative_to(ROOT)}")
