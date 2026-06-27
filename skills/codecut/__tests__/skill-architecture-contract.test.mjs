import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pluginRoot = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"..",
	"..",
);
const stageSkills = [
	"codecut",
	"codecut-requirement-intake",
	"codecut-material-ingest",
	"codecut-tiktok-downloader",
	"codecut-reference-template",
	"codecut-executor-apply",
];
const requiredSections = [
	"## Core Boundary",
	"## Progressive Load Map",
	"## Stage Ownership",
	"## Inputs",
	"## Outputs",
	"## Artifacts",
	"## Stop Conditions",
	"## Handoff",
];
const expectedStageOwners = new Map([
	["router", ["codecut"]],
	["requirement-intake", ["codecut-requirement-intake"]],
	["source-acquisition", ["codecut-material-ingest", "codecut-tiktok-downloader"]],
	["material-ingest", ["codecut-material-ingest"]],
	["reference-template", ["codecut-reference-template"]],
	["executor-apply", ["codecut-executor-apply"]],
]);
const supportingFileStages = [
	"`router`",
	"`requirement-intake`",
	"`source-acquisition`",
	"`material-ingest`",
	"`reference-template`",
	"`edit-planning`",
	"`executor-apply`",
	"`timeline-inspection`",
	"`implementation`",
];
const successContractOutcomes = [
	"Workspace ready",
	"Timeline mutated",
	"Local MP4 export produced",
	"Human preview ready",
	"Visual QA passed",
	"Plugin-facing change ready",
];

function readProjectFile(...parts) {
	return readFileSync(join(pluginRoot, ...parts), "utf8");
}

function countExactHeading(content, heading) {
	const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return Array.from(content.matchAll(new RegExp(`^${escaped}$`, "gm"))).length;
}

function parseStageTable(content) {
	const lines = content.split("\n");
	const tableStart = lines.findIndex((line) => line.startsWith("| Stage | Owner |"));
	expect(tableStart, "workflow stage table missing").toBeGreaterThanOrEqual(0);

	const rows = [];
	for (const line of lines.slice(tableStart + 2)) {
		if (!line.startsWith("| ")) {
			break;
		}
		const cells = line
			.split("|")
			.slice(1, -1)
			.map((cell) => cell.trim());
		if (cells.length >= 7) {
			rows.push(cells);
		}
	}
	return rows;
}

function codecutTokens(cell) {
	return Array.from(cell.matchAll(/`(codecut[^`]*)`/g), (match) => match[1]).sort();
}

describe("CodeCut skill architecture v1 contract", () => {
	test("each stage skill declares the same architecture sections exactly once", () => {
		for (const skillName of stageSkills) {
			const skill = readProjectFile("skills", skillName, "SKILL.md");
			for (const section of requiredSections) {
				expect(countExactHeading(skill, section), `${skillName} ${section}`).toBe(1);
			}
		}
	});

	test("stage proof uses the CodeCut workspace as the primary artifact path", () => {
		const workflowContract = readProjectFile(
			"skills",
			"codecut",
			"references",
			"workflow-stage-contract.md",
		);
		const workspaceDocs = readProjectFile("docs", "codecut-workspace.md");

		for (const content of [workflowContract, workspaceDocs]) {
			expect(content).toContain(".codecut-workspace/projects/<projectId>");
			expect(content).toContain("00-brief");
			expect(content).toContain("07-exports");
		}
		expect(workflowContract).toContain("skill-local `.artifacts`");
		expect(workflowContract).toMatch(
			/must not\s+become the primary Codecut artifact path/,
		);
	});

	test("workflow stage owners map to real loadable skill directories", () => {
		const workflowContract = readProjectFile(
			"skills",
			"codecut",
			"references",
			"workflow-stage-contract.md",
		);
		const rows = parseStageTable(workflowContract);
		const observedStages = rows
			.map((cells) => cells[0].match(/`([^`]+)`/)?.[1])
			.sort();

		expect(observedStages).toEqual(Array.from(expectedStageOwners.keys()).sort());

		for (const cells of rows) {
			const stageName = cells[0].match(/`([^`]+)`/)?.[1];
			const expectedOwners = expectedStageOwners.get(stageName);
			expect(expectedOwners, `unexpected stage ${stageName}`).toBeDefined();
			expect(codecutTokens(cells[1])).toEqual([...expectedOwners].sort());
			for (const owner of expectedOwners) {
				expect(existsSync(join(pluginRoot, "skills", owner, "SKILL.md"))).toBe(true);
			}
		}
		expect(workflowContract).toContain("Non-Skill Workflow Phases");
		expect(workflowContract).toMatch(/not\s+loadable stage skills/);
	});

	test("workflow contract defines the progressive supporting file map", () => {
		const workflowContract = readProjectFile(
			"skills",
			"codecut",
			"references",
			"workflow-stage-contract.md",
		);

		expect(workflowContract).toContain("## Supporting File Map");
		expect(workflowContract).toContain(
			"| Capability / stage | Read first | Load detail when | Stop before continuing | Required readback | Verification proof |",
		);
		for (const stage of supportingFileStages) {
			expect(workflowContract).toContain(stage);
		}
		expect(workflowContract).toContain("get_timeline_state");
		expect(workflowContract).toContain("bun run plugin:freshness");
	});

	test("execution contract centralizes success contracts and readback proof", () => {
		const executionContract = readProjectFile(
			"skills",
			"codecut",
			"references",
			"execution-contract.md",
		);

		expect(executionContract).toContain("## Success Contract Table");
		expect(executionContract).toContain(
			"| Outcome | Durable truth | Required readback | Stop before claiming success | Minimum proof |",
		);
		for (const outcome of successContractOutcomes) {
			expect(executionContract).toContain(outcome);
		}
		expect(executionContract).toContain(
			"Timeline readback and export proof are different contracts",
		);
		expect(executionContract).toContain("get_timeline_state");
		expect(executionContract).toContain("export_project");
		expect(executionContract).toContain("bun run plugin:freshness");
	});

	test("user-visible stage reports use the standard status shape", () => {
		const workflowContract = readProjectFile(
			"skills",
			"codecut",
			"references",
			"workflow-stage-contract.md",
		);

		for (const label of ["Stage:", "Status:", "Proof:", "Next:", "Risk:"]) {
			expect(workflowContract).toContain(label);
		}
	});
});
