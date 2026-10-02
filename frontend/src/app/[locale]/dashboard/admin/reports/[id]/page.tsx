'use client'

import { useTranslations } from 'next-intl'

import { useEffect, useRef, useState } from 'react'
import { intlLocale } from '@/lib/utils/locale-format'
import { useLabel } from '@/lib/i18n/labels'
import { useParams } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { FileVideo, Loader2, Paperclip, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { AuthMedia } from '@/components/media/auth-media'
import { AttachmentLightbox } from '@/components/media/attachment-lightbox'
import { reportsApi } from '@/lib/api/reports.api'
import { useUser } from '@/lib/stores/auth.store'
import { useMyPermissions } from '@/lib/hooks/use-my-permissions'
import { useReportForms } from '@/lib/reports/use-report-forms'
import { useAttendancePrefill } from '@/lib/reports/use-attendance-prefill'
import { toDailyContent, fromDailyContent, fromBiMensuelContent, fromAnnualContent } from '@/lib/reports/content-schemas'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { BackLink } from '@/components/dashboard/shared/page'
import { ConfirmDialog } from '@/components/dashboard/shared/dialogs'
import { REPORT_STATUS_BADGE_CLASS, type ReportAttachment } from '@/types/reports'
import { DailyFields } from '../daily-fields'
import { BiMensuelFields } from '../bimensuel-fields'
import { AnnualFields } from '../annual-fields'
import { ContentView } from '../content-view'
import { useRouter } from '@/i18n/navigation'
import { useReportVocabulary } from '@/lib/hooks/use-report-vocabulary'

/** Signature minimale d'un traducteur next-intl. */
type T = (key: string) => string

const makeRejectSchema = (t: T) => z.object({ reason: z.string().min(1, t('validation.reasonRequired')) })
type RejectForm = z.infer<ReturnType<typeof makeRejectSchema>>

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(intlLocale(), { dateStyle: 'medium', timeStyle: 'short' })
}

export default function ReportDetailPage() {
  const t = useTranslations('reports')
  const tCommon = useTranslations('common')
  const reportStatusLabel = useLabel('reportStatus')
  const reportTypesLabel = useLabel('reportTypes')
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [attachmentToRemove, setAttachmentToRemove] = useState<ReportAttachment | null>(null)
  const [confirmPublish, setConfirmPublish] = useState(false)
  const [selectedAttachment, setSelectedAttachment] = useState<ReportAttachment | null>(null)
  const { permissions, isLoading: isLoadingPermissions } = useMyPermissions()
  const canValidate = permissions.has('reports:validate')
  const user = useUser()
  const isAdmin = user?.role === 'admin'

  const { data: report, isLoading } = useQuery({
    queryKey: ['reports', 'detail', id],
    queryFn: () => reportsApi.get(id).then((r) => r.data),
  })

  const { data: vocabulary } = useReportVocabulary()

  const { dailyForm, bimensuelForm, annualForm } = useReportForms()

  useAttendancePrefill({
    active: report?.report_type === 'quotidien' && (isAdmin || report?.status === 'draft' || report?.status === 'rejected'),
    childId: report?.child.id,
    referenceDate: report?.period_start,
    form: dailyForm,
  })

  useEffect(() => {
    if (!report) return
    if (report.report_type === 'quotidien') dailyForm.reset(fromDailyContent(report.content))
    else if (report.report_type === 'bi_mensuel') bimensuelForm.reset(fromBiMensuelContent(report.content))
    else if (report.report_type === 'annuel') annualForm.reset(fromAnnualContent(report.content))
  }, [report?.id])

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['reports', 'detail', id] })
    queryClient.invalidateQueries({ queryKey: ['reports', 'list'] })
  }

  const activeForm = report?.report_type === 'quotidien' ? dailyForm
    : report?.report_type === 'bi_mensuel' ? bimensuelForm
    : report?.report_type === 'annuel' ? annualForm
    : null

  const saveMutation = useMutation({
    mutationFn: (content: Record<string, unknown>) =>
      reportsApi.update(id, { content }),
    onSuccess: () => { toast.success(t('detail.saved')); invalidate(); router.push('/dashboard/admin/reports') },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const onSave = () => {
    if (report?.report_type === 'quotidien') {
      dailyForm.handleSubmit((content) => saveMutation.mutate(toDailyContent(content) as unknown as Record<string, unknown>))()
    } else if (report?.report_type === 'bi_mensuel') {
      bimensuelForm.handleSubmit((content) => saveMutation.mutate(content as unknown as Record<string, unknown>))()
    } else if (report?.report_type === 'annuel') {
      annualForm.handleSubmit((content) => saveMutation.mutate(content as unknown as Record<string, unknown>))()
    }
  }

  const submitMutation = useMutation({
    mutationFn: async (content: Record<string, unknown>) => {
      await reportsApi.update(id, { content })
      return reportsApi.submit(id)
    },
    // Soumettre en tant qu'admin VALIDE et publie au parent dans le même appel
    // (décision produit assumée, cf. claude.md). L'écran annonçait pourtant
    // « Rapport soumis » sur un rapport déjà parti chez le parent — on lit donc
    // le statut que l'API renvoie au lieu de le supposer.
    onSuccess: ({ data }) => {
      toast.success(data.status === 'validated' ? t('detail.validated') : t('detail.submitted'))
      invalidate()
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const onSubmitReport = () => {
    if (report?.report_type === 'quotidien') {
      dailyForm.handleSubmit((content) => submitMutation.mutate(toDailyContent(content) as unknown as Record<string, unknown>))()
    } else if (report?.report_type === 'bi_mensuel') {
      bimensuelForm.handleSubmit((content) => submitMutation.mutate(content as unknown as Record<string, unknown>))()
    } else if (report?.report_type === 'annuel') {
      annualForm.handleSubmit((content) => submitMutation.mutate(content as unknown as Record<string, unknown>))()
    }
  }

  const validateMutation = useMutation({
    mutationFn: () => reportsApi.validate(id),
    onSuccess: () => { toast.success(t('detail.validated')); invalidate(); router.push('/dashboard/admin/reports') },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const { register: registerReject, handleSubmit: handleRejectSubmit, reset: resetReject, formState: { errors: rejectErrors, isSubmitting: isRejecting } } =
    useForm<RejectForm>({ resolver: zodResolver(makeRejectSchema(t)) })

  const rejectMutation = useMutation({
    mutationFn: (reason: string) => reportsApi.reject(id, reason),
    onSuccess: () => {
      toast.success(t('detail.rejected'))
      setRejectOpen(false)
      resetReject()
      invalidate()
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: () => reportsApi.remove(id),
    onSuccess: () => {
      toast.success(t('detail.deleted'))
      router.push('/dashboard/admin/reports')
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const uploadMutation = useMutation({
    mutationFn: (file: File) => reportsApi.uploadAttachment(id, file),
    onSuccess: () => { toast.success(t('detail.attachmentAdded')); invalidate() },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const deleteAttachmentMutation = useMutation({
    mutationFn: (attachmentId: string) => reportsApi.deleteAttachment(id, attachmentId),
    onSuccess: (_data, attachmentId) => {
      toast.success(t('detail.attachmentRemoved'))
      setSelectedAttachment((prev) => (prev?.id === attachmentId ? null : prev))
      invalidate()
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (!report) {
    return <p className="text-muted-foreground">{t('detail.notFound')}</p>
  }

  // L'admin peut modifier un rapport à tout moment (même validé et déjà lu par
  // le parent) ; le staff le peut tant qu'il n'est pas VALIDÉ — c'est-à-dire
  // tant que le parent ne l'a pas reçu. Doit rester aligné sur
  // `_ensure_mutable` côté API, sinon on retombe sur un bouton qui échoue.
  const isEditable = isAdmin || report.status !== 'validated'
  const isSubmittable = report.status === 'draft' || report.status === 'rejected'
  const isDeletable = report.status === 'draft' && !report.submitted_at

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <BackLink href="/dashboard/admin/reports" label={t('form.back')} />

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle>{report.child.first_names} {report.child.last_name}</CardTitle>
              <CardDescription>
                {reportTypesLabel(report.report_type)} · {report.period_label}
              </CardDescription>
            </div>
            <Badge className={REPORT_STATUS_BADGE_CLASS[report.status]}>
              {reportStatusLabel(report.status)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          <p>{t('detail.createdBy', { name: report.created_by.nickname || `${report.created_by.first_name} ${report.created_by.last_name}` })} · {formatDateTime(report.created_at)}</p>
          {report.validated_by && report.validated_at && (
            <p>{t('detail.validatedBy', { name: report.validated_by.nickname || `${report.validated_by.first_name} ${report.validated_by.last_name}` })} · {formatDateTime(report.validated_at)}</p>
          )}
          {report.status === 'rejected' && report.rejected_reason && (
            <p className="text-destructive">{t('detail.rejectedReason', { reason: report.rejected_reason })}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('detail.contentTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {isEditable && activeForm && vocabulary ? (
            <div className="space-y-4">
              {report.report_type === 'quotidien' && <DailyFields form={dailyForm} vocabulary={vocabulary} />}
              {report.report_type === 'bi_mensuel' && <BiMensuelFields form={bimensuelForm} vocabulary={vocabulary} />}
              {report.report_type === 'annuel' && <AnnualFields form={annualForm} vocabulary={vocabulary} />}

              <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                <Button type="button" variant="outline" onClick={onSave} disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
                  {isSubmittable ? t('detail.saveDraft') : t('detail.saveChanges')}
                </Button>
                {isSubmittable && (
                  <>
                    {/*
                      Pour un ADMIN, ce bouton ne soumet pas : il valide et
                      publie au parent, qui reçoit email et notification. Le
                      libellé « Soumettre » laissait croire à un envoi pour
                      approbation — un établissement a publié un rapport en
                      croyant enregistrer ses modifications. Il dit donc ce
                      qu'il fait, et demande confirmation : c'est irréversible
                      du point de vue du parent, qui a déjà été prévenu.
                    */}
                    <Button
                      type="button"
                      onClick={() => (isAdmin ? setConfirmPublish(true) : onSubmitReport())}
                      disabled={submitMutation.isPending}
                    >
                      {submitMutation.isPending ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
                      {isAdmin ? t('detail.validateAndPublish') : t('detail.submit')}
                    </Button>
                    {isAdmin && (
                      <ConfirmDialog
                        open={confirmPublish}
                        onOpenChange={setConfirmPublish}
                        title={t('detail.submitPublishesTitle')}
                        description={t('detail.submitPublishesBody')}
                        confirmLabel={t('detail.validateAndPublish')}
                        onConfirm={() => {
                          setConfirmPublish(false)
                          onSubmitReport()
                        }}
                      />
                    )}
                  </>
                )}
                {isDeletable && (
                  <>
                    <Button type="button" variant="destructive" className="ml-auto" onClick={() => setConfirmDelete(true)}>
                      {tCommon('actions.delete')}
                    </Button>
                    <ConfirmDialog
                      open={confirmDelete}
                      onOpenChange={setConfirmDelete}
                      title={t('detail.deleteTitle')}
                      description={t('detail.deleteBody')}
                      confirmLabel={t('detail.delete')}
                      destructive
                      onConfirm={() => {
                        setConfirmDelete(false)
                        deleteMutation.mutate()
                      }}
                    />
                  </>
                )}
              </div>
            </div>
          ) : vocabulary ? (
            <ContentView reportType={report.report_type} content={report.content} vocabulary={vocabulary} />
          ) : (
            <Skeleton className="h-64 w-full" />
          )}
        </CardContent>
      </Card>

      {report.status === 'submitted' && !isLoadingPermissions && canValidate && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-2">
            <p className="mr-auto text-sm text-muted-foreground">{t('awaitingValidation')}</p>
            <Button type="button" onClick={() => validateMutation.mutate()} disabled={validateMutation.isPending}>
              {validateMutation.isPending ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
              {t('detail.validateAndPublish')}
            </Button>
            <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
              <DialogTrigger render={<Button type="button" variant="destructive" />}>
                {t('detail.reject')}
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('detail.rejectTitle')}</DialogTitle>
                  <DialogDescription>{t('detail.rejectHint')}</DialogDescription>
                </DialogHeader>
                <form
                  onSubmit={handleRejectSubmit((values) => rejectMutation.mutate(values.reason))}
                  className="space-y-4" noValidate
                >
                  <div className="space-y-2">
                    <Label htmlFor="reason">{t('detail.reason')}</Label>
                    <Textarea id="reason" rows={3} {...registerReject('reason')} aria-invalid={!!rejectErrors.reason} />
                    {rejectErrors.reason && <p className="text-sm text-destructive">{rejectErrors.reason.message}</p>}
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={isRejecting || rejectMutation.isPending}>
                      {isRejecting || rejectMutation.isPending ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
                      {t('detail.reject')}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('detail.attachments')}</CardTitle>
          <CardDescription>{t('detail.mediaHint')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {report.attachments.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('detail.noAttachment')}</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {report.attachments.map((att) => (
                <div
                  key={att.id}
                  className="group relative aspect-square overflow-hidden rounded-md ring-1 ring-border transition hover:ring-primary"
                >
                  <button
                    type="button"
                    onClick={() => setSelectedAttachment(att)}
                    className="size-full"
                    aria-label={t('detail.view', { name: att.filename })}
                  >
                    <AuthMedia
                      queryKey={['reports', 'attachment-thumb', att.id]}
                      fetchBlob={() => reportsApi.downloadAttachment(id, att.id).then((r) => r.data)}
                      contentType={att.content_type}
                      alt={att.filename}
                      className="size-full transition group-hover:scale-105"
                    />
                  </button>
                  {att.content_type.startsWith('video/') && (
                    <FileVideo className="pointer-events-none absolute right-1.5 top-1.5 size-4 text-white drop-shadow" />
                  )}
                  {isEditable && (
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon-sm"
                      className="absolute left-2 top-2 h-10 w-10 opacity-80 shadow transition hover:opacity-100"
                      aria-label={t('detail.remove', { name: att.filename })}
                      onClick={() => setAttachmentToRemove(att)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
          {/*
            ⚠️ Cette carte ne portait AUCUNE garde de statut, alors que l'API en
            applique une : une éducatrice voyait « Ajouter une photo » sur un
            rapport qu'elle avait soumis, cliquait, et recevait un refus. Vu de
            l'établissement, ça ressemblait à un problème de compte — d'autant
            que l'admin, lui, réussit à tout statut. Le formulaire du contenu
            juste au-dessus se cachait déjà, lui : seule la carte des médias
            avait été oubliée.
          */}
          {isEditable ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadMutation.isPending}
            >
              {uploadMutation.isPending ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Paperclip className="mr-1.5 size-4" />}
              {t('detail.addAttachment')}
            </Button>
          ) : (
            // Masquer sans expliquer laisserait la même question sans réponse :
            // on dit pourquoi, et comment reprendre la main.
            <p className="text-sm text-muted-foreground">{t('detail.attachmentsLocked')}</p>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*,.heic,.heif,.avif,.mov,.3gp,.mkv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) {
                // ⚠️ On ne refuse que ce dont on est SÛR. Ce test exigeait un
                // MIME commençant par image/ ou video/ — or un `.heic`
                // d'iPhone, ou un fichier venu d'un gestionnaire de fichiers,
                // arrive souvent avec un type VIDE : la photo était refusée
                // ici, sans jamais atteindre le serveur, et la même photo
                // passait depuis un autre appareil. Le serveur lit désormais
                // les octets ; en cas de doute on le laisse trancher.
                const surelyWrong = file.type === 'image/svg+xml'
                  || (!!file.type && !file.type.startsWith('image/') && !file.type.startsWith('video/'))
                if (surelyWrong) {
                  toast.error(t('detail.badFileType'))
                } else {
                  uploadMutation.mutate(file)
                }
              }
              e.target.value = ''
            }}
          />
        </CardContent>
      </Card>

      {selectedAttachment && (
        <AttachmentLightbox
          filename={selectedAttachment.filename}
          contentType={selectedAttachment.content_type}
          sizeBytes={selectedAttachment.size_bytes}
          fetchBlob={() => reportsApi.downloadAttachment(id, selectedAttachment.id).then((r) => r.data)}
          onOpenChange={(open) => !open && setSelectedAttachment(null)}
        />
      )}

      <ConfirmDialog
        open={!!attachmentToRemove}
        onOpenChange={(open) => !open && setAttachmentToRemove(null)}
        title={t('detail.removeAttachmentTitle')}
        description={t('detail.removeAttachmentBody', { name: attachmentToRemove?.filename ?? '' })}
        confirmLabel={t('detail.removeLabel')}
        onConfirm={() => {
          if (attachmentToRemove) deleteAttachmentMutation.mutate(attachmentToRemove.id)
          setAttachmentToRemove(null)
        }}
      />
    </div>
  )
}
