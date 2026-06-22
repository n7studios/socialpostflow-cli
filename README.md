# Social Post Flow CLI

**Social media automation for AI agents** — schedule posts across 12+ networks programmatically.

A zero-dependency Node.js CLI wrapper around the [Social Post Flow API](https://www.socialpostflow.com/documentation/api/). Designed for use with AI agents (Claude Code, Cursor, Windsurf, Codex, OpenAI SDKs) and for shell scripting / CI workflows.

**Supports:** Facebook, X (Twitter), LinkedIn, Instagram (Feed + Stories), Threads, Pinterest, TikTok, Mastodon, Bluesky, Telegram, Google Business Profiles, and more.

---

## Install as a Claude Code skill

The fastest way to give your agent the ability to schedule posts:

```bash
npx skills add socialpostflow/socialpostflow-cli
```

Then ask your agent things like:

> "Post this text to my X and LinkedIn accounts."
>
> "Schedule a Monday motivation post for 9am next week."
>
> "Queue up these three blog promos across all my channels."

The agent learns from [`SKILL.md`](skills/socialpostflow/SKILL.md), which documents the CLI's behaviour, post types, scheduling model, and common workflows.

## Install as a CLI

Globally via npm:

```bash
npm install -g socialpostflow-cli
```

Or run directly via npx without installing:

```bash
npx socialpostflow-cli --help
```

Or clone the repo and run the script directly (zero dependencies):

```bash
git clone https://github.com/socialpostflow/socialpostflow-cli.git
cd socialpostflow-cli
node scripts/socialpostflow.js --help
```

Requires Node.js 18 or later (for built-in `fetch`).

## Authentication

You need a Social Post Flow account with API access. Grab your personal access token from your [profile page](https://app.socialpostflow.com/profile), then:

```bash
spf setup --key spf_xxxxxxxxxxxxxxxx
```

This verifies the token against the API and saves it to `~/.socialpostflow/credentials.json` (chmod 600).

Alternatively, set the environment variable:

```bash
export SOCIALPOSTFLOW_API_TOKEN=spf_xxxxxxxxxxxxxxxx
```

## Quick start

```bash
# List your connected social profiles
spf profiles

# Post to one profile, immediately
spf post -c "Hello world!" -i 42

# Post to multiple profiles
spf post -c "Big announcement coming soon" -i 42,87,103

# Schedule for a specific time
spf post -c "Happy Monday!" -i 42 --schedule-type scheduled -s "2026-07-20T09:00:00Z"

# Add to the user's queue (uses their configured queue interval)
spf post -c "Quick tip..." -i 42 --schedule-type queue_end

# List recent posts
spf posts --status posted --order-by posted_at --order desc

# Delete a scheduled post
spf delete 12345
```

## Commands

| Command | Description |
|---------|-------------|
| `spf setup --key <token>` | Verify and store a personal access token. |
| `spf whoami` | Show the authenticated user's profile, subscription state, and stats. |
| `spf profiles [--post-type T]` | List connected social profiles. Optionally filter by post type. |
| `spf posts [--status S] [--profile-id N]` | List posts. Filter by status or profile. |
| `spf post -c "..." -i id1,id2 [options]` | Create a post (see options below). |
| `spf show <post-id>` | Show details of a single post. |
| `spf delete <post-id>` | Delete a post. Stops it publishing if scheduled. |

### `spf post` options

| Flag | Description |
|------|-------------|
| `-c, --content` | Post text. Required unless `--type story`. |
| `-i, --profile-ids` | Comma-separated profile IDs (required). |
| `-t, --type` | Post type: `text` (default), `link`, `image`, `story`, `pin`, `tiktok`, `google`. |
| `-m, --media` | Comma-separated public image/video URLs. |
| `-u, --url` | URL to attach (required for `--type link`). |
| `--first-comment` | First-comment text. Not supported on Mastodon, TikTok, Telegram, Google. |
| `--schedule-type` | `immediate` (default), `queue_end`, `queue_start`, `scheduled`. |
| `-s, --scheduled-at` | ISO 8601 timestamp (required when `--schedule-type=scheduled`, must be in future). |

See [SKILL.md](skills/socialpostflow/SKILL.md) for the full post-type rules (what each type requires and forbids).

## All output is JSON

Every command writes JSON to stdout. Errors write JSON to stderr with a non-zero exit code:

```bash
PROFILES=$(spf profiles)
TWITTER_ID=$(echo "$PROFILES" | jq -r '.data[] | select(.provider=="x") | .id')

spf post -c "Hello from a shell script" -i "$TWITTER_ID"
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SOCIALPOSTFLOW_API_TOKEN` | — | Your API token. Alternative to `spf setup`. |
| `SOCIALPOSTFLOW_API_URL` | `https://app.socialpostflow.com/api` | Override the API base URL (useful for testing). |

## Examples

See [`examples/`](examples/) for shell scripts demonstrating common workflows:

- [`post-everywhere.sh`](examples/post-everywhere.sh) — post the same content to all connected text-capable profiles
- [`schedule-week.sh`](examples/schedule-week.sh) — schedule a week's worth of posts using the queue
- [`github-actions.yml`](examples/github-actions.yml) — publish a blog post announcement from a GitHub Action

## Alternative: MCP

If you're using Claude Desktop, ChatGPT Desktop, or another MCP-compatible client, you can use the Social Post Flow MCP server instead. It connects in one click with no setup. See [socialpostflow.com](https://www.socialpostflow.com) for details.

## Troubleshooting

**"Not authenticated"** — Run `spf setup --key <token>` or set `SOCIALPOSTFLOW_API_TOKEN`.

**"HTTP 401 from API"** — Your token is invalid. Get a valid token from https://app.socialpostflow.com/profile.

**"HTTP 422 from API"** — Validation error. The `details` payload tells you which field failed. Common causes: invalid `post_type`/`schedule_type` combination, scheduled time in the past, missing required `media_urls` for image/story/pin/tiktok posts.

**"HTTP 429 from API"** — Daily post limit reached for that profile. The user needs to wait or upgrade their plan.

## License

MIT — see [LICENSE](LICENSE).

## Links

- **Social Post Flow:** [socialpostflow.com](https://www.socialpostflow.com)
- **API documentation:** [socialpostflow.com/documentation/api](https://www.socialpostflow.com/documentation/api/)
- **MCP documentation:** [socialpostflow.com/documentation/api](https://www.socialpostflow.com/documentation/mcp/)
- **WordPress Plugin:** [wordpress.org/plugins/social-post-flow](https://wordpress.org/plugins/social-post-flow/)
- **Issues / feedback:** [github.com/socialpostflow/socialpostflow-cli/issues](https://github.com/socialpostflow/socialpostflow-cli/issues)
