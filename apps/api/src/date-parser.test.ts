import { describe, expect, it } from "vitest";
import { parsePostedDateToIso } from "./date-parser.js";

describe("parsePostedDateToIso", () => {
  it("parses expected gov format", () => {
    expect(parsePostedDateToIso("Posted on 12 February 2026")).toBe("2026-02-12");
  });

  it("returns null on invalid input", () => {
    expect(parsePostedDateToIso("yesterday")).toBeNull();
  });
});
