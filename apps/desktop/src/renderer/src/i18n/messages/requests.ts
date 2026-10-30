// What the agent asks of the user: approvals and questions; and a thread's
// scheduled tasks.

export const en = {
  approval: {
    command: 'Allow this command?',
    tool: (tool: string) => `Allow ${tool}?`,
    commandOutside: 'Run this command outside the sandbox?',
    editFile: 'Make this change to the file?',
    createFile: 'Create this file?',
    outsideConsequence: "It runs without the sandbox's limits: it can reach every file and network your account can.",
    arguments: 'arguments',
    serverArguments: (server: string) => `${server} · arguments`,
    decisions: {
      decline: 'Decline',
      // A session grant in ollupi lasts for the thread: the same call is not asked again.
      acceptForSession: 'Allow for this thread',
      accept: 'Allow once',
    },
    /** acceptAlways: ollupi adds the suggested rules to the workspace's
     * Always allow, or to the thread's when it has no workspace. */
    alwaysIn: (workspace: string) => `Always allow in ${workspace}`,
    alwaysInThread: 'Always allow in this thread',
    alwaysInParent: 'Always allow in the parent thread',
    alwaysAdds: 'Always allowing adds',
    /** accept, when the call leaves the sandbox. */
    runOutside: 'Run outside sandbox',
  },
  questions: {
    submit: 'Submit',
    ownAnswer: 'Or type your own answer',
    answer: 'Your answer',
    many: (n: number) => `${n} questions for you`,
    progress: (answered: number, total: number) => `${answered} of ${total} answered`,
  },
}

export const zh: typeof en = {
  approval: {
    command: '允许运行这条命令？',
    tool: (tool) => `允许 ${tool}？`,
    commandOutside: '在沙箱外运行这条命令？',
    editFile: '允许这样修改文件？',
    createFile: '允许新建这个文件？',
    outsideConsequence: '它不受沙箱限制，能访问你的账号可访问的所有文件和网络。',
    arguments: '参数',
    serverArguments: (server) => `${server} · 参数`,
    decisions: {
      decline: '拒绝',
      acceptForSession: '在此会话中允许',
      accept: '允许一次',
    },
    alwaysIn: (workspace) => `在「${workspace}」中总是允许`,
    alwaysInThread: '在此会话中总是允许',
    alwaysInParent: '在上级会话中总是允许',
    alwaysAdds: '总是允许会添加',
    runOutside: '在沙箱外运行',
  },
  questions: {
    submit: '提交',
    ownAnswer: '或输入你自己的回答',
    answer: '你的回答',
    many: (n) => `有 ${n} 个问题需要你回答`,
    progress: (answered, total) => `已回答 ${answered}/${total}`,
  },
}
