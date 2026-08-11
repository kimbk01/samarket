#!/usr/bin/env bash
# RETIRED. Production deploy authority is origin/main → Vercel Git Integration only.
# This script must not upload a Production deployment.
set -euo pipefail
echo "[deploy-prod-clean] FORBIDDEN"
echo "Production deploy = git push origin main → Vercel Git Integration."
echo "Do not use CLI Production deploy. Git FAIL stays FAILED; fix with a new commit."
exit 1
