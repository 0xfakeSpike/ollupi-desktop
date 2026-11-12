// What the agent asks of the user: approvals and questions; and a thread's
// scheduled tasks.

export const en = {
  approval: {
    command: 'Allow this command?',
    tool: (tool: string) => `Allow ${tool}?`,
    commandFullAccess: 'Give this command full access?',
    editFile: 'Make this change to the file?',
    createFile: 'Create this file?',
    editsOnly: 'Only this file changes; the exact change is in the details.',
    createsOnly: 'Only this one new file is written.',
    details: 'Details',
    runsIn: (folder: string) => `Runs in the “${folder}” folder.`,
    folder: 'Folder',
    copyCommand: 'Copy the command',
    hideDetails: 'Hide details',
    readFile: 'Read this file?',
    glob: 'Find these files?',
    grep: 'Search these files?',
    fullAccessConsequence: 'It runs on this computer without the usual limits: it can reach every file and network your account can.',
    arguments: 'arguments',
    serverArguments: (server: string) => `${server} · arguments`,
    decisions: {
      decline: 'Not now',
      // A session grant in ollupi lasts for the thread: the same call is not asked again.
      acceptForSession: 'Yes, for this whole thread',
      accept: 'Yes',
    },
    /** acceptAlways: ollupi adds the suggested rules to the workspace's
     * Always allow, or to the thread's when it has no workspace. */
    alwaysIn: (workspace: string) => `Always, in ${workspace}`,
    alwaysInThread: 'Always, in this thread',
    alwaysInParent: 'Always, in the parent thread',
    alwaysAdds: 'Always allowing adds',
    /** accept, when the command asks to lift this computer's limits. */
    allowFullAccess: 'Allow full access',
  },
  questions: {
    submit: 'Answer',
    skip: 'Skip',
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
    commandFullAccess: '允许这条命令完全访问？',
    editFile: '允许这样修改文件？',
    createFile: '允许新建这个文件？',
    editsOnly: '只改这一个文件，具体改动在细节里。',
    createsOnly: '只新建这一个文件。',
    details: '看细节',
    runsIn: (folder) => `在「${folder}」文件夹里运行。`,
    folder: '文件夹',
    copyCommand: '复制命令',
    hideDetails: '收起细节',
    readFile: '允许读取这个文件？',
    glob: '允许查找这些文件？',
    grep: '允许搜索这些文件？',
    fullAccessConsequence: '它会在这台电脑上不受平时的限制运行：你的账号能访问的文件和网络，它都能访问。',
    arguments: '参数',
    serverArguments: (server) => `${server} · 参数`,
    decisions: {
      decline: '先不要',
      acceptForSession: '这件事里都可以',
      accept: '可以',
    },
    alwaysIn: (workspace) => `以后在「${workspace}」里都可以`,
    alwaysInThread: '以后这件事里都可以',
    alwaysInParent: '以后上级那件事里都可以',
    alwaysAdds: '总是允许会添加',
    allowFullAccess: '允许完全访问',
  },
  questions: {
    submit: '回答',
    skip: '跳过',
    ownAnswer: '或输入你自己的回答',
    answer: '你的回答',
    many: (n) => `有 ${n} 个问题需要你回答`,
    progress: (answered, total) => `已回答 ${answered}/${total}`,
  },
}
