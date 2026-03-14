import type { RuntimeInspectionPayload, SessionStatusPayload } from "../types.js";
import { formatBacktestJobListItem, sortBacktestJobListItems } from "../backtest/messages.js";
import { formatMemoryArtifactCategory } from "../memory/artifact-labels.js";

export function buildStatusMessage(params: {
  session: SessionStatusPayload;
  runtime?: RuntimeInspectionPayload | null;
}): string {
  const lastUsage = params.session.lastUsage ?? null;
  const cumulativeUsage = params.session.cumulativeUsage ?? {
    turns: 0,
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    contextTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
  const lines = [
    "🧭 Session Status",
    "",
    `Session: ${params.session.sessionId}`,
    `Request: ${params.session.requestId ?? "current"}`,
    `Last Intent: ${params.session.lastIntent ?? "none"}`,
    `Updated: ${params.session.updatedAt}`,
    "",
    "🧠 Context:",
    `- Context Tokens: ${params.session.contextUsage.contextTokens}`,
    `- Source: ${params.session.contextUsage.source}`,
    `- Window: ${params.session.contextUsage.contextWindow}`,
    `- Remaining: ${params.session.contextUsage.remainingTokens}`,
    `- Used: ${params.session.contextUsage.percentUsed}%`,
    `- Compact Threshold: ${params.session.contextUsage.compactionThresholdTokens}`,
    "",
    "📊 Usage:",
    `- Last Turn: turns=${lastUsage ? 1 : 0} ↑${lastUsage?.input ?? 0} ↓${lastUsage?.output ?? 0} total=${lastUsage?.totalTokens ?? 0} cost=${(lastUsage?.cost.total ?? 0).toFixed(6)}`,
    `- Session Total: turns=${cumulativeUsage.turns} ↑${cumulativeUsage.input} ↓${cumulativeUsage.output} total=${cumulativeUsage.totalTokens} cost=${cumulativeUsage.cost.total.toFixed(6)}`,
    "",
    `Transcript Entries: ${params.session.transcriptEntries}`,
    `Spawned Specialists: ${params.session.specialistCount}`,
  ];

  if (params.session.specialists.length > 0) {
    lines.push("", "🧩 Specialists:");
    for (const specialist of params.session.specialists) {
      const usage = specialist.usage;
      const usageSuffix = usage
        ? ` turns=${usage.turns} ↑${usage.input} ↓${usage.output} total=${usage.totalTokens}`
        : "";
      lines.push(`- ${specialist.role} (${specialist.sessionId})${usageSuffix}`);
    }
  }

  if (params.session.sessionSummary) {
    lines.push("", "📝 Live Session Summary:", stripSummaryHeading(params.session.sessionSummary));
  }

  if (params.runtime) {
    lines.push(
      "",
      "⚙️ Runtime:",
      `- Reload Count: ${params.runtime.status.reloadCount}`,
      `- Last Reload: ${params.runtime.status.lastReloadAt ?? "never"}`,
      `- Pending Reload: ${params.runtime.status.pendingReason ?? "none"}`,
      `- Last Error: ${params.runtime.status.lastError ?? "none"}`,
      `- MCP Servers: ${params.runtime.mcp.length}`,
    );

    if (params.runtime.recentMemory.length > 0) {
      lines.push("", "🗂️ Recent Durable Memory Artifacts:");
      for (const artifact of params.runtime.recentMemory) {
        lines.push(
          `- ${artifact.fileName} [${formatMemoryArtifactCategory(artifact.category)}] ${artifact.updatedAt}`,
        );
      }
    }
  }

  lines.push(
    "",
    "📈 Backtests:",
    `- Active: ${params.session.backtests.active}`,
    `- Queued: ${params.session.backtests.queued}`,
    `- Preparing: ${params.session.backtests.preparing}`,
    `- Running: ${params.session.backtests.running}`,
    `- Completed: ${params.session.backtests.completed}`,
    `- Failed: ${params.session.backtests.failed}`,
  );

  if (params.session.backtests.jobs.length > 0) {
    const recentJobs = sortBacktestJobListItems(params.session.backtests.jobs);
    lines.push("", "🧪 Recent Backtest Jobs:");
    lines.push(formatBacktestJobListItem(recentJobs[0]!));
    lines.push("", "Full Backtest History: /backtests");
  }

  lines.push(
    "",
    "⏰ Cron Jobs:",
    `- Total: ${params.session.crons.total}`,
    `- Active: ${params.session.crons.active}`,
    `- Running: ${params.session.crons.running}`,
  );

  if (params.session.crons.jobs.length > 0) {
    const latest = params.session.crons.jobs[0]!;
    lines.push(
      "",
      "🕒 Latest Cron Job:",
      `- ${latest.name} (${latest.jobId})`,
      `- enabled: ${latest.enabled ? "yes" : "no"}`,
      `- next: ${latest.nextRunAt ?? "n/a"}`,
      `- last outcome: ${latest.lastOutcome}`,
      "",
      "Full Cron History: /cron",
    );
  }

  return lines.join("\n");
}

function stripSummaryHeading(markdown: string): string {
  return markdown.replace(/^#\s+Live Session Summary\s*\r?\n\r?\n?/i, "").trim();
}
