// The capabilities screen: what the agent can do, from skills, MCP servers
// and the tools they and the backend give it.

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
    tools: { label: 'Tools', description: 'Everything the agent can call. Permission rules name these tools.' },
  },
}

export const zh: typeof en = {
  title: '能力',
  tabs: {
    skills: {
      label: '技能',
      description:
        '技能是一个带 SKILL.md 的文件夹：名称、何时使用的描述，以及代理启用该技能后遵循的指令。代理能看到所有技能的描述，需要时再加载其余内容。',
    },
    mcp: {
      label: 'MCP',
      description: 'MCP 服务器以 <name>__<tool> 的名字为代理提供工具。后端在启动时连接它们，无法使用的会被跳过。',
    },
    tools: { label: '工具', description: '代理可以调用的全部工具。权限规则以这些名字指定工具。' },
  },
}
