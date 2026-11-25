// The capabilities screen's skills: the profile's skills, listed under each
// agent given them. A skill is one, however many agents have it, and is
// listed under each of them; what is done to it is done for all of them.
// ollupi checks every change with its own rules, and the agents read their
// skills on each step, so a change applies without a restart.

import type { SkillRow } from '@ollupi/protocol'
import { Badge, Button, Callout, Checkbox, Details, Dialog, EmptyState, Field, IconButton, Input, Loader, Textarea } from '@ollupi/ui'
import { Ellipsis, FolderInput, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { agentsOf, skillAgents, type SkillAgent } from '../../../../shared/ipc'
import { importFolder, nameError, readSkill, removeSkill, saveSkill, useSkills, type SkillChange, type SkillFields } from '../../domains/skills'
import { useT } from '../../i18n'
import { desktop } from '../../platform/desktop'
import { Wolf } from '../common/Wolf'
import { AgentSection, None } from './AgentSection'

/** The dialog open on a skill: a new one, one read from a folder, or one
 * the profile has. */
type Editing = { kind: 'new' } | { kind: 'import'; fields: SkillFields; skipped: string[] } | { kind: 'edit'; name: string }

const blank: SkillFields = { name: '', description: '', instructions: '', agents: ['main'], files: [] }

export function SkillsSection() {
  const m = useT()
  const s = m.skills.screen
  const list = useSkills((x) => x.list)
  const [editing, setEditing] = useState<Editing>()
  const [busy, setBusy] = useState(false)

  const importing = async () => {
    setBusy(true)
    const read = await importFolder()
    setBusy(false)
    if (read) setEditing({ kind: 'import', ...read })
  }
  const remove = (skill: SkillRow) => {
    if (confirm(m.skills.skill.confirmRemove(skill.name))) void removeSkill(skill.name)
  }
  const close = () => setEditing(undefined)
  const taken = list?.map((x) => x.name) ?? []

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button icon={<Plus size={14} />} onClick={() => setEditing({ kind: 'new' })}>
          {s.newSkill}
        </Button>
        <Button variant="ghost" icon={<FolderInput size={14} />} loading={busy} onClick={() => void importing()}>
          {s.import}
        </Button>
        <span className="text-small text-fg-subtle">{s.importHint}</span>
      </div>
      {!list ? (
        <div className="flex justify-center py-12">
          <Loader label={s.loading} />
        </div>
      ) : list.length === 0 ? (
        <EmptyState icon={<Wolf pose="rest" className="size-16" />} title={s.empty}>
          {s.emptyHint}
        </EmptyState>
      ) : (
        skillAgents.map((agent) => {
          const own = list.filter((x) => agentsOf(x.roles).includes(agent))
          return (
            <AgentSection key={agent} agent={agent} count={own.length}>
              {own.length === 0 ? (
                <None>{m.capabilities.noSkills}</None>
              ) : (
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(17.5rem,1fr))] gap-2.5">
                  {own.map((x) => (
                    <SkillCard key={x.name} skill={x} onEdit={() => setEditing({ kind: 'edit', name: x.name })} onRemove={() => remove(x)} />
                  ))}
                </ul>
              )}
            </AgentSection>
          )
        })
      )}
      {editing?.kind === 'new' && <SkillDialog title={m.skills.dialog.newTitle} initial={blank} taken={taken} onClose={close} />}
      {editing?.kind === 'import' && (
        <SkillDialog title={m.skills.dialog.importTitle(editing.fields.name)} initial={editing.fields} skipped={editing.skipped} taken={taken} onClose={close} />
      )}
      {editing?.kind === 'edit' && <EditSkill name={editing.name} onClose={close} />}
    </>
  )
}

/** One skill as a card. A card says what an agent is given: the skill's
 * name, the description it decides from whether to use the skill, and
 * which agents have it. The whole card opens the skill to edit; the rest is
 * in its menu. */
function SkillCard({ skill, onEdit, onRemove }: { skill: SkillRow; onEdit(): void; onRemove(): void }) {
  const t = useT().skills
  const m = t.skill
  const menu = async () => {
    if ((await desktop.contextMenu([{ id: 'remove', label: m.remove }])) === 'remove') onRemove()
  }
  return (
    <li className="group relative flex min-w-0 flex-col gap-1 rounded-3xl bg-surface px-4.5 pt-3 pb-4">
      {/* Under the text rather than around it: a button may not hold the menu's button. */}
      <button
        type="button"
        aria-label={m.edit(skill.name)}
        onClick={onEdit}
        className="absolute inset-0 rounded-[inherit] transition-colors duration-100 ease-standard hover:bg-hover focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none"
      />
      <div className="pointer-events-none relative flex min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-ui font-medium text-fg">{skill.name}</span>
        {/* The version, and in its place on hover the menu (DESIGN.md 3.6). */}
        <span className="relative flex h-7 min-w-7 shrink-0 items-center justify-end">
          {skill.version && (
            <span className="group-focus-within:invisible group-hover:invisible">
              <Badge>{m.version(skill.version)}</Badge>
            </span>
          )}
          <span className="pointer-events-auto absolute inset-y-0 right-0 hidden items-center group-focus-within:flex group-hover:flex">
            <IconButton label={m.menu(skill.name)} size="sm" aria-haspopup="menu" onClick={() => void menu()}>
              <Ellipsis size={14} />
            </IconButton>
          </span>
        </span>
      </div>
      <p className="pointer-events-none relative line-clamp-3 text-ui [overflow-wrap:anywhere] text-fg-muted">{skill.description}</p>
      <p className="pointer-events-none relative mt-1 truncate text-small text-fg-subtle">{m.agents(agentsOf(skill.roles).map((a) => t.agents[a].name))}</p>
    </li>
  )
}

/** A skill the profile has, read in full before the dialog opens on it. */
function EditSkill({ name, onClose }: { name: string; onClose(): void }) {
  const m = useT()
  const [fields, setFields] = useState<SkillFields>()
  // Read once per skill: the parent's onClose changes on every render.
  useEffect(() => {
    void readSkill(name).then((read) => (read ? setFields(read) : onClose()))
  }, [name])
  if (!fields) {
    return (
      <Dialog title={m.skills.dialog.editTitle(name)} closeLabel={m.common.close} onClose={onClose} wide>
        <div className="flex justify-center py-12">
          <Loader label={m.skills.dialog.loading} />
        </div>
      </Dialog>
    )
  }
  return <SkillDialog title={m.skills.dialog.editTitle(name)} initial={fields} editing onClose={onClose} />
}

/** Writes a skill whole: what the agent is told and the agents it is given
 * to. Its files come with it, from a folder or as it had them, and are kept
 * as they are. A skill's name is what agents activate it by, so a skill the
 * profile has keeps its own. */
function SkillDialog({
  title,
  initial,
  editing = false,
  taken = [],
  skipped = [],
  onClose,
}: {
  title: string
  initial: SkillFields
  editing?: boolean
  taken?: string[]
  skipped?: string[]
  onClose(): void
}) {
  const m = useT()
  const t = m.skills.dialog
  const [f, setF] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<SkillChange>()
  const set = (change: Partial<SkillFields>) => setF((x) => ({ ...x, ...change }))
  const toggle = (agent: SkillAgent, on: boolean) => set({ agents: skillAgents.filter((a) => (a === agent ? on : f.agents.includes(a))) })

  const name = f.name.trim()
  const nameReason = !editing && name ? nameError(name, taken) : undefined
  const valid = !!name && !nameReason && !!f.description.trim() && !!f.instructions.trim() && f.agents.length > 0

  const save = async () => {
    setSaving(true)
    const saved = await saveSkill({ ...f, name })
    setSaving(false)
    setResult(saved)
    if (saved.ok) onClose()
  }

  return (
    <Dialog
      title={title}
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
          <Input
            value={f.name}
            autoFocus={!editing}
            disabled={editing}
            spellCheck={false}
            className="font-mono"
            placeholder="release-notes"
            onChange={(e) => set({ name: e.target.value })}
          />
        </Field>
        <Field label={t.description} hint={t.descriptionHint}>
          <Textarea rows={3} maxLength={1024} value={f.description} onChange={(e) => set({ description: e.target.value })} />
        </Field>
        <Field label={t.instructions} hint={t.instructionsHint}>
          <Textarea rows={12} spellCheck={false} className="font-mono text-small" value={f.instructions} onChange={(e) => set({ instructions: e.target.value })} />
        </Field>
        <Field label={t.agents} hint={f.agents.length ? t.agentsHint : undefined} error={f.agents.length ? undefined : t.agentsNone}>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-x-4 gap-y-2">
            {skillAgents.map((a) => (
              <Checkbox key={a} checked={f.agents.includes(a)} onChange={(on) => toggle(a, on)}>
                <span className="truncate">{m.skills.agents[a].name}</span>
              </Checkbox>
            ))}
          </div>
        </Field>
        {(f.files.length > 0 || skipped.length > 0) && (
          <div className="flex flex-col gap-1">
            <Details summary={<span className="text-small text-fg-subtle">{t.files(f.files.length)}</span>}>
              <div className="mt-1.5 flex flex-col gap-1.5">
                <p className="text-small text-fg-muted">{t.filesHint}</p>
                <ul className="selectable font-mono text-small text-fg-muted">
                  {f.files.map((file) => (
                    <li key={file.path} className="[overflow-wrap:anywhere]">
                      {file.path}
                    </li>
                  ))}
                </ul>
              </div>
            </Details>
            {skipped.length > 0 && <p className="text-small [overflow-wrap:anywhere] text-fg-subtle">{t.skipped(skipped.join(', '))}</p>}
          </div>
        )}
        {result && !result.ok && (
          <Callout tone="danger">
            <span className="selectable font-mono text-small whitespace-pre-wrap">{result.error}</span>
          </Callout>
        )}
      </div>
    </Dialog>
  )
}
