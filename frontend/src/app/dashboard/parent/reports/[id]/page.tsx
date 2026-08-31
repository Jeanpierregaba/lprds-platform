'use client'

import { useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { ArrowLeft, Download, FileVideo, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AuthMedia } from '@/components/media/auth-media'
import { reportsApi } from '@/lib/api/reports.api'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { downloadBlob } from '@/lib/utils/download'
import { REPORT_TYPE_LABELS } from '@/types/reports'
import { ContentView } from '@/app/dashboard/admin/reports/content-view'

function formatDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('fr-FR', { dateStyle: 'long' }) : '—'
}

export default function ParentReportDetailPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()

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
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="mx-auto w-full max-w-2xl space-y-4"
    >
      <Link
        href="/dashboard/parent/reports"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Retour à la liste
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
            {report.report_type === 'annuel' && (
              <Button variant="outline" size="sm" onClick={() => downloadPdfMutation.mutate()} disabled={downloadPdfMutation.isPending}>
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
                    onClick={async () => {
                      try {
                        const res = await reportsApi.downloadMineAttachment(id, att.id)
                        downloadBlob(res.data, att.filename)
                      } catch (err) {
                        toast.error(getApiErrorMessage(err))
                      }
                    }}
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
    </motion.div>
  )
}
