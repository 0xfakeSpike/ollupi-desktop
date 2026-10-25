package config

// Template is written to <home>/config.yaml on first run.
const Template = `# Ollupi desktop configuration. Restart the backend from the app after editing.
name: ollupi

# Empty uses ollupi's default system prompt.
prompt: ""

# OpenAI-compatible endpoints. Prefer api_key_env over api_key so the key stays
# out of this file. calls caps concurrent requests to the endpoint (default 4).
# Declare limits for models ollupi does not know.
endpoints:
  openai:
    base_url: https://api.openai.com/v1
    api_key_env: OPENAI_API_KEY
  # local:
  #   base_url: http://127.0.0.1:11434/v1
  #   limits:
  #     qwen3:32b: { context: 40960, output: 8192 }

# The first model is the default for new turns. id is the unique key the app
# selects a model by; name is what is sent to the endpoint.
models:
  - id: gpt-5.2
    name: gpt-5.2
    endpoint: openai
  # - id: qwen-local
  #   name: qwen3:32b
  #   endpoint: local

# Agent-level permission defaults; workspaces and threads can add rules on top.
settings:
  approvalPolicy: on-request   # untrusted | on-request | never
  permissions:
    allow: []
    ask: []
    deny: []

shell:
  enabled: true
  sandbox_mode: workspace-write   # read-only | workspace-write | full-access
  command_timeout_sec: 60
  network: false

memory:
  use: true
  generate: false
  # model: { id: memory, name: gpt-5.2, endpoint: openai }
`
