import Fastify from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import { config } from "./config.js";
import { AppDb } from "./db.js";
import { runCrawl } from "./crawler.js";
import { cutoffDateIso } from "./time.js";

const querySchema = z.object({
  category: z.enum(["tech", "business", "data_analyst", "finance"]).optional(),
  source: z.enum(["find_apprenticeship_gov_uk", "linkedin_jobs"]).optional(),
  q: z.string().optional(),
  posted_after: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().positive().optional(),
  page_size: z.coerce.number().int().positive().max(100).optional(),
  sort: z.enum(["posted_desc", "posted_asc"]).optional()
});

export function buildServer(dbPath = config.dbPath) {
  const app = Fastify({ logger: true });
  const db = new AppDb(dbPath);
  let crawlInFlight: Promise<Awaited<ReturnType<typeof runCrawl>>> | null = null;
  let lastCrawlTriggerAt = 0;

  app.register(cors, { origin: true });

  app.addHook("onClose", async () => {
    db.close();
  });

  app.get("/api/health", async () => ({ ok: true }));

  app.get("/api/apprenticeships", async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid query", details: parsed.error.flatten() });
    }

    const query = parsed.data;
    const cutoff = cutoffDateIso(config.cutoffDays);
    const postedAfter = query.posted_after && query.posted_after > cutoff ? query.posted_after : cutoff;

    const result = db.listApprenticeships({
      ...query,
      posted_after: postedAfter
    });

    return result;
  });

  app.get("/api/apprenticeships/:id", async (request, reply) => {
    const params = request.params as { id: string };
    const item = db.getApprenticeship(params.id);
    if (!item) return reply.status(404).send({ error: "Not found" });
    return item;
  });

  app.get("/api/runs/latest", async () => {
    return db.latestRun();
  });

  app.post("/api/crawl/run", async (request, reply) => {
    const now = Date.now();

    if (crawlInFlight) {
      return reply.status(409).send({
        error: "Crawl already running. Wait for completion and retry."
      });
    }

    // Prevent accidental rapid-fire client loops from hammering crawl runs.
    if (now - lastCrawlTriggerAt < 5000) {
      return reply.status(429).send({
        error: "Crawl called too frequently. Wait at least 5 seconds."
      });
    }

    lastCrawlTriggerAt = now;
    crawlInFlight = runCrawl(db);
    try {
      const run = await crawlInFlight;
      return run;
    } finally {
      crawlInFlight = null;
    }
  });

  return app;
}
