---
name: socialpostflow
description: Use this skill when the user wants to publish, schedule, or manage social media posts across multiple networks (Facebook, X, LinkedIn, Instagram, Threads, Pinterest, TikTok, Mastodon, Bluesky, Telegram, Google Business Profiles). Triggers on requests like "schedule a tweet", "post this to all my socials", "share to LinkedIn and Facebook", "queue up a post for tomorrow", or any reference to scheduling/publishing content across networks. Requires the Social Post Flow CLI (this skill) and a valid API token from app.socialpostflow.com.
---

# Social Post Flow Agent Skill

Schedule and publish social media posts across 12+ networks via the Social Post Flow CLI.

## Setup

Before using any other command, ensure the user is authenticated:

```bash
spf setup --key <token>
```

The user can find their personal access token at `https://app.socialpostflow.com/profile` (under API). Or they can set `SOCIALPOSTFLOW_API_TOKEN` in their environment.

To verify auth:

```bash
spf whoami
```

This returns the user's name, email, subscription state, trial days remaining, and post stats.

## Mental model

A **profile** in Social Post Flow is one connected social account (e.g. their Facebook page, their X account, their Instagram business profile). Each profile has a unique numeric ID.

A **post** belongs to exactly one profile. Publishing the same content to three networks creates three separate post records.

Posts have a **status** lifecycle: `scheduled` → `posted` (or `failed`). `scheduled` is the initial state — the post is in the queue waiting for its scheduled time.

## Listing profiles

```bash
spf profiles
```

Returns the user's connected profiles. Each profile includes its `id` (use this when posting), `provider` (e.g. `facebook`, `x`, `linkedin`), `profile_name`, `connected` (boolean — if false, the user needs to reconnect in the web UI), and post counts.

**Filter by what kind of post the profile supports:**

```bash
spf profiles --post-type text         # Networks that support text/link posts
spf profiles --post-type story        # Instagram (Stories only)
spf profiles --post-type pin          # Pinterest only
spf profiles --post-type tiktok       # TikTok only
spf profiles --post-type google       # Google Business Profiles only
```

This filter is critical because not every profile can accept every post type. Always filter first if the user wants to post a specific kind of content.

## Creating posts — the rules

Use `spf post` to create posts. You **must** understand the constraints:

### Required arguments

- `-c "text"` — the post body. Required unless `--type story` (Stories are image-only).
- `-i id1,id2` — comma-separated profile IDs. Each ID becomes its own post.

### Post types and what they need

| Type     | Requires                          | Forbids                          |
|----------|-----------------------------------|----------------------------------|
| `text`   | `-c`                              | `-u` (URL)                       |
| `link`   | `-c` and `-u <url>`               | `-m` (media URLs)                |
| `image`  | `-c` and `-m url1,url2`           | `-u`                             |
| `story`  | `-m <url>` (text optional)        | `-u`, `--first-comment`          |
| `pin`    | `-c`, `-m <url>`. Optional `-u`   | nothing — pins accept both       |
| `tiktok` | `-c` and `-m <video-url>`         | `-u`, `--first-comment`          |
| `google` | `-c`. Optional `-m` and/or `-u`   | `--first-comment`                |

If you violate these rules, the API returns a 422 validation error with a clear message — don't try to be clever, just pass through what the user asked for.

### Media URLs

`-m` takes public HTTP(S) URLs. Social Post Flow downloads each image server-side, crops it to the right aspect ratio per network, and stores it. **You don't need to upload anything** — just give it URLs to images the agent can already see (e.g. from web search, the user's S3, a content CMS).

### Scheduling

The `--schedule-type` flag controls when the post publishes:

- `immediate` (default) — publish at the earliest opportunity. Use this for "post this now".
- `queue_end` — add to the end of the user's profile queue. Use this for "queue this up".
- `queue_start` — insert at the front of the queue, bumping everything else later.
- `scheduled` — publish at a specific time. **Requires** `-s "2026-07-15T14:00:00Z"` (ISO 8601, must be in the future, UTC recommended).

The queue model is one of SPF's key features. Each profile has its own queue interval (set per-user, typically every few hours). When the user says "post these throughout the week" or "queue these up", use `queue_end` — don't try to compute timestamps yourself.

### Examples

**Single profile, text post, publish now:**

```bash
spf post -c "Excited to announce our new feature!" -i 42
```

**Multiple profiles at once:**

```bash
spf post -c "Excited to announce our new feature!" -i 42,87,103
```

**Link post (article share):**

```bash
spf post -t link -c "Worth reading:" -u "https://example.com/article" -i 42
```

**Image post:**

```bash
spf post -t image -c "Behind the scenes today" \
  -m "https://example.com/photo1.jpg,https://example.com/photo2.jpg" \
  -i 42,87
```

**Schedule for a specific time:**

```bash
spf post -c "Happy Monday!" -i 42 \
  --schedule-type scheduled \
  -s "2026-07-20T09:00:00Z"
```

**Add to the user's queue:**

```bash
spf post -c "Quick tip..." -i 42 --schedule-type queue_end
```

**With a first comment (X thread starter, LinkedIn comment, etc.):**

```bash
spf post -c "Main post text" -i 42 \
  --first-comment "Reply with extra context..."
```

First comments are not supported by every network. They will be rejected on Mastodon, TikTok, Telegram, and Google Business Profiles.

## Managing posts

```bash
spf posts                            # List all posts (last 30 days by default)
spf posts --status scheduled         # Only scheduled posts
spf posts --status posted            # Successfully posted
spf posts --status failed            # Failed to publish — check failure_reason
spf posts --profile-id 42            # Only posts for one profile
```

Show a single post:

```bash
spf show 12345
```

Delete a post:

```bash
spf delete 12345
```

Deleting a scheduled post stops it from publishing. Deleting a posted post removes the record in SPF but does **not** remove the post from the social network (we can't unpublish from the platforms after the fact).

## Common workflows

### "Post this to all my socials"

```bash
# 1. Get the user's profile IDs
PROFILES=$(spf profiles --post-type text)
IDS=$(echo "$PROFILES" | jq -r '.data[].id' | paste -sd,)

# 2. Post to all of them
spf post -c "The content the user wrote" -i "$IDS"
```

### "Schedule a week of posts"

When the user has multiple posts to schedule across the week, use `--schedule-type queue_end` rather than computing dates yourself — that lets SPF use the user's configured queue interval and timezone.

```bash
for content in "Monday tip" "Tuesday wisdom" "Wednesday insight"; do
    spf post -c "$content" -i 42 --schedule-type queue_end
done
```

### "Show me what's failing"

```bash
spf posts --status failed | jq '.data[] | {id, profile_name, failure_reason}'
```

Common failure reasons include disconnected profiles (the user needs to reconnect), platform-side errors (e.g. X rate limits), or media validation issues (image too small, wrong format).

### "What's posted today?"

```bash
spf posts --status posted --order-by posted_at --order desc --per-page 50 \
  | jq '.data[] | select(.posted_at | startswith("'"$(date -u +%Y-%m-%d)"'"))'
```

## Important behaviour to know

**The API enforces validation server-side.** Don't try to pre-validate post content — submit and let SPF tell you what's wrong. The error responses are clear and machine-readable.

**One `spf post` call can create multiple posts.** When you pass `-i 42,87,103`, the result is an array of three separate posts. The response is always a collection, never a single post.

**Profile selection matters more than network.** Always look up the profile ID first via `spf profiles`. Don't ask the user "which Facebook account?" — `profiles` shows them all by name and the user can pick.

**Daily limits exist.** The API enforces a per-profile daily post limit. If you hit it, the response includes a clear error message. Surface this to the user; don't retry blindly.

**Scheduled posts must be in the future.** `-s` with a past timestamp fails validation. If the user asks to schedule for "tomorrow at 9am", convert to ISO 8601 UTC carefully — their local timezone is in the `spf whoami` output.

## Output format

Every command outputs JSON. Errors go to stderr with a non-zero exit code and a JSON body:

```json
{
  "error": "HTTP 422 from API",
  "details": { "message": "...", "errors": { "field": ["..."] } }
}
```

Use `jq` for parsing. The CLI never colors output, never asks for confirmation, and never paginates interactively — it's designed for agents and scripts.

## What this skill doesn't do

- Doesn't upload media — `-m` takes public URLs, not local files. If the user has a local image, they need to host it somewhere first (their CMS, S3, etc.).
- Doesn't do analytics — Social Post Flow doesn't expose post-level metrics via the public API yet.
- Doesn't connect new social accounts — that's an OAuth flow that needs a browser. Direct the user to `https://app.socialpostflow.com/profiles` to add a new profile.
- Doesn't do user management — there's one user per API token. Multi-tenancy is handled by the user's separate sub-accounts inside SPF.

## More resources

- API reference: https://www.socialpostflow.com/documentation/api/
- Product: https://www.socialpostflow.com
- CLI source: https://github.com/socialpostflow/socialpostflow-cli
- WordPress plugin (related): https://wordpress.org/plugins/social-post-flow/
