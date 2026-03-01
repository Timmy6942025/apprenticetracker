import type { ApprenticeshipRecord } from "@apprentice/shared";

function normalizePart(value: string | null): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mondayWeekBucket(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - mondayOffset);
  return date.toISOString().slice(0, 10);
}

export function buildCrossSourceDedupeKey(record: Pick<ApprenticeshipRecord, "title" | "employer" | "location" | "posted_date">): string {
  const title = normalizePart(record.title);
  const employer = normalizePart(record.employer);
  const location = normalizePart(record.location);
  const week = mondayWeekBucket(record.posted_date);
  return `${title}|${employer}|${location}|${week}`;
}
