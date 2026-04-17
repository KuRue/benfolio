export function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function formatLongDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function isSameCalendarDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function isSameCalendarYear(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear();
}

function isSameCalendarMonth(left: Date, right: Date) {
  return isSameCalendarYear(left, right) && left.getMonth() === right.getMonth();
}

function buildMonthFormatter(month: "long" | "short") {
  return new Intl.DateTimeFormat("en-US", {
    month,
  });
}

type DateRangeFormat = "long" | "short";

export function formatDateRange(
  start: Date,
  end?: Date | null,
  format: DateRangeFormat = "long",
) {
  const normalizedEnd =
    end && end.getTime() < start.getTime() ? start : end;

  if (!normalizedEnd || isSameCalendarDay(start, normalizedEnd)) {
    return format === "short" ? formatShortDate(start) : formatLongDate(start);
  }

  const monthFormatter = buildMonthFormatter(format === "short" ? "short" : "long");
  const startMonth = monthFormatter.format(start);
  const endMonth = monthFormatter.format(normalizedEnd);
  const startDay = start.getDate();
  const endDay = normalizedEnd.getDate();
  const startYear = start.getFullYear();

  if (isSameCalendarMonth(start, normalizedEnd)) {
    return `${startMonth} ${startDay}\u2013${endDay}, ${startYear}`;
  }

  if (isSameCalendarYear(start, normalizedEnd)) {
    return `${startMonth} ${startDay} \u2013 ${endMonth} ${endDay}, ${startYear}`;
  }

  return `${format === "short" ? formatShortDate(start) : formatLongDate(start)} \u2013 ${
    format === "short"
      ? formatShortDate(normalizedEnd)
      : formatLongDate(normalizedEnd)
  }`;
}

export function absoluteUrl(pathname: string) {
  const url = new URL(pathname, process.env.APP_URL ?? "http://localhost:3000");
  return url.toString();
}

export function getMonogram(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
