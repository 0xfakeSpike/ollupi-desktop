// Adding a workspace: a folder chosen where its environment is, which may
// be another machine than the window's.

export const en = {
  add: {
    title: 'Add workspace',
    description: 'Pick a folder on the environment’s machine. Conversations in the workspace work on its files.',
    environment: 'Environment',
    add: 'Add this folder',
  },
  browser: {
    path: 'Folder',
    up: 'Up one folder',
    newFolder: 'New folder',
    folderName: 'Folder name',
    make: 'Make',
    empty: 'No folders in here.',
    loading: 'Reading the folders',
    unreadable: 'This folder cannot be read.',
  },
}

export const zh: typeof en = {
  add: {
    title: '添加工作区',
    description: '在环境所在的机器上选一个文件夹。工作区里的对话会处理这个文件夹里的文件。',
    environment: '环境',
    add: '添加这个文件夹',
  },
  browser: {
    path: '文件夹',
    up: '上一级',
    newFolder: '新建文件夹',
    folderName: '文件夹名',
    make: '新建',
    empty: '这里没有文件夹。',
    loading: '正在读取文件夹',
    unreadable: '读不了这个文件夹。',
  },
}
