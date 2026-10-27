// What the agent asks of the user: approvals and questions; and a thread's
// scheduled tasks.

export const en = {
  approval: {
    command: 'Allow this command?',
    tool: (tool: string) => `Allow ${tool}?`,
    outsideSandbox: 'runs outside the sandbox',
    arguments: 'arguments',
    serverArguments: (server: string) => `${server} · arguments`,
    decisions: {
      decline: 'Decline',
      // A session grant in ollupi lasts for the thread: the same call is not asked again.
      acceptForSession: 'Allow for this thread',
      accept: 'Allow once',
    },
  },
  questions: {
    submit: 'Submit',
    ownAnswer: 'Or type your own answer',
    answer: 'Your answer',
  },
  cron: {
    title: 'Scheduled tasks',
    empty: 'No scheduled tasks',
    emptyHint: 'Tasks send a message to this thread on a schedule. The agent can also create them when you ask it to.',
    paused: 'Paused',
    next: (when: string, at: string) => `Next ${when} · ${at}`,
    resume: 'Resume',
    pause: 'Pause',
    delete: 'Delete',
    deleteConfirm: (name: string) => `Delete the task “${name}”?`,
    newTask: 'New task',
    name: 'Name',
    nameHint: 'Unique in this thread.',
    schedule: 'Schedule',
    scheduleHint: 'Cron fields or @daily, @hourly…, in local time.',
    message: 'Message',
    messagePlaceholder: 'Summarize what changed in the repository since yesterday.',
    create: 'Create task',
  },
}

export const zh: typeof en = {
  approval: {
    command: '允许运行这条命令？',
    tool: (tool) => `允许 ${tool}？`,
    outsideSandbox: '在沙箱外运行',
    arguments: '参数',
    serverArguments: (server) => `${server} · 参数`,
    decisions: {
      decline: '拒绝',
      acceptForSession: '在此会话中允许',
      accept: '允许一次',
    },
  },
  questions: {
    submit: '提交',
    ownAnswer: '或输入你自己的回答',
    answer: '你的回答',
  },
  cron: {
    title: '定时任务',
    empty: '没有定时任务',
    emptyHint: '定时任务按设定的时间向此会话发送消息。你也可以让代理来创建。',
    paused: '已暂停',
    next: (when, at) => `下次：${when} · ${at}`,
    resume: '恢复',
    pause: '暂停',
    delete: '删除',
    deleteConfirm: (name) => `删除任务“${name}”？`,
    newTask: '新建任务',
    name: '名称',
    nameHint: '在此会话中唯一。',
    schedule: '执行时间',
    scheduleHint: 'Cron 字段或 @daily、@hourly…，按本地时间。',
    message: '消息',
    messagePlaceholder: '总结一下从昨天到现在仓库里的变化。',
    create: '创建任务',
  },
}
