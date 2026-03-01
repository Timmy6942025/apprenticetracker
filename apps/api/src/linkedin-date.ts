export function parseLinkedinPostedToIso(input: string | null): string | null {
  if (!input) return null;

  const cleaned = input
    .toLowerCase()
    .replace(/reposted\s*/i, "")
    .replace(/\+/g, "")
    .trim();

  if (!cleaned) return null;

  if (cleaned.includes("today") || cleaned.includes("just now") || cleaned.includes("minute") || cleaned.includes("hour")) {
    return new Date().toISOString().slice(0, 10);
  }

  const shortMatch = cleaned.match(/^(\d+)\s*(d|w|mo)\b/);
  if (shortMatch) {
    const amount = Number(shortMatch[1]);
    const unit = shortMatch[2];
    if (!Number.isFinite(amount)) return null;
    const date = new Date();
    if (unit === "d") date.setDate(date.getDate() - amount);
    if (unit === "w") date.setDate(date.getDate() - amount * 7);
    if (unit === "mo") date.setMonth(date.getMonth() - amount);
    return date.toISOString().slice(0, 10);
  }

  const agoMatch = cleaned.match(/(\d+)\s*(day|week|month)s?\s+ago/);
  if (agoMatch) {
    const amount = Number(agoMatch[1]);
    const unit = agoMatch[2];
    if (!Number.isFinite(amount)) return null;
    const date = new Date();
    if (unit === "day") date.setDate(date.getDate() - amount);
    if (unit === "week") date.setDate(date.getDate() - amount * 7);
    if (unit === "month") date.setMonth(date.getMonth() - amount);
    return date.toISOString().slice(0, 10);
  }

  const isoMatch = cleaned.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (isoMatch) return isoMatch[1];

  return null;
}
