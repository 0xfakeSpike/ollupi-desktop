import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  connect: vi.fn(),
  sync: vi.fn(),
  check: vi.fn(async () => {}),
  ready: { status: 'ready', url: 'ws://127.0.0.1:1/', token: 't', version: '' },
}))

vi.mock('@ollupi/client', () => ({ OllupiClient: { connect: h.connect }, errorMessage: String }))
vi.mock('../platform/desktop', () => ({ desktop: { backend: { onState: () => {}, state: async () => h.ready, check: h.check } } }))
vi.mock('./contract', () => ({ contractInspector: () => undefined }))
vi.mock('../domains/conversation', () => ({ conversationDomain: { sync: h.sync } }))
vi.mock('../domains/cron', () => ({ cronDomain: {} }))
vi.mock('../domains/models', () => ({ modelsDomain: {} }))
vi.mock('../domains/catalog', () => ({ catalogDomain: {} }))
vi.mock('../domains/notices', () => ({ noticesDomain: {} }))
vi.mock('../domains/notifications', () => ({ notificationsDomain: {} }))
vi.mock('../domains/requests', () => ({ requestsDomain: {} }))
vi.mock('../domains/settings', () => ({ settingsDomain: {} }))
vi.mock('../domains/profile', () => ({ profileDomain: {} }))
vi.mock('../domains/mcp', () => ({ mcpDomain: {} }))
vi.mock('../domains/skills', () => ({ skillsDomain: {} }))
vi.mock('../domains/threads', () => ({ threadsDomain: {} }))
vi.mock('../domains/tools', () => ({ toolsDomain: {} }))
vi.mock('../domains/environments', () => ({ environmentsDomain: {} }))
vi.mock('../domains/workspaces', () => ({ workspacesDomain: {} }))
vi.mock('../domains/todos', () => ({ todosDomain: {} }))

function fakeClient() {
  const closes: ((reason: string) => void)[] = []
  const client = {
    isClosed: false,
    protocolSha256: '',
    onClose: (listener: (reason: string) => void) => closes.push(listener),
    close: () => {
      if (client.isClosed) return
      client.isClosed = true
      closes.forEach((c) => c('closed'))
    },
  }
  return client
}

describe('session', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('keeps to one connect loop when the connection closes during a sync', async () => {
    const first = fakeClient()
    h.connect.mockResolvedValueOnce(first).mockImplementation(async () => fakeClient())
    h.sync.mockImplementationOnce(async () => {
      first.close()
      throw new Error('connection closed')
    })
    const { startSession } = await import('./session')

    await startSession()
    await vi.advanceTimersByTimeAsync(10_000)

    expect(h.connect).toHaveBeenCalledTimes(2)
    // The failed sync asks the main process why, as a refused remote would
    // only say so there.
    expect(h.check).toHaveBeenCalledTimes(1)
  })
})
