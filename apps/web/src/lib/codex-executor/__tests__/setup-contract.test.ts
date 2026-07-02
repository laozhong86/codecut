import { describe, expect, test } from "bun:test";
import {
	applyConfirmedSetupPatch,
	ConfirmedSetupSchema,
} from "../setup-contract";

function confirmedSetup(overrides: Record<string, unknown> = {}) {
	return {
		version: 1,
		taskType: "edit_execution",
		confirmedAt: "2026-06-27T00:00:00.000Z",
		source: "codecut_setup_confirmation",
		timelinePreferences: {
			aspectRatio: "9:16",
			durationGoal: { mode: "auto" },
			durationContract: {
				totalDurationMode: "auto",
				sourceCoverageMode: "selected_segments",
			},
			transitionPreference: "auto",
			generateIntroCover: true,
			requirements: "Create a clear short video.",
		},
		titlePreferences: { enabled: false },
		captionPreferences: {
			enabled: true,
			language: "auto",
			font: "auto",
			size: "medium",
			stylePreset: "creator-clean",
		},
		voicePreferences: {
			enabled: false,
			voicePackId: "none",
		},
		characterPreferences: { characterId: "none" },
		bgmPreferences: { mode: "none" },
		exportPreferences: {
			format: "mp4",
			quality: "high",
			includeAudio: true,
		},
		templatePreference: { mode: "auto" },
		networkMaterialMatching: {
			enabled: false,
			placement: "background",
			providers: ["pexels", "pixabay", "coverr"],
			resolvedTemplateId: "talking-head-short",
			decisionSource: "template",
		},
		changes: [],
		...overrides,
	};
}

function bgmCandidate(overrides: Record<string, unknown> = {}) {
	return {
		id: "internet-archive:safe-lofi:safe-lofi.mp3",
		sourceId: "internet-archive:safe-lofi:safe-lofi.mp3",
		title: "Safe Lofi Beat",
		creator: "Open Artist",
		source: "internet_archive",
		sourceUrl: "https://archive.org/details/safe-lofi",
		licenseLabel: "CC BY 4.0",
		licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
		commercialUseAllowed: true,
		attributionRequired: true,
		previewUrl: "https://archive.org/download/safe-lofi/safe-lofi.mp3",
		downloadUrl: "https://archive.org/download/safe-lofi/safe-lofi.mp3",
		durationSeconds: 91.2,
		...overrides,
	};
}

function smartBgmPreferences(overrides: Record<string, unknown> = {}) {
	const selectedCandidate = bgmCandidate();
	return {
		mode: "smart_match",
		searchQuery: "bright lofi product demo",
		candidates: [selectedCandidate],
		selectedCandidate,
		...overrides,
	};
}

describe("ConfirmedSetup durationContract", () => {
	test("accepts the default selected-segment duration contract and fills tolerance", () => {
		const parsed = ConfirmedSetupSchema.parse(confirmedSetup());

		expect(parsed.timelinePreferences.durationContract).toEqual({
			totalDurationMode: "auto",
			sourceCoverageMode: "selected_segments",
			toleranceSeconds: 0.2,
		});
		expect(parsed.templatePreference).toEqual({ mode: "auto" });
		expect(parsed.networkMaterialMatching).toEqual({
			enabled: false,
			placement: "background",
			providers: ["pexels", "pixabay", "coverr"],
			resolvedTemplateId: "talking-head-short",
			decisionSource: "template",
		});
	});

	test("accepts confirmed network material matching from template defaults", () => {
		const parsed = ConfirmedSetupSchema.parse(
			confirmedSetup({
				networkMaterialMatching: {
					enabled: true,
					placement: "top",
					providers: ["pexels", "coverr"],
					resolvedTemplateId: "talking-head-broll-split",
					decisionSource: "template",
				},
			}),
		);

		expect(parsed.networkMaterialMatching).toEqual({
			enabled: true,
			placement: "top",
			providers: ["pexels", "coverr"],
			resolvedTemplateId: "talking-head-broll-split",
			decisionSource: "template",
		});
	});

	test("accepts specified template preference with requested template", () => {
		const parsed = ConfirmedSetupSchema.parse(
			confirmedSetup({
				templatePreference: {
					mode: "specified",
					requestedTemplate: "talking-head-broll-split",
				},
			}),
		);

		expect(parsed.templatePreference).toEqual({
			mode: "specified",
			requestedTemplate: "talking-head-broll-split",
		});
		expect(() =>
			ConfirmedSetupSchema.parse(
				confirmedSetup({
					templatePreference: { mode: "specified" },
				}),
			),
		).toThrow();
		expect(() =>
			ConfirmedSetupSchema.parse(
				confirmedSetup({
					templatePreference: {
						mode: "specified",
						requestedTemplate: "TikTok 解说视频模板",
					},
				}),
			),
		).toThrow();
	});

	test("accepts create template preference with draft template name", () => {
		const parsed = ConfirmedSetupSchema.parse(
			confirmedSetup({
				templatePreference: {
					mode: "create",
					draftTemplateName: "TikTok 解说模板草稿",
				},
			}),
		);

		expect(parsed.templatePreference).toEqual({
			mode: "create",
			draftTemplateName: "TikTok 解说模板草稿",
		});
		expect(() =>
			ConfirmedSetupSchema.parse(
				confirmedSetup({
					templatePreference: { mode: "create", draftTemplateName: "" },
				}),
			),
		).toThrow();
	});

	test("template preference changes require replan", () => {
		const applied = applyConfirmedSetupPatch({
			confirmedSetup: ConfirmedSetupSchema.parse(confirmedSetup()),
			patch: {
				templatePreference: {
					mode: "specified",
					requestedTemplate: "talking-head-short",
				},
			},
			reason: "user_selected_template",
			changedAt: "2026-07-01T00:00:00.000Z",
		});

		expect(applied.requiresReplan).toBe(true);
		expect(applied.changedFields).toEqual([
			"templatePreference.mode",
			"templatePreference.requestedTemplate",
		]);
		expect(applied.confirmedSetup.templatePreference).toEqual({
			mode: "specified",
			requestedTemplate: "talking-head-short",
		});
	});

	test("accepts character and BGM preferences", () => {
		const parsed = ConfirmedSetupSchema.parse(
			confirmedSetup({
				characterPreferences: { characterId: "ugc-female-host" },
				bgmPreferences: smartBgmPreferences(),
			}),
		);

		expect(parsed.characterPreferences).toEqual({
			characterId: "ugc-female-host",
		});
		expect(parsed.bgmPreferences).toEqual(smartBgmPreferences());
		expect(() =>
			ConfirmedSetupSchema.parse(
				confirmedSetup({
					characterPreferences: { characterId: "unknown-character" },
					bgmPreferences: smartBgmPreferences(),
				}),
			),
		).toThrow("characterPreferences.characterId must be none or a built-in role");
		expect(() =>
			ConfirmedSetupSchema.parse(
				confirmedSetup({
					characterPreferences: { characterId: "none" },
					bgmPreferences: { mode: "custom_upload" },
				}),
			),
		).toThrow();
	});

	test("defaults missing character and BGM preferences for existing confirmed setups", () => {
		const legacy = confirmedSetup();
		delete (legacy as Record<string, unknown>).characterPreferences;
		delete (legacy as Record<string, unknown>).bgmPreferences;

		const parsed = ConfirmedSetupSchema.parse(legacy);

		expect(parsed.characterPreferences).toEqual({ characterId: "none" });
		expect(parsed.bgmPreferences).toEqual({ mode: "none" });

		const applied = applyConfirmedSetupPatch({
			confirmedSetup: legacy as unknown as Parameters<
				typeof applyConfirmedSetupPatch
			>[0]["confirmedSetup"],
			patch: {
				characterPreferences: { characterId: "ugc-female-host" },
				bgmPreferences: smartBgmPreferences(),
			},
			reason: "user_selected_role_and_bgm",
			changedAt: "2026-07-01T00:00:00.000Z",
		});

		expect(applied.changedFields).toEqual([
			"characterPreferences.characterId",
			"bgmPreferences.mode",
			"bgmPreferences.searchQuery",
			"bgmPreferences.candidates",
			"bgmPreferences.selectedCandidate.id",
			"bgmPreferences.selectedCandidate.sourceId",
			"bgmPreferences.selectedCandidate.title",
			"bgmPreferences.selectedCandidate.creator",
			"bgmPreferences.selectedCandidate.source",
			"bgmPreferences.selectedCandidate.sourceUrl",
			"bgmPreferences.selectedCandidate.licenseLabel",
			"bgmPreferences.selectedCandidate.licenseUrl",
			"bgmPreferences.selectedCandidate.commercialUseAllowed",
			"bgmPreferences.selectedCandidate.attributionRequired",
			"bgmPreferences.selectedCandidate.previewUrl",
			"bgmPreferences.selectedCandidate.downloadUrl",
			"bgmPreferences.selectedCandidate.durationSeconds",
		]);
		expect(applied.confirmedSetup.characterPreferences).toEqual({
			characterId: "ugc-female-host",
		});
		expect(applied.confirmedSetup.bgmPreferences).toEqual(smartBgmPreferences());
	});

	test("character and BGM preference changes require replan", () => {
		const applied = applyConfirmedSetupPatch({
			confirmedSetup: ConfirmedSetupSchema.parse(
				confirmedSetup({
					characterPreferences: { characterId: "none" },
					bgmPreferences: { mode: "none" },
				}),
			),
			patch: {
				characterPreferences: { characterId: "ugc-female-host" },
				bgmPreferences: smartBgmPreferences(),
			},
			reason: "user_selected_role_and_bgm",
			changedAt: "2026-07-01T00:00:00.000Z",
		});

		expect(applied.requiresReplan).toBe(true);
		expect(applied.changedFields).toEqual([
			"characterPreferences.characterId",
			"bgmPreferences.mode",
			"bgmPreferences.searchQuery",
			"bgmPreferences.candidates",
			"bgmPreferences.selectedCandidate.id",
			"bgmPreferences.selectedCandidate.sourceId",
			"bgmPreferences.selectedCandidate.title",
			"bgmPreferences.selectedCandidate.creator",
			"bgmPreferences.selectedCandidate.source",
			"bgmPreferences.selectedCandidate.sourceUrl",
			"bgmPreferences.selectedCandidate.licenseLabel",
			"bgmPreferences.selectedCandidate.licenseUrl",
			"bgmPreferences.selectedCandidate.commercialUseAllowed",
			"bgmPreferences.selectedCandidate.attributionRequired",
			"bgmPreferences.selectedCandidate.previewUrl",
			"bgmPreferences.selectedCandidate.downloadUrl",
			"bgmPreferences.selectedCandidate.durationSeconds",
		]);
		expect(applied.confirmedSetup.characterPreferences).toEqual({
			characterId: "ugc-female-host",
		});
		expect(applied.confirmedSetup.bgmPreferences).toEqual(smartBgmPreferences());
	});

	test("requires smart matched BGM to carry search query candidates and selected music", () => {
		expect(() =>
			ConfirmedSetupSchema.parse(
				confirmedSetup({
					bgmPreferences: { mode: "smart_match" },
				}),
			),
		).toThrow("bgmPreferences.searchQuery is required for smart_match.");
		expect(() =>
			ConfirmedSetupSchema.parse(
				confirmedSetup({
					bgmPreferences: {
						mode: "smart_match",
						searchQuery: "lofi",
						candidates: [],
						selectedCandidate: bgmCandidate(),
					},
				}),
			),
		).toThrow("bgmPreferences.candidates must include at least one candidate.");
		expect(() =>
			ConfirmedSetupSchema.parse(
				confirmedSetup({
					bgmPreferences: {
						mode: "smart_match",
						searchQuery: "lofi",
						candidates: [bgmCandidate()],
					},
				}),
			),
		).toThrow("bgmPreferences.selectedCandidate is required for smart_match.");
	});

	test("rejects stale or unsafe BGM selections", () => {
		expect(() =>
			ConfirmedSetupSchema.parse(
				confirmedSetup({
					bgmPreferences: {
						...smartBgmPreferences(),
						selectedCandidate: bgmCandidate({
							id: "internet-archive:other:other.mp3",
							sourceId: "internet-archive:other:other.mp3",
						}),
					},
				}),
			),
		).toThrow("bgmPreferences.selectedCandidate must be one of candidates.");
		expect(() =>
			ConfirmedSetupSchema.parse(
				confirmedSetup({
					bgmPreferences: smartBgmPreferences({
						candidates: [bgmCandidate({ commercialUseAllowed: false })],
						selectedCandidate: bgmCandidate({ commercialUseAllowed: false }),
					}),
				}),
			),
		).toThrow("BGM candidates must allow commercial use.");
		expect(() =>
			ConfirmedSetupSchema.parse(
				confirmedSetup({
					bgmPreferences: {
						mode: "none",
						selectedCandidate: bgmCandidate(),
					},
				}),
			),
		).toThrow("bgmPreferences.mode none cannot include matched music.");
	});

	test("create template preference changes require replan", () => {
		const applied = applyConfirmedSetupPatch({
			confirmedSetup: ConfirmedSetupSchema.parse(confirmedSetup()),
			patch: {
				templatePreference: {
					mode: "create",
					draftTemplateName: "复盘模板草稿",
				},
			},
			reason: "user_requested_template_draft",
			changedAt: "2026-07-01T00:00:00.000Z",
		});

		expect(applied.requiresReplan).toBe(true);
		expect(applied.changedFields).toEqual([
			"templatePreference.mode",
			"templatePreference.draftTemplateName",
		]);
		expect(applied.confirmedSetup.templatePreference).toEqual({
			mode: "create",
			draftTemplateName: "复盘模板草稿",
		});
	});

	test("network material matching changes require replan", () => {
		const applied = applyConfirmedSetupPatch({
			confirmedSetup: ConfirmedSetupSchema.parse(confirmedSetup()),
			patch: {
				networkMaterialMatching: {
					enabled: true,
					placement: "bottom",
					providers: ["pexels"],
					resolvedTemplateId: "talking-head-broll-split",
					decisionSource: "user",
				},
			},
			reason: "user_selected_network_material_layout",
			changedAt: "2026-07-01T00:00:00.000Z",
		});

		expect(applied.requiresReplan).toBe(true);
		expect(applied.changedFields).toEqual([
			"networkMaterialMatching.enabled",
			"networkMaterialMatching.placement",
			"networkMaterialMatching.providers",
			"networkMaterialMatching.resolvedTemplateId",
			"networkMaterialMatching.decisionSource",
		]);
		expect(applied.confirmedSetup.networkMaterialMatching).toEqual({
			enabled: true,
			placement: "bottom",
			providers: ["pexels"],
			resolvedTemplateId: "talking-head-broll-split",
			decisionSource: "user",
		});
	});

	test("accepts built-in and custom voice preferences", () => {
		const parsed = ConfirmedSetupSchema.parse(
			confirmedSetup({
				voicePreferences: {
					enabled: true,
					voicePackId: "podcast-female",
				},
			}),
		);

		expect(parsed.voicePreferences).toEqual({
			enabled: true,
			voicePackId: "podcast-female",
		});
		const custom = ConfirmedSetupSchema.parse(
			confirmedSetup({
				voicePreferences: {
					enabled: true,
					voicePackId: "custom",
					customVoiceFile: {
						name: "voice.wav",
						url: "blob:voice",
						path: "voice.wav",
					},
				},
			}),
		);
		expect(custom.voicePreferences).toEqual({
			enabled: true,
			voicePackId: "custom",
			customVoiceFile: {
				name: "voice.wav",
				url: "blob:voice",
				path: "voice.wav",
			},
		});
		const localFileOnly = ConfirmedSetupSchema.parse(
			confirmedSetup({
				voicePreferences: {
					enabled: true,
					voicePackId: "custom",
					customVoiceFile: {
						name: "voice.wav",
						path: "/tmp/voice.wav",
					},
				},
			}),
		);
		expect(localFileOnly.voicePreferences).toEqual({
			enabled: true,
			voicePackId: "custom",
			customVoiceFile: {
				name: "voice.wav",
				path: "/tmp/voice.wav",
			},
		});
		expect(() =>
			ConfirmedSetupSchema.parse(
				confirmedSetup({
					voicePreferences: {
						enabled: true,
						voicePackId: "女声",
					},
				}),
			),
		).toThrow();
		expect(() =>
			ConfirmedSetupSchema.parse(
				confirmedSetup({
					voicePreferences: {
						enabled: true,
						voicePackId: "none",
					},
				}),
			),
		).toThrow("voicePreferences.voicePackId must be a voice");
		expect(() =>
			ConfirmedSetupSchema.parse(
				confirmedSetup({
					voicePreferences: {
						enabled: true,
						voicePackId: "custom",
					},
				}),
			),
		).toThrow("voicePreferences.customVoiceFile is required");
		expect(() =>
			ConfirmedSetupSchema.parse(
				confirmedSetup({
					voicePreferences: {
						enabled: false,
						voicePackId: "podcast-female",
					},
				}),
			),
		).toThrow("voicePreferences.voicePackId must be none");
	});

	test("accepts voice clone preferences with a source audio file", () => {
		const parsed = ConfirmedSetupSchema.parse(
			confirmedSetup({
				voicePreferences: {
					enabled: true,
					voicePackId: "voice_clone",
					voiceCloneSourceFile: {
						name: "reference.wav",
						path: "/tmp/reference.wav",
					},
				},
			}),
		);

		expect(parsed.voicePreferences).toEqual({
			enabled: true,
			voicePackId: "voice_clone",
			voiceCloneSourceFile: {
				name: "reference.wav",
				path: "/tmp/reference.wav",
			},
		});
		expect(() =>
			ConfirmedSetupSchema.parse(
				confirmedSetup({
					voicePreferences: {
						enabled: true,
						voicePackId: "voice_clone",
					},
				}),
			),
		).toThrow("voicePreferences.voiceCloneSourceFile is required");
		expect(() =>
			ConfirmedSetupSchema.parse(
				confirmedSetup({
					voicePreferences: {
						enabled: true,
						voicePackId: "custom",
						customVoiceFile: {
							name: "voice.wav",
							url: "blob:voice",
						},
						voiceCloneSourceFile: {
							name: "reference.wav",
							path: "/tmp/reference.wav",
						},
					},
				}),
			),
		).toThrow(
			"voicePreferences.voiceCloneSourceFile is only allowed for voice clone.",
		);
	});

	test("clears the selected voice when voice is disabled by patch", () => {
		const applied = applyConfirmedSetupPatch({
			confirmedSetup: ConfirmedSetupSchema.parse(
				confirmedSetup({
					voicePreferences: {
						enabled: true,
						voicePackId: "voice_clone",
						voiceCloneSourceFile: {
							name: "reference.wav",
							path: "/tmp/reference.wav",
						},
					},
				}),
			),
			patch: {
				voicePreferences: { enabled: false },
			},
			reason: "user_disabled_voice",
			changedAt: "2026-07-01T00:00:00.000Z",
		});

		expect(applied.confirmedSetup.voicePreferences).toEqual({
			enabled: false,
			voicePackId: "none",
		});
		expect(applied.changedFields).toEqual([
			"voicePreferences.enabled",
			"voicePreferences.voicePackId",
		]);
		expect(applied.requiresReplan).toBe(true);
	});

	test("accepts title, caption, and voice enablement preferences", () => {
		const parsed = ConfirmedSetupSchema.parse(
			confirmedSetup({
				titlePreferences: {
					enabled: true,
					mode: "custom",
					text: "别乱花钱",
					stylePreset: "hook_title",
				},
				captionPreferences: {
					enabled: false,
					language: "zh-CN",
					font: "auto",
					size: "medium",
					stylePreset: "short-form-bold",
				},
				voicePreferences: {
					enabled: false,
					voicePackId: "none",
				},
			}),
		);

		expect(parsed.titlePreferences).toEqual({
			enabled: true,
			mode: "custom",
			text: "别乱花钱",
			stylePreset: "hook_title",
		});
		expect(parsed.captionPreferences.enabled).toBe(false);
		expect(parsed.voicePreferences).toEqual({
			enabled: false,
			voicePackId: "none",
		});
	});

	test("accepts automatic title mode without fixed title text", () => {
		const parsed = ConfirmedSetupSchema.parse(
			confirmedSetup({
				titlePreferences: {
					enabled: true,
					mode: "auto",
					stylePreset: "hook_title",
				},
			}),
		);

		expect(parsed.titlePreferences).toEqual({
			enabled: true,
			mode: "auto",
			stylePreset: "hook_title",
		});
	});

	test("requires title text and style when custom title is enabled", () => {
		expect(() =>
			ConfirmedSetupSchema.parse(
				confirmedSetup({
					titlePreferences: {
						enabled: true,
						mode: "custom",
					},
				}),
			),
		).toThrow("titlePreferences.text is required");
	});

	test("requires source duration when preserving total duration", () => {
		expect(() =>
			ConfirmedSetupSchema.parse(
				confirmedSetup({
					timelinePreferences: {
						aspectRatio: "9:16",
						durationGoal: { mode: "auto" },
						durationContract: {
							totalDurationMode: "preserve_source",
							sourceCoverageMode: "selected_segments",
						},
						transitionPreference: "auto",
						generateIntroCover: true,
						requirements: "Keep the full source duration.",
					},
				}),
			),
		).toThrow("durationContract.sourceDurationSeconds is required");
	});

	test("rejects timeline intro cover for full-source preservation", () => {
		expect(() =>
			ConfirmedSetupSchema.parse(
				confirmedSetup({
					timelinePreferences: {
						aspectRatio: "9:16",
						durationGoal: { mode: "auto" },
						durationContract: {
							totalDurationMode: "preserve_source",
							sourceCoverageMode: "full_source",
							sourceDurationSeconds: 28.866667,
						},
						transitionPreference: "auto",
						generateIntroCover: true,
						requirements:
							"Keep the full source video and add a fixed top title.",
					},
				}),
			),
		).toThrow("generateIntroCover must be false");
	});

	test("requires a custom duration range when the contract uses custom_range", () => {
		expect(() =>
			ConfirmedSetupSchema.parse(
				confirmedSetup({
					timelinePreferences: {
						aspectRatio: "9:16",
						durationGoal: { mode: "auto" },
						durationContract: {
							totalDurationMode: "custom_range",
							sourceCoverageMode: "selected_segments",
						},
						transitionPreference: "auto",
						generateIntroCover: true,
						requirements: "Cut to a custom range.",
					},
				}),
			),
		).toThrow("durationGoal.mode must be custom");
	});
});
