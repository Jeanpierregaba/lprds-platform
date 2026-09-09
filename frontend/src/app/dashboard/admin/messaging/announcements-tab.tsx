'use client'

import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Loader2, Megaphone, Paperclip, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { messagingApi } from '@/lib/api/messaging.api'
import { organizationApi } from '@/lib/api/organization.api'
import { useMessagingEvent } from '@/lib/messaging/socket-context'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { downloadBlob } from '@/lib/utils/download'
import type { Announcement } from '@/types/messaging'

const schema = z.object({
  title: z.string().min(1, 'Titre requis').max(200),
  body: z.string().min(1, 'Contenu requis'),
})
type Form = z.infer<typeof schema>

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
}

export function AnnouncementsTab() {
  const queryClient = useQueryClient()
  const [includeInactive, setIncludeInactive] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Announcement | null>(null)
  const [attachFile, setAttachFile] = useState<File | null>(null)
  // Ciblage : coché AVANT l'envoi (rédaction d'abord, périmètre ensuite).
  // broadcast=true → department_ids=[] (tous les parents).
  const [broadcast, setBroadcast] = useState(true)
  const [selectedDeptIds, setSelectedDeptIds] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['messaging', 'announcements', { includeInactive }],
    queryFn: () => messagingApi.listAnnouncements({ include_inactive: includeInactive }).then((r) => r.data),
  })

  const { data: departments = [] } = useQuery({
    queryKey: ['organization', 'departments'],
    queryFn: () => organizationApi.listDepartments().then((r) => r.data),
  })
  const deptNames = new Map(departments.map((d) => [d.id, d.name]))

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['messaging', 'announcements'] })

  useMessagingEvent((event) => {
    if (event.type === 'announcement') {
      invalidate()
    } else if (event.type === 'announcement_read') {
      queryClient.setQueriesData<{ total: number; items: Announcement[] } | undefined>(
        { queryKey: ['messaging', 'announcements'] },
        (old) => {
          if (!old) return old
          return {
            ...old,
            items: old.items.map((a) =>
              a.id === event.announcement_id ? { ...a, read_count: event.read_count } : a
            ),
          }
        }
      )
    } else if (event.type === 'announcement_attachment') {
      invalidate()
    }
  })

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
  })

  const openCreate = () => {
    setEditing(null)
    setAttachFile(null)
    setBroadcast(true)
    setSelectedDeptIds([])
    reset({ title: '', body: '' })
    setDialogOpen(true)
  }

  const openEdit = (a: Announcement) => {
    setEditing(a)
    setAttachFile(null)
    const scoped = a.department_ids ?? []
    setBroadcast(scoped.length === 0)
    setSelectedDeptIds(scoped)
    reset({ title: a.title, body: a.body })
    setDialogOpen(true)
  }

  const toggleDept = (id: string) =>
    setSelectedDeptIds((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]))

  const onSubmit = async (values: Form) => {
    if (!broadcast && selectedDeptIds.length === 0) {
      toast.error('Cochez au moins un département, ou choisissez « Tous les parents ».')
      return
    }
    const department_ids = broadcast ? [] : selectedDeptIds
    try {
      let announcement: Announcement
      if (editing) {
        await messagingApi.updateAnnouncement(editing.id, { ...values, department_ids })
        announcement = editing
        toast.success('Diffusion mise à jour.')
      } else {
        const created = await messagingApi.createAnnouncement({ ...values, department_ids })
        announcement = created.data
        toast.success('Diffusion publiée.')
      }
      if (attachFile) {
        await messagingApi.uploadAnnouncementAttachment(announcement.id, attachFile)
        if (!editing) toast.success('Pièce jointe ajoutée.')
      }
      setDialogOpen(false)
      invalidate()
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  const toggleActiveMutation = useMutation({
    mutationFn: (a: Announcement) => messagingApi.updateAnnouncement(a.id, { is_active: !a.is_active }),
    onSuccess: (_, a) => {
      toast.success(a.is_active ? 'Diffusion désactivée.' : 'Diffusion réactivée.')
      invalidate()
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const items = data?.items ?? []

  return (
    <div className="space-y-4 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Switch id="announcement-include-inactive" checked={includeInactive} onCheckedChange={setIncludeInactive} />
          <Label htmlFor="announcement-include-inactive" className="text-sm text-white font-semibold">Inclure les diffusions désactivées</Label>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger render={<Button onClick={openCreate} />}>
            <Plus className="mr-1.5 size-4" />
            Nouvelle diffusion
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? 'Modifier la diffusion' : 'Nouvelle diffusion'}</DialogTitle>
              <DialogDescription>
                Rédigez le message en entier, puis cochez les départements concernés avant l&apos;envoi.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="title">Titre</Label>
                <Input id="title" {...register('title')} aria-invalid={!!errors.title} />
                {errors.title && <p className="text-sm text-destructive">{errors.title.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="body">Contenu</Label>
                <Textarea id="body" rows={5} {...register('body')} aria-invalid={!!errors.body} />
                {errors.body && <p className="text-sm text-destructive">{errors.body.message}</p>}
              </div>

              <div className="space-y-2">
                <Label>Destinataires</Label>
                <div className="flex items-center gap-2 rounded-md border px-3 py-2">
                  <Checkbox
                    id="announcement-broadcast"
                    checked={broadcast}
                    onCheckedChange={(v) => setBroadcast(v === true)}
                  />
                  <Label htmlFor="announcement-broadcast" className="text-sm font-normal">
                    Tous les parents de l&apos;établissement
                  </Label>
                </div>
                {!broadcast && (
                  <div className="space-y-1 rounded-md border px-3 py-2">
                    {departments.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Aucun département dans l&apos;établissement.</p>
                    ) : (
                      departments.map((d) => (
                        <div key={d.id} className="flex items-center gap-2 py-1">
                          <Checkbox
                            id={`announcement-dept-${d.id}`}
                            checked={selectedDeptIds.includes(d.id)}
                            onCheckedChange={() => toggleDept(d.id)}
                          />
                          <Label htmlFor={`announcement-dept-${d.id}`} className="text-sm font-normal">
                            {d.name}
                          </Label>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {!editing && (
                <div className="space-y-2">
                  <Label>Pièce jointe (facultatif)</Label>
                  {attachFile ? (
                    <div className="flex items-center gap-2 rounded-md border px-3 py-2">
                      <Paperclip className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate text-sm">{attachFile.name}</span>
                      <button
                        type="button"
                        onClick={() => setAttachFile(null)}
                        className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                      >
                        Retirer
                      </button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Paperclip className="mr-1.5 size-3.5" />
                      Joindre un fichier
                    </Button>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) setAttachFile(file)
                      e.target.value = ''
                    }}
                  />
                </div>
              )}

              <DialogFooter>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting
                    ? <><Loader2 className="mr-2 size-4 animate-spin" /> Enregistrement...</>
                    : editing ? 'Enregistrer' : 'Publier'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex h-48 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <Megaphone className="size-5" />
            </div>
            <p className="font-medium text-foreground">Aucune diffusion pour le moment.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((a) => (
            <AnnouncementCard
              key={a.id}
              announcement={a}
              deptNames={deptNames}
              onEdit={() => openEdit(a)}
              onToggleActive={() => toggleActiveMutation.mutate(a)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function AnnouncementCard({
  announcement, deptNames, onEdit, onToggleActive,
}: {
  announcement: Announcement
  deptNames: Map<string, string>
  onEdit: () => void
  onToggleActive: () => void
}) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scoped = announcement.department_ids ?? []

  const uploadMutation = useMutation({
    mutationFn: (file: File) => messagingApi.uploadAnnouncementAttachment(announcement.id, file),
    onSuccess: () => {
      toast.success('Pièce jointe ajoutée.')
      queryClient.invalidateQueries({ queryKey: ['messaging', 'announcements'] })
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) uploadMutation.mutate(file)
    e.target.value = ''
  }

  return (
    <Card className={!announcement.is_active ? 'opacity-70' : undefined}>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{announcement.title}</CardTitle>
            <CardDescription>
              {announcement.created_by.nickname || `${announcement.created_by.first_name} ${announcement.created_by.last_name}`}
              {' · '}{formatDateTime(announcement.created_at)}
            </CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {!announcement.is_active && <Badge variant="outline">Inactive</Badge>}
            <Badge variant="outline" className="font-normal">
              {scoped.length === 0
                ? 'Tous les parents'
                : scoped.map((id) => deptNames.get(id) ?? 'Département').join(', ')}
            </Badge>
            {announcement.read_count != null && (
              <Badge variant="outline" className="font-normal">
                {announcement.read_count}/{announcement.total_parents} ont lu
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="whitespace-pre-wrap text-sm">{announcement.body}</p>

        {announcement.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {announcement.attachments.map((att) => (
              <Button
                key={att.id}
                type="button"
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    const res = await messagingApi.downloadAttachment(att.id)
                    downloadBlob(res.data, att.filename)
                  } catch (err) {
                    toast.error(getApiErrorMessage(err))
                  }
                }}
              >
                <Paperclip className="mr-1.5 size-3.5" />
                {att.filename}
              </Button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onEdit}>Modifier</Button>
          <Button variant="outline" size="sm" onClick={onToggleActive}>
            {announcement.is_active ? 'Désactiver' : 'Réactiver'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
          >
            {uploadMutation.isPending
              ? <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              : <Paperclip className="mr-1.5 size-3.5" />}
            Joindre un fichier
          </Button>
          <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={onFileChange} />
        </div>
      </CardContent>
    </Card>
  )
}
