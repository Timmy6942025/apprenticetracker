import { describe, expect, it } from "vitest";
import { TARGET_CATEGORIES } from "./constants.js";

describe("shared constants", () => {
  it("has the three target categories", () => {
    expect(TARGET_CATEGORIES).toEqual([
      "tech",
      "business",
      "data_analyst"
    ]);
  });
});
