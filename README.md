# Codecut

[中文](README.zh-CN.md)

<p>
  Local Agent video editor for self-media creators.<br />
  Codex plans the edit; Codecut applies it to a local web timeline.
</p>

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](.github/CONTRIBUTING.md)

---

## At a Glance

Codecut is a local Agent video editor for self-media creators. It is built on the Codex plugin: Codex understands the content, generates or selects assets, and writes a clear editing plan; Codecut then applies that plan to a local web timeline for creators to preview, adjust, and export.

## Why Codecut Exists

Self-media creators are already using AI for ideation, copywriting, image
generation, and content planning, but the final video workflow is still broken:

- Pure Agents can write scripts and generate images, but they have no visual
  timeline, no preview surface, and no reliable video export path.
- Pure video editors have a timeline, but they do not understand the creator's
  content intent and usually do not expose an Agent-native editing contract.
- CapCut / Jianying-style tools are familiar and powerful, but frequent
  creators can hit paid AI features, premium templates, cloud storage,
  collaboration, or asset paywalls.
- Third-party AI video APIs add another cost layer, require API keys, and make
  simple creator workflows feel like engineering projects.

Codecut connects the two missing halves: Agent intelligence plus visual local
editing.

The product bet is simple: creators should be able to use Codex / Claude to
think, generate, and plan, then use Codecut to inspect, adjust, and export a
real timeline.

## Target Users

Codecut is built first for AI-native self-media workers:

- Knowledge creators, AI tool creators, independent developers, consultants,
  course makers, and founder-led media operators.
- Creators who already pay for Codex, Claude, or ChatGPT and want that
  subscription to do more of their video workflow.
- People who produce short videos every week and care about speed, cost,
  repeatable style, and human review.
- Users who want a local tool they can inspect and control, not a black-box
  cloud renderer.

It is not the best first product for casual template users, professional film
post-production teams, or agencies that mainly need multi-user review,
approval, and cloud asset management.

## What You Can Do

- Import local media into a project.
- Let Codex inspect transcript and media context through local executor tools.
- Ask the Agent to cut a talking-head, course, interview, or demo video into a
  short-form draft.
- Generate an explicit EditPlan that explains selected clips, captions, titles,
  and target format.
- Apply the plan to a visible timeline instead of receiving a black-box mp4.
- Preview, adjust, and export locally.

The early flagship workflow is:

> Give Codecut a local talking-head video and ask Codex to make a 30-90 second vertical short with cleaned speech, captions, a hook title, and optional generated visual assets.

## Product Principles

- **Reuse existing Agent subscriptions.** Codecut should make Codex / Claude
  more useful for video work instead of forcing creators into another AI API
  stack. Image generation availability and usage limits depend on the user's
  Agent account and plan.
- **Local-first execution.** Media, transcript processing, timeline mutation,
  preview, and export should stay local whenever possible.
- **Visible timeline over black-box output.** The Agent can draft, but the
  creator must be able to see and change the result.
- **One explicit editing path.** Agent reasoning becomes a validated EditPlan;
  Codecut applies that plan. No silent fallbacks, magic defaults, or hidden
  auto-repair.
- **CapCut Pro AI workflow alternative, not full CapCut clone.** The first
  product does not compete on template volume. It competes on Agent-native
  control, lower repeated AI-tool cost, and explainable local editing.

## Stack Snapshot

- `Next.js` application in `apps/web`
- `Bun` for dependency management and scripts
- `PostgreSQL + Redis` (optional for frontend-only work)
- `TypeScript` across the project

## Installation

### Ask Codex To Install Codecut

Send this message to Codex:

```text
Please install the Codecut Codex plugin from https://github.com/laozhong86/codecut.git.
Clone the repository into ~/plugins/codecut, verify that .codex-plugin/plugin.json exists, run bun install, create apps/web/.env.local from apps/web/.env.example if it is missing, add the plugin to the personal marketplace, run codex plugin marketplace add ~, then run codex plugin add codecut@personal. After installing, validate the plugin and tell me whether I should start a fresh Codex conversation to load the new skills and MCP tools.
```

### Manual Install

Clone the plugin into the default location referenced by the Codex personal
marketplace:

```bash
mkdir -p ~/plugins
git clone https://github.com/laozhong86/codecut.git ~/plugins/codecut
cd ~/plugins/codecut
bun install
test -f apps/web/.env.local || cp apps/web/.env.example apps/web/.env.local
bun run build:web
```

Make sure `~/.agents/plugins/marketplace.json` contains a Codecut entry:

```json
{
  "name": "personal",
  "interface": {
    "displayName": "Personal"
  },
  "plugins": [
    {
      "name": "codecut",
      "source": {
        "source": "local",
        "path": "./plugins/codecut"
      },
      "policy": {
        "installation": "AVAILABLE",
        "authentication": "ON_INSTALL"
      },
      "category": "Developer Tools"
    }
  ]
}
```

Then register the personal marketplace and install the plugin:

```bash
codex plugin marketplace add ~
codex plugin add codecut@personal
```

After installing, start a fresh Codex conversation so the new skills and MCP
tools load cleanly.

## Usage

### Open Codecut

Ask Codex:

```text
Open Codecut and set up a local video editing workspace.
```

Codecut starts a local web editor at:

```text
http://127.0.0.1:4100/en/projects
```

Planning and execution artifacts are saved under the active project workspace,
not inside the plugin repository:

```text
.codecut-workspace/projects/<project-id>/
```

### Import Local Media

Ask Codex:

```text
Import my local video into Codecut and prepare a short-form edit.
```

Codex will use the Codecut plugin to inspect the file, collect the required
editing setup, and prepare a visible local timeline instead of returning a
black-box video file.

### Create A Vertical Short

Ask Codex:

```text
Turn this source clip into a 30-90 second vertical short with captions.
```

Codex writes the editing plan. Codecut applies the plan to the local web
timeline, returns an `editorUrl`, and keeps the result available for creator
preview, adjustment, and export.

## Publish And Verify Local Updates

Codecut can run as a normal local app, but the Codex plugin release has four
separate layers: marketplace discovery, plugin enablement, installed cache, and
the active Codex session. Do not treat a passing source test as proof that a
fresh Codex thread can see the current plugin.

Publish a local update after changing `.codex-plugin/plugin.json`, `skills/`,
`.mcp.json`, MCP resources, widgets, bridge code, or plugin-facing assets:

```bash
node scripts/sync-codex-local-plugin.mjs --marketplace <marketplace-name>
bun run plugin:freshness
```

`node scripts/sync-codex-local-plugin.mjs` copies the source checkout into the
installed Codex cache and verifies key source/cache checksums. `bun run
plugin:freshness` is read-only; it reports source, marketplace, enabled config,
installed cache, and session freshness without repairing state.

Before calling a plugin release ready, record the checklist in
`docs/codecut-version-release-matrix.md`:

- Manifest: `.codex-plugin/plugin.json` name and version.
- Marketplace/config: the enabled `codecut@<marketplace-name>` entry points at
  this source checkout.
- Installed cache: source-to-cache sync is clean after the update.
- Fresh Codex session: start a fresh Codex thread after install or cache sync.
- Tool surface: use `tool_search` for `open_codecut_workspace Codecut MCP
  workspace setup widget` and confirm `open_codecut_workspace` is callable.
- Fresh-thread widget proof: follow `docs/codecut-widget-intake-fresh-thread.md`
  before claiming widget or MCP routing changes are visible.

Codecut workspace data, imported media, generated planning artifacts, timeline
state, and exports belong to the user's project or executor workspace. They are
not plugin source files and must not be used as proof that the plugin bundle is
published.

## Quick Start (Fast Path)

```bash
git clone <your-fork-url>
cd codecut/apps/web
cp .env.example .env.local
bun install
bun dev
```

Open `http://localhost:4100`.

## Full Local Setup (With Services)

Start only the backing services for local development:

```bash
docker compose up redis serverless-redis-http -d
```

Then in `apps/web`:

```bash
cp .env.example .env.local
```

Required env values:

```bash
UPSTASH_REDIS_REST_URL="http://localhost:8079"
UPSTASH_REDIS_REST_TOKEN="codecut_redis_token"
NODE_ENV="development"
```

To enable authentication, also start PostgreSQL and add these env values:

```bash
docker compose up redis serverless-redis-http postgres -d
```

```bash
DATABASE_URL="postgresql://codecut:codecut@localhost:5432/codecut"
BETTER_AUTH_SECRET="your-generated-secret-here"
```

Generate `BETTER_AUTH_SECRET`:

```bash
openssl rand -base64 32
```

Run:

```bash
bun run db:migrate
bun run dev
```

## Contributing

Contributions are welcome. Check `.github/CONTRIBUTING.md` before opening a PR.

Current high-impact areas:

- Timeline behavior and interaction quality
- Project management and reliability
- Performance tuning and bug fixing
- UI improvements outside preview internals

Areas currently under active refactor:

- Preview panel internals (fonts/stickers/effects)
- Export pipeline internals

## Docker Deployment

Run the full application with Docker:

```bash
docker compose up --build
```

Open `http://localhost:4100`.

This starts Redis and the web app. To enable authentication, uncomment the PostgreSQL service and related env vars in `docker-compose.yaml`.

## Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmsgbyte%2Fcodecut&project-name=codecut&repository-name=codecut)

## License

Released under the [MIT License](LICENSE).

<p align="right">
  <sub><sup>NOTE: fork from opencut (#fca99d6126c31fbb18ed9f1034cee6f940b040e8)</sup></sub>
</p>
