package config

// Template is written to <home>/config.yaml on first start.
const Template = `# Ollupi desktop backend. Restart the backend from the app after editing.
# This file is the same for every profile. The models are not in it: they
# are set in the app, under Settings → Models. Which model a profile starts
# and learns with, its permissions, MCP servers, skills, and whether memory
# is on are its own, set in the app.
name: ollupi

# Empty uses ollupi's default system prompt.
prompt: ""

# How many threads may run at once (default 32).
# slots: 32
`
