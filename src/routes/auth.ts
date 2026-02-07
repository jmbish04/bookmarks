import { Hono } from "hono";

const app = new Hono<{ Bindings: Env }>();

/**
 * Check Auth Status
 * GET /auth/status
 */
app.get("/status", async (c) => {
  const token = c.env.RAINDROP_TOKEN;
  const isConfigured = !!token;
  
  return c.json({ 
    authenticated: isConfigured, 
    systemConfigured: isConfigured, 
    method: "static_token"
  });
});

export default app;
