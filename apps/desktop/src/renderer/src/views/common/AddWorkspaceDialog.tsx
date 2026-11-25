// Adds a workspace: a folder of an environment's machine, chosen by
// browsing that machine through ollupi, wherever it is.

import { Button, Dialog, Field, Select } from '@ollupi/ui'
import { useState } from 'react'
import { defaultEnvironment, environmentName, useEnvironments } from '../../domains/environments'
import { addWorkspaceAt, useAddingWorkspace } from '../../domains/workspaces'
import { useT } from '../../i18n'
import { FolderBrowser } from './FolderBrowser'

export function AddWorkspaceDialog() {
  const open = useAddingWorkspace((s) => s.open)
  return open ? <Adding onClose={() => useAddingWorkspace.setState({ open: false })} /> : null
}

function Adding({ onClose }: { onClose(): void }) {
  const m = useT()
  const t = m.workspaces.add
  const environments = useEnvironments((s) => s.list)
  const [environmentId, setEnvironmentId] = useState(() => defaultEnvironment(environments)?.id)
  const [at, setAt] = useState<string>()
  const [adding, setAdding] = useState(false)
  const add = async () => {
    if (!at) return
    setAdding(true)
    await addWorkspaceAt(environmentId, at)
    setAdding(false)
  }
  return (
    <Dialog
      title={t.title}
      description={t.description}
      closeLabel={m.common.close}
      onClose={onClose}
      wide
      footer={
        <>
          <Button size="lg" onClick={onClose}>
            {m.common.cancel}
          </Button>
          <Button size="lg" variant="primary" disabled={!at} loading={adding} onClick={() => void add()}>
            {t.add}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {environments.length > 1 && (
          <Field label={t.environment}>
            <Select value={environmentId} onChange={(e) => setEnvironmentId(e.target.value)}>
              {environments.map((env) => (
                <option key={env.id} value={env.id}>
                  {environmentName(env)}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <FolderBrowser environmentId={environmentId} onAt={setAt} />
      </div>
    </Dialog>
  )
}
