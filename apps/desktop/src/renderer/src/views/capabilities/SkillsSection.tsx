// The capabilities screen's skills: the folder config.yaml's skills_dir
// names, and the skills in it as the agent loads them. The agent reads the folder only at start and will
// not start with a skill it cannot load, so every change is checked with
// its own rules first and then restarts the backend.

import { Badge, Button, Callout, Dialog, EmptyState, Field, IconButton, Input, Spinner, Textarea } from '@ollupi/ui'
import { FolderInput, FolderOpen, Pencil, Plus, RotateCw, Sparkles, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { NewSkill, Skill, SkillChange, SkillList } from '../../../../shared/ipc'
import {
  chooseFolder,
  createSkill,
  importSkill,
  nameError,
  readSkillFile,
  readSkills,
  removeSkill,
  saveSkill,
  turnOff,
  turnOn,
  useLoadedSkills,
} from '../../domains/skills'
import { useConnection } from '../../gateway/connection'
import { useT } from '../../i18n'
import { desktop } from '../../platform/desktop'

/** Resource files a skill shows before the rest are counted. */
const shownFiles = 8

export function SkillsSection() {
  const m = useT()
  const s = m.skills.screen
  const [list, setList] = useState<SkillList>()
  const [editing, setEditing] = useState<{ name?: string }>()
  const [busy, setBusy] = useState(false)
  const loaded = useLoadedSkills()

  // A change restarts the backend: read again once the new one is connected.
  const connected = useConnection((c) => c.gateway === 'connected')
  const reload = useCallback(async () => setList(await readSkills()), [])
  useEffect(() => {
    if (connected) void reload()
  }, [connected, reload])

  const act = async (action: () => Promise<boolean>) => {
    setBusy(true)
    if (await action()) await reload()
    setBusy(false)
  }

  const skills = list?.ok ? list.skills : []
  const names = skills.map((x) => x.name)
  // The folder and the running agent disagree, e.g. after a change made in
  // the folder itself.
  const stale =
    connected && list?.ok && loaded !== undefined && list.dir !== '' && [...loaded].sort().join('\n') !== [...names].sort().join('\n')

  return (
    <>
      {!list ? (
        <div className="flex justify-center py-12 text-fg-subtle">
          <Spinner />
        </div>
      ) : !list.dir ? (
        list.ok ? (
          <EmptyState
            icon={<Sparkles size={20} />}
            title={s.off}
            action={
              <Button variant="primary" loading={busy} onClick={() => void act(turnOn)}>
                {s.turnOn}
              </Button>
            }
          >
            {s.offHint}
          </EmptyState>
        ) : (
          <Callout tone="danger">
            {s.unreadable} <span className="selectable font-mono text-small">{list.error}</span>
          </Callout>
        )
      ) : (
        <>
          <Folder dir={list.dir} busy={busy} onChange={() => void act(chooseFolder)} onOff={() => void act(turnOff)} />
          {stale && (
            <Callout tone="warning">
              <div className="flex items-center gap-3">
                <span className="flex-1">{s.stale}</span>
                <Button size="sm" icon={<RotateCw size={14} />} onClick={() => void desktop.backend.restart()}>
                  {m.common.restartBackend}
                </Button>
              </div>
            </Callout>
          )}
          {!list.ok ? (
            <Callout tone="danger">
              <p>{s.broken}</p>
              <pre className="selectable mt-1 font-mono text-small whitespace-pre-wrap text-fg-muted">{list.error}</pre>
            </Callout>
          ) : skills.length === 0 ? (
            <EmptyState icon={<Sparkles size={20} />} title={s.empty}>
              {s.emptyHint}
            </EmptyState>
          ) : (
            <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
              {skills.map((x) => (
                <SkillRow
                  key={x.name}
                  skill={x}
                  dir={list.dir}
                  onEdit={() => setEditing({ name: x.name })}
                  onRemove={() => {
                    if (confirm(m.skills.skill.confirmRemove(x.name))) void act(() => removeSkill(x.name))
                  }}
                />
              ))}
            </ul>
          )}
          {list.ok && (
            <div className="flex flex-wrap items-center gap-2">
              <Button icon={<Plus size={14} />} onClick={() => setEditing({})}>
                {s.newSkill}
              </Button>
              <Button icon={<FolderInput size={14} />} loading={busy} onClick={() => void act(importSkill)}>
                {s.import}
              </Button>
              <Button variant="ghost" icon={<RotateCw size={14} />} onClick={() => void reload()}>
                {s.reload}
              </Button>
              <span className="text-small text-fg-subtle">{s.importHint}</span>
            </div>
          )}
        </>
      )}
      {editing &&
        (editing.name === undefined ? (
          <NewSkillDialog
            taken={names}
            onClose={() => setEditing(undefined)}
            onSave={async (skill) => {
              const result = await createSkill(skill)
              if (result?.ok) {
                setEditing(undefined)
                await reload()
              }
              return result
            }}
          />
        ) : (
          <EditSkillDialog
            name={editing.name}
            onClose={() => setEditing(undefined)}
            onSave={async (text) => {
              const result = await saveSkill(editing.name!, text)
              if (result?.ok) {
                setEditing(undefined)
                await reload()
              }
              return result
            }}
          />
        ))}
    </>
  )
}

function Folder({ dir, busy, onChange, onOff }: { dir: string; busy: boolean; onChange(): void; onOff(): void }) {
  const s = useT().skills.screen
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-ui font-medium text-fg">{s.folder}</div>
        <div className="selectable mt-0.5 font-mono text-small break-all text-fg-muted">{dir}</div>
      </div>
      <IconButton label={s.openFolder} size="sm" onClick={() => void desktop.openPath(dir)}>
        <FolderOpen size={14} />
      </IconButton>
      <Button size="sm" disabled={busy} onClick={onChange}>
        {s.change}
      </Button>
      <Button size="sm" variant="ghost" disabled={busy} title={s.turnOffHint} onClick={onOff}>
        {s.turnOff}
      </Button>
    </div>
  )
}

function SkillRow({ skill, dir, onEdit, onRemove }: { skill: Skill; dir: string; onEdit(): void; onRemove(): void }) {
  const m = useT().skills.skill
  const files = skill.resources ?? []
  const tools = skill.allowed_tools ?? []
  return (
    <li className="group flex flex-col gap-1.5 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="font-mono text-ui font-medium text-fg">{skill.name}</span>
        {skill.version && <Badge>{m.version(skill.version)}</Badge>}
        <div className="flex-1" />
        <div className="flex opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100">
          <IconButton label={m.edit(skill.name)} size="sm" onClick={onEdit}>
            <Pencil size={14} />
          </IconButton>
          <IconButton label={m.reveal(skill.name)} size="sm" onClick={() => void desktop.openPath(`${dir}/${skill.name}`)}>
            <FolderOpen size={14} />
          </IconButton>
          <IconButton label={m.remove(skill.name)} size="sm" onClick={onRemove}>
            <Trash2 size={14} />
          </IconButton>
        </div>
      </div>
      <p className="selectable text-ui whitespace-pre-wrap text-fg-muted">{skill.description}</p>
      {tools.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 text-small text-fg-subtle">
          <span className="mr-1">{m.tools}</span>
          {tools.map((t) => (
            <code key={t} className="rounded-sm bg-hover px-1.5 py-0.5 font-mono text-small text-fg-muted">
              {t}
            </code>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 text-small text-fg-subtle">
          <span className="mr-1">{m.files(files.length)}</span>
          {files.slice(0, shownFiles).map((f) => (
            <code key={f.path} className="rounded-sm bg-hover px-1.5 py-0.5 font-mono text-small text-fg-muted">
              {f.path}
            </code>
          ))}
          {files.length > shownFiles && <span>{m.more(files.length - shownFiles)}</span>}
        </div>
      )}
    </li>
  )
}

/** The refusal shows above the footer, in the backend's own words. */
function Refusal({ result }: { result: SkillChange | undefined }) {
  if (!result || result.ok) return null
  return (
    <Callout tone="danger">
      <span className="selectable font-mono text-small whitespace-pre-wrap">{result.error}</span>
    </Callout>
  )
}

function NewSkillDialog({
  taken,
  onClose,
  onSave,
}: {
  taken: string[]
  onClose(): void
  onSave(skill: NewSkill): Promise<SkillChange | undefined>
}) {
  const m = useT()
  const t = m.skills.dialog
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [instructions, setInstructions] = useState('')
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<SkillChange>()

  const trimmed = name.trim()
  const nameReason = trimmed ? nameError(trimmed, taken) : undefined
  const valid = !!trimmed && !nameReason && !!description.trim() && !!instructions.trim()

  const save = async () => {
    setSaving(true)
    setResult(await onSave({ name: trimmed, description: description.trim(), instructions }))
    setSaving(false)
  }

  return (
    <Dialog
      title={t.newTitle}
      description={m.skills.screen.restarts}
      closeLabel={m.common.close}
      onClose={onClose}
      wide
      footer={
        <>
          <Button size="lg" onClick={onClose}>
            {m.common.cancel}
          </Button>
          <Button size="lg" variant="primary" disabled={!valid} loading={saving} onClick={() => void save()}>
            {t.saveAndRestart}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t.name} error={nameReason && m.errors.skillName[nameReason]} hint={t.nameHint}>
          <Input value={name} autoFocus spellCheck={false} className="font-mono" placeholder="release-notes" onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t.description} hint={t.descriptionHint}>
          <Textarea rows={3} maxLength={1024} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label={t.instructions} hint={t.instructionsHint}>
          <Textarea rows={12} spellCheck={false} className="font-mono text-small" value={instructions} onChange={(e) => setInstructions(e.target.value)} />
        </Field>
        <Refusal result={result} />
      </div>
    </Dialog>
  )
}

function EditSkillDialog({ name, onClose, onSave }: { name: string; onClose(): void; onSave(text: string): Promise<SkillChange | undefined> }) {
  const m = useT()
  const t = m.skills.dialog
  const [text, setText] = useState<string>()
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<SkillChange>()
  // Read once per skill: the parent's onClose changes on every render.
  useEffect(() => {
    void readSkillFile(name).then((file) => (file === undefined ? onClose() : setText(file)))
  }, [name])

  const save = async () => {
    setSaving(true)
    setResult(await onSave(text!))
    setSaving(false)
  }

  return (
    <Dialog
      title={t.editTitle(name)}
      description={m.skills.screen.restarts}
      closeLabel={m.common.close}
      onClose={onClose}
      wide
      footer={
        <>
          <Button size="lg" onClick={onClose}>
            {m.common.cancel}
          </Button>
          <Button size="lg" variant="primary" disabled={!text?.trim()} loading={saving} onClick={() => void save()}>
            {t.saveAndRestart}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {text === undefined ? (
          <div className="flex justify-center py-12 text-fg-subtle">
            <Spinner />
          </div>
        ) : (
          <Field label={t.file} hint={t.fileHint}>
            <Textarea rows={20} autoFocus spellCheck={false} className="font-mono text-small" value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
        )}
        <Refusal result={result} />
      </div>
    </Dialog>
  )
}
