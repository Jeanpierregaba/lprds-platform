'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import jsQR from 'jsqr'
import { toast } from 'sonner'
import { AlertTriangle, Camera, CheckCircle2, Keyboard, Loader2, QrCode } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { attendanceApi } from '@/lib/api/attendance.api'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import type { AttendanceEvent, EventType } from '@/types/attendance'

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  arrival: 'Arrivée',
  departure: 'Départ',
  meal: 'Cantine (personnel uniquement)',
}

type CameraState = 'idle' | 'starting' | 'scanning' | 'denied' | 'unsupported'

function personLabel(event: AttendanceEvent) {
  const person = event.child ?? event.staff
  if (!person) return '—'
  return person.nickname || `${person.first_names ?? person.first_name ?? ''} ${person.last_name}`.trim()
}

export function ScanTab() {
  const queryClient = useQueryClient()

  const [cameraState, setCameraState] = useState<CameraState>('idle')
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [decodedPayload, setDecodedPayload] = useState<string | null>(null)
  const [manualPayload, setManualPayload] = useState('')

  const [eventType, setEventType] = useState<EventType>('arrival')
  const [companionName, setCompanionName] = useState('')
  const [companionPhone, setCompanionPhone] = useState('')

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const frameRef = useRef<number | null>(null)

  const stopCamera = useCallback(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current)
    frameRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  const scanLoop = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const code = jsQR(imageData.data, imageData.width, imageData.height)
        if (code?.data) {
          stopCamera()
          setCameraState('idle')
          setDecodedPayload(code.data)
          return
        }
      }
    }
    frameRef.current = requestAnimationFrame(scanLoop)
  }, [stopCamera])

  const startCamera = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCameraState('unsupported')
      return
    }
    setCameraState('starting')
    setCameraError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setCameraState('scanning')
      frameRef.current = requestAnimationFrame(scanLoop)
    } catch (err) {
      setCameraState('denied')
      setCameraError(err instanceof Error ? err.message : "Impossible d'accéder à la caméra")
    }
  }, [scanLoop])

  useEffect(() => () => stopCamera(), [stopCamera])

  const resetToIdle = () => {
    setDecodedPayload(null)
    setEventType('arrival')
    setCompanionName('')
    setCompanionPhone('')
  }

  const scanMutation = useMutation({
    mutationFn: () =>
      attendanceApi.scan({
        qr_payload: decodedPayload!,
        event_type: eventType,
        companion_name: companionName || undefined,
        companion_phone: companionPhone || undefined,
      }).then((r) => r.data),
    onSuccess: (event) => {
      toast.success(`${EVENT_TYPE_LABELS[event.event_type]} enregistré(e) — ${personLabel(event)}`)
      queryClient.invalidateQueries({ queryKey: ['attendance'] })
      resetToIdle()
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const onManualSubmit = () => {
    if (!manualPayload.trim()) return
    stopCamera()
    setCameraState('idle')
    setDecodedPayload(manualPayload.trim())
    setManualPayload('')
  }

  return (
    <div className="mx-auto max-w-md space-y-4 pt-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scanner un badge</CardTitle>
          <CardDescription>Activez la caméra et présentez le QR code.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {decodedPayload ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                <CheckCircle2 className="size-4 shrink-0 text-primary" />
                <span>QR code scanné — complétez les informations pour valider.</span>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="event_type">Type d&apos;événement</Label>
                <Select
                  items={EVENT_TYPE_LABELS}
                  value={eventType}
                  onValueChange={(v) => v && setEventType(v as EventType)}
                >
                  <SelectTrigger id="event_type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {eventType !== 'meal' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="companion_name">Accompagnateur (enfant, optionnel)</Label>
                    <Input id="companion_name" value={companionName} onChange={(e) => setCompanionName(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="companion_phone">Téléphone accompagnateur</Label>
                    <Input id="companion_phone" value={companionPhone} onChange={(e) => setCompanionPhone(e.target.value)} />
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={resetToIdle} disabled={scanMutation.isPending}>
                  Annuler
                </Button>
                <Button type="button" className="flex-1" onClick={() => scanMutation.mutate()} disabled={scanMutation.isPending}>
                  {scanMutation.isPending ? <><Loader2 className="mr-1.5 size-4 animate-spin" /> Validation...</> : 'Valider'}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="relative aspect-square w-full overflow-hidden rounded-md border border-border bg-black">
                <video ref={videoRef} className="size-full object-cover" muted playsInline />
                <canvas ref={canvasRef} className="hidden" />
                {cameraState !== 'scanning' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 p-4 text-center text-white">
                    {cameraState === 'denied' ? (
                      <>
                        <AlertTriangle className="size-8 text-destructive" />
                        <p className="text-sm">Accès caméra refusé ou indisponible.</p>
                        {cameraError && <p className="text-xs text-white/70">{cameraError}</p>}
                      </>
                    ) : cameraState === 'unsupported' ? (
                      <>
                        <AlertTriangle className="size-8 text-destructive" />
                        <p className="text-sm">Caméra non prise en charge par ce navigateur.</p>
                      </>
                    ) : cameraState === 'starting' ? (
                      <>
                        <Loader2 className="size-8 animate-spin text-white/70" />
                        <p className="text-sm text-white/70">Démarrage...</p>
                      </>
                    ) : (
                      <QrCode className="size-8 text-white/70" />
                    )}
                  </div>
                )}
              </div>

              <Button type="button" onClick={startCamera} disabled={cameraState === 'starting' || cameraState === 'scanning'} className="w-full">
                <Camera className="mr-1.5 size-4" />
                Scanner
              </Button>

              <details className="rounded-md border border-border p-3 text-sm">
                <summary className="cursor-pointer font-medium">
                  <Keyboard className="mr-1.5 inline size-4" />
                  Saisie manuelle (dépannage)
                </summary>
                <div className="mt-3 flex gap-2">
                  <Input
                    placeholder="Coller le jeton QR..."
                    value={manualPayload}
                    onChange={(e) => setManualPayload(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') onManualSubmit() }}
                  />
                  <Button type="button" variant="outline" onClick={onManualSubmit}>Envoyer</Button>
                </div>
              </details>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
