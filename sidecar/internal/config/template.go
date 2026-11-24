package config

// Template is written to <home>/config.yaml on first start.
const Template = `# Ollupi desktop backend. Restart the backend from the app after editing.
# Permissions, MCP servers, and whether memory is on and learns are set in
# the app.
name: ollupi
schema_version: 2

# Empty uses ollupi's default system prompt.
prompt: ""

# API accounts shared by profiles. Models that profiles both select use the
# same client and concurrency limit. limits is the context window and the most
# an answer may take; calls caps concurrent requests to that model; images
# lets it receive images.
credentials:
  - id: openai
    type: openai
    base_url: https://api.openai.com/v1
    api_key: ""
    models:
      - name: gpt-5.2
        images: true
        limits: { context: 400000, output: 128000 }

# Profiles the app can switch between. Each names the models it may run in
# order; the first is its default. Its learning model must be one of them.
profiles:
  - id: default
    name: ""
    color: stone
    models: [openai/gpt-5.2]
    # The model that learns memories from finished turns while memory and
    # learning are on. Leave it out to learn none.
    # memory:
    #   model: openai/gpt-5.2
  # - id: work
  #   name: Work
  #   color: teal
  #   models: [openai/gpt-5.2]
  #   memory:
  #     model: openai/gpt-5.2

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

# A Feishu bot to drive sessions from your phone: a self-built app with
# events and card callbacks received over a long connection. Message it
# once and it answers with your open_id, which goes under users.
# feishu:
#   app_id: cli_xxx
#   app_secret: xxx
#   profile: default # the user the bot's sessions belong to
#   users: [ou_xxx]
#   profiles: {ou_xxx: default} # optional: whose open_id acts as which profile
#   workspace: ~/projects/app # new sessions' workspace; ~ is your home and a
#                             # relative path this file's folder; leave out for none
`
