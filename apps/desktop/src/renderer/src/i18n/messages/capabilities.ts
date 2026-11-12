// The capabilities screen: what the agent can do, from skills, MCP servers
// and the tools it has built in, worded for someone who does not write code.

export const en = {
  title: 'Capabilities',
  tabs: {
    skills: {
      label: 'Skills',
      description:
        'A skill is a written way of doing one kind of task, such as “write the weekly report in our template”. It reads every skill’s summary and picks one up by itself when it fits.',
    },
    mcp: {
      label: 'MCP',
      description: 'MCP servers connect it to other apps and services, such as GitHub or Notion, so it can use them too.',
    },
    tools: {
      label: 'Built-in tools',
      description: 'What it can do out of the box, by kind. Open a group to see its tools by the names permission rules use.',
    },
  },
  /** The built-in tool groups, by the provider ollupi or this app names. */
  groups: {
    workspace: { name: 'Files and commands', about: 'Reads and edits the files in your workspace, and runs commands there.' },
    web: { name: 'Web', about: 'Opens a web address and reads what is there.' },
    browser: { name: 'Browser', about: 'Looks at pages, clicks and fills in forms in the built-in browser, where you can watch and take over.' },
    plan: { name: 'Plan', about: 'Writes a plan for work with several steps and keeps it up to date.' },
    user_input: { name: 'Asking you', about: 'Stops to ask you when a choice is yours.' },
    subagent: { name: 'Helpers', about: 'Hands part of the work to a helper that works alongside it.' },
    memory: { name: 'Memory', about: 'Looks up and writes down what it knows about you.' },
    skills: { name: 'Skills', about: 'Opens a skill when it needs one.' },
    cron: { name: 'Scheduled tasks', about: 'Creates, pauses and deletes scheduled tasks.' },
    context: { name: 'Long output', about: 'Reads back output too long to keep in the conversation at once.' },
    tool_registry: { name: 'Finding tools', about: 'Looks up which tools there are and loads the ones it needs.' },
  },
  toolCount: (n: number) => (n === 1 ? '1 tool' : `${n} tools`),
}

export const zh: typeof en = {
  title: '能力',
  tabs: {
    skills: {
      label: '技能',
      description: '技能是写好的一种做事方法，比如“按公司模板写周报”。它看得到每个技能的简介，用得上时会自己拿出来用。',
    },
    mcp: {
      label: 'MCP',
      description: 'MCP 服务器把它接到别的应用和服务上，比如 GitHub、Notion，让它也能用这些。',
    },
    tools: {
      label: '内置工具',
      description: '它本来就会做的事，按用途分组。点开一组，能看到每个工具在权限规则里的名字。',
    },
  },
  groups: {
    workspace: { name: '文件和命令', about: '读写你工作区里的文件，在那里运行命令。' },
    web: { name: '网页', about: '打开一个网址，读上面的内容。' },
    browser: { name: '浏览器', about: '在内置浏览器里看网页、点按钮、填表，你可以看着，也可以接手。' },
    plan: { name: '计划', about: '把多步骤的事列成计划，边做边更新。' },
    user_input: { name: '问你', about: '轮到你做决定时，停下来问你。' },
    subagent: { name: '帮手', about: '把一部分工作交给帮手，一起做。' },
    memory: { name: '记忆', about: '查找和记下关于你的事。' },
    skills: { name: '技能', about: '需要时打开一个技能。' },
    cron: { name: '定时任务', about: '创建、暂停和删除定时任务。' },
    context: { name: '长输出', about: '回头读那些太长、没法一次放进对话的输出。' },
    tool_registry: { name: '找工具', about: '查有哪些工具，按需载入。' },
  },
  toolCount: (n) => `${n} 个工具`,
}
