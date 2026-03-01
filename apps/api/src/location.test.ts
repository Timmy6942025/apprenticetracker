import { describe, expect, it } from "vitest";
import { isLikelyEnglandLocation } from "./location.js";

describe("isLikelyEnglandLocation", () => {
  it("allows english locations", () => {
    expect(isLikelyEnglandLocation("London")).toBe(true);
  });

  it("filters non-england locations", () => {
    expect(isLikelyEnglandLocation("Cardiff, Wales")).toBe(false);
    expect(isLikelyEnglandLocation("Glasgow, Scotland")).toBe(false);
  });
});
