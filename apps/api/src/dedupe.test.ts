import { describe, expect, it } from "vitest";
import { buildCrossSourceDedupeKey } from "./dedupe.js";

describe("buildCrossSourceDedupeKey", () => {
  it("normalizes text and buckets by posted week", () => {
    const keyA = buildCrossSourceDedupeKey({
      title: "Software Engineer Apprentice",
      employer: "Acme Ltd.",
      location: "London, England",
      posted_date: "2026-02-18"
    });

    const keyB = buildCrossSourceDedupeKey({
      title: "software engineer apprentice",
      employer: "ACME LTD",
      location: "London England",
      posted_date: "2026-02-17"
    });

    expect(keyA).toBe(keyB);
  });
});
