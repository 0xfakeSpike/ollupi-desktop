// The app's frame: the sidebar, the connection, the backend screen and the
// contract banner.

import type { ReactNode } from 'react'

export const en = {
  sidebar: {
    newThread: 'New thread',
    addWorkspace: 'Add workspace',
    memory: 'Memory',
    settings: 'Settings',
    threads: 'Threads',
    noThreads: 'No threads yet',
    showLess: 'Show less',
    showMore: (n: number) => `Show ${n} more`,
    waiting: 'Waiting for you',
    revealFolder: 'Reveal folder',
    workspaceSettings: 'Workspace settings',
    archive: (name: string) => `Archive ${name}`,
    newThreadIn: (name: string) => `New thread in ${name}`,
    archived: (n: number) => `Archived · ${n}`,
    restore: (name: string) => `Restore ${name}`,
  },
  connection: {
    connected: 'Connected',
    starting: 'Backend starting…',
    stopped: 'Backend stopped',
    reconnecting: 'Reconnecting…',
  },
  backend: {
    starting: 'Starting the ollupi backend…',
    stopped: 'The backend is stopped.',
    reconnecting: 'Reconnecting…',
    connecting: 'Connecting…',
    failed: 'The backend could not start',
    configuredIn: (path: ReactNode): ReactNode => <>The backend is configured in {path}. Fix it there, then restart the backend.</>,
    openConfig: 'Open config',
    log: 'Backend log',
    failure: {
      timeout: (s: number) => `the backend did not report ready within ${s}s`,
      spawn: (binary: string, error: string) => `cannot start ${binary}: ${error}`,
      exited: (how: string) => `the backend exited unexpectedly (${how})`,
      reported: 'the backend failed to start',
    },
  },
  contractBanner: (server: string, ui: string) =>
    `The backend and the app were built from different ollupi protocol versions (backend ${server}, app ${ui}). Rebuild the backend or regenerate the protocol.`,
}

export const zh: typeof en = {
  sidebar: {
    newThread: '新会话',
    addWorkspace: '添加工作区',
    memory: '记忆',
    settings: '设置',
    threads: '会话',
    noThreads: '还没有会话',
    showLess: '收起',
    showMore: (n) => `再显示 ${n} 个`,
    waiting: '等待你处理',
    revealFolder: '打开文件夹',
    workspaceSettings: '工作区设置',
    archive: (name) => `归档 ${name}`,
    newThreadIn: (name) => `在 ${name} 中新建会话`,
    archived: (n) => `已归档 · ${n}`,
    restore: (name) => `恢复 ${name}`,
  },
  connection: {
    connected: '已连接',
    starting: '后端启动中…',
    stopped: '后端已停止',
    reconnecting: '正在重新连接…',
  },
  backend: {
    starting: '正在启动 ollupi 后端…',
    stopped: '后端已停止。',
    reconnecting: '正在重新连接…',
    connecting: '正在连接…',
    failed: '后端无法启动',
    configuredIn: (path) => <>后端的配置在 {path}。请在那里修改，然后重启后端。</>,
    openConfig: '打开配置',
    log: '后端日志',
    failure: {
      timeout: (s) => `后端在 ${s} 秒内没有报告就绪`,
      spawn: (binary, error) => `无法启动 ${binary}：${error}`,
      exited: (how) => `后端意外退出（${how}）`,
      reported: '后端启动失败',
    },
  },
  contractBanner: (server, ui) => `后端和应用基于不同版本的 ollupi 协议构建（后端 ${server}，应用 ${ui}）。请重新构建后端或重新生成协议。`,
}
