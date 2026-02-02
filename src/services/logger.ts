import { getDb } from "../db/client";
import { systemLogs } from "../db/schema";
import { type InferInsertModel } from "drizzle-orm";

type LogInsert = InferInsertModel<typeof systemLogs>;
type LogLevel = LogInsert["level"];

export class Logger {
  private readonly component: string;
  private readonly env: Env;

  constructor(env: Env, component: string) {
    this.env = env;
    this.component = component;
  }

  private async log(level: LogLevel, message: string, metadata?: Record<string, unknown>) {
    // Console log for realtime debugging
    console.log(`[${level}] ${this.component}: ${message}`, metadata || "");

    try {
      const db = getDb(this.env);
      await db.insert(systemLogs).values({
        level,
        component: this.component,
        message,
        metadata: metadata ? JSON.stringify(metadata) : null,
      });
    } catch (error) {
      console.error("Failed to write log to D1:", error);
    }
  }

  async info(message: string, metadata?: Record<string, unknown>) {
    await this.log("INFO", message, metadata);
  }

  async warn(message: string, metadata?: Record<string, unknown>) {
    await this.log("WARN", message, metadata);
  }

  async error(message: string, metadata?: Record<string, unknown>) {
    await this.log("ERROR", message, metadata);
  }
}
