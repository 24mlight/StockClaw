import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

import type { RuntimeEventLevel, RuntimeEventRecord } from "./types.js";

export class RuntimeEventLogger {
  private queue: Promise<void> = Promise.resolve();
  private readonly filePath: string;

  constructor(
    root: string = path.resolve("data/.runtime-logs"),
    fileName: string = "runtime.jsonl",
    private readonly consoleEnabled: boolean = true,
  ) {
    this.filePath = path.join(root, fileName);
  }

  async info(event: Omit<RuntimeEventRecord, "timestamp" | "level">): Promise<void> {
    await this.log({ ...event, level: "info" });
  }

  async warn(event: Omit<RuntimeEventRecord, "timestamp" | "level">): Promise<void> {
    await this.log({ ...event, level: "warn" });
  }

  async error(event: Omit<RuntimeEventRecord, "timestamp" | "level">): Promise<void> {
    await this.log({ ...event, level: "error" });
  }

  async close(): Promise<void> {
    await this.queue.catch(() => undefined);
  }

  private async log(event: Omit<RuntimeEventRecord, "timestamp">): Promise<void> {
    const record: RuntimeEventRecord = {
      timestamp: new Date().toISOString(),
      ...event,
    };
    if (this.consoleEnabled) {
      const line = formatConsoleLine(record);
      if (record.level === "error") {
        console.error(line);
      } else if (record.level === "warn") {
        console.warn(line);
      } else {
        console.log(line);
      }
    }
    this.queue = this.queue.then(async () => {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      await appendFile(this.filePath, `${JSON.stringify(record)}\n`, "utf8");
    });
    await this.queue;
  }
}

function formatConsoleLine(record: RuntimeEventRecord): string {
  const emoji = resolveRuntimeEmoji(record);
  const parts = [emoji ? `${emoji} [${record.component}]` : `[${record.component}]`, record.type];
  if (record.profileId) {
    parts.push(`profile=${record.profileId}`);
  }
  if (record.sessionId) {
    parts.push(`session=${shorten(record.sessionId)}`);
  }
  if (record.requestId) {
    parts.push(`request=${shorten(record.requestId)}`);
  }
  for (const [key, value] of Object.entries(record.data || {})) {
    if (value == null) {
      continue;
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      parts.push(`${key}=${shorten(String(value))}`);
    }
  }
  return parts.join(" ");
}

function resolveRuntimeEmoji(record: RuntimeEventRecord): string {
  if (record.level === "error") {
    return "❌";
  }
  if (record.level === "warn") {
    return "⚠️";
  }
  if (record.component === "runtime") {
    if (record.type === "runtime_reloaded" || record.type === "manager_started") {
      return "🔄";
    }
    if (record.type === "runtime_watch_event") {
      return "👀";
    }
    return "⚙️";
  }
  if (record.component === "root") {
    return "🧠";
  }
  if (record.component === "agent") {
    if (record.type === "tool_selected") {
      return "🛠️";
    }
    return "🤖";
  }
  if (record.component === "tool") {
    return "🛠️";
  }
  if (record.component === "daemon") {
    return "🖥️";
  }
  return "ℹ️";
}

function shorten(value: string, limit = 96): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= limit) {
    return compact;
  }
  return `${compact.slice(0, limit - 1)}…`;
}
