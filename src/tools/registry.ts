import type { ToolDefinition } from "@mariozechner/pi-coding-agent";

import { classifyCommandInvocation } from "../runtime-logging/classify.js";
import type { ToolDescriptor } from "../types.js";
import { createActionTools } from "./action-tools.js";
import { createBacktestTools } from "./backtest-tools.js";
import { ToolCatalog } from "./catalog.js";
import { createCronTools } from "./cron-tools.js";
import { createTelegramTools } from "./telegram-tools.js";
import type {
  SessionToolController,
  ToolExecutionContext,
  ToolRegistryDeps,
} from "./contracts.js";
import { createMemoryTools } from "./memory-tools.js";
import { createSessionTools } from "./session-tools.js";
import { createStateTools } from "./state-tools.js";
import { createReviewTools } from "./review-tools.js";
import { createWebTools } from "./web-tools.js";
import { inferMcpCategory } from "./support.js";

export type { SessionToolController, ToolExecutionContext, ToolRegistryDeps } from "./contracts.js";

export class ToolRegistry {
  private sessionController: SessionToolController | null = null;

  constructor(
    private readonly deps: ToolRegistryDeps,
    private readonly catalog: ToolCatalog,
  ) {}

  setSessionController(controller: SessionToolController): void {
    this.sessionController = controller;
  }

  describeAll(): ToolDescriptor[] {
    const mcp = this.deps.mcpRuntime.listTools().map((tool) => ({
      name: tool.name,
      group: "mcp",
      category: inferMcpCategory(tool.name),
      risk: "read" as const,
      description: tool.description || `${tool.server}/${tool.name}`,
      source: "mcp" as const,
    }));
    return [...this.catalog.listBusinessTools(), ...mcp];
  }

  createTools(allowedNames: readonly string[], context: ToolExecutionContext): ToolDefinition[] {
    const allowSet = new Set(allowedNames);
    const business = [
      ...createMemoryTools(this.deps, context),
      ...createActionTools(this.deps, context, this.sessionController),
      ...createBacktestTools(this.deps, context),
      ...createCronTools(this.deps, context),
      ...createTelegramTools(this.deps, context),
      ...createSessionTools(this.deps, context, this.sessionController),
      ...createWebTools(this.deps, context),
      ...createStateTools(this.deps, context),
      ...createReviewTools(this.deps, context),
    ];
    const implementationMap = new Map(business.map((tool) => [tool.name, tool]));
    for (const toolName of allowSet) {
      if (this.catalog.hasTool(toolName) && !implementationMap.has(toolName)) {
        throw new Error(`Missing tool implementation for configured tool '${toolName}'.`);
      }
    }
    return [...allowSet]
      .map((toolName) => {
        const tool = implementationMap.get(toolName);
        return tool ? this.wrapTool(tool, context) : undefined;
      })
      .filter((tool): tool is ToolDefinition => Boolean(tool));
  }

  private wrapTool(tool: ToolDefinition, context: ToolExecutionContext): ToolDefinition {
    return {
      ...tool,
      execute: async (toolCallId, params, signal, onUpdate, extensionContext) => {
        await this.deps.runtimeLogger?.info({
          component: "tool",
          type: "tool_call_started",
          sessionId: context.sessionKey,
          requestId: context.requestId ?? null,
          profileId: context.profileId,
          data: {
            toolName: tool.name,
          },
        });
        try {
          const result = await tool.execute(toolCallId, params, signal, onUpdate, extensionContext);
          await this.deps.runtimeLogger?.info({
            component: "tool",
            type: "tool_call_completed",
            sessionId: context.sessionKey,
            requestId: context.requestId ?? null,
            profileId: context.profileId,
            data: {
              toolName: tool.name,
              ...summarizeToolDetails(tool.name, result?.details),
            },
          });
          return result;
        } catch (error) {
          await this.deps.runtimeLogger?.error({
            component: "tool",
            type: "tool_call_failed",
            sessionId: context.sessionKey,
            requestId: context.requestId ?? null,
            profileId: context.profileId,
            data: {
              toolName: tool.name,
              error: error instanceof Error ? error.message : String(error),
            },
          });
          throw error;
        }
      },
    } satisfies ToolDefinition;
  }
}

function summarizeToolDetails(toolName: string, details: unknown): Record<string, unknown> {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return {};
  }
  const typed = details as Record<string, unknown>;
  if (toolName === "exec_command") {
    const command = typeof typed.command === "string" ? typed.command : "";
    const summary = classifyCommandInvocation(command);
    return {
      mode: typeof typed.mode === "string" ? typed.mode : undefined,
      route: summary.route,
      skillName: summary.skillName,
      mcpServer: summary.mcpServer,
      mcpTool: summary.mcpTool,
      exitCode: numericOrNull(typed.exitCode),
    };
  }
  if (typeof typed.server === "string" && typeof typed.tool === "string") {
    return {
      source: "mcp",
      server: typed.server,
      upstreamTool: typed.tool,
      isError: typed.isError === true,
    };
  }
  if (typeof typed.command === "string") {
    return {
      command: compact(typed.command),
    };
  }
  return {};
}

function numericOrNull(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function compact(value: string, limit = 120): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (collapsed.length <= limit) {
    return collapsed;
  }
  return `${collapsed.slice(0, limit - 1)}…`;
}
