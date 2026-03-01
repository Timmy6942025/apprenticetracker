import { describe, expect, it } from "vitest";
import { classifyCategories } from "./classifier.js";

describe("classifyCategories", () => {
  it("detects data analyst category", () => {
    const categories = classifyCategories("Data Analyst Apprentice", "SQL reporting and BI dashboards");
    expect(categories).toContain("data_analyst");
  });

  it("can match multiple categories", () => {
    const categories = classifyCategories("Business Data Analyst Apprentice", "data analysis and operations");
    expect(categories).toEqual(expect.arrayContaining(["business", "data_analyst"]));
  });
});
