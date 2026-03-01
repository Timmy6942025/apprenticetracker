const monthMap: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11
};

export function parsePostedDateToIso(text: string): string | null {
  const normalized = text.replace(/Posted on\s*/i, "").trim();
  const match = normalized.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = monthMap[match[2].toLowerCase()];
  const year = Number(match[3]);
  if (Number.isNaN(day) || Number.isNaN(month) || Number.isNaN(year)) return null;
  const date = new Date(Date.UTC(year, month, day));
  return date.toISOString().slice(0, 10);
}
