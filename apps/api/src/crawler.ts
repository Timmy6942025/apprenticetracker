import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PlaywrightCrawler, RequestQueue } from "crawlee";
import type { ApprenticeshipSource, CrawlRun } from "@apprentice/shared";
import { config } from "./config.js";
import { AppDb } from "./db.js";
import {
  normalizeListing,
  extractGovListingsFromPage,
  extractLinkedinListingsFromPage,
  extractGovListingDetailFromPage,
  extractLinkedinListingDetailFromPage
} from "./extract-listing.js";
import type { RawListing } from "./parser.js";
import { rawToRecordWithReason } from "./parser.js";
import { isLikelyEnglandLocation } from "./location.js";
import { isWithinDays } from "./time.js";
import { buildCrossSourceDedupeKey } from "./dedupe.js";

type RequestKind = "list" | "detail";

interface CrawlRequestData {
  source: ApprenticeshipSource;
  kind: RequestKind;
  seed?: RawListing;
}

export function shouldQueueDetailRequest(
  source: ApprenticeshipSource,
  linkedinListOnly = config.linkedinListOnly
): boolean {
  if (source === "linkedin_jobs" && linkedinListOnly) return false;
  return true;
}

function makeRunId(): string {
  return crypto.randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

function sanitizeSnapshotPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/-+/g, "-").slice(0, 80);
}

function errorMessageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isBlocked429(error: unknown): boolean {
  return /429|request blocked/i.test(errorMessageFrom(error));
}

async function writeFailureSnapshot(
  page: import("playwright").Page,
  source: ApprenticeshipSource,
  seedId: string,
  reason: string
): Promise<string | null> {
  try {
    const html = await page.content();
    fs.mkdirSync(config.snapshotDir, { recursive: true });
    const file = `${Date.now()}-${sanitizeSnapshotPart(source)}-${sanitizeSnapshotPart(seedId)}-${sanitizeSnapshotPart(
      reason
    )}.html`;
    const outPath = path.resolve(config.snapshotDir, file);
    fs.writeFileSync(outPath, html, "utf8");
    return outPath;
  } catch {
    return null;
  }
}

function randomInt(min: number, max: number): number {
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  return Math.floor(Math.random() * (high - low + 1)) + low;
}

async function applyDelay(page: import("playwright").Page, retryCount: number): Promise<void> {
  const jitterMs = randomInt(config.crawlJitterMinMs, config.crawlJitterMaxMs);
  const backoffBase = 350;
  const backoffMs = retryCount > 0 ? Math.min(6000, backoffBase * 2 ** retryCount + randomInt(100, 800)) : 0;
  await page.waitForTimeout(jitterMs + backoffMs);
}

async function enqueueNextPage(
  queue: RequestQueue,
  page: import("playwright").Page,
  source: ApprenticeshipSource
): Promise<boolean> {
  const nextHref = await page.evaluate(() => {
    const next =
      (document.querySelector("a[rel='next']") as HTMLAnchorElement | null) ??
      (Array.from(document.querySelectorAll("a")).find((a) => /next/i.test(a.textContent ?? "")) as
        | HTMLAnchorElement
        | undefined);
    return next?.href ?? null;
  });

  if (!nextHref) return false;
  await queue.addRequest({
    url: nextHref,
    uniqueKey: `${source}:list:${nextHref}`,
    userData: { source, kind: "list" satisfies RequestKind }
  });
  return true;
}

export async function runCrawl(db: AppDb): Promise<CrawlRun> {
  const run: CrawlRun = {
    id: makeRunId(),
    started_at: nowIso(),
    finished_at: null,
    status: "running",
    pages_crawled: 0,
    records_seen: 0,
    records_accepted: 0,
    records_inserted: 0,
    records_updated: 0,
    records_rejected_category: 0,
    records_rejected_date: 0,
    records_rejected_location: 0,
    records_rejected_schema: 0,
    records_deduped: 0,
    records_filtered_old: 0,
    errors_count: 0,
    error_message: null
  };

  db.startRun(run);

  try {
    const queue = await RequestQueue.open(`crawl-${run.id}`);
    await queue.addRequest({
      url: config.govSourceStartUrl,
      uniqueKey: `gov:list:${config.govSourceStartUrl}`,
      userData: { source: "find_apprenticeship_gov_uk" satisfies ApprenticeshipSource, kind: "list" satisfies RequestKind }
    });

    for (const linkedinUrl of config.linkedinSourceStartUrls) {
      await queue.addRequest({
        url: linkedinUrl,
        uniqueKey: `linkedin:list:${linkedinUrl}`,
        userData: { source: "linkedin_jobs" satisfies ApprenticeshipSource, kind: "list" satisfies RequestKind }
      });
    }

    let listPagesCrawled = 0;
    const seenDedupeKeys = new Set<string>();

    const ingestNormalizedListing = (normalized: RawListing): void => {
      const parsed = rawToRecordWithReason(normalized, nowIso(), config.targetCategories);

      if (!parsed.record) {
        if (parsed.reason === "rejected_category") run.records_rejected_category += 1;
        if (parsed.reason === "missing_posted_date") run.records_rejected_date += 1;
        return;
      }

      const record = parsed.record;
      if (!isLikelyEnglandLocation(record.location)) {
        run.records_rejected_location += 1;
        return;
      }
      if (!isWithinDays(record.posted_date, config.cutoffDays)) {
        run.records_filtered_old += 1;
        run.records_rejected_date += 1;
        return;
      }

      const dedupeKey = buildCrossSourceDedupeKey(record);
      if (seenDedupeKeys.has(dedupeKey)) {
        run.records_deduped += 1;
        return;
      }
      seenDedupeKeys.add(dedupeKey);

      const outcome = db.upsertApprenticeship(record);
      if (outcome === "deduped") {
        run.records_deduped += 1;
      } else {
        run.records_accepted += 1;
        if (outcome === "inserted") run.records_inserted += 1;
        if (outcome === "updated") run.records_updated += 1;
      }
    };

    const crawler = new PlaywrightCrawler({
      requestQueue: queue,
      maxRequestsPerCrawl: config.crawlMaxRequests,
      maxConcurrency: config.crawlMaxConcurrency,
      maxRequestRetries: config.crawlMaxRetries,
      requestHandlerTimeoutSecs: 120,
      launchContext: {
        launchOptions: {
          headless: true
        }
      },
      async requestHandler({ page, request, log }) {
        run.pages_crawled += 1;

        const data = (request.userData ?? {}) as Partial<CrawlRequestData>;
        const source = data.source ?? "find_apprenticeship_gov_uk";
        const kind = data.kind ?? "list";

        // tsx transpilation can emit __name() wrappers inside page-evaluated functions.
        await page.evaluate(() => {
          const pageGlobal = globalThis as { __name?: <T>(fn: T, name?: string) => T };
          if (!pageGlobal.__name) {
            pageGlobal.__name = <T>(fn: T) => fn;
          }
        });

        await applyDelay(page, request.retryCount);
        log.info(`Crawling ${request.url} [${source}:${kind}] (retry ${request.retryCount})`);

        if (kind === "list") {
          listPagesCrawled += 1;

          const extracted =
            source === "linkedin_jobs"
              ? await extractLinkedinListingsFromPage(page)
              : await extractGovListingsFromPage(page);

          run.records_rejected_schema += extracted.invalidCount;
          run.records_seen += extracted.items.length;

          for (const raw of extracted.items) {
            const normalized = normalizeListing(raw);
            if (!shouldQueueDetailRequest(source)) {
              ingestNormalizedListing(normalized);
              continue;
            }
            await queue.addRequest({
              url: normalized.url,
              uniqueKey: `${source}:detail:${normalized.source_listing_id}`,
              noRetry: source === "linkedin_jobs",
              userData: {
                source,
                kind: "detail" satisfies RequestKind,
                seed: normalized
              }
            });
          }

          if (listPagesCrawled < config.crawlMaxPages) {
            await enqueueNextPage(queue, page, source);
          }
          return;
        }

        const seed = data.seed;
        if (!seed) {
          run.records_rejected_schema += 1;
          throw new Error("Missing seed listing for detail page extraction");
        }

        const normalizedSeed = normalizeListing(seed);
        const details =
          source === "linkedin_jobs"
            ? await extractLinkedinListingDetailFromPage(page, normalizedSeed)
            : await extractGovListingDetailFromPage(page, normalizedSeed);

        run.records_rejected_schema += details.invalidCount;

        if (!details.item) {
          run.records_rejected_schema += 1;
          const snapshot = await writeFailureSnapshot(page, source, normalizedSeed.source_listing_id, "detail-parse-failed");
          if (snapshot) {
            log.warning(`Extractor snapshot captured at ${snapshot}`);
          }
          throw new Error(`Detail extraction returned no valid record for ${source}:${normalizedSeed.source_listing_id}`);
        }

        const normalized = normalizeListing(details.item);
        ingestNormalizedListing(normalized);
      },
      async failedRequestHandler({ request, log }, error) {
        const data = (request.userData ?? {}) as Partial<CrawlRequestData>;
        const source = data.source ?? "find_apprenticeship_gov_uk";
        const kind = data.kind ?? "list";

        // LinkedIn frequently blocks detail-page requests. Fall back to list-card data instead of failing the run.
        if (source === "linkedin_jobs" && kind === "detail" && isBlocked429(error) && data.seed) {
          const normalized = normalizeListing(data.seed);
          ingestNormalizedListing(normalized);

          log.warning(`LinkedIn detail blocked (429), used list fallback: ${request.url}`);
          return;
        }

        run.errors_count += 1;
        const message = errorMessageFrom(error);
        run.error_message = `${request.url}: ${message}`;
      }
    });

    await crawler.run();

    run.status = run.errors_count > 0 ? "failed" : "success";
    run.finished_at = nowIso();
    db.finishRun(run);
    return run;
  } catch (error) {
    run.status = "failed";
    run.finished_at = nowIso();
    run.error_message = error instanceof Error ? error.message : "Unknown crawl error";
    run.errors_count += 1;
    db.finishRun(run);
    return run;
  }
}
