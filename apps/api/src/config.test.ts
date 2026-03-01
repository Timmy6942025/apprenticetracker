import { describe, expect, it } from "vitest";
import { config } from "./config.js";

describe("config defaults", () => {
  it("uses conservative crawl defaults", () => {
    expect(config.crawlMaxRequests).toBe(80);
    expect(config.crawlMaxConcurrency).toBe(1);
    expect(config.crawlMaxRetries).toBe(0);
    expect(config.crawlJitterMinMs).toBe(1500);
    expect(config.crawlJitterMaxMs).toBe(5000);
  });

  it("enables linkedin list-only mode by default", () => {
    expect(config.linkedinListOnly).toBe(true);
  });
});
