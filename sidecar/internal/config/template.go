package config

// Template is written to <home>/config.yaml on first start.
const Template = `# Ollupi desktop backend. Restart the backend from the app after editing.
name: ollupi

# Empty uses ollupi's default system prompt.
prompt: ""

# Models, grouped by the API that serves them. type is the API it speaks:
# openai (any OpenAI-compatible API), anthropic or gemini. A model is
# selected as provider/name, so providers need distinct names and may serve
# models of the same name. The first model is the default. api_key is the
# API's key; leave it out for an API without one. limits is the model's
# context window and the most an answer may take of it, in tokens. calls caps
# concurrent requests to one model (default 4). images: true lets the model
# be sent images.
models:
  - provider: openai
    type: openai
    base_url: https://api.openai.com/v1
    api_key: ""
    names:
      - name: gpt-5.2
        images: true
        limits: { context: 400000, output: 128000 }
  # - provider: anthropic
  #   type: anthropic
  #   api_key: sk-ant-...
  #   names:
  #     - name: claude-sonnet-5-5
  #       images: true
  #       limits: { context: 200000, output: 64000 }
  # - provider: deepseek
  #   type: openai
  #   base_url: https://api.deepseek.com
  #   api_key: sk-...
  #   names:
  #     - name: deepseek-flash
  #       calls: 4
  #       limits: { context: 1048576, output: 393216 }
  # - provider: local
  #   type: openai
  #   base_url: http://127.0.0.1:11434/v1
  #   names:
  #     - name: qwen3:32b
  #       limits: { context: 40960, output: 8192 }

# Agent-level permissions; workspaces and threads add rules on top.
permissions:
  approval: on-request # untrusted | on-request | never
  allow: []
  ask: []
  deny: []

# How many threads may run at once (default 32).
# slots: 32

shell:
  enabled: true
  sandbox_mode: workspace-write # read-only | workspace-write | full-access
  command_timeout_sec: 60
  network: false

# MCP servers: a command run over stdio, or an HTTP URL. Their tools appear
# as <name>__<tool>; a server that cannot start is skipped. Write secrets in
# env and header values as ${NAME}, a variable from your login shell; a
# command also inherits that environment.
# mcp:
#   - name: filesystem
#     command: npx
#     args: [-y, "@modelcontextprotocol/server-filesystem", /path/to/dir]
#   - name: github
#     url: https://api.githubcopilot.com/mcp/
#     headers: { Authorization: "Bearer ${GITHUB_TOKEN}" }

# Learning extracts memories from finished turns with one of the models
# above (provider/name), sharing its calls; recall puts them in context.
memory:
  use: true
  generate: false
  # model: openai/gpt-5.2
`
