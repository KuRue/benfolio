export type OrderablePhoto = {
  id: string;
  createdAt: Date;
  capturedAt: Date | null;
  takenAtOverride: Date | null;
  sortOrder: number;
};

export type EventDateRangePhoto = Pick<
  OrderablePhoto,
  "createdAt" | "capturedAt" | "takenAtOverride"
>;

export function getEffectiveTakenAt(photo: {
  capturedAt: Date | null;
  takenAtOverride: Date | null;
}) {
  return photo.takenAtOverride ?? photo.capturedAt ?? null;
}

export function getPhotoChronologyDate(photo: EventDateRangePhoto) {
  return getEffectiveTakenAt(photo) ?? photo.createdAt;
}

export function getEventDateRange(
  photos: EventDateRangePhoto[],
  fallbackDate: Date,
) {
  if (!photos.length) {
    return {
      eventDate: fallbackDate,
      eventEndDate: null,
    };
  }

  const chronologyDates = photos
    .map((photo) => getPhotoChronologyDate(photo))
    .sort((left, right) => left.getTime() - right.getTime());
  const eventDate = chronologyDates[0] ?? fallbackDate;
  const lastDate = chronologyDates.at(-1) ?? eventDate;
  const eventEndDate =
    lastDate.getTime() === eventDate.getTime() ? null : lastDate;

  return {
    eventDate,
    eventEndDate,
  };
}

export function getAutoSortedPhotoIds(photos: OrderablePhoto[]) {
  return [...photos]
    .sort((left, right) => {
      const leftTime = getPhotoChronologyDate(left).getTime();
      const rightTime = getPhotoChronologyDate(right).getTime();

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
