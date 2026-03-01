import { z } from "zod";
import type { Page } from "playwright";
import type { RawListing } from "./parser.js";

const sourceSchema = z.enum(["find_apprenticeship_gov_uk", "linkedin_jobs"]);

const rawListingSchema = z.object({
  source: sourceSchema,
  source_listing_id: z.string().min(1),
  title: z.string().min(1),
  employer: z.string().nullable(),
  location: z.string().nullable(),
  posted_text: z.string().nullable(),
  posted_date_iso: z.string().nullable().optional(),
  closing_text: z.string().nullable(),
  url: z.string().min(1),
  description_snippet: z.string().nullable(),
  salary_text: z.string().nullable()
});

const govListingSchema = rawListingSchema.extend({
  source: z.literal("find_apprenticeship_gov_uk")
});

const linkedinListingSchema = rawListingSchema.extend({
  source: z.literal("linkedin_jobs")
});

export interface ListingExtractionResult {
  items: RawListing[];
  invalidCount: number;
}

export interface DetailExtractionResult {
  item: RawListing | null;
  invalidCount: number;
}

function normalizeText(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length ? trimmed : null;
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url;
  }
}

function extractIdFromUrl(url: string): string {
  const apprenticeshipMatch = url.match(/apprenticeship\/([^/?#]+)/i);
  if (apprenticeshipMatch) return apprenticeshipMatch[1];

  const linkedinMatch = url.match(/\/jobs\/view\/(\d+)/i);
  if (linkedinMatch) return linkedinMatch[1];

  return url;
}

function validateMany(candidates: unknown[], source: RawListing["source"]): ListingExtractionResult {
  let invalidCount = 0;
  const schema = source === "linkedin_jobs" ? linkedinListingSchema : govListingSchema;

  const items = candidates
    .map((candidate) => {
      const normalized = normalizeListing(toLooseRawListing(candidate, source));
      const result = schema.safeParse(normalized);
      if (!result.success) {
        invalidCount += 1;
        return null;
      }
      return result.data;
    })
    .filter((item): item is RawListing => item !== null);

  return { items, invalidCount };
}

function validateOne(candidate: unknown, source: RawListing["source"]): DetailExtractionResult {
  const schema = source === "linkedin_jobs" ? linkedinListingSchema : govListingSchema;
  const normalized = normalizeListing(toLooseRawListing(candidate, source));
  const result = schema.safeParse(normalized);
  if (!result.success) return { item: null, invalidCount: 1 };
  return { item: result.data, invalidCount: 0 };
}

function toLooseRawListing(candidate: unknown, fallbackSource: RawListing["source"]): RawListing {
  const value = typeof candidate === "object" && candidate !== null ? (candidate as Record<string, unknown>) : {};
  const source =
    value.source === "find_apprenticeship_gov_uk" || value.source === "linkedin_jobs"
      ? value.source
      : fallbackSource;
  const url = typeof value.url === "string" ? value.url : "";
  return {
    source,
    source_listing_id: typeof value.source_listing_id === "string" ? value.source_listing_id : "",
    title: typeof value.title === "string" ? value.title : "",
    employer: typeof value.employer === "string" ? value.employer : null,
    location: typeof value.location === "string" ? value.location : null,
    posted_text: typeof value.posted_text === "string" ? value.posted_text : null,
    posted_date_iso: typeof value.posted_date_iso === "string" ? value.posted_date_iso : null,
    closing_text: typeof value.closing_text === "string" ? value.closing_text : null,
    url,
    description_snippet: typeof value.description_snippet === "string" ? value.description_snippet : null,
    salary_text: typeof value.salary_text === "string" ? value.salary_text : null
  };
}

export async function extractGovListingsFromPage(page: Page): Promise<ListingExtractionResult> {
  const candidates = await page.evaluate(() => {
    function text(el: Element | null): string | null {
      if (!el) return null;
      const t = el.textContent?.replace(/\s+/g, " ").trim();
      return t && t.length > 0 ? t : null;
    }

    const cards = Array.from(document.querySelectorAll("a[href*='/apprenticeship/']"));
    const unique = new Map<string, unknown>();

    for (const anchor of cards) {
      const href = (anchor as HTMLAnchorElement).href;
      if (!href) continue;
      const container = anchor.closest("li, article, div") ?? anchor.parentElement;
      if (!container) continue;

      const title = text(anchor);
      if (!title) continue;

      const allText = container.textContent?.replace(/\s+/g, " ") ?? "";
      const chips = Array.from(container.querySelectorAll("[class*='metadata'], .govuk-tag, dd, p"))
        .map((el) => text(el))
        .filter((v): v is string => Boolean(v));

      const postedMatch =
        allText.match(/Posted on\s+\d{1,2}\s+[A-Za-z]+\s+\d{4}/i) ??
        allText.match(/\d+\+?\s*(?:day|week|month)s?\s*ago/i);
      const closingMatch = allText.match(/Closing date\s+\d{1,2}\s+[A-Za-z]+\s+\d{4}/i);
      const salaryMatch = allText.match(/£[\d,]+(?:\s*(?:to|-|–)\s*£?[\d,]+)?/);

      const sourceListingId = href.match(/apprenticeship\/([^/?#]+)/i)?.[1] ?? href;
      const employer = chips.find((c) => /ltd|limited|llp|plc|academy|university|council/i.test(c)) ?? null;
      const location =
        chips.find((c) =>
          /(london|manchester|birmingham|leeds|bristol|sheffield|newcastle|nottingham|liverpool|england|remote|hybrid)/i.test(
            c
          )
        ) ?? null;

      if (!unique.has(sourceListingId)) {
        unique.set(sourceListingId, {
          source: "find_apprenticeship_gov_uk",
          source_listing_id: sourceListingId,
          title,
          employer,
          location,
          posted_text: postedMatch ? postedMatch[0] : null,
          posted_date_iso: null,
          closing_text: closingMatch ? closingMatch[0] : null,
          url: href,
          description_snippet: allText.slice(0, 600),
          salary_text: salaryMatch ? salaryMatch[0] : null
        });
      }
    }

    return Array.from(unique.values());
  });

  return validateMany(candidates, "find_apprenticeship_gov_uk");
}

export async function extractLinkedinListingsFromPage(page: Page): Promise<ListingExtractionResult> {
  const candidates = await page.evaluate(() => {
    function text(el: Element | null): string | null {
      if (!el) return null;
      const t = el.textContent?.replace(/\s+/g, " ").trim();
      return t && t.length > 0 ? t : null;
    }

    function toAbsolute(url: string): string {
      try {
        return new URL(url, window.location.origin).toString();
      } catch {
        return url;
      }
    }

    const anchors = Array.from(
      document.querySelectorAll("a.base-card__full-link, a[href*='/jobs/view/'], a.base-search-card__title-link")
    ) as HTMLAnchorElement[];

    const unique = new Map<string, unknown>();

    for (const anchor of anchors) {
      const href = anchor.getAttribute("href");
      if (!href) continue;

      const absoluteUrl = toAbsolute(href);
      const container =
        anchor.closest("li, article, .base-search-card, .base-card, .job-search-card") ?? anchor.parentElement;
      if (!container) continue;

      const title =
        text(container.querySelector("h3.base-search-card__title")) ?? text(container.querySelector("h3")) ?? text(anchor);
      if (!title) continue;

      const employer =
        text(container.querySelector("h4.base-search-card__subtitle")) ??
        text(container.querySelector("a.hidden-nested-link")) ??
        null;

      const location =
        text(container.querySelector(".job-search-card__location")) ??
        text(container.querySelector("span[class*='location']")) ??
        null;

      const timeNode = container.querySelector("time");
      const postedText = text(timeNode) ?? null;
      const postedDateIso = (timeNode?.getAttribute("datetime") ?? "").match(/^\d{4}-\d{2}-\d{2}$/)?.[0] ?? null;

      const allText = container.textContent?.replace(/\s+/g, " ") ?? "";
      const salaryMatch = allText.match(/£[\d,]+(?:\s*(?:to|-|–)\s*£?[\d,]+)?/);

      const sourceListingId = absoluteUrl.match(/\/jobs\/view\/(\d+)/i)?.[1] ?? absoluteUrl;

      if (!unique.has(sourceListingId)) {
        unique.set(sourceListingId, {
          source: "linkedin_jobs",
          source_listing_id: sourceListingId,
          title,
          employer,
          location,
          posted_text: postedText,
          posted_date_iso: postedDateIso,
          closing_text: null,
          url: absoluteUrl,
          description_snippet: allText.slice(0, 600),
          salary_text: salaryMatch ? salaryMatch[0] : null
        });
      }
    }

    return Array.from(unique.values());
  });

  return validateMany(candidates, "linkedin_jobs");
}

export async function extractGovListingDetailFromPage(page: Page, seed: RawListing): Promise<DetailExtractionResult> {
  const details = await page.evaluate(() => {
    function text(el: Element | null): string | null {
      if (!el) return null;
      const t = el.textContent?.replace(/\s+/g, " ").trim();
      return t && t.length > 0 ? t : null;
    }

    function valueFromLabel(labels: string[]): string | null {
      const norms = labels.map((l) => l.toLowerCase());
      const keys = Array.from(document.querySelectorAll("dt, th"));
      for (const key of keys) {
        const keyText = text(key)?.toLowerCase();
        if (!keyText) continue;
        if (!norms.some((label) => keyText.includes(label))) continue;
        const sibling = key.nextElementSibling;
        const value = text(sibling);
        if (value) return value;
      }
      return null;
    }

    function textAfterHeading(heading: string): string | null {
      const headings = Array.from(document.querySelectorAll("h2, h3, h4"));
      const match = headings.find(
        (el) => text(el)?.toLowerCase().replace(/\s+/g, " ").trim() === heading.toLowerCase()
      );
      if (!match) return null;

      let current: Element | null = match.nextElementSibling;
      while (current) {
        const tag = current.tagName.toLowerCase();
        if (/^h[1-6]$/.test(tag)) break;
        const value = text(current);
        if (value) return value;
        current = current.nextElementSibling;
      }
      return null;
    }

    const bodyText = document.body.textContent?.replace(/\s+/g, " ") ?? "";
    const postedText =
      bodyText.match(/Posted on\s+\d{1,2}\s+[A-Za-z]+\s+\d{4}/i)?.[0] ??
      bodyText.match(/\d+\+?\s*(?:day|week|month)s?\s*ago/i)?.[0] ??
      null;

    const closingText =
      bodyText.match(/Closing date\s+\d{1,2}\s+[A-Za-z]+\s+\d{4}/i)?.[0] ??
      bodyText.match(/(?:applications? close|apply by)\s+\d{1,2}\s+[A-Za-z]+\s+\d{4}/i)?.[0] ??
      null;

    const description =
      text(document.querySelector("#about-apprenticeship")) ??
      text(document.querySelector("main article")) ??
      text(document.querySelector("main")) ??
      null;

    const salaryFromLabel = valueFromLabel(["wage", "salary", "pay"]);
    const salaryFromBody = bodyText.match(/£[\d,]+(?:\s*(?:to|-|–)\s*£?[\d,]+)?/)?.[0] ?? null;

    return {
      title: text(document.querySelector("h1")) ?? text(document.querySelector(".govuk-heading-xl")) ?? null,
      employer:
        text(document.querySelector(".faa-vacancy__organisation [itemprop='hiringOrganization']")) ??
        text(document.querySelector(".faa-vacancy__organisation")) ??
        valueFromLabel(["employer"]) ??
        text(document.querySelector("a[href*='/employer/']")) ??
        null,
      location:
        text(document.querySelector(".faa-vacancy__location [itemprop='jobLocation']")) ??
        text(document.querySelector(".faa-vacancy__location")) ??
        textAfterHeading("where you'll work") ??
        valueFromLabel(["location", "address"]) ??
        null,
      posted_text: postedText,
      closing_text: closingText,
      description_snippet: description,
      salary_text: salaryFromLabel ?? salaryFromBody
    };
  });

  const merged = normalizeListing({
    ...seed,
    title: details.title ?? seed.title,
    employer: details.employer ?? seed.employer,
    location: details.location ?? seed.location,
    posted_text: details.posted_text ?? seed.posted_text,
    closing_text: details.closing_text ?? seed.closing_text,
    description_snippet: details.description_snippet ?? seed.description_snippet,
    salary_text: details.salary_text ?? seed.salary_text
  });

  return validateOne(merged, "find_apprenticeship_gov_uk");
}

export async function extractLinkedinListingDetailFromPage(page: Page, seed: RawListing): Promise<DetailExtractionResult> {
  const details = await page.evaluate(() => {
    function text(el: Element | null): string | null {
      if (!el) return null;
      const t = el.textContent?.replace(/\s+/g, " ").trim();
      return t && t.length > 0 ? t : null;
    }

    const bodyText = document.body.textContent?.replace(/\s+/g, " ") ?? "";
    const salaryText =
      bodyText.match(/£[\d,]+(?:\s*(?:to|-|–)\s*£?[\d,]+)?(?:\s*(?:a year|per year|yearly))?/i)?.[0] ?? null;

    const postedFromText =
      text(document.querySelector("span.posted-time-ago__text")) ??
      text(document.querySelector("span[class*='posted-time-ago']")) ??
      text(document.querySelector("time")) ??
      null;

    const postedIso = (document.querySelector("time")?.getAttribute("datetime") ?? "").match(/^\d{4}-\d{2}-\d{2}$/)?.[0] ?? null;

    const description =
      text(document.querySelector(".show-more-less-html__markup")) ??
      text(document.querySelector(".description__text")) ??
      text(document.querySelector("main")) ??
      null;

    return {
      title:
        text(document.querySelector("h1.top-card-layout__title")) ??
        text(document.querySelector("h1.topcard__title")) ??
        text(document.querySelector("h1")) ??
        null,
      employer:
        text(document.querySelector("a.topcard__org-name-link")) ??
        text(document.querySelector("span.topcard__flavor")) ??
        null,
      location:
        text(document.querySelector("span.topcard__flavor--bullet")) ??
        text(document.querySelector("span[class*='location']")) ??
        null,
      posted_text: postedFromText,
      posted_date_iso: postedIso,
      description_snippet: description,
      salary_text: salaryText
    };
  });

  const merged = normalizeListing({
    ...seed,
    title: details.title ?? seed.title,
    employer: details.employer ?? seed.employer,
    location: details.location ?? seed.location,
    posted_text: details.posted_text ?? seed.posted_text,
    posted_date_iso: details.posted_date_iso ?? seed.posted_date_iso,
    description_snippet: details.description_snippet ?? seed.description_snippet,
    salary_text: details.salary_text ?? seed.salary_text
  });

  return validateOne(merged, "linkedin_jobs");
}

export function normalizeListing(record: RawListing): RawListing {
  return {
    ...record,
    source_listing_id: extractIdFromUrl(record.url),
    title: normalizeText(record.title) ?? "Untitled apprenticeship",
    employer: normalizeText(record.employer),
    location: normalizeText(record.location),
    posted_text: normalizeText(record.posted_text),
    posted_date_iso: normalizeText(record.posted_date_iso ?? null),
    closing_text: normalizeText(record.closing_text),
    url: normalizeUrl(record.url),
    description_snippet: normalizeText(record.description_snippet),
    salary_text: normalizeText(record.salary_text)
  };
}
