// What the agent asks of the user: approvals and questions; and a thread's
// scheduled tasks.

export const en = {
  approval: {
    command: 'Allow this command?',
    tool: (tool: string) => `Allow ${tool}?`,
    commandOutside: 'Run this command outside the sandbox?',
    outsideConsequence: "It runs without the sandbox's limits: it can reach every file and network your account can.",
    arguments: 'arguments',
    serverArguments: (server: string) => `${server} · arguments`,
    decisions: {
      decline: 'Decline',
      // A session grant in ollupi lasts for the thread: the same call is not asked again.
      acceptForSession: 'Allow for this thread',
      accept: 'Allow once',
    },
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
    outsideConsequence: '它不受沙箱限制，能访问你的账号可访问的所有文件和网络。',
    arguments: '参数',
    serverArguments: (server) => `${server} · 参数`,
    decisions: {
      decline: '拒绝',
      acceptForSession: '在此会话中允许',
      accept: '允许一次',
    },
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
