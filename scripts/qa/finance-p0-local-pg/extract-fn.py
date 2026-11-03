"""Print the latest CREATE FUNCTION statement for each name from supabase/migrations (body = 운영 md5 일치 확인본)."""
import glob, os, re, sys
root = os.path.join(os.path.dirname(__file__), "..", "..", "..", "supabase", "migrations")
latest = {}
for f in sorted(glob.glob(os.path.join(root, "*.sql"))):
    s = open(f, encoding="utf-8").read()
    for n in sys.argv[1:]:
        for m in re.finditer(r"create\s+or\s+replace\s+function\s+public\." + re.escape(n) + r"\s*\(", s, re.I):
            q = re.search(r"\bAS\s+(\$[A-Za-z_]*\$)", s[m.end():], re.I)
            tag = q.group(1)
            body_start = m.end() + q.end()
            end = s.find(tag, body_start) + len(tag)
            latest[n] = s[m.start():end] + ";\n"
for n in sys.argv[1:]:
    sys.stdout.write(latest[n] + "\n")
