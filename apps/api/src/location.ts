const nonEnglandTerms = [/scotland/i, /wales/i, /northern ireland/i, /ireland\b/i];

export function isLikelyEnglandLocation(location: string | null): boolean {
  if (!location) return true;
  return !nonEnglandTerms.some((term) => term.test(location));
}
