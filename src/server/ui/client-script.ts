export function renderControlPanelClientScript(): string {
  return `
      const boot = JSON.parse(document.getElementById("boot").textContent || "{}");
      const state = {
        sessionId: "",
        userId: boot.defaults?.userId || "web-user",
        loadingTimer: null,
        spawnPoller: null,
        pendingRequestId: null,
        currentThoughts: [],
        spawnedRoles: [],
        runtimeData: null,
      };

      const byId = (id) => document.getElementById(id);
      const pretty = (value) => JSON.stringify(value, null, 2);
      const escapeHtml = (value) => String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
      const escapeAttribute = (value) => escapeHtml(value).replaceAll("'", "&#39;");

      const setStatus = (id, message, isError = false) => {
        const el = byId(id);
        el.textContent = message || "";
        el.classList.toggle("error", Boolean(isError));
      };

      const loadingSteps = [
        "IntentRecognitionAgent: routing the request",
        "PortfolioAgent: reading portfolio and memory context",
        "ResearchRoot: planning specialist lenses",
        "Specialists: collecting evidence and synthesis",
      ];

      function beginLoadingThoughts() {
        state.currentThoughts = [];
        state.spawnedRoles = [];
        clearInterval(state.loadingTimer);
        let index = 0;
        state.loadingTimer = setInterval(() => {
          if (index < loadingSteps.length) {
            state.currentThoughts.push(loadingSteps[index]);
            index += 1;
            renderChat(state.sessionData || null, null, true);
          }
        }, 750);
      }

      function stopLoadingThoughts() {
        clearInterval(state.loadingTimer);
        state.loadingTimer = null;
      }

      function stopSpawnPolling() {
        clearInterval(state.spawnPoller);
        state.spawnPoller = null;
      }

      function startSpawnPolling() {
        stopSpawnPolling();
        if (!state.sessionId || !state.pendingRequestId) {
          return;
        }
        state.spawnPoller = setInterval(async () => {
          try {
            const spawns = await api("/api/sessions/" + encodeURIComponent(state.sessionId) + "/spawns?requestId=" + encodeURIComponent(state.pendingRequestId), { headers: {} });
            const roles = Array.isArray(spawns) ? spawns.map((item) => item.role).filter((item) => typeof item === "string") : [];
            state.spawnedRoles = Array.from(new Set(roles));
            renderChat(state.sessionData || null, null, true);
          } catch {
            // keep polling quietly during the request
          }
        }, 1200);
      }

      function updateComposerOffset() {
        const composer = document.querySelector(".composer");
        if (!composer) {
          return;
        }
        document.documentElement.style.setProperty("--composer-offset", composer.getBoundingClientRect().height + "px");
      }

      async function api(path, options = {}) {
        const response = await fetch(path, {
          headers: { "content-type": "application/json" },
          ...options,
        });
        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || "request failed");
        }
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          return response.json();
        }
        return response.text();
      }

      function normalizeBlocks(blocks) {
        return Array.isArray(blocks) ? blocks.filter(Boolean) : [];
      }

      function renderChat(session, latestResult = null, showLoading = false) {
        const log = byId("chatLog");
        const transcript = session?.transcript || [];
        const rows = [];

        for (const entry of transcript) {
          if (entry.role === "user") {
            rows.push('<div class="message-row user"><div class="bubble-user">' + renderMarkdown(entry.content || "") + '</div></div>');
            continue;
          }

          const blocks = normalizeBlocks(entry.blocks || []);
          rows.push(
            '<div class="message-row assistant"><div class="assistant-wrap"><div class="assistant-icon">AI</div><div class="assistant-body">' +
              renderMarkdown(entry.content || "") +
              renderBlocks(blocks) +
              "</div></div></div>",
          );
        }

        const transcriptAlreadyIncludesLatest =
          latestResult?.response?.message &&
          transcript.length > 0 &&
          transcript[transcript.length - 1]?.role === "assistant" &&
          transcript[transcript.length - 1]?.content === latestResult.response.message;

        if (latestResult?.response?.message && !transcriptAlreadyIncludesLatest) {
          const resultBlocks = normalizeBlocks(latestResult?.response?.blocks || []);
          rows.push(
            '<div class="message-row assistant"><div class="assistant-wrap"><div class="assistant-icon">AI</div><div class="assistant-body">' +
              renderMarkdown(latestResult.response.message) +
              renderBlocks(resultBlocks) +
              "</div></div></div>",
          );
        }

        if (showLoading) {
          const completed = state.currentThoughts.map((item) => '<div class="thought done">' + escapeHtml(item) + '</div>').join("");
          const spawned = state.spawnedRoles.map((role) => '<div class="thought agent done">spawned: ' + escapeHtml(role) + '</div>').join("");
          rows.push('<div class="message-row assistant"><div class="assistant-wrap"><div class="assistant-icon">AI</div><div class="assistant-body"><div class="thoughts">' +
            completed +
            spawned +
            '<div class="thought live">' + escapeHtml(state.spawnedRoles.length ? "Synthesizing specialist output..." : (state.currentThoughts.length ? "Waiting for specialist output..." : "Initializing agent route...")) + '</div>' +
          '</div></div></div></div>');
        }

        log.innerHTML = rows.join("");
        log.parentElement.scrollTop = log.parentElement.scrollHeight;
        updateComposerOffset();
      }

      function renderSpawnActivity(spawns) {
        const lines = [];
        const list = Array.isArray(spawns) ? spawns : [];
        if (!list.length) {
          byId("spawnOutput").value = "No spawned subagents for this session yet.";
          return;
        }
        for (const spawn of list) {
          lines.push("[" + (spawn.role || "unknown") + "] " + (spawn.sessionId || ""));
          if (spawn.task) {
            lines.push("task: " + spawn.task);
          }
          const toolCalls = Array.isArray(spawn.toolCalls) ? spawn.toolCalls : [];
          if (!toolCalls.length) {
            lines.push("toolCalls: (none)");
          } else {
            lines.push("toolCalls:");
            for (const call of toolCalls) {
              lines.push("- " + (call.toolName || "unknown") + " " + JSON.stringify(call.args || {}));
            }
          }
          lines.push("");
        }
        byId("spawnOutput").value = lines.join("\\n").trim();
      }

      function renderRuntime(payload) {
        state.runtimeData = payload;
        const status = payload?.status || {};
        byId("runtimeOutput").value = pretty({
          status,
          mcp: payload?.mcp || [],
        });
        byId("memoryArtifacts").value = pretty(payload?.recentMemory || []);
        byId("skillsOutput").value = pretty(payload?.skills || []);
        const started = status.startedAt ? new Date(status.startedAt).toLocaleString() : "not started";
        const reload = status.lastReloadAt ? new Date(status.lastReloadAt).toLocaleString() : "never";
        byId("healthBadge").textContent = status.reloadInFlight
          ? "Runtime reloading..."
          : "Daemon online · started " + started;
        setStatus("runtimeStatus", "Last reload: " + reload + (status.lastReloadReason ? " (" + status.lastReloadReason + ")" : ""));
      }

      function renderBlocks(blocks) {
        if (!blocks.length) {
          return "";
        }
        return '<div class="blocks">' + blocks.map((block) => {
          const title = typeof block.title === "string" ? '<strong>' + escapeHtml(block.title) + "</strong>" : "";
          const content = typeof block.content === "string"
            ? renderMarkdown(block.content)
            : '<pre>' + escapeHtml(JSON.stringify(block.content ?? "", null, 2)) + "</pre>";
          return '<div class="block">' + title + content + "</div>";
        }).join("") + "</div>";
      }

      function renderMarkdown(markdown) {
        const source = String(markdown || "");
        if (!source.trim()) {
          return "";
        }

        const tick = String.fromCharCode(96);
        const tripleTick = tick + tick + tick;
        const codeBlocks = [];
        const withoutFences = source.replace(new RegExp(tripleTick + "([^\\\\n]*)\\\\n([\\\\s\\\\S]*?)" + tripleTick, "g"), (_, lang, code) => {
          const index = codeBlocks.push({
            lang: String(lang || "").trim(),
            code: String(code || "").replace(/\\s+$/, ""),
          }) - 1;
          return "\\n@@CODEBLOCK_" + index + "@@\\n";
        });

        const blocks = withoutFences
          .replace(/\\r/g, "")
          .split(/\\n{2,}/)
          .map((part) => part.trim())
          .filter(Boolean);

        const html = blocks.map((block) => renderMarkdownBlock(block)).join("");
        return '<div class="markdown">' + html.replace(/@@CODEBLOCK_(\\d+)@@/g, (_, rawIndex) => {
          const item = codeBlocks[Number(rawIndex)];
          if (!item) {
            return "";
          }
          const label = item.lang ? '<div class="code-lang">' + escapeHtml(item.lang) + "</div>" : "";
          return '<div class="code-block">' + label + "<pre><code>" + escapeHtml(item.code) + "</code></pre></div>";
        }) + "</div>";
      }

      function renderMarkdownBlock(block) {
        if (/^@@CODEBLOCK_\\d+@@$/.test(block)) {
          return block;
        }
        if (/^---+$/.test(block) || /^\\*\\*\\*+$/.test(block)) {
          return "<hr>";
        }

        const lines = block.split("\\n");
        if (lines.every((line) => /^>\\s?/.test(line))) {
          const content = lines.map((line) => line.replace(/^>\\s?/, "")).join(" ");
          return "<blockquote>" + renderInlineMarkdown(content) + "</blockquote>";
        }
        if (lines.every((line) => /^\\d+\\.\\s+/.test(line))) {
          return "<ol>" + lines.map((line) => "<li>" + renderInlineMarkdown(line.replace(/^\\d+\\.\\s+/, "")) + "</li>").join("") + "</ol>";
        }
        if (lines.every((line) => /^[-*]\\s+/.test(line))) {
          return "<ul>" + lines.map((line) => "<li>" + renderInlineMarkdown(line.replace(/^[-*]\\s+/, "")) + "</li>").join("") + "</ul>";
        }

        const heading = block.match(/^(#{1,6})\\s+(.+)$/);
        if (heading) {
          const level = heading[1].length;
          return "<h" + level + ">" + renderInlineMarkdown(heading[2]) + "</h" + level + ">";
        }

        return "<p>" + lines.map((line) => renderInlineMarkdown(line)).join("<br>") + "</p>";
      }

      function renderInlineMarkdown(text) {
        let html = escapeHtml(String(text || ""));
        const tick = String.fromCharCode(96);
        html = html.replace(new RegExp(tick + "([^" + tick + "]+)" + tick, "g"), "<code>$1</code>");
        html = html.replace(/\\[([^\\]]+)\\]\\((https?:\\/\\/[^\\s)]+)\\)/g, (_, label, url) => '<a href="' + escapeAttribute(url) + '" target="_blank" rel="noreferrer noopener">' + label + "</a>");
        html = html.replace(/\\*\\*([^*]+)\\*\\*/g, "<strong>$1</strong>");
        html = html.replace(/(^|[^\\*])\\*([^*]+)\\*(?!\\*)/g, "$1<em>$2</em>");
        html = html.replace(/~~([^~]+)~~/g, "<del>$1</del>");
        return html;
      }

      function renderSession(session) {
        state.sessionData = session;
        byId("sessionCaption").textContent = session ? "Session " + session.sessionId : "Session not created";
        byId("sessionId").value = session?.sessionId || "";
        byId("userId").value = session?.userId || state.userId;
        byId("sessionSummary").value = session?.sessionSummary || "";
        renderChat(session);
      }

      function computePortfolioStats(snapshot) {
        const positions = Array.isArray(snapshot?.positions) ? snapshot.positions : [];
        return positions.reduce((stats, item) => {
          const quantity = Number(item.quantity || 0);
          const price = Number(item.marketPrice || 0);
          const avg = Number(item.avgCost || 0);
          const marketValue = Number.isFinite(item.marketValue) ? Number(item.marketValue) : quantity * price;
          const pnl = quantity * (price - avg);
          stats.totalValue += marketValue;
          stats.totalCost += quantity * avg;
          stats.totalPnl += pnl;
          return stats;
        }, { totalValue: Number(snapshot?.cash || 0), totalCost: 0, totalPnl: 0 });
      }

      function renderPortfolio(payload) {
        const snapshot = payload.snapshot;
        const positions = Array.isArray(snapshot?.positions) ? snapshot.positions : [];
        const stats = computePortfolioStats(snapshot);
        const pnlLine = byId("totalPnlLine");
        const pnlPercent = stats.totalCost > 0 ? (stats.totalPnl / stats.totalCost) * 100 : 0;
        byId("totalValue").textContent = Number(snapshot?.equity || stats.totalValue || 0).toFixed(2);
        pnlLine.textContent = "PnL " + (stats.totalPnl >= 0 ? "+" : "") + stats.totalPnl.toFixed(2) + " (" + pnlPercent.toFixed(2) + "%)";
        pnlLine.classList.toggle("up", stats.totalPnl >= 0);
        pnlLine.classList.toggle("down", stats.totalPnl < 0);
        byId("portfolioInput").value = pretty(snapshot);
        byId("portfolioSummary").value = payload.summary || "";

        const list = byId("positionsList");
        list.innerHTML = positions.length
          ? positions.map((item) => {
              const quantity = Number(item.quantity || 0);
              const currentPrice = Number(item.marketPrice || 0);
              const avgPrice = Number(item.avgCost || 0);
              const pnl = quantity * (currentPrice - avgPrice);
              const pnlPercentItem = avgPrice > 0 ? ((currentPrice - avgPrice) / avgPrice) * 100 : 0;
              const direction = pnl >= 0 ? "up" : "down";
              return '<article class="holding"><div class="holding-head"><div><strong>' + escapeHtml(item.symbol || "UNKNOWN") + '</strong><div class="meta">' + escapeHtml(item.name || "Unnamed") + '</div></div><div><strong>$' + currentPrice.toFixed(2) + '</strong><div class="meta">' + quantity + " shares" + '</div></div></div><div class="holding-foot"><small>Avg $' + avgPrice.toFixed(2) + '</small><span class="pill ' + direction + '">' + (pnl >= 0 ? "+" : "") + pnl.toFixed(2) + " / " + pnlPercentItem.toFixed(2) + '%</span></div></article>';
            }).join("")
          : '<div class="holding"><strong>No positions</strong><div class="meta">Import or update the paper portfolio to begin.</div></div>';
      }

      async function refreshHealth() {
        try {
          const result = await api("/health", { headers: {} });
          if (result.runtime) {
            renderRuntime({ status: result.runtime, mcp: state.runtimeData?.mcp || [], skills: state.runtimeData?.skills || [], recentMemory: state.runtimeData?.recentMemory || [] });
          } else {
            byId("healthBadge").textContent = result.status === "ok" ? "Daemon online" : "Daemon status unknown";
          }
        } catch (error) {
          byId("healthBadge").textContent = "Daemon unavailable";
          setStatus("chatStatus", error.message || String(error), true);
        }
      }

      async function refreshRuntime() {
        try {
          const payload = await api("/api/runtime", { headers: {} });
          renderRuntime(payload);
        } catch (error) {
          setStatus("runtimeStatus", error.message || String(error), true);
        }
      }

      async function reloadRuntime() {
        try {
          setStatus("runtimeStatus", "Reloading runtime...");
          const status = await api("/api/runtime/reload", {
            method: "POST",
            body: JSON.stringify({ reason: "web-ui" }),
          });
          renderRuntime({ status, mcp: state.runtimeData?.mcp || [], skills: state.runtimeData?.skills || [], recentMemory: state.runtimeData?.recentMemory || [] });
          await refreshRuntime();
        } catch (error) {
          setStatus("runtimeStatus", error.message || String(error), true);
        }
      }

      async function restartRuntime() {
        try {
          setStatus("runtimeStatus", "Scheduling daemon restart...");
          const sessionId = state.sessionId || "web:control-panel";
          await api("/api/runtime/restart", {
            method: "POST",
            body: JSON.stringify({
              sessionId,
              note: "stock-claw restarted successfully. You can continue from the same session.",
              reason: "web-ui",
            }),
          });
          setStatus("runtimeStatus", "Restart scheduled. Reload this page after the daemon comes back.");
        } catch (error) {
          setStatus("runtimeStatus", error.message || String(error), true);
        }
      }

      async function createOrLoadSession() {
        try {
          const requestedSessionId = byId("sessionId").value.trim() || undefined;
          const session = await api("/api/sessions", {
            method: "POST",
            body: JSON.stringify({
              sessionId: requestedSessionId,
              userId: byId("userId").value.trim() || state.userId,
            }),
          });
          state.sessionId = session.sessionId;
          state.userId = session.userId;
          renderSession(session);
          setStatus("sessionStatus", "Session ready");
        } catch (error) {
          setStatus("sessionStatus", error.message || String(error), true);
        }
      }

      async function refreshSession() {
        const requestedSessionId = byId("sessionId").value.trim();
        if (requestedSessionId && requestedSessionId !== state.sessionId) {
          state.sessionId = requestedSessionId;
        }
        if (!state.sessionId) {
          return createOrLoadSession();
        }
        try {
          const session = await api("/api/sessions/" + encodeURIComponent(state.sessionId), { headers: {} });
          renderSession(session);
          const spawns = await api("/api/sessions/" + encodeURIComponent(state.sessionId) + "/spawns", { headers: {} });
          renderSpawnActivity(spawns);
          setStatus("sessionStatus", "Session refreshed");
        } catch (error) {
          setStatus("sessionStatus", error.message || String(error), true);
        }
      }

      async function sendMessage(messageOverride = null) {
        const message = (messageOverride ?? byId("messageInput").value).trim();
        if (!message) {
          return;
        }
        if (!state.sessionId) {
          await createOrLoadSession();
        }
        beginLoadingThoughts();
        try {
          const requestId = crypto.randomUUID();
          state.pendingRequestId = requestId;
          startSpawnPolling();
          setStatus("chatStatus", "Running stock-claw...");
          renderChat(state.sessionData || null, null, true);
          const result = await api("/api/sessions/" + encodeURIComponent(state.sessionId) + "/messages", {
            method: "POST",
            body: JSON.stringify({
              requestId,
              userId: byId("userId").value.trim() || state.userId,
              message,
            }),
          });
          byId("messageInput").value = "";
          setStatus("chatStatus", "Reply received.");
          await refreshSession();
          await refreshRuntime();
          renderChat(state.sessionData || null, result, false);
          await refreshPortfolio();
        } catch (error) {
          setStatus("chatStatus", error.message || String(error), true);
        } finally {
          stopSpawnPolling();
          stopLoadingThoughts();
          state.pendingRequestId = null;
          state.currentThoughts = [];
        }
      }

      async function refreshPortfolio() {
        try {
          const payload = await api("/api/portfolio", { headers: {} });
          renderPortfolio(payload);
          setStatus("portfolioStatus", "Portfolio loaded");
        } catch (error) {
          setStatus("portfolioStatus", error.message || String(error), true);
        }
      }

      async function savePortfolio() {
        try {
          const snapshot = JSON.parse(byId("portfolioInput").value);
          const payload = await api("/api/portfolio", {
            method: "PUT",
            body: JSON.stringify(snapshot),
          });
          renderPortfolio(payload);
          setStatus("portfolioStatus", "Portfolio saved");
        } catch (error) {
          setStatus("portfolioStatus", error.message || String(error), true);
        }
      }

      async function refreshConfig(target = "all") {
        try {
          const payload = await api("/api/config?target=" + encodeURIComponent(target), { headers: {} });
          byId("configOutput").value = pretty(payload);
          setStatus("configStatus", "Config loaded");
        } catch (error) {
          setStatus("configStatus", error.message || String(error), true);
        }
      }

      byId("messageInput").addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          void sendMessage();
        }
      });
      byId("refreshPortfolioButton").addEventListener("click", () => refreshPortfolio());
      byId("savePortfolioButton").addEventListener("click", () => savePortfolio());
      byId("refreshConfigButton").addEventListener("click", () => refreshConfig("all"));
      byId("showMcpButton").addEventListener("click", () => refreshConfig("mcp"));
      byId("showLlmButton").addEventListener("click", () => refreshConfig("llm"));
      byId("refreshRuntimeButton").addEventListener("click", () => refreshRuntime());
      byId("reloadRuntimeButton").addEventListener("click", () => reloadRuntime());
      byId("restartRuntimeButton").addEventListener("click", () => restartRuntime());
      window.addEventListener("resize", updateComposerOffset);

      await refreshHealth();
      await createOrLoadSession();
      await refreshPortfolio();
      await refreshConfig("all");
      await refreshRuntime();
      renderSpawnActivity([]);
      updateComposerOffset();
`;
}
