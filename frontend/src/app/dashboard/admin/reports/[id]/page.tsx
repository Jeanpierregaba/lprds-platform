'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { ArrowLeft, FileVideo, Loader2, Paperclip, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { AuthMedia } from '@/components/media/auth-media'
import { AttachmentLightbox } from '@/components/media/attachment-lightbox'
import { reportsApi } from '@/lib/api/reports.api'
import { useUser } from '@/lib/stores/auth.store'
import { useMyPermissions } from '@/lib/hooks/use-my-permissions'
import { useReportForms } from '@/lib/reports/use-report-forms'
import { toDailyContent, fromDailyContent, fromBiMensuelContent, fromAnnualContent } from '@/lib/reports/content-schemas'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { REPORT_STATUS_BADGE_CLASS, REPORT_STATUS_LABELS, REPORT_TYPE_LABELS, type ReportAttachment } from '@/types/reports'
import { DailyFields } from '../daily-fields'
import { BiMensuelFields } from '../bimensuel-fields'
import { AnnualFields } from '../annual-fields'
import { ContentView } from '../content-view'

const rejectSchema = z.object({ reason: z.string().min(1, 'Motif requis') })
type RejectForm = z.infer<typeof rejectSchema>

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function ReportDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [selectedAttachment, setSelectedAttachment] = useState<ReportAttachment | null>(null)
  const { permissions, isLoading: isLoadingPermissions } = useMyPermissions()
  const canValidate = permissions.has('reports:validate')
  const user = useUser()
  const isAdmin = user?.role === 'admin'

  const { data: report, isLoading } = useQuery({
    queryKey: ['reports', 'detail', id],
    queryFn: () => reportsApi.get(id).then((r) => r.data),
  })

  const { data: vocabulary } = useQuery({
    queryKey: ['reports', 'vocabulary'],
    queryFn: () => reportsApi.getVocabulary().then((r) => r.data),
  })

  const { dailyForm, bimensuelForm, annualForm } = useReportForms()

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
    onSuccess: () => { toast.success('Rapport enregistré.'); invalidate() },
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
    onSuccess: () => { toast.success('Rapport soumis.'); invalidate() },
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
    onSuccess: () => { toast.success('Rapport validé et publié au parent.'); invalidate() },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const { register: registerReject, handleSubmit: handleRejectSubmit, reset: resetReject, formState: { errors: rejectErrors, isSubmitting: isRejecting } } =
    useForm<RejectForm>({ resolver: zodResolver(rejectSchema) })

  const rejectMutation = useMutation({
    mutationFn: (reason: string) => reportsApi.reject(id, reason),
    onSuccess: () => {
      toast.success('Rapport rejeté.')
      setRejectOpen(false)
      resetReject()
      invalidate()
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: () => reportsApi.remove(id),
    onSuccess: () => {
      toast.success('Rapport supprimé.')
      router.push('/dashboard/admin/reports')
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const uploadMutation = useMutation({
    mutationFn: (file: File) => reportsApi.uploadAttachment(id, file),
    onSuccess: () => { toast.success('Pièce jointe ajoutée.'); invalidate() },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const deleteAttachmentMutation = useMutation({
    mutationFn: (attachmentId: string) => reportsApi.deleteAttachment(id, attachmentId),
    onSuccess: (_data, attachmentId) => {
      toast.success('Pièce jointe retirée.')
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
    return <p className="text-muted-foreground">Rapport introuvable.</p>
  }

  // L'admin peut modifier un rapport à tout moment (même soumis, validé et
  // déjà lu par le parent) ; le staff reste limité au brouillon / rejeté.
  const isEditable = isAdmin || report.status === 'draft' || report.status === 'rejected'
  const isSubmittable = report.status === 'draft' || report.status === 'rejected'
  const isDeletable = report.status === 'draft' && !report.submitted_at

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <Link
        href="/dashboard/admin/reports"
        className="inline-flex items-center gap-1.5 text-sm text-white"
      >
        <ArrowLeft className="size-4 text-white" />
        <span className="text-white font-semibold">Retour à la liste</span>
      </Link>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle>{report.child.first_names} {report.child.last_name}</CardTitle>
              <CardDescription>
                {REPORT_TYPE_LABELS[report.report_type]} · {report.period_label}
              </CardDescription>
            </div>
            <Badge className={REPORT_STATUS_BADGE_CLASS[report.status]}>
              {REPORT_STATUS_LABELS[report.status]}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          <p>Créé par {report.created_by.nickname || `${report.created_by.first_name} ${report.created_by.last_name}`} · {formatDateTime(report.created_at)}</p>
          {report.validated_by && report.validated_at && (
            <p>Validé par {report.validated_by.nickname || `${report.validated_by.first_name} ${report.validated_by.last_name}`} · {formatDateTime(report.validated_at)}</p>
          )}
          {report.status === 'rejected' && report.rejected_reason && (
            <p className="text-destructive">Motif du rejet : {report.rejected_reason}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contenu</CardTitle>
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
                  {isSubmittable ? 'Enregistrer le brouillon' : 'Enregistrer les modifications'}
                </Button>
                {isSubmittable && (
                  <Button type="button" onClick={onSubmitReport} disabled={submitMutation.isPending}>
                    {submitMutation.isPending ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
                    Soumettre
                  </Button>
                )}
                {isDeletable && (
                  <AlertDialog>
                    <AlertDialogTrigger render={<Button type="button" variant="destructive" className="ml-auto" />}>
                      Supprimer
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Supprimer ce brouillon ?</AlertDialogTitle>
                        <AlertDialogDescription>Cette action est définitive.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteMutation.mutate()}>Supprimer</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
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
            <p className="mr-auto text-sm text-muted-foreground">
              Ce rapport est en attente de validation — sa publication notifie les parents par email.
            </p>
            <Button type="button" onClick={() => validateMutation.mutate()} disabled={validateMutation.isPending}>
              {validateMutation.isPending ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
              Valider et publier
            </Button>
            <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
              <DialogTrigger render={<Button type="button" variant="destructive" />}>
                Rejeter
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Rejeter ce rapport</DialogTitle>
                  <DialogDescription>Le rapport retourne à son auteur avec le motif indiqué.</DialogDescription>
                </DialogHeader>
                <form
                  onSubmit={handleRejectSubmit((values) => rejectMutation.mutate(values.reason))}
                  className="space-y-4" noValidate
                >
                  <div className="space-y-2">
                    <Label htmlFor="reason">Motif</Label>
                    <Textarea id="reason" rows={3} {...registerReject('reason')} aria-invalid={!!rejectErrors.reason} />
                    {rejectErrors.reason && <p className="text-sm text-destructive">{rejectErrors.reason.message}</p>}
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={isRejecting || rejectMutation.isPending}>
                      {isRejecting || rejectMutation.isPending ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
                      Rejeter
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
          <CardTitle className="text-base">Pièces jointes</CardTitle>
          <CardDescription>Photos et vidéos associées à ce rapport.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {report.attachments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune pièce jointe.</p>
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
                    aria-label={`Voir ${att.filename}`}
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
                  <AlertDialog>
                    <AlertDialogTrigger
                      render={
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon-xs"
                          className="absolute left-1.5 top-1.5 opacity-80 shadow transition hover:opacity-100"
                          aria-label={`Retirer ${att.filename}`}
                        />
                      }
                    >
                      <Trash2 className="size-3.5" />
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Retirer cette pièce jointe ?</AlertDialogTitle>
                        <AlertDialogDescription>
                          {att.filename} sera définitivement retirée de ce rapport.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteAttachmentMutation.mutate(att.id)}
                        >
                          Retirer
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
            </div>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
          >
            {uploadMutation.isPending ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Paperclip className="mr-1.5 size-4" />}
            Ajouter une pièce jointe
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) {
                const isMedia = (file.type.startsWith('image/') || file.type.startsWith('video/'))
                  && file.type !== 'image/svg+xml'
                if (!isMedia) {
                  toast.error('Type de fichier non autorisé : seules les images et vidéos sont acceptées.')
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
    </div>
  )
}
