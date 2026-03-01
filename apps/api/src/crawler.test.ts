import { describe, expect, it } from "vitest";
import { shouldQueueDetailRequest } from "./crawler.js";

describe("shouldQueueDetailRequest", () => {
  it("always queues gov detail pages", () => {
    expect(shouldQueueDetailRequest("find_apprenticeship_gov_uk", true)).toBe(true);
    expect(shouldQueueDetailRequest("find_apprenticeship_gov_uk", false)).toBe(true);
  });

  it("skips linkedin detail pages in list-only mode", () => {
    expect(shouldQueueDetailRequest("linkedin_jobs", true)).toBe(false);
  });

  it("queues linkedin detail pages when list-only is disabled", () => {
    expect(shouldQueueDetailRequest("linkedin_jobs", false)).toBe(true);
  });
});
