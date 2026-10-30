// What a failed action's notice says it was doing, and the reasons the
// config domains give for refusing a change.

export const en = {
  failed: (what: string, why: string) => `${what}: ${why}`,
  notConnected: 'Not connected to the backend',
  contractMismatch: (where: string, problem: string) => `Contract mismatch: ${where} ${problem}`,
  configUnchanged: (why: string) => `config.yaml was not changed: ${why}`,
  skillsUnchanged: (why: string) => `The skills folder was not changed: ${why}`,

  workspace: {
    add: 'Could not add the workspace',
    rename: 'Could not rename the workspace',
    archive: 'Could not archive the workspace',
    restore: 'Could not restore the workspace',
    permissions: 'Could not save the workspace permissions',
  },
  thread: {
    open: 'Could not open the thread',
    earlier: 'Could not load earlier messages',
    start: 'Could not start the thread',
    send: 'Could not send the message',
    stop: 'Could not stop the turn',
    permissions: 'Could not save the thread permissions',
    rename: 'Could not rename the thread',
    archive: 'Could not archive the thread',
    restore: 'Could not restore the thread',
    delete: 'Could not delete the thread',
    export: 'Could not export the thread',
    archived: 'Could not list archived threads',
  },
  search: 'Could not search',
  cron: {
    create: 'Could not create the task',
    pause: 'Could not pause the task',
    resume: 'Could not resume the task',
    delete: 'Could not delete the task',
  },
  memory: {
    load: 'Could not load memory',
    save: 'Could not save the memory',
    move: 'Could not move the memory',
    forget: 'Could not forget the memory',
  },
  settings: {
    redaction: 'Could not change redaction',
  },
  config: {
    read: 'Could not read config.yaml',
    save: 'Could not save config.yaml',
    mcpStatus: 'Could not read the MCP servers',
  },
  files: {
    list: 'Could not read the folder',
    read: 'Could not read the file',
  },
  changes: {
    list: 'Could not read the changes',
    diff: 'Could not read the diff',
    stage: 'Could not stage the changes',
    unstage: 'Could not unstage the changes',
    discard: 'Could not discard the changes',
    commit: 'Could not commit',
  },
  skills: {
    load: 'Could not read the skills',
    read: 'Could not read SKILL.md',
    save: 'Could not save the skill',
    remove: 'Could not remove the skill',
  },

  mcpName: {
    format: "1 to 32 letters, digits, '-' or '_', starting with a letter or digit, without '__'.",
    taken: 'Another server has this name.',
    builtin: 'The app’s built-in browser has this name.',
  },
  skillName: {
    format: '1 to 64 lowercase letters, digits and single hyphens, not starting or ending with one.',
    taken: 'Another skill has this name.',
  },
  modelRemoval: {
    lastModel: 'The backend needs at least one model.',
    memoryModel: 'Memory uses this model to extract memories. Choose another one on the Memory screen first.',
    memoryModels: 'Memory uses one of these models to extract memories. Choose another one on the Memory screen first.',
  },
}

export const zh: typeof en = {
  failed: (what, why) => `${what}：${why}`,
  notConnected: '未连接到后端',
  contractMismatch: (where, problem) => `协议不一致：${where} ${problem}`,
  configUnchanged: (why) => `config.yaml 未修改：${why}`,
  skillsUnchanged: (why) => `技能文件夹未修改：${why}`,

  workspace: {
    add: '无法添加工作区',
    rename: '无法重命名工作区',
    archive: '无法归档工作区',
    restore: '无法恢复工作区',
    permissions: '无法保存工作区权限',
  },
  thread: {
    open: '无法打开会话',
    earlier: '无法加载更早的消息',
    start: '无法开始会话',
    send: '无法发送消息',
    stop: '无法停止这一轮',
    permissions: '无法保存会话权限',
    rename: '无法重命名会话',
    archive: '无法归档会话',
    restore: '无法恢复会话',
    delete: '无法删除会话',
    export: '无法导出会话',
    archived: '无法列出已归档的会话',
  },
  search: '无法搜索',
  cron: {
    create: '无法创建任务',
    pause: '无法暂停任务',
    resume: '无法恢复任务',
    delete: '无法删除任务',
  },
  memory: {
    load: '无法加载记忆',
    save: '无法保存记忆',
    move: '无法移动记忆',
    forget: '无法遗忘记忆',
  },
  settings: {
    redaction: '无法更改脱敏设置',
  },
  config: {
    read: '无法读取 config.yaml',
    save: '无法保存 config.yaml',
    mcpStatus: '无法读取 MCP 服务器',
  },
  files: {
    list: '无法读取文件夹',
    read: '无法读取文件',
  },
  changes: {
    list: '无法读取改动',
    diff: '无法读取差异',
    stage: '无法暂存改动',
    unstage: '无法取消暂存',
    discard: '无法丢弃改动',
    commit: '无法提交',
  },
  skills: {
    load: '无法读取技能',
    read: '无法读取 SKILL.md',
    save: '无法保存技能',
    remove: '无法删除技能',
  },

  mcpName: {
    format: '1 到 32 个字母、数字、“-”或“_”，以字母或数字开头，不能包含“__”。',
    taken: '已有服务器使用这个名称。',
    builtin: '这个名称是 app 内置浏览器的。',
  },
  skillName: {
    format: '1 到 64 个小写字母、数字或单个连字符，不能以连字符开头或结尾。',
    taken: '已有技能使用这个名称。',
  },
  modelRemoval: {
    lastModel: '后端至少需要一个模型。',
    memoryModel: '记忆用这个模型提取记忆。请先在记忆页面选择其他模型。',
    memoryModels: '记忆用其中一个模型提取记忆。请先在记忆页面选择其他模型。',
  },
}
