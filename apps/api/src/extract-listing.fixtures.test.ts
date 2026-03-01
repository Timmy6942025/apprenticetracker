import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import {
  extractGovListingDetailFromPage,
  extractGovListingsFromPage,
  extractLinkedinListingDetailFromPage,
  extractLinkedinListingsFromPage
} from "./extract-listing.js";
import type { RawListing } from "./parser.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

function fixturePath(name: string): string {
  return path.resolve(currentDir, "__fixtures__/extractors", name);
}

function fixture(name: string): string {
  return fs.readFileSync(fixturePath(name), "utf8");
}

describe("source extractor fixtures", () => {
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  let browserAvailable = false;

  beforeAll(async () => {
    try {
      browser = await chromium.launch({ headless: true });
      context = await browser.newContext();
      page = await context.newPage();
      browserAvailable = true;
    } catch {
      browserAvailable = false;
    }
  });

  beforeEach(async () => {
    if (!page) return;
    await page.goto("about:blank");
  });

  afterAll(async () => {
    if (context) await context.close();
    if (browser) await browser.close();
  });

  it("extracts gov list fixture", async () => {
    if (!browserAvailable || !page) return;
    await page.setContent(fixture("gov-list.html"), { waitUntil: "domcontentloaded" });

    const result = await extractGovListingsFromPage(page);
    expect(result.invalidCount).toBe(0);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]?.source_listing_id).toBe("abc123");
    expect(result.items[0]?.posted_text).toContain("Posted on");
    expect(result.items[0]?.closing_text).toContain("Closing date");
  });

  it("extracts gov detail fixture", async () => {
    if (!browserAvailable || !page) return;
    await page.setContent(fixture("gov-detail.html"), { waitUntil: "domcontentloaded" });

    const seed: RawListing = {
      source: "find_apprenticeship_gov_uk",
      source_listing_id: "abc123",
      title: "Software Apprentice",
      employer: null,
      location: null,
      posted_text: null,
      closing_text: null,
      posted_date_iso: null,
      url: "https://www.findapprenticeship.service.gov.uk/apprenticeship/abc123",
      description_snippet: null,
      salary_text: null
    };

    const result = await extractGovListingDetailFromPage(page, seed);
    expect(result.invalidCount).toBe(0);
    expect(result.item).not.toBeNull();
    expect(result.item?.title).toBe("Software Developer Apprentice");
    expect(result.item?.employer).toBe("Acme Ltd");
    expect(result.item?.location).toBe("Basildon (SS15 6TA)");
    expect(result.item?.salary_text).toContain("£22,000");
    expect(result.item?.description_snippet).toContain("build web APIs");
  });

  it("extracts linkedin list fixture", async () => {
    if (!browserAvailable || !page) return;
    await page.setContent(fixture("linkedin-list.html"), { waitUntil: "domcontentloaded" });

    const result = await extractLinkedinListingsFromPage(page);
    expect(result.invalidCount).toBe(0);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.source_listing_id).toBe("1234567890");
    expect(result.items[0]?.posted_date_iso).toBe("2026-02-22");
  });

  it("extracts linkedin detail fixture", async () => {
    if (!browserAvailable || !page) return;
    await page.setContent(fixture("linkedin-detail.html"), { waitUntil: "domcontentloaded" });

    const seed: RawListing = {
      source: "linkedin_jobs",
      source_listing_id: "1234567890",
      title: "Software Apprentice",
      employer: null,
      location: null,
      posted_text: null,
      closing_text: null,
      posted_date_iso: null,
      url: "https://www.linkedin.com/jobs/view/1234567890",
      description_snippet: null,
      salary_text: null
    };

    const result = await extractLinkedinListingDetailFromPage(page, seed);
    expect(result.invalidCount).toBe(0);
    expect(result.item).not.toBeNull();
    expect(result.item?.title).toBe("Software Engineer Apprentice");
    expect(result.item?.employer).toBe("Acme Ltd");
    expect(result.item?.location).toContain("London");
    expect(result.item?.posted_text).toBe("1 week ago");
    expect(result.item?.salary_text).toContain("£24,000");
  });
});
