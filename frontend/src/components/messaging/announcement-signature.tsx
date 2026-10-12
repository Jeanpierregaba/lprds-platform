'use client'

import { useTranslations } from 'next-intl'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CheckCircle2, Loader2, PenLine } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { messagingApi } from '@/lib/api/messaging.api'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { intlLocale } from '@/lib/utils/locale-format'
import type { Announcement } from '@/types/messaging'

/** Signature minimale d'un traducteur next-intl. */
type T = (key: string) => string

const makeSchema = (t: T) => z.object({
  signed_name: z.string().trim().min(2, t('validation.signatureNameRequired')).max(200),
  // La case n'est pas décorative : c'est elle qui fait de la saisie un ACTE.
  // Un nom tapé sans attestation cochée ne serait qu'un champ rempli.
  attest: z.boolean().refine((v) => v === true, {
    message: t('validation.signatureAttestRequired'),
  }),
})
type Form = z.infer<ReturnType<typeof makeSchema>>

/**
 * Signature d'une diffusion par le parent.
 *
 * ⚠️ Ne s'affiche QUE si la diffusion l'exige (`requires_signature`). Proposer
 * le geste partout banaliserait l'attestation et rendrait le compteur admin
 * illisible — on ne distinguerait plus « personne n'a signé » de « ce n'était
 * pas demandé ».
 *
 * Une fois signée, le bloc devient une CONFIRMATION datée, pas un formulaire
 * désactivé : le parent doit pouvoir constater ce qu'il a attesté et quand.
 * Resigner est refusé par l'API (409) — une attestation ne se rejoue pas.
 */
export function AnnouncementSignature({
  announcement,
  onSigned,
}: {
  announcement: Announcement
  onSigned?: (updated: Announcement) => void
}) {
  const t = useTranslations('messaging')

  const { control, register, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(makeSchema(t)),
    defaultValues: { signed_name: '', attest: false },
  })

  const signMutation = useMutation({
    mutationFn: (values: Form) =>
      messagingApi.signAnnouncement(announcement.id, values.signed_name),
    onSuccess: (res) => {
      toast.success(t('announcements.signatureSaved'))
      onSigned?.(res.data)
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  if (!announcement.requires_signature) return null

  if (announcement.is_signed) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
        <p className="break-words">
          {t('announcements.signed', {
            date: announcement.signed_at
              ? new Date(announcement.signed_at).toLocaleString(intlLocale(), {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })
              : '',
          })}
        </p>
      </div>
    )
  }

  const nameId = `sign-name-${announcement.id}`
  const attestId = `sign-attest-${announcement.id}`

  return (
    <form
      // Le clic ne doit pas remonter à la carte, qui marque la diffusion lue :
      // signer la marque déjà lue côté serveur, et un double appel ferait
      // clignoter l'état pour rien.
      onClick={(e) => e.stopPropagation()}
      onSubmit={handleSubmit((values) => signMutation.mutate(values))}
      className="space-y-3 rounded-md border border-primary/40 bg-primary/5 p-3"
      noValidate
    >
      <p className="flex items-start gap-2 text-sm font-medium">
        <PenLine className="mt-0.5 size-4 shrink-0 text-primary" />
        {t('announcements.signaturePrompt')}
      </p>

      <div className="space-y-2">
        <Label htmlFor={nameId}>{t('announcements.signatureNameLabel')}</Label>
        <Input
          id={nameId}
          autoComplete="name"
          placeholder={t('announcements.signatureNamePlaceholder')}
          aria-invalid={!!errors.signed_name}
          {...register('signed_name')}
        />
        {errors.signed_name && (
          <p className="text-sm text-destructive">{errors.signed_name.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-start gap-2">
          <Controller
            control={control}
            name="attest"
            render={({ field }) => (
              <Checkbox
                id={attestId}
                checked={field.value}
                onCheckedChange={(v) => field.onChange(v === true)}
                aria-invalid={!!errors.attest}
              />
            )}
          />
          <Label htmlFor={attestId} className="text-sm font-normal leading-snug">
            {t('announcements.signatureAttest')}
          </Label>
        </div>
        {errors.attest && <p className="text-sm text-destructive">{errors.attest.message}</p>}
      </div>

      <Button type="submit" size="sm" disabled={signMutation.isPending}>
        {signMutation.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
        {t('announcements.sign')}
      </Button>
    </form>
  )
}
