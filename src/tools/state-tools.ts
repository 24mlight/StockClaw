import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";

import { buildPortfolioSummary } from "../memory/summary.js";
import type { ToolExecutionContext, ToolRegistryDeps } from "./contracts.js";
import {
  jsonToolResult,
  readObject,
  requiredString,
  readString,
  readStringArray,
} from "./support.js";

const WRITABLE_MEMORY_PATHS = new Set([
  "non-investment/SOUL.md",
  "non-investment/USER.md",
  "non-investment/TOOLS.md",
  "knowledge/INVESTMENT-PRINCIPLES.md",
]);

const WRITABLE_TRADING_MEMORY_PATHS = new Set([
  "trading/risk-profile.md",
  "trading/market-conditions.md",
  "trading/position-sizing.md",
  "trading/error-patterns.md",
  "trading/high-conviction-setups.md",
  "trading/do-not-trade.md",
]);

function normalizeMemoryPath(input: string): string {
  return input.replace(/\\/g, "/").replace(/^memory\//, "").trim();
}

function ensureWritableMemoryPath(input: string): string {
  const normalized = normalizeMemoryPath(input);
  if (!WRITABLE_MEMORY_PATHS.has(normalized)) {
    throw new Error(
      `memory_write_markdown only allows ${[...WRITABLE_MEMORY_PATHS].join(", ")}.`,
    );
  }
  return normalized;
}

function ensureWritableTradingMemoryPath(input: string): string {
  const normalized = normalizeMemoryPath(input);
  if (!WRITABLE_TRADING_MEMORY_PATHS.has(normalized)) {
    throw new Error(
      `memory_write_trading_note only allows ${[...WRITABLE_TRADING_MEMORY_PATHS].join(", ")}.`,
    );
  }
  return normalized;
}

export function createStateTools(
  deps: ToolRegistryDeps,
  _context: ToolExecutionContext,
): ToolDefinition[] {
  return [
    {
      name: "portfolio_read",
      label: "Portfolio Read",
      description: "Read the current paper portfolio snapshot as JSON.",
      parameters: Type.Object({}),
      execute: async () => jsonToolResult(await deps.portfolio.load()),
    },
    {
      name: "portfolio_replace",
      label: "Portfolio Replace",
      description:
        "Replace the paper portfolio snapshot. Use only when the user provides explicit portfolio state.",
      parameters: Type.Object({
        snapshot: Type.Object({}, { additionalProperties: true }),
      }),
      execute: async (_toolCallId, params) => {
        const snapshot = readObject(params, "snapshot");
        return jsonToolResult(await deps.portfolio.replace(snapshot as never));
      },
    },
    {
      name: "portfolio_patch",
      label: "Portfolio Patch",
      description:
        "Patch the paper portfolio snapshot with user-provided holdings, cash, or account values.",
      parameters: Type.Object(
        {
          patch: Type.Object(
            {
              accountId: Type.Optional(Type.String()),
              mode: Type.Optional(Type.String()),
              cash: Type.Optional(Type.Number()),
              equity: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
              buyingPower: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
              positions: Type.Optional(
                Type.Array(
                  Type.Object({
                    symbol: Type.String(),
                    quantity: Type.Number(),
                    avgCost: Type.Optional(Type.Number()),
                    marketPrice: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
                    marketValue: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
                    currency: Type.Optional(Type.String()),
                  }),
                ),
              ),
            },
            { additionalProperties: false },
          ),
        },
        { additionalProperties: false },
      ),
      execute: async (_toolCallId, params) => {
        const patch = readObject(params, "patch");
        return jsonToolResult(await deps.portfolio.patch(patch as never));
      },
    },
    {
      name: "portfolio_summary",
      label: "Portfolio Summary",
      description: "Generate a markdown summary of the current paper portfolio.",
      parameters: Type.Object({}),
      execute: async () => {
        const snapshot = await deps.portfolio.load();
        return {
          content: [{ type: "text", text: buildPortfolioSummary(snapshot) }],
          details: snapshot,
        };
      },
    },
    {
      name: "memory_write_markdown",
      label: "Memory Write Markdown",
      description:
        "Append a concise durable memory note to an approved markdown file. Only use this after summarizing the durable point in your own words.",
      parameters: Type.Object({
        path: Type.String(),
        content: Type.String(),
      }),
      execute: async (_toolCallId, params) => {
        const target = ensureWritableMemoryPath(requiredString(params, "path"));
        const content = requiredString(params, "content");
        await deps.memory.appendDocument(target, "Agent Update", [content]);
        return jsonToolResult({ ok: true, path: target, content });
      },
    },
    {
      name: "memory_append_daily_log",
      label: "Memory Append Daily Log",
      description:
        "Append durable memory entries to memory/YYYY-MM-DD.md. Use for pre-compaction memory flush and append only.",
      parameters: Type.Object({
        date: Type.String(),
        entries: Type.Array(Type.String()),
      }),
      execute: async (_toolCallId, params) => {
        const date = readString(params, "date");
        const entries = readStringArray(params, "entries");
        await deps.memory.appendDocument(`${date}.md`, "Memory Flush", entries);
        return jsonToolResult({ ok: true, date, entries });
      },
    },
    {
      name: "memory_write_trading_note",
      label: "Memory Write Trading Note",
      description:
        "Append a concise trading-system memory note to an approved long-term trading markdown file.",
      parameters: Type.Object({
        path: Type.String(),
        content: Type.String(),
      }),
      execute: async (_toolCallId, params) => {
        const target = ensureWritableTradingMemoryPath(requiredString(params, "path"));
        const content = requiredString(params, "content");
        await deps.memory.appendDocument(target, "Trading Memory", [content]);
        return jsonToolResult({ ok: true, path: target, content });
      },
    },
    {
      name: "memory_write_portfolio_summary",
      label: "Memory Write Portfolio Summary",
      description: "Refresh memory/portfolio/summary.md from the current portfolio state.",
      parameters: Type.Object({}),
      execute: async () => {
        const snapshot = await deps.portfolio.load();
        const summary = buildPortfolioSummary(snapshot);
        await deps.memory.writeDocument("portfolio/summary.md", summary);
        return jsonToolResult({ ok: true, summary });
      },
    },
  ];
}
