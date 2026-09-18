'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Baby, Download, IdCard, QrCode, Search, UserRound } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { attendanceApi } from '@/lib/api/attendance.api'
import { childrenApi } from '@/lib/api/children.api'
import { staffApi } from '@/lib/api/staff.api'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { CardPreviewModal } from '@/components/card-preview-modal'
import { TabFade } from './dashboard-tab'

/** Nom de fichier à partir du nom affiché : « Tata Victoire » → « tata-victoire ». */
function slugifyName(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function QrCodesTab() {
  return (
    <div className="pt-2">
      <Tabs defaultValue="children">
        <TabsList className="h-auto w-full gap-1.5 overflow-x-auto rounded-2xl bg-card p-1.5 shadow-soft ring-1 ring-border sm:w-fit">
          <TabsTrigger
            value="children"
            className="rounded-xl px-4 py-2.5 text-muted-foreground transition-all duration-300 ease-in-out hover:bg-accent hover:text-foreground data-active:bg-primary data-active:text-white data-active:shadow-md"
          >
            <Baby className="mr-1.5 size-4" />
            Enfants
          </TabsTrigger>
          <TabsTrigger
            value="staff"
            className="rounded-xl px-4 py-2.5 text-muted-foreground transition-all duration-300 ease-in-out hover:bg-accent hover:text-foreground data-active:bg-teal data-active:text-white data-active:shadow-md"
          >
            <UserRound className="mr-1.5 size-4" />
            Personnel
          </TabsTrigger>
        </TabsList>
        <TabsContent value="children">
          <TabFade value="children">
            <PersonQrCode personType="child" />
          </TabFade>
        </TabsContent>
        <TabsContent value="staff">
          <TabFade value="staff">
            <PersonQrCode personType="staff" />
          </TabFade>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function PersonQrCode({ personType }: { personType: 'child' | 'staff' }) {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showCardModal, setShowCardModal] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => setSelectedId(null), [debouncedSearch, personType])

  const { data: childResults, isLoading: isSearchingChildren } = useQuery({
    queryKey: ['children', { search: debouncedSearch }],
    queryFn: () => childrenApi.list({ search: debouncedSearch || undefined, limit: 10 }).then((r) => r.data),
    enabled: personType === 'child' && debouncedSearch.length > 0,
  })

  const { data: staffResults, isLoading: isSearchingStaff } = useQuery({
    queryKey: ['staff', { search: debouncedSearch }],
    queryFn: () => staffApi.list({ search: debouncedSearch || undefined, limit: 10 }).then((r) => r.data),
    enabled: personType === 'staff' && debouncedSearch.length > 0,
  })

  const isSearching = personType === 'child' ? isSearchingChildren : isSearchingStaff

  const results = personType === 'child'
    ? (childResults?.items.map((c) => ({ id: c.id, label: `${c.first_names} ${c.last_name}`, sub: c.matricule })) ?? [])
    : (staffResults?.items.map((s) => ({ id: s.id, label: s.nickname || `${s.first_name} ${s.last_name}`, sub: s.matricule })) ?? [])

  const { data: qrcode, isLoading: isLoadingQr, error } = useQuery({
    queryKey: ['attendance', 'qrcode', personType, selectedId],
    queryFn: () =>
      (personType === 'child' ? attendanceApi.getChildQrcode(selectedId!) : attendanceApi.getStaffQrcode(selectedId!))
        .then((r) => r.data),
    enabled: !!selectedId,
  })

  const selected = results.find((r) => r.id === selectedId)

  const { data: childDetail } = useQuery({
    queryKey: ['children', selectedId],
    queryFn: () => childrenApi.get(selectedId!).then((r) => r.data),
    enabled: personType === 'child' && !!selectedId,
  })

  const cardData =
    childDetail && qrcode
      ? {
          qrImage: qrcode.qr_image,
          matricule: qrcode.matricule,
          firstName: childDetail.first_names,
          lastName: childDetail.last_name,
          section: childDetail.section?.name ?? '',
        }
      : null

  return (
    <div className="grid gap-4 pt-2 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rechercher</CardTitle>
          <CardDescription>
            Par nom{personType === 'child' ? ', prénoms' : ', surnom'} ou matricule.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Rechercher..."
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {debouncedSearch && (
            <div className="divide-y divide-border rounded-md border border-border">
              {isSearching ? (
                <div className="space-y-2 p-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              ) : results.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">Aucun résultat.</p>
              ) : (
                results.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedId(r.id)}
                    className={`flex w-full items-center justify-between gap-2 p-3 text-left text-sm transition-colors hover:bg-muted ${
                      selectedId === r.id ? 'bg-muted' : ''
                    }`}
                  >
                    <span className="font-medium">{r.label}</span>
                    <span className="font-mono text-xs text-muted-foreground">{r.sub ?? '—'}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">QR code</CardTitle>
          <CardDescription>{selected ? selected.label : 'Sélectionnez une personne.'}</CardDescription>
        </CardHeader>
        <CardContent>
          {!selectedId ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
              <QrCode className="size-8" />
              <p className="text-sm">Aucune sélection.</p>
            </div>
          ) : isLoadingQr ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <Skeleton className="size-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">{getApiErrorMessage(error)}</p>
          ) : qrcode ? (
            <div className="flex flex-col items-center gap-3 py-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- data URI, no next/image optimization to gain */}
              <img
                src={qrcode.qr_image}
                alt={`QR code de ${selected?.label}`}
                className="size-48 rounded-md border border-border bg-white p-2"
              />
              <p className="font-mono text-sm text-muted-foreground">{qrcode.matricule}</p>
              <Button variant="outline" size="sm" render={<a href={qrcode.qr_image} download={personType === 'staff' && selected ? `qr-${slugifyName(selected.label)}.png` : `qr-${qrcode.matricule}.png`} />}>
                <Download className="mr-1.5 size-4" />
                Télécharger
              </Button>
              {personType === 'child' && cardData && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setShowCardModal(true)}
                >
                  <IdCard className="mr-1.5 size-4" />
                  Générer la carte scolaire
                </Button>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {cardData && (
        <CardPreviewModal
          open={showCardModal}
          onOpenChange={setShowCardModal}
          cardData={cardData}
        />
      )}
    </div>
  )
}
