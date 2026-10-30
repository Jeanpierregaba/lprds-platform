'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Baby, Layers, Loader2, Pencil, Plus, Search, Trash2, UserRound } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ConfirmDialog } from '@/components/dashboard/shared/dialogs'
import { attendanceApi } from '@/lib/api/attendance.api'
import { directoryApi } from '@/lib/api/directory.api'
import { useDirectoryUnits } from '@/lib/hooks/use-directory'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { cn } from '@/lib/utils/cn'
import { intlLocale } from '@/lib/utils/locale-format'
import type { DirectoryUnit } from '@/types/directory'
import type { Exemption, ExemptionScope, ExemptionState } from '@/types/attendance'

type T = (key: string) => string

const SCOPES: ExemptionScope[] = ['section', 'child', 'staff']

const SCOPE_ICON: Record<ExemptionScope, typeof UserRound> = {
  section: Layers,
  child: Baby,
  staff: UserRound,
}

// « En cours » et « À venir » se lisent comme des engagements, « Expirée »
// comme une information, « Annulée » comme un classement. La teinte dit
// laquelle sans qu'on lise l'étiquette.
const STATE_TINT: Record<ExemptionState, string> = {
  active: 'border-transparent bg-teal text-white',
  upcoming: 'border-transparent bg-sky text-white',
  expired: 'border-transparent bg-muted text-muted-foreground',
  revoked: 'border-transparent bg-destructive/10 text-destructive',
}

/**
 * ⚠️ Chaîne VIDE = borne ouverte, et c'est volontaire : un `<input type="date">`
 * vidé rend `''`, et « depuis toujours » / « sans fin » sont des valeurs
 * pleines de sens côté API (NULL). Les traduire en `null` au moment de l'envoi
 * plutôt que de les interdire est ce qui permet de reproduire l'ancienne
 * exemption de personnel, qui n'avait aucune période.
 */
const makeExemptionSchema = (t: T) =>
  z
    .object({
      scope: z.enum(['staff', 'child', 'section']),
      targetId: z.string().min(1, t('exemptions.targetRequired')),
      starts_on: z.string(),
      ends_on: z.string(),
      reason: z.string().max(500, t('exemptions.reasonTooLong')),
    })
    .refine(
      (v) => !v.starts_on || !v.ends_on || v.ends_on >= v.starts_on,
      { message: t('exemptions.endBeforeStart'), path: ['ends_on'] },
    )

type ExemptionForm = z.infer<ReturnType<typeof makeExemptionSchema>>

const EXEMPTIONS_KEY = ['attendance', 'settings', 'exemptions']

export function ExemptionsSettings() {
  const t = useTranslations('attendance')
  const queryClient = useQueryClient()
  const [scopeFilter, setScopeFilter] = useState<ExemptionScope | 'all'>('all')
  const [includeRevoked, setIncludeRevoked] = useState(false)
  const [editing, setEditing] = useState<Exemption | null>(null)
  const [creating, setCreating] = useState(false)
  const [revoking, setRevoking] = useState<Exemption | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: [...EXEMPTIONS_KEY, { scopeFilter, includeRevoked }],
    queryFn: () =>
      attendanceApi
        .listExemptions({
          scope: scopeFilter === 'all' ? undefined : scopeFilter,
          include_revoked: includeRevoked,
        })
        .then((r) => r.data),
  })

  const revoke = useMutation({
    mutationFn: (id: string) => attendanceApi.revokeExemption(id),
    onSuccess: () => {
      toast.success(t('exemptions.revoked'))
      setRevoking(null)
      queryClient.invalidateQueries({ queryKey: EXEMPTIONS_KEY })
      // Le statut du jour est calculé à la volée : les tableaux de bord
      // changent d'avis dès que l'exemption disparaît.
      queryClient.invalidateQueries({ queryKey: ['attendance', 'daily'] })
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const items = data?.items ?? []

  return (
    <div className="mt-2 space-y-4">
      {/* ⚠️ Une SEULE ligne hors de la carte, courte et en gras. Le fond du
          tableau de bord est une photographie : un paragraphe en blanc par
          dessus se lit mal, et celui-ci est le plus important des deux —
          c'est lui qui explique à quoi sert la page. Le conseil « préférez la
          section » vit sur le fond de la carte, où il est lisible. */}
      <p className="text-sm font-semibold text-white">{t('exemptions.hint')}</p>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <FilterPill
            active={scopeFilter === 'all'}
            onClick={() => setScopeFilter('all')}
            label={t('exemptions.filterAll')}
          />
          {SCOPES.map((scope) => (
            <FilterPill
              key={scope}
              active={scopeFilter === scope}
              onClick={() => setScopeFilter(scope)}
              label={t(`exemptions.scope.${scope}`)}
            />
          ))}
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id="include-revoked"
              checked={includeRevoked}
              onCheckedChange={setIncludeRevoked}
            />
            <Label htmlFor="include-revoked" className="text-sm text-white">
              {t('exemptions.showRevoked')}
            </Label>
          </div>
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 size-4" />
            {t('exemptions.new')}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-3 p-0">
          <p className="px-4 pt-4 text-sm text-muted-foreground">
            {t('exemptions.hintSection')}
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('exemptions.columns.who')}</TableHead>
                <TableHead>{t('exemptions.columns.period')}</TableHead>
                <TableHead>{t('exemptions.columns.reason')}</TableHead>
                <TableHead>{t('exemptions.columns.state')}</TableHead>
                <TableHead className="w-24 text-right">{t('exemptions.columns.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-16" /></TableCell>
                  </TableRow>
                ))
              ) : items.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="h-40 text-center">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                        <Layers className="size-5" />
                      </div>
                      <p>{t('exemptions.empty')}</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => {
                  const Icon = SCOPE_ICON[item.scope]
                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="flex items-start gap-2">
                          <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0">
                            <p className="font-medium">{item.target_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {t(`exemptions.scope.${item.scope}`)}
                              {item.section_name ? ` · ${item.section_name}` : ''}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        <PeriodLabel starts={item.starts_on} ends={item.ends_on} />
                      </TableCell>
                      <TableCell className="max-w-56 text-sm text-muted-foreground">
                        {item.reason || '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn('font-normal', STATE_TINT[item.state])}>
                          {t(`exemptions.state.${item.state}`)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {/* Une exemption annulée ne se modifie plus : elle ne
                              compte nulle part, et rouvrir sa période par le
                              formulaire laisserait croire qu'elle revit. */}
                          {item.is_active && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setEditing(item)}
                                aria-label={t('exemptions.edit')}
                              >
                                <Pencil className="size-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setRevoking(item)}
                                aria-label={t('exemptions.revoke')}
                              >
                                <Trash2 className="size-4 text-destructive" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ExemptionDialog
        open={creating || editing !== null}
        exemption={editing}
        onClose={() => {
          setCreating(false)
          setEditing(null)
        }}
      />

      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => !open && setRevoking(null)}
        title={t('exemptions.revokeTitle')}
        description={t('exemptions.revokeBody', { name: revoking?.target_name ?? '' })}
        confirmLabel={t('exemptions.revoke')}
        destructive
        confirmDisabled={revoke.isPending}
        onConfirm={() => revoking && revoke.mutate(revoking.id)}
      />
    </div>
  )
}

function FilterPill({
  active, onClick, label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full px-3 py-1.5 text-sm transition-colors',
        active ? 'bg-teal text-white' : 'bg-white/80 text-foreground hover:bg-white',
      )}
    >
      {label}
    </button>
  )
}

/**
 * Une borne absente se LIT — « depuis toujours », « sans fin ». Laisser la
 * cellule vide ferait croire à une donnée manquante.
 *
 * ⚠️ `T00:00` et non la chaîne nue : `new Date('2026-03-10')` est interprété
 * en UTC, donc affiché la VEILLE à l'ouest de Greenwich. Le même piège que
 * partout ailleurs dans le module — une date de fin qui recule d'un jour à
 * l'écran est exactement ce qui fait douter de la fonctionnalité.
 */
const prettyDay = (iso: string) =>
  new Date(`${iso}T00:00`).toLocaleDateString(intlLocale(), {
    day: 'numeric', month: 'short', year: 'numeric',
  })

function PeriodLabel({ starts, ends }: { starts: string | null; ends: string | null }) {
  const t = useTranslations('attendance')
  if (!starts && !ends) return <span>{t('exemptions.always')}</span>
  if (!starts) return <span>{t('exemptions.untilDate', { date: prettyDay(ends!) })}</span>
  if (!ends) return <span>{t('exemptions.fromDate', { date: prettyDay(starts) })}</span>
  return <span>{t('exemptions.range', { from: prettyDay(starts), to: prettyDay(ends!) })}</span>
}

function ExemptionDialog({
  open, exemption, onClose,
}: {
  open: boolean
  exemption: Exemption | null
  onClose: () => void
}) {
  const t = useTranslations('attendance')
  const tCommon = useTranslations('common')
  const queryClient = useQueryClient()
  const isEdit = exemption !== null

  const form = useForm<ExemptionForm>({
    resolver: zodResolver(makeExemptionSchema(t)),
    defaultValues: { scope: 'section', targetId: '', starts_on: '', ends_on: '', reason: '' },
  })
  const scope = form.watch('scope')
  const targetId = form.watch('targetId')

  useEffect(() => {
    if (!open) return
    form.reset(
      exemption
        ? {
            scope: exemption.scope,
            targetId:
              exemption.staff_id ?? exemption.child_id ?? exemption.section_id ?? '',
            starts_on: exemption.starts_on ?? '',
            ends_on: exemption.ends_on ?? '',
            reason: exemption.reason ?? '',
          }
        : { scope: 'section', targetId: '', starts_on: '', ends_on: '', reason: '' },
    )
    // `form` est stable (react-hook-form) et volontairement hors des
    // dépendances : l'y mettre rejouerait le reset à chaque rendu et
    // effacerait la saisie en cours.
  }, [open, exemption])

  const save = useMutation({
    mutationFn: (values: ExemptionForm) => {
      const period = {
        starts_on: values.starts_on || null,
        ends_on: values.ends_on || null,
        reason: values.reason.trim() || null,
      }
      if (exemption) return attendanceApi.updateExemption(exemption.id, period)
      return attendanceApi.createExemption({
        scope: values.scope,
        ...(values.scope === 'staff' ? { staff_id: values.targetId } : {}),
        ...(values.scope === 'child' ? { child_id: values.targetId } : {}),
        ...(values.scope === 'section' ? { section_id: values.targetId } : {}),
        ...period,
      })
    },
    onSuccess: () => {
      toast.success(isEdit ? t('exemptions.updated') : t('exemptions.created'))
      queryClient.invalidateQueries({ queryKey: EXEMPTIONS_KEY })
      queryClient.invalidateQueries({ queryKey: ['attendance', 'daily'] })
      onClose()
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90dvh] min-w-0 overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('exemptions.editTitle') : t('exemptions.newTitle')}
          </DialogTitle>
          <DialogDescription>
            {isEdit ? t('exemptions.editDescription') : t('exemptions.newDescription')}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit((values) => save.mutate(values))}
          className="space-y-4"
        >
          {/* ⚠️ La PORTÉE ne se modifie pas : déplacer une exemption d'un
              enfant à un autre, c'est en annuler une et en créer une autre —
              sinon l'historique du premier changerait sous ses pieds. */}
          {!isEdit && (
            <div className="space-y-2">
              <Label>{t('exemptions.scopeLabel')}</Label>
              <Select
                value={scope}
                onValueChange={(v) => {
                  form.setValue('scope', v as ExemptionScope)
                  form.setValue('targetId', '')
                }}
              >
                <SelectTrigger className="w-full">
                  {/* ⚠️ Le libellé est rendu EXPLICITEMENT. Sans enfant,
                      `SelectValue` affiche la valeur brute — « section » au
                      lieu de « Section ». Même piège que le sélecteur du
                      trombinoscope, qui annonçait un UUID. Invisible au
                      type-check : il faut l'ouvrir pour le voir. */}
                  <SelectValue>{t(`exemptions.scope.${scope}`)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {SCOPES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`exemptions.scope.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t(`exemptions.scopeHelp.${scope}`)}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label>{t('exemptions.targetLabel')}</Label>
            {isEdit ? (
              <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                {exemption.target_name}
              </p>
            ) : scope === 'section' ? (
              <SectionPicker
                value={targetId}
                onChange={(id) => form.setValue('targetId', id, { shouldValidate: true })}
              />
            ) : (
              <PersonPicker
                kind={scope}
                value={targetId}
                onChange={(id) => form.setValue('targetId', id, { shouldValidate: true })}
              />
            )}
            {form.formState.errors.targetId && (
              <p className="text-sm text-destructive">
                {form.formState.errors.targetId.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="starts_on">{t('exemptions.startsOn')}</Label>
              <Input id="starts_on" type="date" {...form.register('starts_on')} />
              <p className="text-xs text-muted-foreground">{t('exemptions.openStart')}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ends_on">{t('exemptions.endsOn')}</Label>
              <Input id="ends_on" type="date" {...form.register('ends_on')} />
              <p className="text-xs text-muted-foreground">{t('exemptions.openEnd')}</p>
              {form.formState.errors.ends_on && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.ends_on.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">{t('exemptions.reason')}</Label>
            <Input
              id="reason"
              placeholder={t('exemptions.reasonPlaceholder')}
              {...form.register('reason')}
            />
            {form.formState.errors.reason && (
              <p className="text-sm text-destructive">
                {form.formState.errors.reason.message}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {tCommon('actions.cancel')}
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              {tCommon('actions.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Sections, avec leur département en contexte : deux établissements peuvent
 *  avoir une « Petite Section » par département. */
function SectionPicker({
  value, onChange,
}: {
  value: string
  onChange: (id: string) => void
}) {
  const t = useTranslations('attendance')
  const { departments, sections } = useDirectoryUnits()
  const deptName = useMemo(
    () => new Map(departments.map((d) => [d.id, d.name])),
    [departments],
  )
  const label = (s: DirectoryUnit) =>
    s.department_id ? `${deptName.get(s.department_id) ?? ''} · ${s.name}` : s.name
  const picked = sections.find((s) => s.id === value)

  return (
    <Select value={value} onValueChange={(v) => onChange(v ?? '')}>
      <SelectTrigger className="w-full">
        {/* ⚠️ Le libellé est rendu EXPLICITEMENT, et c'est indispensable ici :
            les sections arrivent de façon ASYNCHRONE, donc `SelectValue` sans
            enfant affiche l'identifiant brut — vu à l'écran, un UUID à la
            place de « Maternelle · Petite Section ». C'est le défaut déjà
            rencontré sur le sélecteur du trombinoscope, et ni le type-check
            ni le lint ne le voient. */}
        <SelectValue>
          {picked ? label(picked) : t('exemptions.pickSection')}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {sections.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {label(s)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/**
 * ⚠️ Passe par l'ANNUAIRE, jamais par `/children` ni `/staff` : poser une
 * exemption n'exige pas d'ouvrir un dossier. C'est exactement le couplage que
 * le module Annuaire a dû refermer ailleurs — la permission autorisait le
 * geste, l'écran ne pouvait pas le proposer.
 */
function PersonPicker({
  kind, value, onChange,
}: {
  kind: 'staff' | 'child'
  value: string
  onChange: (id: string) => void
}) {
  const t = useTranslations('attendance')
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [picked, setPicked] = useState<{ id: string; label: string; sub: string | null } | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    if (!value) setPicked(null)
  }, [value])

  const active = debounced.length >= 2 && !picked

  const { data: staffHits, isFetching: staffFetching } = useQuery({
    queryKey: ['directory', 'staff', { search: debounced, limit: 8 }],
    queryFn: () =>
      directoryApi.listStaff({ search: debounced, limit: 8 }).then((r) => r.data),
    enabled: active && kind === 'staff',
  })
  const { data: childHits, isFetching: childFetching } = useQuery({
    queryKey: ['directory', 'children', { search: debounced, limit: 8 }],
    queryFn: () =>
      directoryApi.listChildren({ search: debounced, limit: 8 }).then((r) => r.data),
    enabled: active && kind === 'child',
  })

  const results =
    kind === 'staff'
      ? (staffHits?.items ?? []).map((s) => ({ id: s.id, label: s.display_name, sub: s.matricule }))
      : (childHits?.items ?? []).map((c) => ({
          id: c.id,
          label: c.display_name,
          sub: c.section_name ?? c.matricule,
        }))
  const fetching = kind === 'staff' ? staffFetching : childFetching

  if (picked) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{picked.label}</p>
          {picked.sub && <p className="truncate text-xs text-muted-foreground">{picked.sub}</p>}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setPicked(null)
            setSearch('')
            onChange('')
          }}
        >
          {t('exemptions.change')}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder={kind === 'staff' ? t('exemptions.searchStaff') : t('exemptions.searchChild')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {active && (
        <div className="max-h-48 overflow-y-auto rounded-md border">
          {fetching ? (
            <p className="p-3 text-sm text-muted-foreground">{t('exemptions.searching')}</p>
          ) : results.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">{t('exemptions.noResult')}</p>
          ) : (
            results.map((r) => (
              <button
                key={r.id}
                type="button"
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted"
                onClick={() => {
                  setPicked(r)
                  onChange(r.id)
                }}
              >
                <span className="truncate text-sm">{r.label}</span>
                {r.sub && <span className="shrink-0 text-xs text-muted-foreground">{r.sub}</span>}
              </button>
            ))
          )}
        </div>
      )}
      {!active && !picked && (
        <p className="text-xs text-muted-foreground">{t('exemptions.searchPrompt')}</p>
      )}
    </div>
  )
}
