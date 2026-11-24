package config

// Template is written to <home>/config.yaml on first start.
const Template = `# Ollupi desktop backend. Restart the backend from the app after editing.
# This file is the same for every profile. Which model a profile starts and
# learns with, its permissions, MCP servers, and whether memory is on are its
# own, set in the app.
name: ollupi

# Empty uses ollupi's default system prompt.
prompt: ""

# The models this backend serves, each provider an API account. Every profile
# runs on them and chooses which; a model is selected as provider/name. limits
# is the context window and the most an answer may take; calls caps
# concurrent requests to that model; images lets it receive images.
providers:
  - id: openai
    type: openai
    base_url: https://api.openai.com/v1
    api_key: ""
    models:
      - name: gpt-5.2
        images: true
        limits: { context: 400000, output: 128000 }

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
#   profile: default # the profile the bot's sessions belong to
#   users: [ou_xxx]
#   profiles: {ou_xxx: default} # optional: whose open_id acts as which profile
#   workspace: ~/projects/app # new sessions' workspace; ~ is your home and a
#                             # relative path this file's folder; leave out for none
`
