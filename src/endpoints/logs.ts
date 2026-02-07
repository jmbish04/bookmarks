import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { getDb } from "../db/client";
import { systemLogs } from "../db/schema";
import { desc } from "drizzle-orm";

const app = new OpenAPIHono<{ Bindings: Env }>();

const SystemLogSchema = z.object({
  id: z.number(),
  level: z.string(),
  component: z.string(),
  message: z.string(),
  metadata: z.string().nullable(),
  createdAt: z.string().nullable(),
}).openapi("SystemLog");

const LogListResponseSchema = z.object({
  logs: z.array(SystemLogSchema),
}).openapi("LogListResponse");

const listLogsRoute = createRoute({
  method: "get",
  path: "/logs",
  operationId: "listLogs",
  summary: "List system logs",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: LogListResponseSchema,
        },
      },
      description: "Recent system logs",
    },
    500: {
      description: "Internal Server Error",
    },
  },
});

app.openapi(listLogsRoute, async (c) => {
  try {
    const db = getDb(c.env);
    const logs = await db.select().from(systemLogs).orderBy(desc(systemLogs.id)).limit(50);
    return c.json({ logs }, 200);
  } catch (error) {
    return c.json({ logs: [] }, 500);
  }
});

export default app;
