import { describe, expect, it } from "vitest";
import { parseLinkedinPostedToIso } from "./linkedin-date.js";

describe("parseLinkedinPostedToIso", () => {
  it("parses relative week text", () => {
    const iso = parseLinkedinPostedToIso("2 weeks ago", new Date("2026-03-01T12:00:00.000Z"));
    expect(iso).toBe("2026-02-15");
  });

  it("parses short d/w/mo forms", () => {
    const reference = new Date("2026-03-01T12:00:00.000Z");
    expect(parseLinkedinPostedToIso("3d", reference)).toBe("2026-02-26");
    expect(parseLinkedinPostedToIso("2w", reference)).toBe("2026-02-15");
    expect(parseLinkedinPostedToIso("1mo", reference)).toBe("2026-02-01");
  });

  it("parses today-like inputs", () => {
    const reference = new Date("2026-03-01T12:00:00.000Z");
    expect(parseLinkedinPostedToIso("Just now", reference)).toBe("2026-03-01");
  });

  it("parses 30+ day input", () => {
    const reference = new Date("2026-03-01T12:00:00.000Z");
    expect(parseLinkedinPostedToIso("30+ days", reference)).toBe("2026-01-30");
  });
});
