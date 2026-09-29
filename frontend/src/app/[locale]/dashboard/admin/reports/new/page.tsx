'use client'

import { useEffect, useState } from 'react'
import { useLabelMap } from '@/lib/i18n/labels'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { FileUp, Loader2, Search, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { childrenApi } from '@/lib/api/children.api'
import { reportsApi } from '@/lib/api/reports.api'
import { useReportForms } from '@/lib/reports/use-report-forms'
import { useAttendancePrefill } from '@/lib/reports/use-attendance-prefill'
import { toDailyContent } from '@/lib/reports/content-schemas'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { useUser } from '@/lib/stores/auth.store'
import { useMyPermissions } from '@/lib/hooks/use-my-permissions'
import { BackLink, PageMotion } from '@/components/dashboard/shared/page'
import { REPORT_TYPES, type ReportType } from '@/types/reports'
import type { ChildListItem } from '@/types/children'
import { DailyFields } from '../daily-fields'
import { BiMensuelFields } from '../bimensuel-fields'
import { AnnualFields } from '../annual-fields'
import { useRouter } from '@/i18n/navigation'

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

// Mêmes limites que le backend (REPORTS_MAX_ATTACHMENT_MB +
// REPORTS_ALLOWED_ATTACHMENT_TYPES, défauts config.py) — pré-vérification
// côté client pour éviter des échecs d'upload silencieux à la soumission.
// Le backend accepte désormais tout MIME image/* ou video/* (sauf
// image/svg+xml) : on reflète ce contrat ici.
const MAX_ATTACHMENT_MB = 50
const MAX_ATTACHMENT_BYTES = MAX_ATTACHMENT_MB * 1024 * 1024
const isAllowedMediaType = (type: string): boolean =>
  (type.startsWith('image/') || type.startsWith('video/')) && type !== 'image/svg+xml'

export default function NewReportPage() {
  const reportTypesLabels = useLabelMap('reportTypes', REPORT_TYPES)
  const router = useRouter()
  const user = useUser()
  const { permissions, isLoading: isLoadingPermissions } = useMyPermissions()

  // Une éducatrice sans children:read (cas standard, socle hors RBAC) n'a pas
  // accès à GET /children — jusqu'ici la recherche l'appelait quand même et
  // se prenait un 403 silencieux (aucun résultat, aucune erreur visible) :
  // impossible de trouver un enfant, même celui de son propre groupe. On
  // bascule donc pour elle sur /children/my-group (toujours autorisé, hors
  // RBAC) et on filtre côté client. Un admin, ou un staff avec children:read
  // en accès spécial, garde la recherche pleine base côté serveur.
  const hasChildrenRead = user?.role === 'admin' || permissions.has('children:read')

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedChild, setSelectedChild] = useState<ChildListItem | null>(null)
  const [reportType, setReportType] = useState<ReportType | ''>('')
  const [referenceDate, setReferenceDate] = useState(todayIso())
  const [stagedFiles, setStagedFiles] = useState<File[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [pendingAction, setPendingAction] = useState<'draft' | 'submit' | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  // Admin (ou staff avec children:read) : recherche/liste sur toute la base.
  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: ['children', { search: debouncedSearch }],
    queryFn: () => childrenApi.list({ search: debouncedSearch || undefined, limit: 10 }).then((r) => r.data),
    enabled: hasChildrenRead && debouncedSearch.length > 0 && !selectedChild,
  })

  const { data: allChildren, isLoading: isLoadingAll } = useQuery({
    queryKey: ['children', { all: true }],
    queryFn: () => childrenApi.list({ limit: 200 }).then((r) => r.data),
    enabled: hasChildrenRead && !debouncedSearch && !selectedChild,
  })

  // Staff sans children:read : uniquement les enfants de son/ses groupe(s),
  // toujours accessible, jamais de 403 — filtré côté client pour la recherche.
  const { data: myGroupChildren, isLoading: isLoadingMyGroup } = useQuery({
    queryKey: ['children', 'my-group'],
    queryFn: () => childrenApi.listMyGroup().then((r) => r.data),
    enabled: !hasChildrenRead && user?.role === 'staff' && !selectedChild,
  })

  const normalize = (s: string) => s.toLowerCase().trim()
  const myGroupFiltered = debouncedSearch
    ? (myGroupChildren?.items ?? []).filter((c) => {
        const q = normalize(debouncedSearch)
        return normalize(`${c.first_names} ${c.last_name}`).includes(q) || normalize(c.matricule).includes(q)
      })
    : (myGroupChildren?.items ?? [])

  const childResults = hasChildrenRead ? (debouncedSearch ? searchResults : allChildren) : { total: myGroupFiltered.length, items: myGroupFiltered }
  const isSearchingOrListing = hasChildrenRead
    ? (debouncedSearch ? isSearching : isLoadingAll)
    : isLoadingMyGroup

  const { data: allowedTypes, isLoading: isLoadingTypes } = useQuery({
    queryKey: ['reports', 'department-types', selectedChild?.department?.id],
    queryFn: () => reportsApi.listDepartmentReportTypes(selectedChild!.department!.id).then((r) => r.data),
    enabled: !!selectedChild?.department,
  })

  const { data: vocabulary, isLoading: isLoadingVocabulary } = useQuery({
    queryKey: ['reports', 'vocabulary'],
    queryFn: () => reportsApi.getVocabulary().then((r) => r.data),
  })

  const { dailyForm, bimensuelForm, annualForm } = useReportForms()

  useAttendancePrefill({
    active: reportType === 'quotidien',
    childId: selectedChild?.id,
    referenceDate,
    form: dailyForm,
    departmentId: selectedChild?.department?.id ?? undefined,
  })

  const activeForm = reportType === 'quotidien' ? dailyForm : reportType === 'bi_mensuel' ? bimensuelForm : reportType === 'annuel' ? annualForm : null

  const allowedTypeValues = new Set((allowedTypes ?? []).map((t) => t.report_type))

  const onCreate = async (content: Record<string, unknown>, action: 'draft' | 'submit') => {
    if (!selectedChild || !reportType) return
    setIsSubmitting(true)
    setPendingAction(action)
    try {
      const { data } = await reportsApi.create({
        child_id: selectedChild.id,
        report_type: reportType,
        reference_date: referenceDate,
        content,
      })

      let uploadFailures: string[] = []
      if (stagedFiles.length > 0) {
        const results = await Promise.allSettled(
          stagedFiles.map((file) => reportsApi.uploadAttachment(data.id, file))
        )
        uploadFailures = results
          .map((r, i) => (r.status === 'rejected' ? stagedFiles[i]?.name ?? null : null))
          .filter((name): name is string => name !== null)
      }

      if (action === 'submit' && uploadFailures.length === 0) {
        try {
          await reportsApi.submit(data.id)
          toast.success('Rapport créé et soumis.')
        } catch (err) {
          toast.error(`Rapport créé en brouillon, mais la soumission a échoué : ${getApiErrorMessage(err)}`)
        }
      } else if (uploadFailures.length > 0) {
        toast.error(
          `Rapport enregistré en brouillon — ${uploadFailures.length} pièce(s) jointe(s) n'ont pas pu être envoyée(s) : ` +
            `${uploadFailures.join(', ')}. Ré-ajoutez-les, puis soumettez depuis la page du rapport.`
        )
      } else {
        toast.success('Rapport créé (brouillon).')
      }
      router.push(`/dashboard/admin/reports/${data.id}`)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    } finally {
      setIsSubmitting(false)
      setPendingAction(null)
    }
  }

  const onFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return

    const valid: File[] = []
    const rejected: string[] = []
    for (const file of files) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        rejected.push(`${file.name} (dépasse ${MAX_ATTACHMENT_MB} Mo)`)
      } else if (!isAllowedMediaType(file.type)) {
        rejected.push(`${file.name} (type non accepté)`)
      } else {
        valid.push(file)
      }
    }
    if (rejected.length > 0) {
      toast.error(`Fichier(s) ignoré(s) : ${rejected.join(', ')}`)
    }
    if (valid.length > 0) {
      setStagedFiles((prev) => [...prev, ...valid])
    }
  }

  const runSubmit = (action: 'draft' | 'submit') => {
    if (reportType === 'quotidien') {
      dailyForm.handleSubmit((content) => onCreate(toDailyContent(content) as unknown as Record<string, unknown>, action))()
    } else if (reportType === 'bi_mensuel') {
      bimensuelForm.handleSubmit((content) => onCreate(content as unknown as Record<string, unknown>, action))()
    } else if (reportType === 'annuel') {
      annualForm.handleSubmit((content) => onCreate(content as unknown as Record<string, unknown>, action))()
    }
  }

  const onFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    runSubmit('draft')
  }

  return (
    <PageMotion className="mx-auto w-full max-w-2xl space-y-4">
      <BackLink href="/dashboard/admin/reports" label="Retour à la liste" />

      <Card>
        <CardHeader>
          <CardTitle>Nouveau rapport</CardTitle>
          <CardDescription>Enregistrez comme brouillon pour continuer plus tard, ou soumettez directement.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!selectedChild ? (
            <div className="space-y-2">
              <Label htmlFor="child_search">Enfant</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="child_search"
                  placeholder="Rechercher par nom, prénoms ou matricule..."
                  className="pl-8"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {!isLoadingPermissions && (
                <div className="max-h-72 divide-y divide-border overflow-y-auto rounded-md border border-border">
                  {isSearchingOrListing ? (
                    <div className="space-y-2 p-3">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-2/3" />
                    </div>
                  ) : childResults?.items.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground">
                      {debouncedSearch
                        ? 'Aucun résultat.'
                        : hasChildrenRead
                          ? 'Aucun enfant dans l\'établissement.'
                          : 'Vous ne menez encore aucun groupe.'}
                    </p>
                  ) : (
                    childResults?.items.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => { setSelectedChild(c); setReportType('') }}
                        className="flex w-full items-center justify-between gap-2 p-3 text-left text-sm hover:bg-muted"
                      >
                        <span className="font-medium">{c.first_names} {c.last_name}</span>
                        <span className="font-mono text-xs text-muted-foreground">{c.matricule}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <p className="font-medium">{selectedChild.first_names} {selectedChild.last_name}</p>
                <p className="text-xs text-muted-foreground">
                  {selectedChild.matricule} · {selectedChild.department?.name ?? 'Aucun département'}
                </p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => { setSelectedChild(null); setReportType('') }}>
                Changer
              </Button>
            </div>
          )}

          {selectedChild && !selectedChild.department && (
            <p className="text-sm text-destructive">
              Cet enfant n&apos;a pas de département assigné — impossible de créer un rapport.
            </p>
          )}

          {selectedChild?.department && (
            <>
              {isLoadingTypes ? (
                <Skeleton className="h-9 w-full" />
              ) : allowedTypeValues.size === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucun type de rapport activé pour le département « {selectedChild.department.name} ».
                  Configurez-le depuis l&apos;onglet Paramètres.
                </p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="report_type">Type de rapport</Label>
                    <Select
                      items={reportTypesLabels}
                      value={reportType}
                      onValueChange={(v) => setReportType((v as ReportType) ?? '')}
                    >
                      <SelectTrigger id="report_type" className="w-full">
                        <SelectValue placeholder="Choisir un type" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(reportTypesLabels)
                          .filter(([value]) => allowedTypeValues.has(value as ReportType))
                          .map(([value, label]) => (
                            <SelectItem key={value} value={value}>{label}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reference_date">Date de référence</Label>
                    <Input
                      id="reference_date" type="date" max={todayIso()}
                      value={referenceDate} onChange={(e) => setReferenceDate(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {reportType && activeForm && (
            isLoadingVocabulary || !vocabulary ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <form onSubmit={onFormSubmit} className="space-y-4" noValidate>
                {reportType === 'quotidien' && <DailyFields form={dailyForm} vocabulary={vocabulary} />}
                {reportType === 'bi_mensuel' && <BiMensuelFields form={bimensuelForm} vocabulary={vocabulary} />}
                {reportType === 'annuel' && <AnnualFields form={annualForm} vocabulary={vocabulary} />}

                <div className="space-y-2">
                  <Label htmlFor="attachments">Photos et vidéos</Label>
                  <div className="rounded-md border border-dashed border-border p-6 text-center ">
                    <FileUp className="mx-auto mb-2 size-6 text-muted-foreground" />
                    <Label htmlFor="attachments" className="cursor-pointer text-sm font-medium text-primary">
                      Choisir des fichiers
                    </Label>
                    <input
                      id="attachments"
                      type="file"
                      multiple
                      accept="image/*,video/*"
                      className="hidden"
                      onChange={onFilesSelected}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Envoyées automatiquement à la création du rapport.
                    </p>
                  </div>
                  {stagedFiles.length > 0 && (
                    <ul className="space-y-2">
                      {stagedFiles.map((file, index) => (
                        <li key={`${file.name}-${index}`} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                          <span className="truncate">{file.name}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Retirer ${file.name}`}
                            onClick={() => setStagedFiles((prev) => prev.filter((_, i) => i !== index))}
                          >
                            <X className="size-4" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    disabled={isSubmitting}
                    onClick={() => runSubmit('draft')}
                  >
                    {isSubmitting && pendingAction === 'draft'
                      ? <><Loader2 className="mr-2 size-4 animate-spin" /> Enregistrement...</>
                      : 'Enregistrer comme brouillon'}
                  </Button>
                  <Button
                    type="button"
                    className="flex-1"
                    disabled={isSubmitting}
                    onClick={() => runSubmit('submit')}
                  >
                    {isSubmitting && pendingAction === 'submit'
                      ? <><Loader2 className="mr-2 size-4 animate-spin" /> Soumission...</>
                      : 'Soumettre'}
                  </Button>
                </div>
              </form>
            )
          )}
        </CardContent>
      </Card>
    </PageMotion>
  )
}
