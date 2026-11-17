# Question tools

Ask the user directly for decisions that cannot be established from the repository. Use a structured question tool only when the current host exposes it and its schema fits the question. Do not assume a tool exists because another coding agent supports a similarly named function.

Ask one question at a time. Keep choices short and mutually exclusive, include a concise consequence where it helps, and omit options that repository evidence rules out. For open-ended build or updater prerequisites, use a short free-form prompt. If the host has no suitable question tool, ask in the conversation and wait for the answer before taking dependent action.

## Known tool examples

These names and protocol methods are host-specific examples, not a portable API:

| Host or protocol | Question interface | Reference |
| --- | --- | --- |
| Codex | `request_user_input` (available only in supported modes/contexts) | [Codex tool specification](https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/handlers/request_user_input_spec.rs) |
| Claude Code Agent SDK | `AskUserQuestion` | [Claude Code Agent SDK permissions](https://code.claude.com/docs/zh-CN/agent-sdk/permissions) |
| Gemini CLI | `ask_user` | [Gemini CLI ask-user tool](https://geminicli.com/docs/tools/ask-user/) |
| OpenCode | `question` | [OpenCode tools](https://opencode.ai/docs/tools) |
| Cursor CLI ACP | `cursor/ask_question` protocol method | [Cursor CLI ACP](https://cursor.com/docs/cli/acp) |

Inspect the current tool list and use only a tool actually provided to the session. Do not call a provider-specific API by guessing its name or schema. A model identifier is not a question tool. Never send user questions through email, chat, or another external service unless the user separately authorized that action.
