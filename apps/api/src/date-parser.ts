import { londonDateFrom, londonIsoDate } from "./time.js";

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

function cleanDateText(input: string): string {
  return input
    .replace(/\u00a0/g, " ")
    .replace(/reposted\s*/gi, "")
    .replace(/(?:posted|closing date|application deadline|applications? close|apply by)\s*(?:on)?\s*/gi, "")
    .replace(/[,:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function shiftLondonDate(base: Date, amount: number, unit: "day" | "week" | "month"): string {
  const date = londonDateFrom(base);
  if (unit === "day") date.setUTCDate(date.getUTCDate() - amount);
  if (unit === "week") date.setUTCDate(date.getUTCDate() - amount * 7);
  if (unit === "month") date.setUTCMonth(date.getUTCMonth() - amount);
  return londonIsoDate(date);
}

function parseRelativeToIso(text: string, referenceDate: Date): string | null {
  const normalized = text.toLowerCase().replace(/\+/g, "").trim();

  if (
    normalized.includes("today") ||
    normalized.includes("just now") ||
    normalized.includes("minute") ||
    normalized.includes("hour")
  ) {
    return londonIsoDate(referenceDate);
  }

  if (normalized.includes("yesterday")) {
    return shiftLondonDate(referenceDate, 1, "day");
  }

  const shortMatch = normalized.match(/^(\d+)\s*(d|w|mo)\b/);
  if (shortMatch) {
    const amount = Number(shortMatch[1]);
    const unit = shortMatch[2];
    if (!Number.isFinite(amount)) return null;
    if (unit === "d") return shiftLondonDate(referenceDate, amount, "day");
    if (unit === "w") return shiftLondonDate(referenceDate, amount, "week");
    return shiftLondonDate(referenceDate, amount, "month");
  }

  const agoMatch = normalized.match(/(\d+)\+?\s*(day|week|month)s?\s*(?:ago)?$/);
  if (agoMatch) {
    const amount = Number(agoMatch[1]);
    const unit = agoMatch[2] as "day" | "week" | "month";
    if (!Number.isFinite(amount)) return null;
    return shiftLondonDate(referenceDate, amount, unit);
  }

  return null;
}

function parseAbsoluteToIso(text: string): string | null {
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const match = text.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = monthMap[match[2].toLowerCase()];
  const year = Number(match[3]);
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
  const utc = new Date(Date.UTC(year, month, day));
  return londonIsoDate(utc);
}

export function parsePostedDateToIso(text: string, referenceDate: Date = new Date()): string | null {
  const normalized = cleanDateText(text);
  if (!normalized) return null;

  return parseAbsoluteToIso(normalized) ?? parseRelativeToIso(normalized, referenceDate);
}
