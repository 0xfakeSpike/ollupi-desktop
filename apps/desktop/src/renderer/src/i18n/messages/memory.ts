// The memory screen: scopes, entries and the learning and use switches.

export const en = {
  screen: {
    title: 'Memory',
    scope: 'Scope',
    global: 'Global',
    general: 'No workspace',
    emptyHere: 'Nothing remembered in this scope',
    emptyHereHint:
      'Memories are kept globally, for conversations outside workspaces, or per workspace; other scopes have some. Choose one on the left.',
    emptyYet: 'Nothing remembered yet',
    emptyYetHint: 'Memories are distilled from finished turns while learning is on.',
  },
  status: {
    used: 'used in conversations',
    notUsed: 'not used in conversations',
    learningOn: 'learning on',
    learningOff: 'learning off',
    active: (n: number) => `${n} active`,
    pending: (n: number) => (n === 1 ? '1 turn to learn from' : `${n} turns to learn from`),
  },
  entry: {
    /** Display names of the kinds ollupi gives memories. */
    kinds: { preference: 'preference', decision: 'decision', procedure: 'procedure', fact: 'fact' },
    editedByYou: 'edited by you',
    move: 'Move to another scope',
    forget: 'Forget',
    forgetConfirm: 'Forget this memory?',
  },
  moveTo: {
    label: 'Move to',
    select: 'Scope to move to',
    move: 'Move',
  },
  settings: {
    unreadable: 'config.yaml cannot be read:',
    learn: 'Learn from conversations',
    learnHint: "After each finished turn, a model distills what is worth remembering. This uses the model's tokens.",
    model: 'Model that extracts memories',
    modelNeeded: 'Choose a model to turn learning on.',
    chooseModel: 'Choose a model',
    use: 'Use memories in conversations',
    useHint: 'Each conversation starts with the memories that fit in its context, and the agent can search the rest.',
    restarts: 'Saving restarts the backend, which reads these at start.',
    stale: 'config.yaml differs from what the backend is using.',
    saveAndRestart: 'Save and restart',
  },
}

export const zh: typeof en = {
  screen: {
    title: '记忆',
    scope: '范围',
    global: '全局',
    general: '无工作区',
    emptyHere: '这个范围里还没有记忆',
    emptyHereHint: '记忆按全局、工作区之外的会话或各个工作区分别保存；其他范围里有记忆，可在左侧选择。',
    emptyYet: '还没有记忆',
    emptyYetHint: '开启学习后，记忆会从已完成的轮中提炼出来。',
  },
  status: {
    used: '在会话中使用',
    notUsed: '不在会话中使用',
    learningOn: '学习已开启',
    learningOff: '学习已关闭',
    active: (n) => `${n} 条有效`,
    pending: (n) => `${n} 轮待学习`,
  },
  entry: {
    kinds: { preference: '偏好', decision: '决定', procedure: '流程', fact: '事实' },
    editedByYou: '已由你编辑',
    move: '移到其他范围',
    forget: '遗忘',
    forgetConfirm: '遗忘这条记忆？',
  },
  moveTo: {
    label: '移到',
    select: '要移到的范围',
    move: '移动',
  },
  settings: {
    unreadable: '无法读取 config.yaml：',
    learn: '从会话中学习',
    learnHint: '每轮结束后，由模型提炼值得记住的内容。这会消耗该模型的 token。',
    model: '提取记忆的模型',
    modelNeeded: '选择一个模型以开启学习。',
    chooseModel: '选择模型',
    use: '在会话中使用记忆',
    useHint: '每个会话开始时会带上其上下文能容纳的记忆，其余的由代理按需搜索。',
    restarts: '保存会重启后端，后端在启动时读取这些设置。',
    stale: 'config.yaml 与后端正在使用的设置不一致。',
    saveAndRestart: '保存并重启',
  },
}
