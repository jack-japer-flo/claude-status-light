# status-light

A Claude Code mod that shows a status light above the prompt in every session:

- 🟢 **Working** — Claude is thinking or running tools.
- 🟡 **Needs you** — a permission prompt, a question (AskUserQuestion), plan approval, an MCP input request, or a turn that stopped on an error or refusal. The reason is shown beside the light; an error stays yellow until your next prompt.
- 🔴 **Idle** — the turn ended normally or was interrupted.

## Install

Type this at the prompt of a Claude Code session:

```
/plugin install status-light --marketplace jack-japer-flo/claude-status-light
```

Answer `y` to add the marketplace, then choose the **user** scope so it applies to every session.

## Known gap

After you approve a permission prompt, the light stays yellow until that tool finishes, since no event fires at the moment of approval.
