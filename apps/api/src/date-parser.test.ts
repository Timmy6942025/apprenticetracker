import { describe, expect, it } from "vitest";
import { parsePostedDateToIso } from "./date-parser.js";

describe("parsePostedDateToIso", () => {
  it("parses expected gov format", () => {
    expect(parsePostedDateToIso("Posted on 12 February 2026")).toBe("2026-02-12");
  });

  it("parses relative text with plus sign", () => {
    const reference = new Date("2026-03-01T12:00:00.000Z");
    expect(parsePostedDateToIso("30+ days ago", reference)).toBe("2026-01-30");
  });

  it("parses short unit forms", () => {
    const reference = new Date("2026-03-01T12:00:00.000Z");
    expect(parsePostedDateToIso("2w", reference)).toBe("2026-02-15");
  });

  it("returns null on invalid input", () => {
    expect(parsePostedDateToIso("sometime soon")).toBeNull();
  });
});
