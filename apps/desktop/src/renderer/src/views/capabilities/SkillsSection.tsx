// The capabilities screen's skills: the folder config.yaml's skills_dir
// names, and in it each agent's skills as ollupi loads them. A skill belongs
// to an agent: each has its own, so the screen is one section per agent,
// and what is done to a skill is done to that agent's. The agent reads them
// on each run but will not start with a skill it cannot load, so every
// change is checked with its own rules first.

import { Badge, Button, Callout, ClampText, Details, Dialog, EmptyState, Field, IconButton, Input, Loader, Switch, Textarea } from '@ollupi/ui'
import { Copy, FolderInput, FolderOpen, Pencil, Plus, RotateCw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { AgentSkills, NewSkill, Skill, SkillAgent, SkillChange, SkillList } from '../../../../shared/ipc'
import {
  chooseFolder,
  copySkill,
  createSkill,
  importSkill,
  nameError,
  readSkillFile,
  readSkills,
  removeSkill,
  saveSkill,
  turnOff,
  turnOn,
} from '../../domains/skills'
import { openPath } from '../../domains/files'
import { useConnection } from '../../gateway/connection'
import { useT } from '../../i18n'
import { desktop } from '../../platform/desktop'
import { Wolf } from '../common/Wolf'

/** Resource files a skill shows before the rest are counted. */
const shownFiles = 8

/** A dialog open on one agent's skills: a new one, or one it has. */
type Editing = { agent: SkillAgent; skill?: Skill }

export function SkillsSection() {
  const m = useT()
  const s = m.skills.screen
  const [list, setList] = useState<SkillList>()
  const [editing, setEditing] = useState<Editing>()
  const [busy, setBusy] = useState(false)

  // Turning skills on or off restarts the backend: read again once the new
  // one is connected.
  const connected = useConnection((c) => c.gateway === 'connected')
  const reload = useCallback(async () => {
    const read = await readSkills()
    if (read) setList(read)
  }, [])
  useEffect(() => {
    if (connected) void reload()
  }, [connected, reload])

  const act = async (action: () => Promise<boolean>) => {
    setBusy(true)
    if (await action()) await reload()
    setBusy(false)
  }

  const agents = list?.ok ? list.agents : []
  const close = () => setEditing(undefined)
  const saved = async (result: SkillChange | undefined) => {
    if (result?.ok) {
      close()
      await reload()
    }
    return result
  }

  return (
    <>
      {!list ? (
        <div className="flex justify-center py-12">
          <Loader label={m.skills.screen.loading} />
        </div>
      ) : !list.dir ? (
        list.ok ? (
          <EmptyState
            icon={<Wolf pose="sleep" className="size-16" />}
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
          {!list.ok ? (
            <Callout tone="danger">
              <p>{s.broken}</p>
              <pre className="selectable mt-1 font-mono text-small whitespace-pre-wrap text-fg-muted">{list.error}</pre>
            </Callout>
          ) : (
            <>
              {agents.map((group) => (
                <AgentSection
                  key={group.agent}
                  group={group}
                  all={agents}
                  dir={list.dir}
                  busy={busy}
                  onNew={() => setEditing({ agent: group.agent })}
                  onImport={() => void act(() => importSkill(group.agent))}
                  onEdit={(skill) => setEditing({ agent: group.agent, skill })}
                  onCopy={(skill, to) => void act(() => copySkill(group.agent, skill.name, to))}
                  onRemove={(skill) => {
                    if (confirm(m.skills.skill.confirmRemove(skill.name, m.skills.agents[group.agent].name))) void act(() => removeSkill(group.agent, skill.name))
                  }}
                />
              ))}
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="ghost" icon={<RotateCw size={14} />} onClick={() => void reload()}>
                  {s.reload}
                </Button>
                <span className="text-small text-fg-subtle">{s.importHint}</span>
              </div>
            </>
          )}
        </>
      )}
      {editing &&
        (editing.skill === undefined ? (
          <NewSkillDialog
            agent={editing.agent}
            taken={agents.find((a) => a.agent === editing.agent)?.skills.map((x) => x.name) ?? []}
            onClose={close}
            onSave={async (skill) => saved(await createSkill(editing.agent, skill))}
          />
        ) : (
          <EditSkillDialog agent={editing.agent} name={editing.skill.name} onClose={close} onSave={async (text) => saved(await saveSkill(editing.agent, editing.skill!.name, text))} />
        ))}
    </>
  )
}

/** Skills are on: a switch to turn them off, and where they are kept,
 * which opens into the folder's path. */
function Folder({ dir, busy, onChange, onOff }: { dir: string; busy: boolean; onChange(): void; onOff(): void }) {
  const s = useT().skills.screen
  return (
    <div className="flex flex-col gap-2 rounded-3xl bg-surface px-5 py-3.5">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-ui font-medium text-fg">{s.use}</div>
          <div className="mt-0.5 text-small text-fg-muted">{s.turnOffHint}</div>
        </div>
        <Switch checked label={s.use} disabled={busy} onChange={(on) => !on && onOff()} />
      </div>
      <Details summary={<span className="text-small text-fg-subtle">{s.where}</span>}>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="selectable min-w-0 flex-1 font-mono text-small [overflow-wrap:anywhere] text-fg-muted">{dir}</span>
          <IconButton label={s.openFolder} size="sm" onClick={() => void openPath(dir)}>
            <FolderOpen size={14} />
          </IconButton>
          <Button size="sm" className="bg-canvas" disabled={busy} onClick={onChange}>
            {s.change}
          </Button>
        </div>
      </Details>
    </div>
  )
}

/** One agent's skills: what the agent is, its skills, and making or
 * importing one of its own. */
function AgentSection({
  group,
  all,
  dir,
  busy,
  onNew,
  onImport,
  onEdit,
  onCopy,
  onRemove,
}: {
  group: AgentSkills
  all: AgentSkills[]
  dir: string
  busy: boolean
  onNew(): void
  onImport(): void
  onEdit(skill: Skill): void
  onCopy(skill: Skill, to: SkillAgent): void
  onRemove(skill: Skill): void
}) {
  const m = useT().skills
  const agent = m.agents[group.agent]
  // The agents a skill can be copied to: those without one of its name.
  const others = (skill: Skill) => all.filter((a) => a.agent !== group.agent && !a.skills.some((x) => x.name === skill.name)).map((a) => a.agent)
  return (
    <section aria-label={agent.name} className="flex flex-col gap-2">
      <div className="flex items-end gap-3 px-1">
        <div className="min-w-0 flex-1">
          <h3 className="text-ui font-medium text-fg">{agent.name}</h3>
          <p className="text-small text-fg-muted">{agent.about}</p>
        </div>
        <Button size="sm" icon={<Plus size={14} />} onClick={onNew}>
          {m.screen.newSkill}
        </Button>
        <Button size="sm" variant="ghost" icon={<FolderInput size={14} />} disabled={busy} onClick={onImport}>
          {m.screen.import}
        </Button>
      </div>
      {group.skills.length === 0 ? (
        <div className="rounded-3xl bg-surface px-5 py-3.5 text-small text-fg-subtle">{m.screen.empty}</div>
      ) : (
        <ul className="flex flex-col divide-y divide-canvas rounded-3xl bg-surface">
          {group.skills.map((x) => (
            <SkillRow key={x.name} skill={x} dir={dir} copyTo={others(x)} onEdit={() => onEdit(x)} onCopy={(to) => onCopy(x, to)} onRemove={() => onRemove(x)} />
          ))}
        </ul>
      )}
    </section>
  )
}

function SkillRow({
  skill,
  dir,
  copyTo,
  onEdit,
  onCopy,
  onRemove,
}: {
  skill: Skill
  dir: string
  copyTo: SkillAgent[]
  onEdit(): void
  onCopy(to: SkillAgent): void
  onRemove(): void
}) {
  const common = useT().common
  const agents = useT().skills.agents
  const m = useT().skills.skill
  const files = skill.resources ?? []
  const copy = async () => {
    const to = await desktop.contextMenu(copyTo.map((a) => ({ id: a, label: m.copyTo(agents[a].name) })))
    if (to) onCopy(to as SkillAgent)
  }
  return (
    <li className="group flex flex-col gap-1.5 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-ui font-medium text-fg">{skill.name}</span>
        {skill.version && <Badge>{m.version(skill.version)}</Badge>}
        <div className="flex-1" />
        <div className="flex opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100">
          <IconButton label={m.edit(skill.name)} size="sm" onClick={onEdit}>
            <Pencil size={14} />
          </IconButton>
          {copyTo.length > 0 && (
            <IconButton label={m.copy(skill.name)} size="sm" onClick={() => void copy()}>
              <Copy size={14} />
            </IconButton>
          )}
          <IconButton label={m.reveal(skill.name)} size="sm" onClick={() => void openPath(`${dir}/${skill.source_file.replace(/\/SKILL\.md$/, '')}`)}>
            <FolderOpen size={14} />
          </IconButton>
          <IconButton label={m.remove(skill.name)} size="sm" onClick={onRemove}>
            <Trash2 size={14} />
          </IconButton>
        </div>
      </div>
      <ClampText text={skill.description} lines={2} more={common.showAll} less={common.showLess} className="text-ui text-fg-muted" />
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
  agent,
  taken,
  onClose,
  onSave,
}: {
  agent: SkillAgent
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
      title={t.newTitle(m.skills.agents[agent].name)}
      description={m.skills.screen.checks}
      closeLabel={m.common.close}
      onClose={onClose}
      wide
      footer={
        <>
          <Button size="lg" onClick={onClose}>
            {m.common.cancel}
          </Button>
          <Button size="lg" variant="primary" disabled={!valid} loading={saving} onClick={() => void save()}>
            {t.save}
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

function EditSkillDialog({
  agent,
  name,
  onClose,
  onSave,
}: {
  agent: SkillAgent
  name: string
  onClose(): void
  onSave(text: string): Promise<SkillChange | undefined>
}) {
  const m = useT()
  const t = m.skills.dialog
  const [text, setText] = useState<string>()
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<SkillChange>()
  // Read once per skill: the parent's onClose changes on every render.
  useEffect(() => {
    void readSkillFile(agent, name).then((file) => (file === undefined ? onClose() : setText(file)))
  }, [agent, name])

  const save = async () => {
    setSaving(true)
    setResult(await onSave(text!))
    setSaving(false)
  }

  return (
    <Dialog
      title={t.editTitle(name, m.skills.agents[agent].name)}
      description={m.skills.screen.checks}
      closeLabel={m.common.close}
      onClose={onClose}
      wide
      footer={
        <>
          <Button size="lg" onClick={onClose}>
            {m.common.cancel}
          </Button>
          <Button size="lg" variant="primary" disabled={!text?.trim()} loading={saving} onClick={() => void save()}>
            {t.save}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {text === undefined ? (
          <div className="flex justify-center py-12">
            <Loader label={t.loading} />
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
