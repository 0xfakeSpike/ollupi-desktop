// The memory screen: scopes, entries and the learning and use switches.

import type { MemoryFailureCode } from '@ollupi/protocol'

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
    /** What went wrong while learning, by the code ollupi gives the failure;
     * said of no time, as both the current failure and a skip use it. */
    failure: {
      model_request: 'the model could not be reached',
      invalid_response: "the model's reply could not be used",
      evidence: 'the conversation could not be read',
      storage: 'memories could not be saved',
    } satisfies Record<MemoryFailureCode, string>,
    retryAt: (reason: string, time: string, n: number) => `Learning failed: ${reason}; retrying at ${time} (retry ${n})`,
    retrySoon: (reason: string) => `Learning failed: ${reason}; retrying shortly`,
    /** Learning is off, so nothing retries until it is turned on. */
    retryWhenOn: (reason: string) => `Learning failed: ${reason}; it is retried once learning is on`,
    skipped: (n: number) => (n === 1 ? '1 entry could not be learned from and was skipped' : `${n} entries could not be learned from and were skipped`),
    lastSkip: (when: string, n: number) => (n === 1 ? `Last skipped ${when}: 1 entry` : `Last skipped ${when}: ${n} entries`),
    skipIn: 'In',
    someConversation: 'a conversation',
    skipReason: (reason: string) => `Why: ${reason}`,
  },
  entry: {
    /** Display names of the kinds ollupi gives memories. */
    kinds: { preference: 'preference', decision: 'decision', procedure: 'procedure', fact: 'fact' },
    editedByYou: 'edited by you',
    toGlobal: 'Move to global',
    toGlobalHint: 'Every conversation will use it; you can move it back',
    backTo: (place: string) => `Move back to ${place}`,
    /** What moving back means, by where the memory came from. */
    backToGeneralHint: 'Only conversations outside any workspace will use it',
    backToWorkspaceHint: (workspace: string) => `Only conversations in ${workspace} will use it`,
    from: (place: string) => `from ${place}`,
    forget: 'Forget',
    forgetConfirm: 'Forget this memory?',
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
    failure: {
      model_request: '请求模型失败',
      invalid_response: '模型返回的内容不合规',
      evidence: '读取对话内容出错',
      storage: '保存记忆出错',
    },
    retryAt: (reason, time, n) => `上次整理时${reason}，将在 ${time} 重试（第 ${n} 次）`,
    retrySoon: (reason) => `上次整理时${reason}，稍后重试`,
    retryWhenOn: (reason) => `上次整理时${reason}，开启学习后会重试`,
    skipped: (n) => `有 ${n} 条内容未能整理成记忆，已跳过`,
    lastSkip: (when, n) => `最近一次跳过：${when}，共 ${n} 条`,
    skipIn: '来自对话',
    someConversation: '一个对话',
    skipReason: (reason) => `原因：${reason}`,
  },
  entry: {
    kinds: { preference: '偏好', decision: '决定', procedure: '流程', fact: '事实' },
    editedByYou: '已由你编辑',
    toGlobal: '移到全局',
    toGlobalHint: '所有会话都会用到这条记忆，之后可以移回来',
    backTo: (place) => `移回${place}`,
    backToGeneralHint: '只在不属于任何工作区的会话里使用',
    backToWorkspaceHint: (workspace) => `只在「${workspace}」的会话里使用`,
    from: (place) => `来自${place}`,
    forget: '遗忘',
    forgetConfirm: '遗忘这条记忆？',
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
