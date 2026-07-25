import { FastifyInstance } from "fastify";
import { z } from "zod";

// Thin ingest endpoint forwarding to a managed provider (PostHog/
// Amplitude) at launch — don't stand up a custom pipeline until volume
// actually justifies the ops cost (see ARCHITECTURE.md §5).
export async function analyticsRoutes(app: FastifyInstance) {
  app.post("/analytics/event", async (req, reply) => {
    const body = z
      .object({ name: z.string(), properties: z.record(z.unknown()).optional() })
      .parse(req.body);

    // TODO: forward `body` to the managed analytics provider's ingest API.
    req.log.info({ event: body.name }, "analytics event received");
    return reply.code(202).send();
  });
}
