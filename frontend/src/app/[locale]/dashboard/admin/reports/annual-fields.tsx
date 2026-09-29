'use client'

import { Controller, type UseFormReturn } from 'react-hook-form'
import { DOMAIN_KEYS } from '@/types/reports'
import { useLabel } from '@/lib/i18n/labels'

import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { AnnualContentForm } from '@/lib/reports/content-schemas'
import type { ReportVocabulary } from '@/types/reports'

export function AnnualFields({
  form, vocabulary,
}: { form: UseFormReturn<AnnualContentForm>; vocabulary: ReportVocabulary }) {
  const reportDomainsLabel = useLabel('reportDomains')
  const { register, control, formState: { errors } } = form

  return (
    <div className="space-y-4">
      {DOMAIN_KEYS.map((key) => (
        <Card key={key}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">{reportDomainsLabel(key)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor={`${key}.rating`}>Notation</Label>
              <Controller
                control={control}
                name={`${key}.rating`}
                render={({ field }) => (
                  <Select items={vocabulary.acquisition_level} value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id={`${key}.rating`} className="w-full" aria-invalid={!!errors[key]?.rating}>
                      <SelectValue placeholder="Choisir..." />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(vocabulary.acquisition_level).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors[key]?.rating && <p className="text-sm text-destructive">{errors[key]?.rating?.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${key}.observation`}>Observation</Label>
              <Textarea id={`${key}.observation`} rows={2} {...register(`${key}.observation`)} aria-invalid={!!errors[key]?.observation} />
              {errors[key]?.observation && <p className="text-sm text-destructive">{errors[key]?.observation?.message}</p>}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
