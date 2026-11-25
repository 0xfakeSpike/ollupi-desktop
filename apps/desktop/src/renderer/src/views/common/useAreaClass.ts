import type { WorkspaceRow } from '@ollupi/protocol'
import { useWorkspaces } from '../../domains/workspaces'
import { areaFields, FIELDS, leaning, type AreaField } from './areas'

const byList = new WeakMap<readonly WorkspaceRow[], Map<string, AreaField>>()

/** The field of the workspace, as the list now read assigns it; a scratch
 * workspace, what was started in no project, lies on the bare ground. */
export function useAreaClass(workspaceId: string | undefined): AreaField | undefined {
  const list = useWorkspaces((s) => s.list)
  if (!workspaceId || list.find((w) => w.id === workspaceId)?.kind === 'scratch') return undefined
  let fields = byList.get(list)
  if (!fields) {
    fields = areaFields(list)
    byList.set(list, fields)
  }
  return fields.get(workspaceId) ?? FIELDS[leaning(workspaceId)]
}
