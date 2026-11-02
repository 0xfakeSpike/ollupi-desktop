import { describe, expect, it } from 'vitest'
import { feishuFields, parseUsers, removeFeishu, saveFeishu } from './feishuConfig'

describe('feishu config', () => {
  it('reads an absent section as an empty form', () => {
    expect(feishuFields(undefined)).toEqual({ appId: '', appSecret: '', domain: 'feishu', users: '', workspace: '' })
  })

  it('splits open_ids on lines, spaces and commas, once each', () => {
    expect(parseUsers(' ou_a\nou_b, ou_c，ou_a \n')).toEqual(['ou_a', 'ou_b', 'ou_c'])
  })

  it('writes the section without its defaults', () => {
    expect(saveFeishu({ appId: ' cli_x ', appSecret: 's', domain: 'feishu', users: '', workspace: '' })).toEqual([
      { kind: 'set', path: ['feishu'], value: { app_id: 'cli_x', app_secret: 's' } },
    ])
    expect(saveFeishu({ appId: 'cli_x', appSecret: 's', domain: 'lark', users: 'ou_a', workspace: '/code/app' })).toEqual([
      { kind: 'set', path: ['feishu'], value: { app_id: 'cli_x', app_secret: 's', domain: 'lark', users: ['ou_a'], workspace: '/code/app' } },
    ])
  })

  it('round-trips a saved section', () => {
    const fields = { appId: 'cli_x', appSecret: 's', domain: 'lark' as const, users: 'ou_a\nou_b', workspace: '/code/app' }
    const [change] = saveFeishu(fields)
    expect(feishuFields((change as { value: Parameters<typeof feishuFields>[0] }).value)).toEqual(fields)
  })

  it('removes the section', () => {
    expect(removeFeishu()).toEqual([{ kind: 'delete', path: ['feishu'] }])
  })
})
