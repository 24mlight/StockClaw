export const CONTROL_PANEL_STYLES = `
      html {
        height: 100%;
      }

      :root {
        --bg: #212121;
        --panel: #171717;
        --panel-soft: #2a2a2a;
        --panel-strong: #2f2f2f;
        --border: #383838;
        --text: #ececec;
        --muted: #8e8e8e;
        --success: #22c55e;
        --danger: #ef4444;
        --accent: #ffffff;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        height: 100%;
        background: var(--bg);
        color: var(--text);
        font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
        overflow: hidden;
      }

      .app {
        display: flex;
        height: 100vh;
        min-height: 100vh;
        overflow: hidden;
      }

      .chat-shell {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-width: 0;
        min-height: 0;
        position: relative;
        overflow: hidden;
      }

      .side-shell {
        width: min(380px, 100vw);
        background: var(--panel);
        border-left: 1px solid var(--border);
        display: flex;
        flex-direction: column;
        min-height: 0;
        overflow: hidden;
      }

      .topbar {
        position: sticky;
        top: 0;
        z-index: 4;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 14px 18px;
        background: rgba(33, 33, 33, 0.96);
        border-bottom: 1px solid rgba(56, 56, 56, 0.72);
        backdrop-filter: blur(12px);
      }

      .title-group strong {
        display: block;
        font-size: 15px;
      }

      .title-group span,
      .badge,
      .hint,
      .status,
      label,
      input,
      textarea,
      button {
        font-size: 13px;
      }

      .title-group span {
        color: var(--muted);
      }

      .badge {
        padding: 7px 10px;
        border-radius: 999px;
        border: 1px solid var(--border);
        color: var(--muted);
        background: rgba(47, 47, 47, 0.85);
      }

      .chat-scroll {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: 24px 20px calc(var(--composer-offset, 220px) + 28px);
      }

      .chat-stack {
        max-width: 900px;
        margin: 0 auto;
        display: flex;
        flex-direction: column;
        gap: 22px;
      }

      .message-row {
        display: flex;
        width: 100%;
      }

      .message-row.user {
        justify-content: flex-end;
      }

      .message-row.assistant {
        justify-content: flex-start;
      }

      .bubble-user {
        max-width: min(78%, 720px);
        padding: 16px 18px;
        border-radius: 26px;
        background: var(--panel-strong);
        color: var(--text);
      }

      .assistant-wrap {
        max-width: min(86%, 880px);
        display: flex;
        gap: 14px;
      }

      .assistant-icon {
        width: 34px;
        height: 34px;
        border-radius: 999px;
        background: #fff;
        color: #000;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        flex: 0 0 auto;
      }

      .assistant-body {
        flex: 1;
        padding-top: 4px;
      }

      .assistant-body pre,
      .bubble-user pre,
      .thoughts pre,
      textarea,
      code {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
        font-family: "Cascadia Code", "JetBrains Mono", Consolas, monospace;
        line-height: 1.6;
      }

      .markdown {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .markdown > :first-child {
        margin-top: 0;
      }

      .markdown > :last-child {
        margin-bottom: 0;
      }

      .markdown p,
      .markdown ul,
      .markdown ol,
      .markdown blockquote {
        margin: 0;
      }

      .markdown h1,
      .markdown h2,
      .markdown h3,
      .markdown h4,
      .markdown h5,
      .markdown h6 {
        margin: 0;
        line-height: 1.35;
        font-weight: 800;
      }

      .markdown h1 {
        font-size: 28px;
      }

      .markdown h2 {
        font-size: 24px;
      }

      .markdown h3 {
        font-size: 20px;
      }

      .markdown h4,
      .markdown h5,
      .markdown h6 {
        font-size: 16px;
      }

      .markdown a {
        color: #93c5fd;
        text-decoration: none;
      }

      .markdown a:hover {
        text-decoration: underline;
      }

      .markdown ul,
      .markdown ol {
        padding-left: 22px;
      }

      .markdown li + li {
        margin-top: 4px;
      }

      .markdown blockquote {
        padding: 10px 14px;
        border-left: 3px solid rgba(255, 255, 255, 0.18);
        background: rgba(255, 255, 255, 0.04);
        color: #d6d6d6;
        border-radius: 0 12px 12px 0;
      }

      .markdown hr {
        width: 100%;
        height: 1px;
        border: 0;
        background: rgba(255, 255, 255, 0.12);
      }

      .markdown code {
        display: inline-block;
        padding: 1px 6px;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.08);
        font-size: 12px;
      }

      .code-block {
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(0, 0, 0, 0.24);
        border-radius: 14px;
        overflow: hidden;
      }

      .code-lang {
        padding: 8px 12px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        color: var(--muted);
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .code-block pre {
        margin: 0;
        padding: 14px;
        overflow-x: auto;
      }

      .thoughts {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 12px;
        padding-left: 12px;
        border-left: 2px solid var(--border);
      }

      .thought {
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--muted);
        font-size: 12px;
      }

      .thought.agent {
        color: var(--text);
      }

      .thought.done::before {
        content: "OK";
        color: var(--success);
        font-weight: 700;
      }

      .thought.live::before {
        content: "...";
        color: var(--text);
        font-weight: 700;
      }

      .blocks {
        margin-top: 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .block {
        border-radius: 14px;
        background: rgba(47, 47, 47, 0.72);
        border: 1px solid rgba(71, 71, 71, 0.8);
        padding: 12px;
      }

      .composer {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        padding: 28px 18px 16px;
        background: linear-gradient(180deg, rgba(33, 33, 33, 0) 0%, rgba(33, 33, 33, 0.85) 24%, rgba(33, 33, 33, 1) 100%);
      }

      .composer-inner {
        max-width: 900px;
        margin: 0 auto;
      }

      .composer-box {
        border: 1px solid var(--border);
        background: var(--panel-strong);
        border-radius: 24px;
        overflow: hidden;
      }

      .composer-box textarea {
        width: 100%;
        background: transparent;
        color: var(--text);
        border: 0;
        padding: 16px 18px 12px;
        min-height: 120px;
        resize: vertical;
      }

      .composer-actions {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
        padding: 0 14px 14px;
      }

      .button-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      button {
        border: 0;
        border-radius: 999px;
        padding: 10px 14px;
        font-weight: 700;
        cursor: pointer;
        transition: opacity 120ms ease;
      }

      button.primary {
        background: var(--accent);
        color: #000;
      }

      button.secondary {
        background: var(--panel);
        color: var(--text);
        border: 1px solid var(--border);
      }

      button.warn {
        background: #4c1d1d;
        color: #fecaca;
        border: 1px solid rgba(239, 68, 68, 0.4);
      }

      button:disabled {
        opacity: 0.45;
        cursor: default;
      }

      .hint {
        color: var(--muted);
      }

      .status {
        min-height: 18px;
        color: var(--muted);
        margin-top: 8px;
      }

      .status.error {
        color: #fca5a5;
      }

      .portfolio-head {
        padding: 22px 20px;
        border-bottom: 1px solid var(--border);
      }

      .portfolio-head h2 {
        margin: 0 0 16px;
        font-size: 13px;
        letter-spacing: 0.02em;
        color: var(--muted);
        text-transform: uppercase;
      }

      .value-line {
        display: flex;
        align-items: baseline;
        gap: 6px;
        font-size: 34px;
        font-weight: 800;
      }

      .value-line span {
        font-size: 22px;
        color: var(--muted);
      }

      .pnl-line {
        margin-top: 14px;
        display: flex;
        align-items: center;
        gap: 10px;
        font-weight: 700;
      }

      .pnl-line.up {
        color: var(--success);
      }

      .pnl-line.down {
        color: var(--danger);
      }

      .positions {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: 12px 12px 20px;
      }

      .section-label {
        padding: 8px 8px 10px;
        color: var(--muted);
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
      }

      .holding {
        border-radius: 14px;
        padding: 14px 12px;
        transition: background 120ms ease;
      }

      .holding:hover {
        background: rgba(33, 33, 33, 0.8);
      }

      .holding-head,
      .holding-foot {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        align-items: flex-start;
      }

      .holding strong {
        font-size: 16px;
      }

      .holding small,
      .holding .meta {
        color: var(--muted);
      }

      .holding-foot {
        margin-top: 10px;
        align-items: center;
      }

      .pill {
        padding: 3px 7px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 700;
        background: rgba(255, 255, 255, 0.06);
      }

      .pill.up {
        color: var(--success);
        background: rgba(34, 197, 94, 0.12);
      }

      .pill.down {
        color: var(--danger);
        background: rgba(239, 68, 68, 0.12);
      }

      details {
        margin-top: 10px;
        border-top: 1px solid var(--border);
      }

      summary {
        list-style: none;
        cursor: pointer;
        padding: 14px 20px;
        font-weight: 700;
      }

      summary::-webkit-details-marker {
        display: none;
      }

      .detail-body {
        padding: 0 20px 18px;
      }

      label {
        display: block;
        color: var(--muted);
        margin: 10px 0 6px;
      }

      input,
      textarea.control {
        width: 100%;
        background: var(--panel-soft);
        color: var(--text);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 10px 12px;
        font: inherit;
      }

      textarea.control {
        min-height: 110px;
        resize: vertical;
      }

      textarea.control.tall {
        min-height: 160px;
      }

      .split {
        display: grid;
        gap: 10px;
      }

      @media (max-width: 1080px) {
        body {
          overflow: auto;
        }

        .app {
          flex-direction: column;
          height: auto;
          overflow: visible;
        }

        .side-shell {
          width: 100%;
          min-height: 44vh;
          border-left: 0;
          border-top: 1px solid var(--border);
          overflow: visible;
        }

        .composer {
          position: sticky;
          bottom: 0;
        }
      }
`;
