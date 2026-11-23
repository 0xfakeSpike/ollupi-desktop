package config

// Template is written to <home>/config.yaml on first start.
const Template = `# Ollupi desktop backend. Restart the backend from the app after editing.
# Permissions, MCP servers, and whether memory is on and learns are set in
# the app.
name: ollupi

# Empty uses ollupi's default system prompt.
prompt: ""

# Models, grouped by the API that serves them. type is the API it speaks:
# openai (any OpenAI-compatible API), anthropic or gemini. A model is
# selected as provider/name, so providers need distinct names and may serve
# models of the same name. The first model is the default. api_key is the
# API's key; leave it out for an API without one. limits is the model's
# context window and the most an answer may take of it, in tokens, with input
# for a model that takes less input than the window leaves. calls caps
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

# A second profile's models, and the model that learns its memory. The first
# profile's models are the ones above; every profile's API keys are its own.
# users:
#   - id: work
#     models:
#       - provider: openai
#         type: openai
#         api_key: sk-...
#         names:
#           - name: gpt-5.2
#             limits: { context: 400000, output: 128000 }
#     memory:
#       model: openai/gpt-5.2

# How many threads may run at once (default 32).
# slots: 32

# Commands and file edits, in the sandbox.
workspace:
  enabled: true
  sandbox_mode: workspace-write # read-only | workspace-write | full-access
  command_timeout_sec: 60
  network: false

# Agent Skills: a folder holding one folder per skill, each with a SKILL.md,
# relative to this file's folder. Leave it out to turn skills off.
skills_dir: skills

# The model (provider/name, one of those above) that learns memories from
# finished turns, sharing its calls, while memory and learning are on in the
# app. Leave it out to learn none.
# memory:
#   model: openai/gpt-5.2

# A Feishu bot to drive sessions from your phone: a self-built app with
# events and card callbacks received over a long connection. Message it
# once and it answers with your open_id, which goes under users.
# feishu:
#   app_id: cli_xxx
#   app_secret: xxx
#   profile: default # the user the bot's sessions belong to
#   users: [ou_xxx]
#   workspace: ~/projects/app # new sessions' workspace; ~ is your home and a
#                             # relative path this file's folder; leave out for none
`
