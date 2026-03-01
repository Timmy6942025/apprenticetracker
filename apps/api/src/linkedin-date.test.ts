import { describe, expect, it } from "vitest";
import { parseLinkedinPostedToIso } from "./linkedin-date.js";

describe("parseLinkedinPostedToIso", () => {
  it("parses relative week text", () => {
    const iso = parseLinkedinPostedToIso("2 weeks ago");
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("parses short d/w/mo forms", () => {
    expect(parseLinkedinPostedToIso("3d")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(parseLinkedinPostedToIso("2w")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(parseLinkedinPostedToIso("1mo")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("parses today-like inputs", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(parseLinkedinPostedToIso("Just now")).toBe(today);
  });
});
