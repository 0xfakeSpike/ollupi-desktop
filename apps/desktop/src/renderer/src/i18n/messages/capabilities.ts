// The capabilities screen: what the agent can do, from skills, MCP servers
// and the tools it has built in.

export const en = {
  title: 'Capabilities',
  tabs: {
    skills: {
      label: 'Skills',
      description:
        'A skill is a folder with a SKILL.md: a name, a description of when to use it, and instructions the agent follows once it activates the skill. The agent sees every description and loads the rest when it needs it.',
    },
    mcp: {
      label: 'MCP',
      description: 'MCP servers give the agent their tools as <name>__<tool>. The backend connects them at start and skips one it cannot use.',
    },
    tools: {
      label: 'Built-in tools',
      description:
        "The tools that come with the agent, from ollupi and this app; MCP servers' tools are listed under MCP. Permission rules name tools by these names.",
    },
  },
}

export const zh: typeof en = {
  title: '能力',
  tabs: {
    skills: {
      label: '技能',
      description:
        '技能是一个带 SKILL.md 的文件夹：名称、何时使用的描述，以及 agent 启用该技能后遵循的指令。agent 能看到所有技能的描述，需要时再加载其余内容。',
    },
    mcp: {
      label: 'MCP',
      description: 'MCP 服务器以 <name>__<tool> 的名字为 agent 提供工具。后端在启动时连接它们，无法使用的会被跳过。',
    },
    tools: {
      label: '内置工具',
      description: 'agent 自带的工具，来自 ollupi 和这个应用；MCP 服务器的工具列在 MCP 里。权限规则以这些名字指定工具。',
    },
  },
}
