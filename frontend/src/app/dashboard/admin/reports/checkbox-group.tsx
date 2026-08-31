'use client'

import { Checkbox } from '@/components/ui/checkbox'

export function CheckboxGroup({
  options, value, onChange,
}: { options: Record<string, string>; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-2">
      {Object.entries(options).map(([code, label]) => {
        const checked = value.includes(code)
        return (
          <label key={code} className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={checked}
              onCheckedChange={(next) => onChange(next ? [...value, code] : value.filter((c) => c !== code))}
              className="mt-0.5"
            />
            <span>{label}</span>
          </label>
        )
      })}
    </div>
  )
}
