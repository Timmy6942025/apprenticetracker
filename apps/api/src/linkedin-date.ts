import { parsePostedDateToIso } from "./date-parser.js";

export function parseLinkedinPostedToIso(input: string | null, referenceDate: Date = new Date()): string | null {
  if (!input) return null;
  return parsePostedDateToIso(input, referenceDate);
}
