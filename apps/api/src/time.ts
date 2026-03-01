const londonDateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

export function londonIsoDate(input: Date | string): string {
  const date = typeof input === "string" ? new Date(input) : input;
  const parts = londonDateFormatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  if (!year || !month || !day) {
    return new Date(date).toISOString().slice(0, 10);
  }
  return `${year}-${month}-${day}`;
}

export function londonDateFrom(input: Date | string): Date {
  const londonDate = londonIsoDate(input);
  return new Date(`${londonDate}T00:00:00.000Z`);
}

export function cutoffDateIso(days: number): string {
  const nowLondon = londonDateFrom(new Date());
  nowLondon.setUTCDate(nowLondon.getUTCDate() - days);
  return nowLondon.toISOString().slice(0, 10);
}

export function isWithinDays(postedDateIso: string, days: number): boolean {
  const cutoff = cutoffDateIso(days);
  return postedDateIso >= cutoff;
}
