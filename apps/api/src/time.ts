const londonDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

export function londonDateFrom(input: Date | string): Date {
  const date = typeof input === "string" ? new Date(input) : input;
  const londonDate = londonDateFormatter.format(date);
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
