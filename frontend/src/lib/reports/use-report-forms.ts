'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  dailyContentSchema, bimensuelContentSchema, annualContentSchema,
  DAILY_DEFAULTS, BIMENSUEL_DEFAULTS, ANNUAL_DEFAULTS,
  type DailyContentForm, type BiMensuelContentForm, type AnnualContentForm,
} from './content-schemas'

export function useReportForms() {
  const dailyForm = useForm<DailyContentForm>({
    resolver: zodResolver(dailyContentSchema),
    defaultValues: DAILY_DEFAULTS,
  })
  const bimensuelForm = useForm<BiMensuelContentForm>({
    resolver: zodResolver(bimensuelContentSchema),
    defaultValues: BIMENSUEL_DEFAULTS,
  })
  const annualForm = useForm<AnnualContentForm>({
    resolver: zodResolver(annualContentSchema),
    defaultValues: ANNUAL_DEFAULTS,
  })
  return { dailyForm, bimensuelForm, annualForm }
}
