import { drizzle } from "drizzle-orm/d1";


/**
 * Create a Drizzle ORM client for the Cloudflare D1 database.
 */
export const getDb = (env: Env) => drizzle(env.DB);
