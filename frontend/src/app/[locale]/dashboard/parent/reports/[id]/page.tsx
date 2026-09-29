'use client'

import { useEffect, useState } from 'react'
import { useLabel } from '@/lib/i18n/labels'
import { useParams } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Download, FileVideo, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AuthMedia } from '@/components/media/auth-media'
import { AttachmentLightbox } from '@/components/media/attachment-lightbox'
import { reportsApi } from '@/lib/api/reports.api'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { downloadBlob } from '@/lib/utils/download'
import { BackLink, PageMotion } from '@/components/dashboard/shared/page'
import { type ReportAttachment } from '@/types/reports'
import { ContentView } from '@/app/[locale]/dashboard/admin/reports/content-view'

function formatDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('fr-FR', { dateStyle: 'long' }) : '—'
}

export default function ParentReportDetailPage() {
  const reportTypesLabel = useLabel('reportTypes')
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const [selectedAttachment, setSelectedAttachment] = useState<ReportAttachment | null>(null)

  const { data: report, isLoading } = useQuery({
    queryKey: ['parent', 'report', id],
    queryFn: () => reportsApi.getMine(id).then((r) => r.data),
  })

  const { data: vocabulary } = useQuery({
    queryKey: ['reports', 'vocabulary'],
    queryFn: () => reportsApi.getVocabulary().then((r) => r.data),
  })

  const markReadMutation = useMutation({
    mutationFn: () => reportsApi.markMineRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parent', 'report', id] })
      queryClient.invalidateQueries({ queryKey: ['parent', 'reports-mine'] })
    },
  })

  useEffect(() => {
    if (report && !report.is_read) markReadMutation.mutate()
  }, [report, markReadMutation])

  const downloadPdfMutation = useMutation({
    mutationFn: () => reportsApi.downloadMinePdf(id),
    onSuccess: (res) => downloadBlob(res.data, `bulletin-${id}.pdf`),
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

  return (
    <PageMotion className="mx-auto w-full max-w-2xl space-y-4">
      <BackLink href="/dashboard/parent/reports" label="Retour à la liste" />

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
            <div className="min-w-0">
              <CardTitle className="break-words">{report.child.first_names} {report.child.last_name}</CardTitle>
              <CardDescription>
                {reportTypesLabel(report.report_type)} · {report.period_label}
              </CardDescription>
            </div>
            {report.report_type === 'annuel' && (
              <Button variant="outline" size="sm" className="h-10 shrink-0 sm:w-auto" onClick={() => downloadPdfMutation.mutate()} disabled={downloadPdfMutation.isPending}>
                {downloadPdfMutation.isPending ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Download className="mr-1.5 size-4" />}
                Bulletin PDF
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Publié le {formatDate(report.validated_at)}
        </CardContent>
      </Card>

      {report.summary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Résumé</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{report.summary}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contenu</CardTitle>
        </CardHeader>
        <CardContent>
          {vocabulary ? (
            <ContentView reportType={report.report_type} content={report.content} vocabulary={vocabulary} />
          ) : (
            <Skeleton className="h-64 w-full" />
          )}
        </CardContent>
      </Card>

      {report.attachments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Photos et vidéos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {report.attachments.map((att) => (
                <div key={att.id} className="group relative aspect-square overflow-hidden rounded-md ring-1 ring-border">
                  <button
                    type="button"
                    className="size-full"
                    onClick={() => setSelectedAttachment(att)}
                  >
                    <AuthMedia
                      queryKey={['parent', 'report-attachment-thumb', att.id]}
                      fetchBlob={() => reportsApi.downloadMineAttachment(id, att.id).then((r) => r.data)}
                      contentType={att.content_type}
                      alt={att.filename}
                      className="size-full"
                    />
                  </button>
                  {att.content_type.startsWith('video/') && (
                    <FileVideo className="pointer-events-none absolute right-1.5 top-1.5 size-4 text-white drop-shadow" />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {selectedAttachment && (
        <AttachmentLightbox
          filename={selectedAttachment.filename}
          contentType={selectedAttachment.content_type}
          sizeBytes={selectedAttachment.size_bytes}
          fetchBlob={() => reportsApi.downloadMineAttachment(id, selectedAttachment.id).then((r) => r.data)}
          onOpenChange={(open) => !open && setSelectedAttachment(null)}
        />
      )}
    </PageMotion>
  )
}
