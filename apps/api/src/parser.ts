import crypto from "node:crypto";
import type { ApprenticeshipRecord, ApprenticeshipSource, Category } from "@apprentice/shared";
import { classifyCategories } from "./classifier.js";
import { parsePostedDateToIso } from "./date-parser.js";
import { parseLinkedinPostedToIso } from "./linkedin-date.js";

export interface RawListing {
  source: ApprenticeshipSource;
  source_listing_id: string;
  title: string;
  employer: string | null;
  location: string | null;
  posted_text: string | null;
  posted_date_iso?: string | null;
  closing_text: string | null;
  url: string;
  description_snippet: string | null;
  salary_text: string | null;
}

function normalizeMaybeDate(text: string | null): string | null {
  if (!text) return null;
  const parsed = parsePostedDateToIso(text.replace(/^Closing date\s*/i, ""));
  return parsed;
}

function hashListing(raw: RawListing, postedDate: string): string {
  const base = [raw.source, raw.title, raw.employer ?? "", raw.location ?? "", postedDate, raw.url].join("|");
  return crypto.createHash("sha256").update(base).digest("hex");
}

function uuidFromHash(hash: string): string {
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

export function rawToRecord(
  raw: RawListing,
  nowIso: string,
  allowedCategories?: readonly Category[]
): ApprenticeshipRecord | null {
  let postedDate = raw.posted_date_iso ?? null;
  if (!postedDate && raw.source === "find_apprenticeship_gov_uk" && raw.posted_text) {
    postedDate = parsePostedDateToIso(raw.posted_text);
  }
  if (!postedDate && raw.source === "linkedin_jobs") {
    postedDate = parseLinkedinPostedToIso(raw.posted_text);
  }
  if (!postedDate) return null;
  const categories = classifyCategories(raw.title, raw.description_snippet, allowedCategories);
  if (categories.length === 0) return null;

  const hash = hashListing(raw, postedDate);
  const id = uuidFromHash(hash);

  return {
    id,
    source: raw.source,
    source_listing_id: raw.source_listing_id,
    title: raw.title,
    employer: raw.employer,
    location: raw.location,
    posted_date: postedDate,
    closing_date: normalizeMaybeDate(raw.closing_text),
    url: raw.url,
    description_snippet: raw.description_snippet,
    categories,
    salary_text: raw.salary_text,
    listing_hash: hash,
    created_at: nowIso,
    updated_at: nowIso
  };
}
