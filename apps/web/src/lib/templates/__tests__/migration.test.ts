import { describe, expect, test } from "bun:test";
import { migrateLegacyTemplateRecord } from "../migration";
import { createLegacyTemplateRecord } from "./test-helpers";

describe("migrateLegacyTemplateRecord", () => {
	test("maps a legacy product-proof template to a unified template execution profile", () => {
		const result = migrateLegacyTemplateRecord(
			createLegacyTemplateRecord({
				id: "legacy-proof",
				trigger: {
					types: ["product-proof-ad"],
					defaultForTypes: ["product-proof-ad"],
					aliases: ["legacy proof"],
				},
			}),
		);

		expect(result).toMatchObject({
			id: "legacy-proof",
			source: "user",
			readOnly: false,
			execution: {
				path: "edit-plan-v1",
				requiredEvidence: ["transcript", "visual-proof", "product-facts"],
			},
		});
	});

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

		expect(result).toMatchObject({
			id: "legacy-proof-demo",
			source: "user",
			readOnly: false,
			execution: {
				path: "edit-plan-v1",
				requiredEvidence: ["transcript", "visual-proof", "product-facts"],
			},
			networkMaterialPolicy: {
				defaultEnabled: false,
			},
		});
	});

	test("fails when a legacy template has no unique execution profile", () => {
		expect(() =>
			migrateLegacyTemplateRecord(
				createLegacyTemplateRecord({
					id: "legacy-custom",
					trigger: {
						types: ["custom"],
						defaultForTypes: [],
						aliases: [],
					},
				}),
			),
		).toThrow(
			"Legacy template legacy-custom cannot be migrated because no unique execution profile matches trigger types: custom.",
		);
	});
});
