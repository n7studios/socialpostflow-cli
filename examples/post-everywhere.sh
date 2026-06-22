#!/usr/bin/env bash
# Post the same content to every text-capable profile.
#
# Usage:
#   ./post-everywhere.sh "Your post content"
#
# Requires: spf CLI authenticated, jq installed.

set -euo pipefail

if [ -z "${1:-}" ]; then
    echo "Usage: $0 \"Your post content\"" >&2
    exit 1
fi

CONTENT="$1"

# Collect every profile that supports text/link posts. This excludes
# image-only networks (Pinterest, Instagram Stories, TikTok).
IDS=$(spf profiles --post-type text \
    | jq -r '.data[] | select(.connected == true) | .id' \
    | paste -sd, -)

if [ -z "$IDS" ]; then
    echo "No connected text-capable profiles found." >&2
    exit 1
fi

echo "Posting to profile IDs: $IDS" >&2

spf post -c "$CONTENT" -i "$IDS"
