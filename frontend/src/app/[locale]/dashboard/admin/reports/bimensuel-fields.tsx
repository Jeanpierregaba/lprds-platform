'use client'

import { useTranslations } from 'next-intl'

import { Controller, type UseFormReturn } from 'react-hook-form'
import { DOMAIN_KEYS } from '@/types/reports'
import { useLabel } from '@/lib/i18n/labels'

import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { CheckboxGroup } from './checkbox-group'
import type { BiMensuelContentForm } from '@/lib/reports/content-schemas'
import type { ReportVocabulary } from '@/types/reports'

export function BiMensuelFields({
  form, vocabulary,
}: { form: UseFormReturn<BiMensuelContentForm>; vocabulary: ReportVocabulary }) {
  const t = useTranslations('reports')
  const reportDomainsLabel = useLabel('reportDomains')
  const { register, control, formState: { errors } } = form

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">{t('content.learningActivities')}</h3>
      {DOMAIN_KEYS.map((key) => (
        <div key={key} className="space-y-2">
          <Label htmlFor={key}>{reportDomainsLabel(key)}</Label>
          <Textarea id={key} rows={2} {...register(key)} aria-invalid={!!errors[key]} />
          {errors[key] && <p className="text-sm text-destructive">{errors[key]?.message}</p>}
        </div>
      ))}

      <Separator />

      <div className="space-y-2">
        <Label>{t('fields.classBehaviors')}</Label>
        <Controller
          control={control}
          name="class_behaviors"
          render={({ field }) => (
            <CheckboxGroup options={vocabulary.class_behavior} value={field.value} onChange={field.onChange} />
          )}
        />
        {errors.class_behaviors && <p className="text-sm text-destructive">{errors.class_behaviors.message}</p>}
      </div>

      <div className="space-y-2">
        <Label>{t('fields.peerRelations')}</Label>
        <Controller
          control={control}
          name="peer_relations"
          render={({ field }) => (
            <CheckboxGroup options={vocabulary.peer_relation} value={field.value} onChange={field.onChange} />
          )}
        />
        {errors.peer_relations && <p className="text-sm text-destructive">{errors.peer_relations.message}</p>}
      </div>

      <div className="space-y-2">
        <Label>{t('fields.emotions')}</Label>
        <Controller
          control={control}
          name="emotion_management"
          render={({ field }) => (
            <CheckboxGroup options={vocabulary.emotion_management} value={field.value} onChange={field.onChange} />
          )}
        />
        {errors.emotion_management && <p className="text-sm text-destructive">{errors.emotion_management.message}</p>}
      </div>

      <Separator />

      <div className="space-y-2">
        <Label htmlFor="teacher_observations">{t('fields.teacherObservations')}</Label>
        <Textarea id="teacher_observations" rows={4} {...register('teacher_observations')} aria-invalid={!!errors.teacher_observations} />
        {errors.teacher_observations && <p className="text-sm text-destructive">{errors.teacher_observations.message}</p>}
      </div>

      <p className="text-xs text-muted-foreground">
        Les photos et vidéos de la période s&apos;ajoutent depuis la section Pièces jointes ci-dessous.
      </p>
    </div>
  )
}
