export interface CharacterImage {
	id: string;
	label: string;
	prompt: string;
	blobKey: string;
	thumbnailDataUrl: string;
	referenceUrl?: string;
	createdAt: string;
}

export type CharacterGenerationType = "image" | "video";

export interface CharacterGeneration {
	id: string;
	type: CharacterGenerationType;
	prompt: string;
	thumbnailDataUrl?: string;
	url: string;
	provider: string;
	projectId?: string;
	mediaId?: string;
	createdAt: string;
}

export const CHARACTER_GENDERS = ["female", "male", "non-binary"] as const;

export type CharacterGender = (typeof CHARACTER_GENDERS)[number];

export const CHARACTER_AGE_RANGES = [
	"child",
	"teenager",
	"young adult",
	"adult",
	"middle-aged adult",
	"senior",
] as const;

export type CharacterAgeRange = (typeof CHARACTER_AGE_RANGES)[number];

export interface AICharacter {
	id: string;
	name: string;
	gender?: CharacterGender;
	age?: CharacterAgeRange;
	description: string;
	styleDescription?: string;
	images: CharacterImage[];
	generations: CharacterGeneration[];
	thumbnailDataUrl?: string;
	createdAt: string;
	updatedAt: string;
}
