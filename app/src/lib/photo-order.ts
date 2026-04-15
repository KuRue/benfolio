export type OrderablePhoto = {
  id: string;
  createdAt: Date;
  capturedAt: Date | null;
  takenAtOverride: Date | null;
  sortOrder: number;
};

export function getEffectiveTakenAt(photo: {
  capturedAt: Date | null;
  takenAtOverride: Date | null;
}) {
  return photo.takenAtOverride ?? photo.capturedAt ?? null;
}

export function getAutoSortedPhotoIds(photos: OrderablePhoto[]) {
  return [...photos]
    .sort((left, right) => {
      const leftTime =
        getEffectiveTakenAt(left)?.getTime() ?? left.createdAt.getTime();
      const rightTime =
        getEffectiveTakenAt(right)?.getTime() ?? right.createdAt.getTime();

      if (leftTime !== rightTime) {
        return leftTime - rightTime;
      }

      const createdDelta = left.createdAt.getTime() - right.createdAt.getTime();

      if (createdDelta !== 0) {
        return createdDelta;
      }

      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }

      return left.id.localeCompare(right.id);
    })
    .map((photo) => photo.id);
}
