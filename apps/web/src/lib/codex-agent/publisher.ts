import { copyFile, mkdir, readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, extname, join, relative, sep } from "node:path";
import { randomUUID } from "node:crypto";

export interface PublishedGeneratedImage {
	type: "image";
	path: string;
	url: string;
}

const pngSignature = Buffer.from([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

export async function publishGeneratedImage({
	imagePath,
	generatedRoot = join(homedir(), ".codex/generated_images"),
	publicDir,
	outputName,
}: {
	imagePath: string;
	generatedRoot?: string;
	publicDir: string;
	outputName?: string;
}): Promise<PublishedGeneratedImage> {
	const [rootRealPath, imageRealPath] = await Promise.all([
		realpath(/* turbopackIgnore: true */ generatedRoot),
		realpath(/* turbopackIgnore: true */ imagePath),
	]);
	const relativePath = relative(rootRealPath, imageRealPath);

	if (relativePath.startsWith("..") || relativePath.includes(`..${sep}`)) {
		throw new Error("Generated image path is outside the allowed directory");
	}

	if (extname(imageRealPath).toLowerCase() !== ".png") {
		throw new Error(`${basename(imageRealPath)} must be a PNG file`);
	}

	const header = await readFile(/* turbopackIgnore: true */ imageRealPath);
	if (!header.subarray(0, pngSignature.length).equals(pngSignature)) {
		throw new Error(`${basename(imageRealPath)} must have a PNG signature`);
	}

	const safeOutputName = outputName ?? `${randomUUID()}-${basename(imageRealPath)}`;
	const outputDir = join(publicDir, "generated/codex");
	const outputPath = join(outputDir, safeOutputName);

	await mkdir(/* turbopackIgnore: true */ outputDir, { recursive: true });
	await copyFile(
		/* turbopackIgnore: true */ imageRealPath,
		/* turbopackIgnore: true */ outputPath,
	);

	return {
		type: "image",
		path: imageRealPath,
		url: `/generated/codex/${safeOutputName}`,
	};
}
