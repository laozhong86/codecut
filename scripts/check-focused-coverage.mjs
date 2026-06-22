#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const COVERAGE_AREAS = [
	{
		name: "codex-executor",
		minLineCoverage: 80,
		prefixes: [
			"apps/web/src/lib/codex-executor/",
			"apps/web/src/app/api/codex-executor/",
		],
	},
	{
		name: "agent-bridge",
		minLineCoverage: 85,
		prefixes: [
			"apps/web/src/lib/agent-bridge/",
			"apps/web/src/app/api/agent-bridge/",
			"apps/web/src/components/providers/agent-bridge-provider.tsx",
		],
	},
	{
		name: "speech-cleanup",
		minLineCoverage: 95,
		prefixes: ["apps/web/src/lib/speech-cleanup/"],
	},
	{
		name: "commands",
		minLineCoverage: 50,
		prefixes: ["apps/web/src/lib/commands/"],
	},
];

export function computeFocusedCoverage(lcovText, areas = COVERAGE_AREAS) {
	const totals = new Map(
		areas.map((area) => [
			area.name,
			{ ...area, files: 0, lineHits: 0, lineTotal: 0 },
		]),
	);

	for (const record of lcovText.split("end_of_record")) {
		const sourceFile = record
			.match(/^SF:(.*)$/m)?.[1]
			?.replaceAll("\\", "/");
		if (!sourceFile) {
			continue;
		}

		for (const area of totals.values()) {
			if (!area.prefixes.some((prefix) => sourceFile.includes(prefix))) {
				continue;
			}

			area.files += 1;
			for (const line of record.matchAll(/^DA:\d+,(\d+)/gm)) {
				area.lineTotal += 1;
				if (Number(line[1]) > 0) {
					area.lineHits += 1;
				}
			}
		}
	}

	return [...totals.values()].map((area) => ({
		name: area.name,
		minLineCoverage: area.minLineCoverage,
		files: area.files,
		lineHits: area.lineHits,
		lineTotal: area.lineTotal,
		lineCoverage:
			area.lineTotal === 0 ? 0 : (area.lineHits / area.lineTotal) * 100,
	}));
}

function formatPercent(value) {
	return `${value.toFixed(2)}%`;
}

export function checkFocusedCoverage(lcovPath) {
	if (!lcovPath) {
		throw new Error("Usage: check-focused-coverage.mjs <lcov.info>");
	}
	if (!existsSync(lcovPath)) {
		throw new Error(`Coverage file does not exist: ${lcovPath}`);
	}

	const coverage = computeFocusedCoverage(readFileSync(lcovPath, "utf8"));
	const failures = [];

	for (const area of coverage) {
		if (area.files === 0 || area.lineTotal === 0) {
			failures.push(`${area.name}: no covered source files found`);
			continue;
		}
		if (area.lineCoverage < area.minLineCoverage) {
			failures.push(
				`${area.name}: ${formatPercent(area.lineCoverage)} < ${formatPercent(
					area.minLineCoverage,
				)}`,
			);
		}
	}

	for (const area of coverage) {
		console.log(
			[
				area.name,
				formatPercent(area.lineCoverage),
				`${area.lineHits}/${area.lineTotal} lines`,
				`${area.files} files`,
				`threshold ${formatPercent(area.minLineCoverage)}`,
			].join(" | "),
		);
	}

	if (failures.length > 0) {
		throw new Error(`Focused coverage failed:\n${failures.join("\n")}`);
	}
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	try {
		checkFocusedCoverage(process.argv[2]);
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exit(1);
	}
}
