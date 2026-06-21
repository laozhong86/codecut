import { mkdir, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { describe, expect, test } from "bun:test";
import { publishGeneratedImage } from "../publisher";

const pngBytes = Buffer.from([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
	0x00, 0x00, 0x00, 0x0d,
]);

describe("generated image publisher", () => {
	test("copies PNGs from the allowed Codex generated root", async () => {
		const generatedRoot = await mkdtemp(join(tmpdir(), "codex-generated-"));
		const publicDir = await mkdtemp(join(tmpdir(), "codecut-public-"));
		const nestedDir = join(generatedRoot, "session-1");
		await mkdir(nestedDir);
		const imagePath = join(nestedDir, "portrait.png");
		await writeFile(imagePath, pngBytes);

		const asset = await publishGeneratedImage({
			imagePath,
			generatedRoot,
			publicDir,
			outputName: "portrait.png",
		});

		expect(asset).toEqual({
			type: "image",
			path: await realpath(imagePath),
			url: "/generated/codex/portrait.png",
		});
		expect(await readFile(join(publicDir, "generated/codex/portrait.png"))).toEqual(
			pngBytes,
		);
	});

	test("rejects files outside the allowed Codex generated root", async () => {
		const generatedRoot = await mkdtemp(join(tmpdir(), "codex-generated-"));
		const publicDir = await mkdtemp(join(tmpdir(), "codecut-public-"));
		const outsidePath = join(await mkdtemp(join(tmpdir(), "outside-")), "x.png");
		await writeFile(outsidePath, pngBytes);

		await expect(
			publishGeneratedImage({
				imagePath: outsidePath,
				generatedRoot,
				publicDir,
			}),
		).rejects.toThrow("outside the allowed directory");
	});

	test("rejects non-PNG extensions before publishing", async () => {
		const generatedRoot = await mkdtemp(join(tmpdir(), "codex-generated-"));
		const publicDir = await mkdtemp(join(tmpdir(), "codecut-public-"));
		const imagePath = join(generatedRoot, "portrait.jpg");
		await writeFile(imagePath, pngBytes);

		await expect(
			publishGeneratedImage({
				imagePath,
				generatedRoot,
				publicDir,
			}),
		).rejects.toThrow(`${basename(imagePath)} must be a PNG file`);
	});
});
