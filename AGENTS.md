# AGENTS.md
<!-- 
  Maintenance reminder: Please update this document when the following files change:
  - wrangler.toml (Durable Objects, environment variables, routes)
  - src/worker/index.ts (API routes, entry logic)
  - scripts/build-html.js (build process)
  - package.json (dependencies, script commands)
  - src/types.ts (Env interface, type definitions)
-->

## Project Overview

CloudSSH is a serverless Web SSH terminal built on Cloudflare Workers. Users connect to SSH servers through a browser-based terminal UI with integrated SFTP file management and AI Agent assistant.

## Architecture

- **Frontend** (`frontend/`): TypeScript + Vite + xterm.js + Tailwind CSS
- **Backend** (`src/`): Cloudflare Workers + Durable Objects
- **SSH Protocol**: Pure TypeScript implementation in `src/ssh/` (no external SSH library)
- **SFTP Protocol**: SFTP v3 subsystem implementation in `src/ssh/sftp.ts` for file management
- **Build Process**: `scripts/build-html.js` builds frontend and inlines it into `src/worker/html.ts`

## Key Directories

```
src/
├── worker/           # Cloudflare Worker entry and Durable Objects
│   ├── index.ts      # Main worker entry (request routing, bounded in-memory SSH rate limiting)
│   ├── durable-object.ts  # SSHSessionDO - manages SSH sessions
│   ├── ssh-session.ts     # SSH session logic, multi-channel routing, SFTP handling
│   ├── sftp-handler.ts    # SFTP protocol ops, task queue, concurrent download, upload tracking
│   ├── user-db.ts    # UserDBDO - user/server storage
│   ├── auth.ts       # GitHub OAuth handling
│   ├── agent/        # AI Agent system
│   │   ├── core.ts       # Agent control loop (LLM calls, tool execution)
│   │   ├── tools.ts      # 8 tool definitions (execute_command, detect_environment, list_processes, service_manage, docker_manage, etc.)
│   │   ├── tool-executor.ts  # Tool dispatch, execution, and blocked command rejection
│   │   ├── prompt.ts     # System prompt for the agent
│   │   ├── safety.ts     # Two-layer security: blocked patterns + confirmation patterns
│   │   ├── ssrf.ts       # SSRF protection for AI base_url
│   │   ├── terminal-context.ts  # Terminal output ring buffer
│   │   ├── exec-channel.ts  # SSH exec channel lifecycle
│   │   └── types.ts      # Agent type definitions
│   └── html.ts       # Auto-generated - DO NOT EDIT
├── ssh/              # SSH protocol implementation
│   ├── transport.ts  # SSH transport layer
│   ├── packet.ts     # SSH packet parser and builder
│   ├── kex.ts        # Key exchange init and negotiation
│   ├── kex-curve25519.ts  # Curve25519-SHA256 key exchange
│   ├── kex-ecdh.ts   # ECDH-NISTP256 key exchange
│   ├── algorithms.ts # Supported algorithm definitions
│   ├── auth.ts       # Authentication methods (password, Ed25519 public key)
│   ├── channel.ts    # SSH channels (session + SFTP subsystem + exec)
│   ├── crypto.ts     # AES-GCM/CTR cipher, HMAC implementations
│   ├── keys.ts       # Key derivation per RFC 4253
│   ├── utils.ts      # Binary utilities
│   ├── sftp.ts       # SFTP v3 client implementation
│   └── sftp-types.ts # SFTP protocol constants and types
└── types.ts          # Shared TypeScript type definitions

frontend/
├── src/
│   ├── main.ts       # Frontend entry point (routing, theme, event handlers)
│   ├── terminal.ts   # xterm.js terminal setup (search, dynamic RTT latency, log export)
│   ├── tab-manager.ts # Tab manager (multi-session terminal/SFTP/Agent coordinator)
│   ├── sftp-panel.ts # SFTP file manager UI (queue, cancel support)
│   ├── auth-form.ts  # Auth form & encrypted anonymous credentials storage/autofill
│   ├── server-list.ts # Server management UI (card grid, add/edit/delete/connect)
│   ├── agent/
│   │   └── agent-panel.ts  # AI assistant sidebar (streaming output, Markdown rendering, thinking process, confirm dialogs)
│   ├── ai-config.ts  # AI model configuration modal
│   ├── style.css     # Global styles (CSS variable theme system)
│   └── turnstile.d.ts # Turnstile type declarations
└── vite.config.ts    # Dev proxy to localhost:8787
```

## Development Commands

```bash
# Start development (builds frontend + starts wrangler dev)
pnpm run dev

# Deploy production (builds frontend + deploys worker)
pnpm run deploy

# Deploy test environment (builds frontend + deploys to cloudssh-test)
pnpm run deploy:test

# Build frontend only (required before deploy)
pnpm run build:frontend

# Run tests
pnpm test

# Install frontend dependencies (separate from root)
cd frontend && pnpm install
```

## Critical Build Process

The frontend is **NOT** served separately in production. The build process:

1. Builds frontend with Vite (`frontend/dist/`)
2. Inlines all CSS/JS into a single HTML string
3. Writes to `src/worker/html.ts` as a template literal
4. Worker serves this inlined HTML for all requests

**Important**: `src/worker/html.ts` is auto-generated. Never edit it directly - changes will be overwritten.

## Durable Objects

Two Durable Objects handle state:

1. **SSHSessionDO** (`src/worker/durable-object.ts`)
   - Manages WebSocket ↔ TCP socket connections
   - Handles SSH session lifecycle
   - Uses Hibernation API for long-lived connections

2. **UserDBDO** (`src/worker/user-db.ts`)
   - SQLite-based user and server storage
   - GitHub OAuth user management

## Environment Variables

Required for optional features (configured in `wrangler.toml` or Cloudflare Dashboard):

- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` - GitHub OAuth
- `TURNSTILE_SECRET` / `TURNSTILE_SITEKEY` - Bot verification
- `BASE_URL` - OAuth callback URL

## API Routes

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/auth/github` | GET | No | GitHub OAuth redirect |
| `/api/auth/callback` | GET | No | OAuth callback, creates user + session |
| `/api/auth/logout` | POST | No | Logout, clears session |
| `/api/auth/me` | GET | Yes | Returns current user info |
| `/api/servers` | GET/POST | Yes | List or create saved servers |
| `/api/servers/:id` | PUT/DELETE | Yes | Update or delete a server |
| `/api/servers/:id/connect` | POST | Yes | Generate one-time-token, return WebSocket URL |
| `/api/user/theme` | GET/PUT | Yes | Get or save user custom theme |
| `/api/known-hosts` | GET/POST/DELETE | Yes | Known host fingerprint CRUD (TOFU) |
| `/api/ai/config` | GET/PUT | Yes | Get or save AI LLM config |
| `/api/ai/models` | POST | Yes | Proxy model list from user's LLM provider |
| `/api/verify` | POST | No | Turnstile bot verification |
| `/api/ssh` | WebSocket | Conditional | SSH terminal WebSocket connection |
| `/api/ssh/sftp` | WebSocket | Token | SFTP data WebSocket (attaches to existing session) |
| `/api/health` | GET | No | Health check |
| `/api/config` | GET | No | Feature flags (turnstile, GitHub auth enabled) |

## Testing

Tests use Vitest. Run with:
```bash
pnpm test
```

Test files should be in `tests/` directory with `.test.ts` extension.

## Git Workflow Guidelines

**Creating feature branches is prohibited.** All changes must be committed directly to the `test` branch to keep the repository branch structure clean.

```
test branch (development/testing)  ──merge──>  main branch (production)
```

### Commit Process

1. Switch to `test` branch: `git checkout test`
2. Pull latest code: `git pull origin test`
3. Develop and test locally
4. Commit directly to `test` branch and push: `git push origin test`
5. After tests pass, maintainers merge `test` into `main`

### Commit Message Conventions

Follow Conventional Commits format with English descriptions:

```
<type>: <English description>

feat: Add new feature
fix: Fix an issue
refactor: Refactor a module
perf: Performance optimization
docs: Documentation update
chore: Build/configuration changes
ci: CI/CD changes
```

### Branch Purposes

| Branch | Purpose | Direct Push Allowed |
|--------|---------|---------------------|
| `test` | All development, testing, PR merges | ✅ |
| `main` | Production environment, only merged from test | ❌ (protected branch) |

## Common Pitfalls

1. **Don't edit `src/worker/html.ts`** - It's auto-generated by `scripts/build-html.js`
2. **Frontend has separate dependencies** - Run `pnpm install` in `frontend/` directory
3. **Durable Object migrations** - New DO classes require migration tags in `wrangler.toml`
4. **Local dev proxy** - Frontend dev server proxies `/api` to `localhost:8787` (wrangler)
5. **TypeScript config** - Root `tsconfig.json` excludes `frontend/` (has its own config)
6. **AI Agent runs in DO** - The agent control loop (`agent/core.ts`) executes inside the Durable Object, not the Worker itself, to access the SSH session directly
7. **Agent tool confirmations** - Dangerous commands (rm -rf, shutdown, etc.) require user confirmation via `agent_confirm` WebSocket message before execution. Blocked commands (rm -rf /, fork bomb, etc.) are rejected outright without prompting.
8. **Agent loop timeouts & Watchdog** - The agent run loop has a step-based timeout of 60 seconds (managed by a watchdog timer in `agent/core.ts` that resets after each LLM response or tool execution). When waiting for user confirmation via `agent_confirm`, the watchdog timer is paused to prevent timeouts due to user delays.
9. **SSH rate limiting** - `/api/ssh` uses a bounded, Worker-isolate in-memory limiter for traffic shedding. It skips requests without `CF-Connecting-IP`; Turnstile and one-time tokens remain the connection authorization controls.

## Deployment Notes

### Dual Environment Deployment

The project supports two independent environments (production and test) running simultaneously on Cloudflare:

| Environment | Worker Name | Branch | Domain |
|-------------|-------------|--------|--------|
| Production | `cloudssh` | `main` | `<name>.workers.dev` + custom domain |
| Test | `cloudssh-test` | `test` | `<name>-test.workers.dev` + custom domain |

The Durable Objects (SSHSessionDO, UserDBDO) data is completely isolated between the two environments.

### Deployment Methods

**Method 1: Cloudflare Dashboard (Recommended)**
1. Build frontend: `pnpm run build:frontend`
2. Go to Cloudflare Dashboard → Workers
3. Create/select worker (`cloudssh` for production, `cloudssh-test` for test)
4. Upload build artifacts or enable Git integration for automatic deployment
5. Configure environment variables and DO bindings in Settings → Variables
6. Bind custom domain in Settings → Domains & Routes if needed

**Method 2: Wrangler CLI**
```bash
pnpm run deploy          # Deploy production
pnpm run deploy:test     # Deploy test environment
```

**Method 3: GitHub Actions (CI/CD)**
- `test` branch push → Auto-deploy to `cloudssh-test`
- `main` branch push → Auto-deploy to `cloudssh`

### Custom Domains

Custom domains are not hardcoded in `wrangler.toml` (open source project, different users have different domains). By default, it uses the Cloudflare-provided `workers.dev` domain. To bind a custom domain:
- Add it in Cloudflare Dashboard → Workers → Your Worker → Settings → Domains & Routes
- Or add `[[routes]]` configuration in `wrangler.toml` (for local use only, do not commit to repository)

### Secrets Configuration

Set via Cloudflare Dashboard or wrangler CLI:
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` - GitHub OAuth
- `TURNSTILE_SECRET` / `TURNSTILE_SITEKEY` - Bot verification
- `BASE_URL` - OAuth callback URL (must match actual domain)

Dashboard: Workers → Your Worker → Settings → Variables → Environment Variables
CLI: `npx wrangler secret set <SECRET_NAME>`

### First Deployment Notes

- For new Durable Objects first deployment: delete old worker first then redeploy (`npx wrangler delete <worker-name>`)
- Test environment DO binds the same class_name as production, but data is completely isolated due to different Worker names

## AI Version Release and Documentation Maintenance Guidelines

When assisting humans with version upgrades and releases, AI assistants must strictly follow these guidelines:

1. **Version Information Flow (Human-led, AI-assisted updates)**:
   - AI assistants are strictly prohibited from autonomously deciding or incrementing version numbers.
   - When a new version needs to be released, based on the version number specified by humans, AI should locally modify:
     - `"version": "X.Y.Z"` in `package.json`.
     - Append the latest changelog at the beginning of `CHANGELOG.md` (format should be `## [X.Y.Z] - YYYY-MM-DD`).
   - Content must be organized following the [Keep a Changelog](https://keepachangelog.com/) specification.
2. **README Navigation Link Maintenance**:
   - The `Changelog` link in `README.md` and the `Changelog` jump hyperlink in `README_en.md` must remain functional.
