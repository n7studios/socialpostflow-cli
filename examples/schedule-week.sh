#!/usr/bin/env bash
# Add a week's worth of posts to the user's queue.
#
# The queue model uses each user's configured queue interval (set in their
# Social Post Flow profile). queue_end inserts at the end of the queue, so
# repeated calls produce evenly-spaced posts without you having to compute
# timestamps.
#
# Usage:
#   ./schedule-week.sh <profile-id>
#
# Edit POSTS below to customize the content.

set -euo pipefail

PROFILE_ID="${1:-}"
if [ -z "$PROFILE_ID" ]; then
    echo "Usage: $0 <profile-id>" >&2
    echo "Run 'spf profiles' to list your profile IDs." >&2
    exit 1
fi

POSTS=(
    "Monday motivation: ship the smallest version that works."
    "Tuesday tip: deleted code is debugged code."
    "Wednesday wisdom: the boring solution usually wins."
    "Thursday thought: read the code before you write the code."
    "Friday focus: what would you build if you had no users?"
)

for POST in "${POSTS[@]}"; do
    echo "Queueing: $POST" >&2
    spf post -c "$POST" -i "$PROFILE_ID" --schedule-type queue_end >/dev/null
done

echo "Done. Run 'spf posts --status scheduled' to see your queue." >&2
