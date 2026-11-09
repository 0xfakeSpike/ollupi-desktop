// Words used across the app: actions, and how times, durations and tool
// calls are worded.

export const en = {
  cancel: 'Cancel',
  save: 'Save',
  close: 'Close',
  dismiss: 'Dismiss',
  edit: 'Edit',
  remove: 'Remove',
  reload: 'Reload',
  restartBackend: 'Restart backend',
  restartRunning: (running: number) => `${running} thread${running === 1 ? ' is' : 's are'} running. Restarting the backend stops commands they are executing. Continue?`,

  time: {
    now: 'just now',
    soon: 'in under a minute',
    ago: { minute: (n: number) => `${n}m`, hour: (n: number) => `${n}h`, day: (n: number) => `${n}d` },
    in: { minute: (n: number) => `in ${n}m`, hour: (n: number) => `in ${n}h`, day: (n: number) => `in ${n}d` },
  },
  span: {
    ms: (n: number) => `${n}ms`,
    s: (s: string) => `${s}s`,
    m: (m: number, s: number) => `${m}m ${s}s`,
  },
  usage: {
    input: (n: string) => `${n} in`,
    cached: (n: string) => `${n} cached`,
    cacheWrite: (n: string) => `${n} written to cache`,
    output: (n: string) => `${n} out`,
  },
  tool: {
    plan: 'Updated the plan',
    question: 'Asked you',
    unnamed: 'tool',
  },
  newThread: 'New thread',

  language: {
    system: (name: string) => `System (${name})`,
    names: { en: 'English', 'zh-CN': '简体中文' },
  },
  appearance: {
    scheme: 'Light or dark',
    schemes: { system: 'System', light: 'Light', dark: 'Dark' },
    palette: 'Palette',
    palettes: { indigo: 'Indigo', paper: 'Paper' },
  },
}

export const zh: typeof en = {
  cancel: '取消',
  save: '保存',
  close: '关闭',
  dismiss: '关闭',
  edit: '编辑',
  remove: '删除',
  reload: '刷新',
  restartBackend: '重启后端',
  restartRunning: (running) => `${running} 个会话正在运行。重启后端会停止它们正在执行的命令。要继续吗？`,

  time: {
    now: '刚刚',
    soon: '一分钟内',
    ago: { minute: (n) => `${n} 分钟前`, hour: (n) => `${n} 小时前`, day: (n) => `${n} 天前` },
    in: { minute: (n) => `${n} 分钟后`, hour: (n) => `${n} 小时后`, day: (n) => `${n} 天后` },
  },
  span: {
    ms: (n) => `${n} 毫秒`,
    s: (s) => `${s} 秒`,
    m: (m, s) => `${m} 分 ${s} 秒`,
  },
  usage: {
    input: (n) => `输入 ${n}`,
    cached: (n) => `缓存 ${n}`,
    cacheWrite: (n) => `写入缓存 ${n}`,
    output: (n) => `输出 ${n}`,
  },
  tool: {
    plan: '更新了计划',
    question: '向你提问',
    unnamed: '工具',
  },
  newThread: '新会话',

  language: {
    system: (name) => `跟随系统（${name}）`,
    names: { en: 'English', 'zh-CN': '简体中文' },
  },
  appearance: {
    scheme: '明暗',
    schemes: { system: '跟随系统', light: '浅色', dark: '深色' },
    palette: '配色',
    palettes: { indigo: '靛蓝', paper: '宣纸' },
  },
}
