import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import { VOICE_PACKS } from "../tts-constants";

const rootDir = resolve(import.meta.dir, "../../../../..");
const proxyPath = resolve(rootDir, "apps/web/src/proxy.ts");

describe("TTS assets", () => {
	test("ships the built-in RunningHub reference voices", () => {
		const expectedVoices = [
			{ id: "podcast-female", name: "女声", fileName: "podcast-female.mp3" },
			{ id: "podcast-male", name: "男声", fileName: "podcast-male.mp3" },
		];

		for (const expectedVoice of expectedVoices) {
			const voice = VOICE_PACKS.find(
				(candidate) => candidate.id === expectedVoice.id,
			);
			expect(voice).toMatchObject({
				name: expectedVoice.name,
				provider: "runninghub-voice-clone",
				referenceAudioUrl: `/voices/${expectedVoice.fileName}`,
				referenceAudioFileName: expectedVoice.fileName,
				referenceAudioMimeType: "audio/mpeg",
			});

			const assetPath = resolve(
				rootDir,
				`apps/web/public/voices/${expectedVoice.fileName}`,
			);
			expect(existsSync(assetPath)).toBe(true);
			expect(statSync(assetPath).size).toBeGreaterThan(0);
		}

		const proxy = readFileSync(proxyPath, "utf8");
		expect(proxy).toContain("voices");
	});
});
