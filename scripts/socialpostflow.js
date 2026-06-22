#!/usr/bin/env node
/**
 * Social Post Flow CLI
 *
 * A zero-dependency Node.js wrapper around the Social Post Flow API
 * (https://www.socialpostflow.com/documentation/api/).
 *
 * Usage:
 *   spf setup --key <token>
 *   spf whoami
 *   spf profiles [--post-type <type>] [--per-page <n>]
 *   spf posts [--status <s>] [--profile-id <id>] [--per-page <n>]
 *   spf post -c "text" -i <id,id> [-t <type>] [-m <url,url>] [-u <link>]
 *            [--schedule-type <type>] [-s <iso8601>] [--first-comment "..."]
 *   spf show <post-id>
 *   spf delete <post-id>
 *
 * All commands output JSON to stdout. Errors are written to stderr with a
 * non-zero exit code.
 *
 * Auth: API token via `spf setup --key` (writes to ~/.socialpostflow/credentials.json)
 * or via the SOCIALPOSTFLOW_API_TOKEN environment variable.
 *
 * Custom endpoint: SOCIALPOSTFLOW_API_URL (defaults to https://app.socialpostflow.com/api).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_API_URL = 'https://app.socialpostflow.com/api';
const CREDENTIALS_PATH = join(homedir(), '.socialpostflow', 'credentials.json');
const CLI_VERSION = '0.1.0';

// ---------------------------------------------------------------------------
// Output helpers
//
// All command output goes to stdout as JSON so it's easy to pipe into jq.
// Diagnostic messages and errors go to stderr.
// ---------------------------------------------------------------------------

function printJson(value) {
    process.stdout.write(JSON.stringify(value, null, 2) + '\n');
}

function fail(message, details) {
    const payload = { error: message };
    if (details !== undefined) payload.details = details;
    process.stderr.write(JSON.stringify(payload, null, 2) + '\n');
    process.exit(1);
}

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

function loadCredentials() {
    if (process.env.SOCIALPOSTFLOW_API_TOKEN) {
        return { token: process.env.SOCIALPOSTFLOW_API_TOKEN };
    }

    if (existsSync(CREDENTIALS_PATH)) {
        try {
            const raw = readFileSync(CREDENTIALS_PATH, 'utf8');
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed.token === 'string') return parsed;
        } catch {
            // Fall through to "not authenticated".
        }
    }

    return null;
}

function saveCredentials(token) {
    mkdirSync(dirname(CREDENTIALS_PATH), { recursive: true, mode: 0o700 });
    writeFileSync(
        CREDENTIALS_PATH,
        JSON.stringify({ token }, null, 2),
        { mode: 0o600 }
    );
}

function requireAuth() {
    const creds = loadCredentials();
    if (!creds) {
        fail(
            'Not authenticated. Run `spf setup --key <token>` or set SOCIALPOSTFLOW_API_TOKEN.',
        );
    }
    return creds;
}

// ---------------------------------------------------------------------------
// HTTP client
// ---------------------------------------------------------------------------

function apiBase() {
    return process.env.SOCIALPOSTFLOW_API_URL || DEFAULT_API_URL;
}

async function apiRequest(method, path, { token, query, body } = {}) {
    const url = new URL(apiBase().replace(/\/$/, '') + path);
    if (query) {
        for (const [k, v] of Object.entries(query)) {
            if (v === undefined || v === null) continue;
            url.searchParams.set(k, String(v));
        }
    }

    const headers = {
        Accept: 'application/json',
        'User-Agent': `socialpostflow-cli/${CLI_VERSION}`,
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    let response;
    try {
        response = await fetch(url, {
            method,
            headers,
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
    } catch (err) {
        fail(`Network error: ${err.message}`);
    }

    // 204 No Content has no body.
    if (response.status === 204) return null;

    let payload;
    const text = await response.text();
    try {
        payload = text.length ? JSON.parse(text) : null;
    } catch {
        // Non-JSON response — surface the raw text.
        if (!response.ok) {
            fail(`HTTP ${response.status} from API`, text.slice(0, 500));
        }
        return text;
    }

    if (!response.ok) {
        fail(`HTTP ${response.status} from API`, payload);
    }

    return payload;
}

// ---------------------------------------------------------------------------
// Argument parsing
//
// Minimal parser — supports --long, -s short flags, optional values, and
// repeated -c flags (used to compose post + comments later if we ever
// expand to multi-content threads).
// ---------------------------------------------------------------------------

function parseArgs(argv) {
    const out = { _: [], flags: {} };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--') {
            out._.push(...argv.slice(i + 1));
            break;
        }
        if (arg.startsWith('--')) {
            const eq = arg.indexOf('=');
            const key = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
            const value = eq === -1
                ? (argv[i + 1] && !argv[i + 1].startsWith('-') ? argv[++i] : true)
                : arg.slice(eq + 1);
            assignFlag(out.flags, key, value);
        } else if (arg.startsWith('-') && arg.length > 1) {
            const key = arg.slice(1);
            const value = (argv[i + 1] !== undefined && !argv[i + 1].startsWith('-'))
                ? argv[++i]
                : true;
            assignFlag(out.flags, key, value);
        } else {
            out._.push(arg);
        }
    }
    return out;
}

function assignFlag(flags, key, value) {
    if (key in flags) {
        flags[key] = Array.isArray(flags[key]) ? [...flags[key], value] : [flags[key], value];
    } else {
        flags[key] = value;
    }
}

function getFlag(flags, ...names) {
    for (const name of names) {
        if (flags[name] !== undefined) return flags[name];
    }
    return undefined;
}

function splitList(value) {
    if (value === undefined || value === null || value === true) return undefined;
    return String(value).split(',').map((s) => s.trim()).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdSetup(flags) {
    const token = getFlag(flags, 'key', 'k');
    if (typeof token !== 'string' || !token) {
        fail('Missing --key (your Social Post Flow personal access token).');
    }

    // Verify the token against /user before persisting, so we fail fast if
    // it's invalid.
    const user = await apiRequest('GET', '/user', { token });

    saveCredentials(token);
    printJson({
        success: true,
        credentials_path: CREDENTIALS_PATH,
        user,
    });
}

async function cmdWhoami() {
    const { token } = requireAuth();
    const user = await apiRequest('GET', '/user', { token });
    printJson(user);
}

async function cmdProfiles(flags) {
    const { token } = requireAuth();
    const query = {
        post_type: getFlag(flags, 'post-type'),
        per_page: getFlag(flags, 'per-page'),
        order_by: getFlag(flags, 'order-by'),
        order: getFlag(flags, 'order'),
    };
    const result = await apiRequest('GET', '/profiles', { token, query });
    printJson(result);
}

async function cmdPosts(flags) {
    const { token } = requireAuth();
    const query = {
        status: getFlag(flags, 'status'),
        social_profile_id: getFlag(flags, 'profile-id'),
        per_page: getFlag(flags, 'per-page'),
        order_by: getFlag(flags, 'order-by'),
        order: getFlag(flags, 'order'),
    };
    const result = await apiRequest('GET', '/posts', { token, query });
    printJson(result);
}

async function cmdShow(argv) {
    const { token } = requireAuth();
    const id = argv[0];
    if (!id) fail('Missing post ID. Usage: spf show <post-id>');
    const result = await apiRequest('GET', `/posts/${encodeURIComponent(id)}`, { token });
    printJson(result);
}

async function cmdDelete(argv) {
    const { token } = requireAuth();
    const id = argv[0];
    if (!id) fail('Missing post ID. Usage: spf delete <post-id>');
    await apiRequest('DELETE', `/posts/${encodeURIComponent(id)}`, { token });
    printJson({ success: true, deleted: id });
}

async function cmdPost(flags) {
    const { token } = requireAuth();

    const text = getFlag(flags, 'c', 'content', 'text');
    const profileIds = splitList(getFlag(flags, 'i', 'profile-ids', 'profile-id'));
    const postType = getFlag(flags, 't', 'type', 'post-type') || 'text';
    const mediaUrls = splitList(getFlag(flags, 'm', 'media', 'media-urls'));
    const url = getFlag(flags, 'u', 'url');
    const firstComment = getFlag(flags, 'first-comment');
    const scheduleType = getFlag(flags, 'schedule-type') || 'immediate';
    const scheduledAt = getFlag(flags, 's', 'scheduled-at');

    if (!profileIds || profileIds.length === 0) {
        fail('Missing --profile-ids (-i). At least one profile ID is required.');
    }

    const body = {
        post_type: postType,
        profile_ids: profileIds,
        schedule_type: scheduleType,
    };

    if (text !== undefined && text !== true) body.text = String(text);
    if (mediaUrls) body.media_urls = mediaUrls;
    if (url) body.url = String(url);
    if (firstComment) body.first_comment = String(firstComment);
    if (scheduledAt) body.scheduled_at = String(scheduledAt);

    const result = await apiRequest('POST', '/posts', { token, body });
    printJson(result);
}

// ---------------------------------------------------------------------------
// Help text
// ---------------------------------------------------------------------------

const HELP = `Social Post Flow CLI v${CLI_VERSION}

Usage:
  spf <command> [options]

Auth:
  spf setup --key <token>            Verify and store a personal access token
                                     (written to ~/.socialpostflow/credentials.json).
                                     Alternatively, set SOCIALPOSTFLOW_API_TOKEN.

Commands:
  whoami                             Print the authenticated user.
  profiles [--post-type <t>]         List connected social profiles.
           [--per-page <n>]
           [--order-by <field>]
           [--order asc|desc]
  posts    [--status <s>]            List posts. status: scheduled|posted|failed.
           [--profile-id <id>]
           [--per-page <n>]
           [--order-by <field>]
           [--order asc|desc]
  post     -c "text"                 Create a post. Required: -c (text, unless
           -i <id,id>                story), -i (one or more profile IDs).
           [-t <post-type>]          post-type: text|link|image|story|pin|tiktok|google
                                     (default: text).
           [-m <url,url>]            Comma-separated public media URLs.
           [-u <link>]               Link URL (required for -t link).
           [--first-comment "..."]   Add a first comment to the published post.
           [--schedule-type <type>]  immediate|queue_end|queue_start|scheduled
                                     (default: immediate).
           [-s <iso8601>]            Required when --schedule-type=scheduled.
  show <post-id>                     Show a single post.
  delete <post-id>                   Delete a post.

Environment:
  SOCIALPOSTFLOW_API_TOKEN           Bearer token (alternative to setup).
  SOCIALPOSTFLOW_API_URL             Override API base URL. Default:
                                     ${DEFAULT_API_URL}

All output is JSON. Pipe to jq for further processing.

See the documentation at https://www.socialpostflow.com/documentation/api/
or the SKILL.md in this repo for agent-friendly usage examples.
`;

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

const COMMANDS = {
    setup:    (parsed) => cmdSetup(parsed.flags),
    whoami:   () => cmdWhoami(),
    profiles: (parsed) => cmdProfiles(parsed.flags),
    posts:    (parsed) => cmdPosts(parsed.flags),
    post:     (parsed) => cmdPost(parsed.flags),
    show:     (parsed) => cmdShow(parsed._),
    delete:   (parsed) => cmdDelete(parsed._),
};

async function main() {
    const argv = process.argv.slice(2);

    if (argv.length === 0 || ['-h', '--help', 'help'].includes(argv[0])) {
        process.stdout.write(HELP);
        return;
    }

    if (['-v', '--version'].includes(argv[0])) {
        printJson({ version: CLI_VERSION });
        return;
    }

    const [command, ...rest] = argv;
    const handler = COMMANDS[command];

    if (!handler) {
        fail(`Unknown command: ${command}. Run 'spf --help' to list commands.`);
    }

    const parsed = parseArgs(rest);
    await handler(parsed);
}

main().catch((err) => {
    fail(`Unexpected error: ${err.message}`);
});
