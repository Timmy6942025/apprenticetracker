import { describe, expect, it } from "vitest";
import { isWithinDays } from "./time.js";

describe("isWithinDays", () => {
  it("accepts fresh postings", () => {
    expect(isWithinDays("2099-01-01", 45)).toBe(true);
  });

  it("rejects old postings", () => {
    expect(isWithinDays("2000-01-01", 45)).toBe(false);
  });
});
