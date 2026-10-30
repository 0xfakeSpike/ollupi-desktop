// The search screen: one query over conversations, messages, scheduled
// tasks and memories.

export const en = {
  title: 'Search',
  placeholder: 'Search conversations, messages, tasks and memories',
  scope: 'Where',
  everywhere: 'Everywhere',
  hint: 'Every word must match. Results are grouped by what they are; open one to go to it.',
  none: (query: string) => `Nothing matches “${query}”.`,
  groups: {
    threads: 'Conversations',
    messages: 'Messages',
    tasks: 'Scheduled tasks',
    memories: 'Memories',
  },
  you: 'You',
  agent: 'Agent',
  archived: 'Archived',
  noWorkspace: 'No workspace',
  inThread: (title: string) => `in ${title}`,
}

export const zh: typeof en = {
  title: '搜索',
  placeholder: '搜索会话、消息、定时任务和记忆',
  scope: '范围',
  everywhere: '全部',
  hint: '每个词都要匹配。结果按类别分组，点击即可跳过去。',
  none: (query) => `没有找到与“${query}”匹配的内容。`,
  groups: {
    threads: '会话',
    messages: '消息',
    tasks: '定时任务',
    memories: '记忆',
  },
  you: '你',
  agent: '代理',
  archived: '已归档',
  noWorkspace: '无工作区',
  inThread: (title) => `在 ${title} 中`,
}
