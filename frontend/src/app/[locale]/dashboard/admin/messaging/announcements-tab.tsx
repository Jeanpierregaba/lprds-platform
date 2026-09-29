'use client'

import { useState } from 'react'
import { intlLocale } from '@/lib/utils/locale-format'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Loader2, Megaphone, Paperclip, Plus } from 'lucide-react'
import { MAX_ANNOUNCEMENT_MEDIA, MediaPicker } from '@/components/messaging/media-picker'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { messagingApi } from '@/lib/api/messaging.api'
import { organizationApi } from '@/lib/api/organization.api'
import { AnnouncementMediaGrid } from '@/components/messaging/announcement-media-grid'
import { useMessagingEvent } from '@/lib/messaging/socket-context'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { InactiveSwitch } from '@/components/dashboard/shared/filters'
import { CardsEmptyState } from '@/components/dashboard/shared/cards'
import { ConfirmDialog } from '@/components/dashboard/shared/dialogs'
import type { Announcement } from '@/types/messaging'

const schema = z.object({
  title: z.string().min(1, 'Titre requis').max(200),
  body: z.string().min(1, 'Contenu requis'),
})
type Form = z.infer<typeof schema>

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(intlLocale(), { dateStyle: 'medium', timeStyle: 'short' })
}

export function AnnouncementsTab() {
  const queryClient = useQueryClient()
  const [includeInactive, setIncludeInactive] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Announcement | null>(null)
  const [attachFiles, setAttachFiles] = useState<File[]>([])
  // Ciblage : coché AVANT l'envoi (rédaction d'abord, périmètre ensuite).
  // broadcast=true → department_ids=[] (tous les parents).
  const [broadcast, setBroadcast] = useState(true)
  const [selectedDeptIds, setSelectedDeptIds] = useState<string[]>([])

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['messaging', 'announcements', { includeInactive }],
    queryFn: () => messagingApi.listAnnouncements({ include_inactive: includeInactive, limit: 200 }).then((r) => r.data),
  })

  const { data: departments = [], isLoading: isLoadingDepts, isError: isDeptsError } = useQuery({
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
    setAttachFiles([])
    setBroadcast(true)
    setSelectedDeptIds([])
    reset({ title: '', body: '' })
    setDialogOpen(true)
  }

  const openEdit = (a: Announcement) => {
    setEditing(a)
    setAttachFiles([])
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
      if (attachFiles.length > 0) {
        const uploaded = await messagingApi.uploadAnnouncementAttachments(announcement.id, attachFiles)
        if (!editing) toast.success(`${uploaded.data.length} média(s) ajouté(s).`)
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
        <InactiveSwitch
          id="announcement-include-inactive"
          checked={includeInactive}
          onCheckedChange={setIncludeInactive}
          label="Inclure les diffusions désactivées"
        />

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
                    onCheckedChange={(v) => {
                      const next = v === true
                      setBroadcast(next)
                      // Repartir d'une sélection vide quand on revient au
                      // ciblé (pas de surprise d'une ancienne sélection).
                      if (next) setSelectedDeptIds([])
                    }}
                  />
                  <Label htmlFor="announcement-broadcast" className="text-sm font-normal">
                    Tous les parents de l&apos;établissement
                  </Label>
                </div>
                {!broadcast && (
                  <div className="space-y-1 rounded-md border px-3 py-2">
                    {isLoadingDepts ? (
                      <div className="space-y-2 py-1">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-2/3" />
                      </div>
                    ) : isDeptsError ? (
                      <p className="text-sm text-destructive">
                        Impossible de charger les départements — réessayez en rouvrant ce dialogue.
                      </p>
                    ) : departments.length === 0 ? (
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

              <div className="space-y-2">
                <Label>Médias (facultatif, max {MAX_ANNOUNCEMENT_MEDIA})</Label>
                <MediaPicker files={attachFiles} onChange={setAttachFiles} />
              </div>

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
      ) : isError ? (
        <Card>
          <CardContent className="flex h-48 flex-col items-center justify-center gap-3 text-center">
            <p className="font-medium text-foreground">Impossible de charger les diffusions.</p>
            <p className="max-w-sm text-sm text-muted-foreground">Vérifiez votre connexion puis réessayez.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Réessayer
            </Button>
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <CardsEmptyState
          icon={Megaphone}
          title="Aucune diffusion pour le moment."
          heightClass="h-48"
        />
      ) : (
        <div className="space-y-3">
          {items.map((a) => (
            <AnnouncementCard
              key={a.id}
              announcement={a}
              deptNames={deptNames}
              onEdit={() => openEdit(a)}
              onToggleActive={() => toggleActiveMutation.mutate(a)}
              togglePending={toggleActiveMutation.isPending}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function AnnouncementCard({
  announcement, deptNames, onEdit, onToggleActive, togglePending,
}: {
  announcement: Announcement
  deptNames: Map<string, string>
  onEdit: () => void
  onToggleActive: () => void
  togglePending: boolean
}) {
  const queryClient = useQueryClient()
  const scoped = announcement.department_ids ?? []
  const [attachOpen, setAttachOpen] = useState(false)
  const [confirmToggle, setConfirmToggle] = useState(false)
  const [attachFiles, setAttachFiles] = useState<File[]>([])
  const remaining = MAX_ANNOUNCEMENT_MEDIA - announcement.attachments.length

  const batchMutation = useMutation({
    mutationFn: (files: File[]) => messagingApi.uploadAnnouncementAttachments(announcement.id, files),
    onSuccess: (res) => {
      toast.success(`${res.data.length} média(s) ajouté(s).`)
      setAttachFiles([])
      setAttachOpen(false)
      queryClient.invalidateQueries({ queryKey: ['messaging', 'announcements'] })
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })
  const slotsLeft = Math.max(remaining, 0)

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
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {!announcement.is_active && <Badge variant="outline">Inactive</Badge>}
            <Badge variant="outline" className="break-words font-normal">
              {scoped.length === 0
                ? 'Tous les parents'
                : scoped.map((id) => deptNames.get(id) ?? 'Département').join(', ')}
            </Badge>
            {announcement.read_count != null && announcement.total_parents != null && (
              <Badge variant="outline" className="whitespace-nowrap font-normal">
                {announcement.read_count}/{announcement.total_parents} ont lu
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="whitespace-pre-wrap text-sm">{announcement.body}</p>

        <AnnouncementMediaGrid attachments={announcement.attachments} />

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onEdit}>Modifier</Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmToggle(true)}
            disabled={togglePending}
          >
            {togglePending
              ? <Loader2 className="mr-1.5 size-4 animate-spin" />
              : null}
            {announcement.is_active ? 'Désactiver' : 'Réactiver'}
          </Button>
          <ConfirmDialog
            open={confirmToggle}
            onOpenChange={setConfirmToggle}
            title={announcement.is_active ? 'Désactiver cette diffusion ?' : 'Réactiver cette diffusion ?'}
            description={
              announcement.is_active
                ? 'Elle sera masquée à tous les parents (réversible).'
                : 'Elle redeviendra visible par les parents concernés.'
            }
            confirmLabel="Confirmer"
            onConfirm={() => {
              setConfirmToggle(false)
              onToggleActive()
            }}
          />
          <Dialog open={attachOpen} onOpenChange={(open) => {
            setAttachOpen(open)
            if (!open) setAttachFiles([])
          }}>
            <DialogTrigger render={
              <Button
                variant="ghost"
                size="sm"
                disabled={slotsLeft <= 0}
                title={slotsLeft <= 0 ? `Limite de ${MAX_ANNOUNCEMENT_MEDIA} médias atteinte` : 'Joindre des fichiers'}
              />
            }>
              <Paperclip className="mr-1.5 size-3.5" />
              Joindre des fichiers
            </DialogTrigger>
          <DialogContent className="max-h-[90dvh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Ajouter des médias</DialogTitle>
                <DialogDescription>
                  {slotsLeft <= 0
                    ? `Limite de ${MAX_ANNOUNCEMENT_MEDIA} médias atteinte pour cette diffusion.`
                    : `Photos, vidéos ou PDF — ${slotsLeft} emplacement${slotsLeft > 1 ? 's' : ''} restant${slotsLeft > 1 ? 's' : ''} sur ${MAX_ANNOUNCEMENT_MEDIA}.`}
                </DialogDescription>
              </DialogHeader>
              <MediaPicker files={attachFiles} onChange={setAttachFiles} max={slotsLeft} />
              <DialogFooter>
                <Button
                  type="button"
                  onClick={() => batchMutation.mutate(attachFiles)}
                  disabled={attachFiles.length === 0 || batchMutation.isPending}
                >
                  {batchMutation.isPending
                    ? <><Loader2 className="mr-1.5 size-4 animate-spin" /> Envoi...</>
                    : `Envoyer (${attachFiles.length})`}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  )
}
