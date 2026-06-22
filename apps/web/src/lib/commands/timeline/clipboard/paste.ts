import { Command } from "@/lib/commands/base-command";
import { EditorCore } from "@/core";
import type {
	TimelineTrack,
	TimelineElement,
	ClipboardItem,
} from "@/types/timeline";
import { generateUUID } from "@/utils/id";
import { wouldElementOverlap } from "@/lib/timeline/element-utils";
import {
	buildEmptyTrack,
	getHighestInsertIndexForTrack,
	isMainTrack,
	enforceMainTrackStart,
} from "@/lib/timeline/track-utils";

export class PasteCommand extends Command {
	private savedState: TimelineTrack[] | null = null;
	private pastedElements: { trackId: string; elementId: string }[] = [];
	private previousSelection: { trackId: string; elementId: string }[] = [];
	private pastedElementIds: string[] = [];
	private pastedTrackIdsBySourceTrackId = new Map<string, string>();

	constructor(
		private time: number,
		private clipboardItems: ClipboardItem[],
	) {
		super();
	}

	execute(): void {
		if (this.clipboardItems.length === 0) return;

		const editor = EditorCore.getInstance();
		this.savedState = editor.timeline.getTracks();
		this.previousSelection = editor.selection.getSelectedElements();
		this.pastedElements = [];

		const minStart = Math.min(
			...this.clipboardItems.map((item) => item.element.startTime),
		);
		const indexedClipboardItems = this.clipboardItems.map((item, index) => ({
			index,
			item,
		}));

		const updatedTracks = [...this.savedState];
		const itemsByTrackId = groupClipboardItemsByTrackId({
			clipboardItems: indexedClipboardItems,
		});

		for (const [trackId, items] of itemsByTrackId) {
			const elementsToAdd = buildPastedElements({
				items,
				minStart,
				time: this.time,
				resolveElementId: (index) => this.getPastedElementId(index),
			});

			if (elementsToAdd.length === 0) {
				continue;
			}

			const trackType = items[0].item.trackType;
			const sourceTrackIndex = updatedTracks.findIndex(
				(track) => track.id === trackId,
			);
			const resolvedTargetIndex = resolveTargetTrackIndex({
				tracks: updatedTracks,
				sourceTrackIndex,
				trackType,
				elements: elementsToAdd,
			});

			if (resolvedTargetIndex >= 0) {
				const targetTrack = updatedTracks[resolvedTargetIndex];
				let adjustedElements = elementsToAdd;

				if (isMainTrack(targetTrack)) {
					const earliestElement = elementsToAdd.reduce((earliest, element) =>
						element.startTime < earliest.startTime ? element : earliest,
					);
					const adjustedEarliestStartTime = enforceMainTrackStart({
						tracks: updatedTracks,
						targetTrackId: targetTrack.id,
						requestedStartTime: earliestElement.startTime,
					});
					const delta = adjustedEarliestStartTime - earliestElement.startTime;

					if (delta !== 0) {
						adjustedElements = elementsToAdd.map((element) => ({
							...element,
							startTime: Math.max(0, element.startTime + delta),
						}));
					}
				}

				updatedTracks[resolvedTargetIndex] = {
					...targetTrack,
					elements: [...targetTrack.elements, ...adjustedElements],
				} as TimelineTrack;
				for (const element of adjustedElements) {
					this.pastedElements.push({
						trackId: targetTrack.id,
						elementId: element.id,
					});
				}
				continue;
			}

			const insertIndex = resolveInsertIndexForNewTrack({
				tracks: updatedTracks,
				sourceTrackIndex,
				trackType,
			});
			const newTrack = buildTrackWithElements({
				trackType,
				elements: elementsToAdd,
				trackId: this.getPastedTrackId({ sourceTrackId: trackId }),
			});
			updatedTracks.splice(insertIndex, 0, newTrack);
			for (const element of elementsToAdd) {
				this.pastedElements.push({
					trackId: newTrack.id,
					elementId: element.id,
				});
			}
		}

		editor.timeline.updateTracks(updatedTracks);

		if (this.pastedElements.length > 0) {
			editor.selection.setSelectedElements({ elements: this.pastedElements });
		}
	}

	undo(): void {
		if (this.savedState) {
			const editor = EditorCore.getInstance();
			editor.timeline.updateTracks(this.savedState);
			editor.selection.setSelectedElements({ elements: this.previousSelection });
		}
	}

	getPastedElements(): { trackId: string; elementId: string }[] {
		return this.pastedElements;
	}

	private getPastedElementId(index: number): string {
		const existingId = this.pastedElementIds[index];
		if (existingId) {
			return existingId;
		}
		const nextId = generateUUID();
		this.pastedElementIds[index] = nextId;
		return nextId;
	}

	private getPastedTrackId({ sourceTrackId }: { sourceTrackId: string }): string {
		const existingId = this.pastedTrackIdsBySourceTrackId.get(sourceTrackId);
		if (existingId) {
			return existingId;
		}
		const nextId = generateUUID();
		this.pastedTrackIdsBySourceTrackId.set(sourceTrackId, nextId);
		return nextId;
	}
}

interface IndexedClipboardItem {
	index: number;
	item: ClipboardItem;
}

function groupClipboardItemsByTrackId({
	clipboardItems,
}: {
	clipboardItems: IndexedClipboardItem[];
}): Map<string, IndexedClipboardItem[]> {
	const groupedItems = new Map<string, IndexedClipboardItem[]>();

	for (const item of clipboardItems) {
		const existingItems = groupedItems.get(item.item.trackId) ?? [];
		groupedItems.set(item.item.trackId, [...existingItems, item]);
	}

	return groupedItems;
}

function buildPastedElements({
	items,
	minStart,
	time,
	resolveElementId,
}: {
	items: IndexedClipboardItem[];
	minStart: number;
	time: number;
	resolveElementId: (index: number) => string;
}): TimelineElement[] {
	const elementsToAdd: TimelineElement[] = [];

	for (const item of items) {
		const relativeOffset = item.item.element.startTime - minStart;
		const startTime = Math.max(0, time + relativeOffset);
		const newElementId = resolveElementId(item.index);

		elementsToAdd.push({
			...item.item.element,
			id: newElementId,
			startTime,
		} as TimelineElement);
	}

	return elementsToAdd;
}

function resolveTargetTrackIndex({
	tracks,
	sourceTrackIndex,
	trackType,
	elements,
}: {
	tracks: TimelineTrack[];
	sourceTrackIndex: number;
	trackType: ClipboardItem["trackType"];
	elements: TimelineElement[];
}): number {
	if (sourceTrackIndex >= 0) {
		const aboveIndex = sourceTrackIndex - 1;
		if (aboveIndex < 0) {
			return -1;
		}

		const aboveTrack = tracks[aboveIndex];
		if (aboveTrack.type !== trackType) {
			return -1;
		}

		const canPlaceOnAbove = canPlaceElementsOnTrack({
			track: aboveTrack,
			elements,
		});
		return canPlaceOnAbove ? aboveIndex : -1;
	}

	const highestCompatibleIndex = tracks.findIndex(
		(track) => track.type === trackType,
	);
	if (highestCompatibleIndex < 0) {
		return -1;
	}

	const highestCompatibleTrack = tracks[highestCompatibleIndex];
	const canPlaceOnHighest = canPlaceElementsOnTrack({
		track: highestCompatibleTrack,
		elements,
	});

	return canPlaceOnHighest ? highestCompatibleIndex : -1;
}

function resolveInsertIndexForNewTrack({
	tracks,
	sourceTrackIndex,
	trackType,
}: {
	tracks: TimelineTrack[];
	sourceTrackIndex: number;
	trackType: ClipboardItem["trackType"];
}): number {
	if (sourceTrackIndex >= 0) {
		return sourceTrackIndex;
	}

	const highestCompatibleIndex = tracks.findIndex(
		(track) => track.type === trackType,
	);
	if (highestCompatibleIndex >= 0) {
		return highestCompatibleIndex;
	}

	return getHighestInsertIndexForTrack({ tracks, trackType });
}

function canPlaceElementsOnTrack({
	track,
	elements,
}: {
	track: TimelineTrack;
	elements: TimelineElement[];
}): boolean {
	for (const element of elements) {
		const endTime = element.startTime + element.duration;
		const hasOverlap = wouldElementOverlap({
			elements: track.elements,
			startTime: element.startTime,
			endTime,
		});
		if (hasOverlap) {
			return false;
		}
	}

	return true;
}

function buildTrackWithElements({
	trackType,
	elements,
	trackId,
}: {
	trackType: ClipboardItem["trackType"];
	elements: TimelineElement[];
	trackId: string;
}): TimelineTrack {
	const newTrackBase = buildEmptyTrack({ id: trackId, type: trackType });
	return {
		...newTrackBase,
		elements,
	} as TimelineTrack;
}
