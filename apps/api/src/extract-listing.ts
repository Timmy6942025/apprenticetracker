import type { Page } from "playwright";
import type { RawListing } from "./parser.js";

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

export async function extractGovListingsFromPage(page: Page): Promise<RawListing[]> {
  return page.evaluate(() => {
    function text(el: Element | null): string | null {
      if (!el) return null;
      const t = el.textContent?.replace(/\s+/g, " ").trim();
      return t && t.length > 0 ? t : null;
    }

    const cards = Array.from(document.querySelectorAll("a[href*='/apprenticeship/']"));
    const unique = new Map<string, RawListing>();

    for (const anchor of cards) {
      const href = (anchor as HTMLAnchorElement).href;
      if (!href) continue;
      const container = anchor.closest("li, article, div") ?? anchor.parentElement;
      if (!container) continue;

      const title = text(anchor);
      if (!title) continue;

      const allText = container.textContent?.replace(/\s+/g, " ") ?? "";
      const chips = Array.from(
        container.querySelectorAll("[class*='search-result'], [class*='metadata'], .govuk-tag, dd, p")
      )
        .map((el) => text(el))
        .filter((v): v is string => Boolean(v));
      const postedMatch = allText.match(/Posted on\s+\d{1,2}\s+[A-Za-z]+\s+\d{4}/i);
      if (!postedMatch) continue;

      const closingMatch = allText.match(/Closing date\s+\d{1,2}\s+[A-Za-z]+\s+\d{4}/i);
      const salaryMatch = allText.match(/£[\d,]+(?:\s*(?:to|-|–)\s*£?[\d,]+)?/);

      const idMatch = href.match(/apprenticeship\/([^/?#]+)/i);
      const sourceListingId = idMatch ? idMatch[1] : href;
      const employer =
        chips.find((c) => /ltd|limited|llp|plc|academy|university|council/i.test(c)) ?? null;
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
          posted_text: postedMatch[0],
          posted_date_iso: null,
          closing_text: closingMatch ? closingMatch[0] : null,
          url: href,
          description_snippet: allText.slice(0, 400),
          salary_text: salaryMatch ? salaryMatch[0] : null
        });
      }
    }

    return Array.from(unique.values());
  });
}

export async function extractLinkedinListingsFromPage(page: Page): Promise<RawListing[]> {
  return page.evaluate(() => {
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
      document.querySelectorAll(
        "a.base-card__full-link, a[href*='/jobs/view/'], a.base-search-card__title-link"
      )
    ) as HTMLAnchorElement[];

    const unique = new Map<string, RawListing>();

    for (const anchor of anchors) {
      const href = anchor.getAttribute("href");
      if (!href) continue;

      const absoluteUrl = toAbsolute(href);
      const container =
        anchor.closest("li, article, .base-search-card, .base-card, .job-search-card") ?? anchor.parentElement;
      if (!container) continue;

      const title =
        text(container.querySelector("h3.base-search-card__title")) ??
        text(container.querySelector("h3")) ??
        text(anchor);
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
      const postedDateIso =
        (timeNode?.getAttribute("datetime") ?? "").match(/^\d{4}-\d{2}-\d{2}$/)?.[0] ?? null;

      const allText = container.textContent?.replace(/\s+/g, " ") ?? "";
      const salaryMatch = allText.match(/£[\d,]+(?:\s*(?:to|-|–)\s*£?[\d,]+)?/);

      const idMatch = absoluteUrl.match(/\/jobs\/view\/(\d+)/i);
      const sourceListingId = idMatch ? idMatch[1] : absoluteUrl;

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
          description_snippet: allText.slice(0, 400),
          salary_text: salaryMatch ? salaryMatch[0] : null
        });
      }
    }

    return Array.from(unique.values());
  });
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
