import crypto from "node:crypto";
import { PlaywrightCrawler, RequestQueue } from "crawlee";
import type { ApprenticeshipSource, CrawlRun } from "@apprentice/shared";
import { config } from "./config.js";
import { AppDb } from "./db.js";
import {
  normalizeListing,
  extractGovListingsFromPage,
  extractLinkedinListingsFromPage
} from "./extract-listing.js";
import { isLikelyEnglandLocation } from "./location.js";
import { rawToRecord } from "./parser.js";
import { isWithinDays } from "./time.js";

function makeRunId(): string {
  return crypto.randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
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
    uniqueKey: `${source}:${nextHref}`,
    userData: { source }
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
    records_inserted: 0,
    records_updated: 0,
    records_filtered_old: 0,
    errors_count: 0,
    error_message: null
  };

  db.startRun(run);

  try {
    const queue = await RequestQueue.open(`crawl-${run.id}`);
    await queue.addRequest({
      url: config.govSourceStartUrl,
      uniqueKey: `gov:${config.govSourceStartUrl}`,
      userData: { source: "find_apprenticeship_gov_uk" satisfies ApprenticeshipSource }
    });
    for (const linkedinUrl of config.linkedinSourceStartUrls) {
      await queue.addRequest({
        url: linkedinUrl,
        uniqueKey: `linkedin:${linkedinUrl}`,
        userData: { source: "linkedin_jobs" satisfies ApprenticeshipSource }
      });
    }

    const crawler = new PlaywrightCrawler({
      requestQueue: queue,
      maxRequestsPerCrawl: config.crawlMaxRequests,
      maxConcurrency: 3,
      requestHandlerTimeoutSecs: 90,
      launchContext: {
        launchOptions: {
          headless: true
        }
      },
      async requestHandler({ page, request, log }) {
        run.pages_crawled += 1;
        log.info(`Crawling ${request.url}`);

        await page.evaluate(() => {
          const pageGlobal = globalThis as {
            __name?: <T>(fn: T, name?: string) => T;
          };
          if (!pageGlobal.__name) {
            pageGlobal.__name = <T>(fn: T) => fn;
          }
        });

        const source = (request.userData.source as ApprenticeshipSource | undefined) ?? "find_apprenticeship_gov_uk";
        const extracted =
          source === "linkedin_jobs"
            ? await extractLinkedinListingsFromPage(page)
            : await extractGovListingsFromPage(page);

        for (const item of extracted) {
          run.records_seen += 1;
          const normalized = normalizeListing(item);
          const record = rawToRecord(normalized, nowIso(), config.targetCategories);

          if (!record) continue;
          if (!isLikelyEnglandLocation(record.location)) continue;
          if (!isWithinDays(record.posted_date, config.cutoffDays)) {
            run.records_filtered_old += 1;
            continue;
          }

          const outcome = db.upsertApprenticeship(record);
          if (outcome === "inserted") run.records_inserted += 1;
          if (outcome === "updated") run.records_updated += 1;
        }

        if (run.pages_crawled < config.crawlMaxPages) {
          await enqueueNextPage(queue, page, source);
        }
      },
      failedRequestHandler({ request, error }) {
        run.errors_count += 1;
        const message = error instanceof Error ? error.message : String(error);
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
