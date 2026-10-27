package config

// Template is written to <home>/config.yaml on first start.
const Template = `# Ollupi desktop backend. Restart the backend from the app after editing.
name: ollupi

# Empty uses ollupi's default system prompt.
prompt: ""

# OpenAI-compatible APIs. Prefer api_key_env so the key stays out of this file.
# calls caps concurrent requests to an endpoint across all its models
# (default 4). Declare limits for models ollupi does not know.
endpoints:
  openai:
    base_url: https://api.openai.com/v1
    api_key_env: OPENAI_API_KEY
  # deepseek:
  #   base_url: https://api.deepseek.com
  #   api_key_env: DEEPSEEK_API_KEY
  # local:
  #   base_url: http://127.0.0.1:11434/v1
  #   limits:
  #     qwen3:32b: { context: 40960, output: 8192 }

# The first model is the default. id is the key the app selects a model by;
# name is what the endpoint is asked for.
models:
  - id: gpt-5.2
    name: gpt-5.2
    endpoint: openai
  # - id: deepseek-flash
  #   name: deepseek-flash
  #   endpoint: deepseek

# Agent-level permissions; workspaces and threads add rules on top.
settings:
  approvalPolicy: on-request # untrusted | on-request | never
  permissions:
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

memory:
  use: true
  generate: false
  # model: { id: memory, name: gpt-5.2, endpoint: openai }
`
