# Template Import Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make CodeCut template import predictable: preflight catches migration and ID conflicts, imports return actionable conflict data, and MCP readback sees the same template library as the web UI.

**Architecture:** Keep `TemplateService` as the single template-library owner. Browser agent tools expose read, preflight, import, update, and delete behavior. MCP and `scripts/codex-bridge.mjs` call the browser agent bridge for every template library operation that depends on browser-local IndexedDB state.

**Tech Stack:** Bun tests, TypeScript, Zod schemas, Next.js browser agent bridge, CodeCut MCP wrapper.

---

### Task 1: Legacy Template Migration Selection

**Files:**
- Modify: `apps/web/src/lib/templates/migration.ts`
- Test: `apps/web/src/lib/templates/__tests__/migration.test.ts`

- [ ] **Step 1: Add a failing migration test**

```ts
test("maps compatible legacy trigger profiles to the strictest execution profile", () => {
	const result = migrateLegacyTemplateRecord(
		createLegacyTemplateRecord({
			id: "legacy-proof-demo",
			trigger: {
				types: ["tutorial-demo", "product-proof-ad"],
				defaultForTypes: [],
				aliases: ["proof demo"],
			},
		}),
	);

	expect(result.execution).toMatchObject({
		path: "edit-plan-v1",
		requiredEvidence: ["transcript", "visual-proof", "product-facts"],
	});
	expect(result.networkMaterialPolicy.defaultEnabled).toBe(false);
});
```

- [ ] **Step 2: Run the focused migration test**

Run: `bun test apps/web/src/lib/templates/__tests__/migration.test.ts`

Expected before implementation: FAIL because multiple legacy trigger profiles are rejected.

- [ ] **Step 3: Implement shared legacy profile resolution**

Replace duplicate trigger matching in `migration.ts` with a helper that:
- collects mappable trigger types,
- reads their built-in templates,
- allows multiple profiles only when all candidates share the same execution path,
- chooses the candidate with the largest `requiredEvidence.length`,
- still throws when there are no candidates or incompatible execution paths.

- [ ] **Step 4: Re-run migration test**

Run: `bun test apps/web/src/lib/templates/__tests__/migration.test.ts`

Expected: PASS.

### Task 2: Template Import Preflight And Conflict Result

**Files:**
- Modify: `apps/web/src/lib/templates/service.ts`
- Modify: `apps/web/src/lib/ai/agent/tools/template-tools.ts`
- Test: `apps/web/src/lib/templates/__tests__/service.test.ts`
- Test: `apps/web/src/lib/ai/agent/tools/__tests__/template-tools.test.ts`

- [ ] **Step 1: Add service tests for preflight**

Cover these cases:
- `canImport: true` for a new user template.
- `canImport: false`, `code: "template-id-conflict"` when a user template already exists.
- `canImport: false`, `code: "reserved-built-in-id"` when the draft uses a built-in ID.

- [ ] **Step 2: Add tool tests for preflight and import conflict**

Add tests for:
- new `executeCheckTemplateImportTool` returning source-of-truth and parsed template summary.
- `executeImportTemplateTool` returning a structured conflict instead of throwing when the ID already exists.

- [ ] **Step 3: Implement `checkTemplateImport` in `TemplateService`**

The method parses `TemplateSchema`, runs legacy migration first, checks built-in ID reservation, checks existing user template, checks default trigger conflicts, and returns a structured result. It does not write records.

- [ ] **Step 4: Wire agent tool**

Add `check_template_import` to `template-tools.ts`, `templateTools`, and `apps/web/src/lib/agent-bridge/schema.ts`. Keep it read-only and require a template JSON object, not a file path.

- [ ] **Step 5: Make import use the same preflight**

Before `registerTemplate`, call `checkTemplateImport`. If it cannot import, return `success: false` with `code`, `draft`, `existingTemplate`, and `nextActions` instead of throwing a generic error.

- [ ] **Step 6: Run focused web tests**

Run:
```bash
bun test apps/web/src/lib/templates/__tests__/service.test.ts
bun test apps/web/src/lib/ai/agent/tools/__tests__/template-tools.test.ts
bun test apps/web/src/lib/agent-bridge/__tests__/schema.test.ts
```

Expected: PASS.

### Task 3: MCP And CLI Template Readback Consistency

**Files:**
- Modify: `scripts/codex-bridge.mjs`
- Modify: `scripts/__tests__/codex-bridge.test.mjs`
- Modify: `mcp/server.mjs`

- [ ] **Step 1: Add CLI envelope builders**

Add:
- `buildListTemplatesEnvelope({ projectId })`
- `buildGetTemplateEnvelope({ projectId, templateId })`
- `buildResolveTemplateEnvelope({ projectId, ...args })`
- `buildCheckTemplateImportEnvelope({ projectId, templateJsonFile })`

All four should build browser agent bridge envelopes.

- [ ] **Step 2: Add CLI commands**

Add commands:
- `list-templates --project-id <id>`
- `get-template --project-id <id> --template-id <id>`
- `resolve-template --project-id <id> --args-json '<json>'`
- `check-template-import --project-id <id> --template-json-file /absolute/path/template.json`

These commands must use `postAgentBridgeEnvelopeAndWait`, not executor `/api/codex-executor/commands`.

- [ ] **Step 3: Update MCP command routing**

In `mcp/server.mjs`, route `list_templates`, `get_template`, `resolve_template`, and `check_template_import` to the new CLI commands. Update descriptions so they say “browser local template library”, not executor registry.

- [ ] **Step 4: Add CLI tests**

Add tests proving list/get/check/resolve template commands call:
1. `/api/agent-bridge/heartbeat`
2. `/api/agent-bridge/commands`
3. `/api/agent-bridge/results`

Expected: no request goes to executor command endpoints for template-library reads.

- [ ] **Step 5: Run focused bridge and MCP tests**

Run:
```bash
bun test scripts/__tests__/codex-bridge.test.mjs
bun test mcp
```

Expected: PASS or clear repo-known limitation for `bun test mcp` if no direct MCP test target exists.

### Task 4: Verification And Plugin Runtime Proof

**Files:**
- Runtime sync only; no source code changes expected after tests.

- [ ] **Step 1: Run quality checks**

Run:
```bash
bun run typecheck:web
bun run lint:web
```

Expected: PASS.

- [ ] **Step 2: Sync plugin cache**

Run: `node scripts/sync-codex-local-plugin.mjs`

Expected: source/cache checksums updated without stale runtime artifacts.

- [ ] **Step 3: Check plugin freshness**

Run: `bun run plugin:freshness`

Expected: runtime-critical plugin cache matches source.

- [ ] **Step 4: Fresh-session tool surface proof**

Use a fresh Codex session or tool discovery to prove `check_template_import`, `list_templates`, `get_template`, and `import_template` are discoverable. If current host session is stale, report that a fresh session is required before claiming runtime tool proof.

---

## Self-Review

- Spec coverage: covers legacy migration blocker, ID conflict, import preflight, MCP readback mismatch, and plugin runtime proof.
- Placeholders: no task depends on an undefined future component.
- Scope control: does not add a full UI wizard yet; this P0 makes the tool contract reliable first.
