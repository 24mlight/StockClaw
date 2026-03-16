import { describe, expect, it, vi } from "vitest";

import { AgentProfileRegistry } from "../src/control/agent-profiles.js";
import { ToolCatalog } from "../src/tools/catalog.js";
import { ToolRegistry } from "../src/tools/registry.js";

describe("telegram tools", () => {
  it("reacts to the current Telegram user message", async () => {
    const tools = new ToolCatalog();
    const profiles = new AgentProfileRegistry(tools);
    const sendSessionReaction = vi.fn(async () => ({
      sessionId: "telegram:200",
      chatId: "200",
      messageId: 42,
      emoji: "👍",
    }));
    const registry = new ToolRegistry(
      {
        profiles,
        mcpRuntime: { listTools: () => [] } as never,
        portfolio: {} as never,
        memory: {} as never,
        reviews: {
          savePreopenDecision: async () => "review-artifacts/preopen/2026-03-17.json",
        } as never,
        executor: {} as never,
        backtests: {} as never,
        cron: {} as never,
        config: {} as never,
        ops: {} as never,
        restart: {} as never,
        sessions: {} as never,
        telegram: { sendSessionReaction } as never,
      },
      tools,
    );

    const tool = registry.createTools(["telegram_react"], {
      profileId: "orchestrator",
      sessionKey: "telegram:200",
      rootUserMessage: "收到的话就点个表情。",
      requestMetadata: { messageId: 42 },
    })[0];

    const result = await tool.execute(
      "tool-1",
      {
        emoji: "👍",
      },
      undefined,
      undefined,
      undefined as never,
    );

    expect(sendSessionReaction).toHaveBeenCalledWith("telegram:200", {
      messageId: 42,
      emoji: "👍",
      isBig: undefined,
    });
    expect((result.details as { emoji: string }).emoji).toBe("👍");
  });

  it("sends a file to the current Telegram session", async () => {
    const tools = new ToolCatalog();
    const profiles = new AgentProfileRegistry(tools);
    const sendSessionFile = vi.fn(async () => ({
      sessionId: "telegram:200",
      chatId: "200",
      fileName: "analysis.html",
    }));
    const registry = new ToolRegistry(
      {
        profiles,
        mcpRuntime: { listTools: () => [] } as never,
        portfolio: {} as never,
        memory: {} as never,
        reviews: {
          savePreopenDecision: async () => "review-artifacts/preopen/2026-03-17.json",
        } as never,
        executor: {} as never,
        backtests: {} as never,
        cron: {} as never,
        config: {} as never,
        ops: {} as never,
        restart: {} as never,
        sessions: {} as never,
        telegram: { sendSessionFile } as never,
      },
      tools,
    );

    const tool = registry.createTools(["telegram_send_file"], {
      profileId: "orchestrator",
      sessionKey: "telegram:200",
      rootUserMessage: "把分析内容作为文件发给我。",
    })[0];

    const result = await tool.execute(
      "tool-1",
      {
        fileName: "analysis.html",
        content: "# Result\n\nAAPL looks constructive.",
        caption: "analysis attached",
        mimeType: "text/html; charset=utf-8",
      },
      undefined,
      undefined,
      undefined as never,
    );

    expect(sendSessionFile).toHaveBeenCalledWith("telegram:200", {
      fileName: "analysis.html",
      content: "# Result\n\nAAPL looks constructive.",
      caption: "analysis attached",
      mimeType: "text/html; charset=utf-8",
    });
    expect((result.details as { fileName: string }).fileName).toBe("analysis.html");
  });

  it("downloads an attachment from the current Telegram user message", async () => {
    const tools = new ToolCatalog();
    const profiles = new AgentProfileRegistry(tools);
    const downloadSessionAttachment = vi.fn(async () => ({
      sessionId: "telegram:200",
      chatId: "200",
      messageId: 42,
      attachmentIndex: 0,
      fileName: "chart.jpg",
      savedPath: "D:/tmp/chart.jpg",
      bytes: 2048,
    }));
    const registry = new ToolRegistry(
      {
        profiles,
        mcpRuntime: { listTools: () => [] } as never,
        portfolio: {} as never,
        memory: {} as never,
        reviews: {
          savePreopenDecision: async () => "review-artifacts/preopen/2026-03-17.json",
        } as never,
        executor: {} as never,
        backtests: {} as never,
        cron: {} as never,
        config: {} as never,
        ops: {} as never,
        restart: {} as never,
        sessions: {} as never,
        telegram: { downloadSessionAttachment } as never,
      },
      tools,
    );

    const tool = registry.createTools(["telegram_download_attachment"], {
      profileId: "orchestrator",
      sessionKey: "telegram:200",
      rootUserMessage: "把我刚发的图保存下来。",
      requestMetadata: {
        messageId: 42,
        telegramAttachments: [{ kind: "photo", fileId: "abc123" }],
      },
    })[0];

    const result = await tool.execute(
      "tool-1",
      {
        attachmentIndex: 0,
        fileName: "chart.jpg",
      },
      undefined,
      undefined,
      undefined as never,
    );

    expect(downloadSessionAttachment).toHaveBeenCalledWith("telegram:200", {
      messageId: 42,
      attachmentIndex: 0,
      fileName: "chart.jpg",
      requestMetadata: {
        messageId: 42,
        telegramAttachments: [{ kind: "photo", fileId: "abc123" }],
      },
    });
    expect((result.details as { savedPath: string }).savedPath).toBe("D:/tmp/chart.jpg");
  });
});
