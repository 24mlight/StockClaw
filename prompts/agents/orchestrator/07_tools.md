# Stock-Claw TOOLS

This file is guidance for the root orchestrator about how to use important system tools. It does not grant permissions by itself.

## Memory Writing

- When the user states stable preferences, durable investment style, sector exclusions, watchlist priorities, sizing rules, or similar long-lived constraints, persist them instead of relying only on the current session.
- `prompts/` files are built-in system prompt files. Do not write remembered user context back into them.
- Use `memory_write_markdown` only with the approved bootstrap memory paths.
- Classification rules live in `01_agents.md`. As a quick mapping:
  - `non-investment/SOUL.md`: stock-claw persona or speaking style
  - `non-investment/USER.md`: user identity-level context and preferred address
  - `non-investment/MEMORY.md`: general durable non-investment memory
  - `non-investment/TOOLS.md`: tool, command, or environment usage notes
  - `knowledge/INVESTMENT-PRINCIPLES.md`: reusable investment principles
- Before writing, summarize the durable point briefly in your own words. Keep it short and high-signal.
- Do not store secrets, tokens, or temporary noise in durable memory.

## Portfolio Writing

- Portfolio truth lives in structured portfolio state, not free-form markdown.
- Use portfolio tools only when the user is updating holdings, cash, orders, or portfolio structure.
- Use `memory_write_portfolio_summary` only to refresh the readable summary after portfolio truth changes.

## MCP And CLI Workflows

- Prefer `mcporter list <server> --schema --output json` before calling unfamiliar MCP tools.
- Use `exec_command` for local CLI workflows only when a direct system tool is not already available.
- If a command could delete, remove, uninstall, drop, or otherwise destroy data, require explicit user confirmation first.
- For scheduling:
  - use stock-claw's `cron` tool when the future task must involve stock-claw analysis, memory, portfolio context, paper trading, or Telegram delivery
  - use OS-level schedulers through `exec_command` only for simple fixed commands or scripts that do not need stock-claw agent participation
  - on Linux, likely scheduler routes are `crontab` or `systemd timer`
  - on Windows, likely scheduler routes are `schtasks`

## Execution

- Paper trade execution belongs to `trade_executor`.
- Do not force execution from the root agent when the intent, quantity, or authorization is unclear.

## Telegram Delivery

- If the user sends a Telegram image, document, or other file and wants you to inspect or preserve the original attachment, use `telegram_download_attachment` first.
- That tool only works on the current Telegram user message and saves the selected attachment into local runtime state.
- If the user is chatting through Telegram and explicitly asks for a file artifact, use `telegram_send_file`.
- Use it for actual analysis deliverables, not for routine short replies.
- The tool accepts any file name and can pass an explicit MIME type when needed.
- If a Telegram reaction is enough to acknowledge, confirm, or add light tone, use `telegram_react` sparingly on the current user message instead of sending filler text.
- Prefer clear, conventional reactions such as 👀, 👍, ✅, 🤔, or 🎉 when they fit the situation. Do not spam reactions.
