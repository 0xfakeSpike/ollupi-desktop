// System notifications and their switches in settings.

export const en = {
  approval: (tool: string) => `Waiting for your approval: ${tool}`,
  question: (question: string) => (question ? `Asks you: ${question}` : 'Has a question for you'),
  completed: 'Finished its turn',
  failed: (error: string) => (error ? `The turn failed: ${error}` : 'The turn failed'),

  settings: {
    title: 'Notifications',
    hint: 'Shown only while Ollupi is not in front. Clicking one opens its thread. The Dock badge counts the threads waiting for you.',
    kinds: {
      approval: 'An approval is needed',
      question: 'The agent asks a question',
      completed: 'A turn finishes',
      failed: 'A turn fails',
    },
  },
}

export const zh: typeof en = {
  approval: (tool) => `等你审批：${tool}`,
  question: (question) => (question ? `向你提问：${question}` : '有问题要问你'),
  completed: '这一轮完成了',
  failed: (error) => (error ? `这一轮失败了：${error}` : '这一轮失败了'),

  settings: {
    title: '通知',
    hint: '只在 Ollupi 不在前台时显示，点击打开对应会话。Dock 角标显示等你处理的会话数。',
    kinds: {
      approval: '需要审批',
      question: '代理向你提问',
      completed: '一轮完成',
      failed: '一轮失败',
    },
  },
}
