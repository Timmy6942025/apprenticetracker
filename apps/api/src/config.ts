import path from "node:path";
import { fileURLToPath } from "node:url";
import { TARGET_CATEGORIES, type Category } from "@apprentice/shared";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDir, "..", "..", "..");

const defaultLinkedinKeywords = [
  "software apprentice",
  "business apprentice",
  "data analyst apprentice"
];

function parseCsvEnv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isCategory(value: string): value is Category {
  return TARGET_CATEGORIES.includes(value as Category);
}

function parseTargetCategories(value: string | undefined): Category[] {
  const categories = parseCsvEnv(value).filter(isCategory);
  if (categories.length === 0) {
    return [...TARGET_CATEGORIES];
  }
  return Array.from(new Set(categories));
}

function buildLinkedinUrls(keywords: readonly string[], location: string): string[] {
  return keywords.map(
    (keyword) =>
      `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(keyword)}&location=${encodeURIComponent(location)}`
  );
}

const linkedinLocation = process.env.LINKEDIN_LOCATION ?? "England, United Kingdom";
const linkedinKeywords = parseCsvEnv(process.env.LINKEDIN_KEYWORDS);
const effectiveLinkedinKeywords = linkedinKeywords.length > 0 ? linkedinKeywords : defaultLinkedinKeywords;
const targetCategories = parseTargetCategories(process.env.TARGET_CATEGORIES);

export const config = {
  port: Number(process.env.PORT ?? 3001),
  host: process.env.HOST ?? "0.0.0.0",
  dbPath: process.env.DB_PATH ?? path.resolve(projectRoot, "data", "apprenticeships.db"),
  baseUrl: process.env.BASE_URL ?? "http://localhost:3001",
  govSourceStartUrl:
    process.env.SOURCE_START_URL ?? "https://www.findapprenticeship.service.gov.uk/apprenticeships",
  linkedinKeywords: effectiveLinkedinKeywords,
  linkedinSourceStartUrls: buildLinkedinUrls(effectiveLinkedinKeywords, linkedinLocation),
  targetCategories,
  crawlMaxPages: Number(process.env.CRAWL_MAX_PAGES ?? 20),
  crawlMaxRequests: Number(process.env.CRAWL_MAX_REQUESTS ?? 200),
  cutoffDays: Number(process.env.CUTOFF_DAYS ?? 45)
};
