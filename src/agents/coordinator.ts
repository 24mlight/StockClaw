import path from "node:path";

import type { MemoryService } from "../memory/service.js";
import { writeLiveSessionSummary } from "../memory/session-summary.js";
import { runMemoryFlushTurn } from "../memory/flush-runner.js";
import {
  DURABLE_MEMORY_CATEGORIES,
  ROOT_BOOTSTRAP_MEMORY_FILES,
  loadBootstrapMemoryFiles,
  renderBootstrapMemoryPrompt,
} from "../memory/bootstrap-files.js";
import type { PortfolioStore } from "../portfolio/store.js";
import type { PromptRegistry } from "../prompts/registry.js";
import type { PiRuntime } from "../pi/runtime.js";
import type { RuntimeEventLogger } from "../runtime-logging/logger.js";
import { classifyIntent } from "../orchestrator/intents.js";
import { resolveWorkflowName, type RootWorkflowName } from "../orchestrator/workflows.js";
import { SessionSpawnService } from "./spawn-service.js";
import { AgentProfileRegistry } from "../control/agent-profiles.js";
import { ToolPolicyService } from "../control/tool-policy.js";
import { renderTelegramAttachmentContext } from "../telegram/inbound.js";
import { ROOT_AGENT_PROFILE_ID } from "../types.js";
import type {
  AgentProfileId,
  ConversationMessage,
  SpecialistResult,
  ToolCallRecord,
  UserRequest,
} from "../types.js";

export class ResearchCoordinator {
  constructor(
    private readonly piRuntime: PiRuntime,
    private readonly prompts: PromptRegistry,
    private readonly memory: MemoryService,
    private readonly portfolio: PortfolioStore,
    private readonly profiles: AgentProfileRegistry,
    private readonly policy: ToolPolicyService,
    private readonly spawns: SessionSpawnService,
    private readonly runtimeLogger: RuntimeEventLogger | null = null,
  ) {}

  async runRootTurn(request: UserRequest): Promise<SpecialistResult> {
    const profile = this.profiles.get(ROOT_AGENT_PROFILE_ID);
    const workflowName = resolveWorkflowName(classifyIntent(request.message), request.metadata);
    await this.runtimeLogger?.info({
      component: "root",
      type: "flow_started",
      sessionId: request.sessionId,
      requestId: request.requestId,
      profileId: profile.id,
      data: {
        flow: "chat",
        workflow: workflowName,
      },
    });
    const run = await this.piRuntime.runPersistent({
      sessionKey: request.sessionId,
      systemPrompt: await this.buildSystemPrompt(profile.id),
      userPrompt: await this.buildRootTask(request.message, request.metadata, workflowName),
      customTools: this.policy.createTools(profile.id, {
        sessionKey: request.sessionId,
        profileId: profile.id,
        requestId: request.requestId,
        rootUserMessage: request.message,
        requestMetadata: request.metadata,
      }),
      beforeCompact: async (messages) => {
        await this.beforeCompactFlush(request.sessionId, messages, "chat");
      },
    });
    await this.runtimeLogger?.info({
      component: "root",
      type: "flow_completed",
      sessionId: request.sessionId,
      requestId: request.requestId,
      profileId: profile.id,
      data: {
        flow: "chat",
        workflow: workflowName,
        toolCallCount: run.toolCalls.length,
      },
    });
    return toSpecialist(profile.id, run.message, run.sessionId, run.toolCalls, run.usage);
  }

  async resetSession(sessionId: string): Promise<void> {
    await this.piRuntime.clearPersistentSession(sessionId);
    await this.spawns.clear(sessionId);
  }

  async getSpawnHistory(sessionId: string, requestId?: string): Promise<SpecialistResult[]> {
    return this.spawns.history(sessionId, requestId);
  }

  async getSessionStatus(sessionId: string, requestId?: string) {
    return this.spawns.status(sessionId, requestId);
  }

  async getSessionBacktests(sessionId: string, limit?: number) {
    return this.spawns.getSessionBacktests(sessionId, limit);
  }

  private async buildBaseTask(
    userMessage: string,
    metadata: Record<string, unknown> = {},
  ): Promise<string> {
    const portfolioSnapshot = await this.portfolio.load();
    const memoryContext = await this.loadMemoryContext();
    const portfolioContext = JSON.stringify(portfolioSnapshot, null, 2);
    const automationContext = buildAutomationContext(metadata);
    const attachmentContext = renderTelegramAttachmentContext(metadata);
    return [
      `User request: ${userMessage}`,
      "",
      automationContext ? `${automationContext}\n` : "",
      attachmentContext ? `${attachmentContext}\n` : "",
      "Portfolio snapshot:",
      portfolioContext,
      "",
      "Durable memory excerpt:",
      memoryContext || "(none)",
      "",
      "Stay aligned with your role prompt and use tools when they reduce uncertainty.",
    ].join("\n");
  }

  private async buildRootTask(
    userMessage: string,
    metadata: Record<string, unknown> = {},
    workflowName: RootWorkflowName = resolveWorkflowName(classifyIntent(userMessage), metadata),
  ): Promise<string> {
    const baseTask = await this.buildBaseTask(userMessage, metadata);
    const workflowPrompt = await this.prompts.composeWorkflowPrompt(workflowName);
    const delegationHint = buildDelegationHint(userMessage);
    return [
      baseTask,
      "",
      delegationHint ? `\nDelegation hint:\n${delegationHint}` : "",
      "",
      workflowPrompt,
    ].join("\n");
  }

  private async loadMemoryContext(): Promise<string> {
    const sections = await Promise.all(
      DURABLE_MEMORY_CATEGORIES.map((category) => this.memory.readCategory(category)),
    );
    const bootstrapPaths = new Set(
      ROOT_BOOTSTRAP_MEMORY_FILES.map((relativePath) =>
        normalizeMemoryDocumentPath(this.memory.root, relativePath),
      ),
    );
    return sections
      .flat()
      .filter((document) => !bootstrapPaths.has(normalizeMemoryDocumentPath(this.memory.root, document.path)))
      .map((document) => `## ${document.path}\n\n${document.content.trim()}`)
      .join("\n\n")
      .trim();
  }

  private async buildSystemPrompt(profileId: AgentProfileId): Promise<string> {
    const base = await this.prompts.composeAgentPrompt(profileId);
    if (profileId !== ROOT_AGENT_PROFILE_ID) {
      return base;
    }
    const bootstrap = renderBootstrapMemoryPrompt(await loadBootstrapMemoryFiles(this.memory));
    return [base, bootstrap].filter(Boolean).join("\n\n").trim();
  }

  private async beforeCompactFlush(
    sessionId: string,
    messages: ConversationMessage[],
    intent: string,
  ): Promise<void> {
    await runMemoryFlushTurn({
      piRuntime: this.piRuntime,
      prompts: this.prompts,
      memory: this.memory,
      portfolio: this.portfolio,
      policy: this.policy,
      sessionId,
      transcript: messages,
      intent,
    });
    await writeLiveSessionSummary({
      memory: this.memory,
      sessionId,
      transcript: messages,
      lastIntent: intent,
      updatedAt: new Date().toISOString(),
    });
  }
}

function toSpecialist(
  role: string,
  message: string,
  sessionId: string,
  toolCalls: ToolCallRecord[],
  usage?: SpecialistResult["usage"],
): SpecialistResult {
  return { role, message, sessionId, toolCalls, usage };
}

function buildDelegationHint(userMessage: string): string {
  const normalized = userMessage.toLowerCase();
  const requested: string[] = [];
  if (/\bvalue|valuation|fundamental/.test(normalized)) {
    requested.push("value_analyst");
  }
  if (/\btechnical|trend|chart|momentum|price action/.test(normalized)) {
    requested.push("technical_analyst");
  }
  if (/\bnews|sentiment|catalyst|headline/.test(normalized)) {
    requested.push("news_sentiment_analyst");
  }
  if (/\brisk|drawdown|downside|volatility|exposure/.test(normalized)) {
    requested.push("risk_manager");
  }
  if (requested.length < 2) {
    return "";
  }
  return `The user explicitly asked for multiple research lenses. If those lenses add signal, delegate them with sessions_spawn. Suggested profiles: ${requested.join(", ")}.`;
}

function normalizeMemoryDocumentPath(root: string, documentPath: string): string {
  return documentPath.replaceAll("\\", "/").replace(/\/+$/g, "").replace(
    new RegExp(`^${pathToForwardSlash(path.resolve(root)).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/?`, "i"),
    "",
  );
}

function pathToForwardSlash(value: string): string {
  return value.replaceAll("\\", "/").replace(/\/+$/g, "");
}

function buildAutomationContext(metadata: Record<string, unknown>): string {
  if (metadata.source !== "cron") {
    return "";
  }

  const lines = ["Cron automation context:"];
  const mode = typeof metadata.automationMode === "string" ? metadata.automationMode : null;
  const jobName = typeof metadata.cronJobName === "string" ? metadata.cronJobName : null;
  const targetSessionId =
    typeof metadata.cronTargetSessionId === "string" ? metadata.cronTargetSessionId : null;
  const targetChannel =
    typeof metadata.cronTargetChannel === "string" ? metadata.cronTargetChannel : null;
  const actionKind =
    typeof metadata.cronActionKind === "string" ? metadata.cronActionKind : null;
  const cronAction =
    metadata.cronAction && typeof metadata.cronAction === "object"
      ? JSON.stringify(metadata.cronAction, null, 2)
      : null;
  const cronTrigger =
    metadata.cronTrigger && typeof metadata.cronTrigger === "object"
      ? JSON.stringify(metadata.cronTrigger, null, 2)
      : null;
  const triggerContext =
    metadata.cronTriggerContext && typeof metadata.cronTriggerContext === "object"
      ? JSON.stringify(metadata.cronTriggerContext, null, 2)
      : null;

  lines.push("- This is a fresh automation turn triggered by cron, not a continuation of the chat session.");
  if (jobName) {
    lines.push(`- Job: ${jobName}`);
  }
  if (mode) {
    lines.push(`- Automation mode: ${mode}`);
  }
  if (actionKind) {
    lines.push(`- Action kind: ${actionKind}`);
  }
  if (targetSessionId || targetChannel) {
    lines.push(
      `- Delivery target: ${targetChannel ?? "unknown"} session ${targetSessionId ?? "unknown"}`,
    );
  }
  lines.push(
    "- Use the structured automation payload as source of truth for standing instructions instead of relying on previous chat context.",
  );
  if (cronTrigger) {
    lines.push("", "Cron trigger:", cronTrigger);
  }
  if (triggerContext) {
    lines.push("", "Observed trigger context:", triggerContext);
  }
  if (cronAction) {
    lines.push("", "Structured automation action:", cronAction);
  }
  return lines.join("\n");
}
