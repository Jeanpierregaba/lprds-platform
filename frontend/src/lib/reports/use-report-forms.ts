'use client'

import { useForm } from 'react-hook-form'
import { useTranslations } from 'next-intl'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  makeDailyContentSchema, makeBimensuelContentSchema, makeAnnualContentSchema,
  DAILY_DEFAULTS, BIMENSUEL_DEFAULTS, ANNUAL_DEFAULTS,
  type DailyContentForm, type BiMensuelContentForm, type AnnualContentForm,
} from './content-schemas'

export function useReportForms() {
  const t = useTranslations('reports')
  const dailyForm = useForm<DailyContentForm>({
    resolver: zodResolver(makeDailyContentSchema(t)),
    defaultValues: DAILY_DEFAULTS,
  })
  const bimensuelForm = useForm<BiMensuelContentForm>({
    resolver: zodResolver(makeBimensuelContentSchema(t)),
    defaultValues: BIMENSUEL_DEFAULTS,
  })
  const annualForm = useForm<AnnualContentForm>({
    resolver: zodResolver(makeAnnualContentSchema(t)),
    defaultValues: ANNUAL_DEFAULTS,
  })
  return { dailyForm, bimensuelForm, annualForm }
}
