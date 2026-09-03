import { jsPDF } from 'jspdf'

import { downloadBlob } from './download'

const CARD_W = 1076
const CARD_H = 1461

const COLOR_QR = '#013e7c'
const COLOR_PRENOMS = '#72a522'
const COLOR_NOM = '#0c7ac9'
const COLOR_SECTION = '#57489f'

const QR_X = 155
const QR_Y = 610
const QR_SIZE = 300

const NAME_FONT_SIZE = 40
const NAME_X = 570
const PRENOMS_Y = 865
const NOM_Y = 655

const SECTION_FONT_SIZE = 40
const SECTION_X = 570
const SECTION_Y = 1070

let fontLoaded = false

async function ensureFredokaFont(): Promise<void> {
  if (fontLoaded) return

  const url = 'https://fonts.gstatic.com/s/fredoka/v14/X7nP6b87HGqHa4YjESAjb_kU.woff2'
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Font fetch failed: ${res.status}`)
    const buffer = await res.arrayBuffer()

    const font = new FontFace('FredokaCanvas', buffer)
    await font.load()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(document.fonts as any).add(font)
    fontLoaded = true
  } catch {
    fontLoaded = false
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`))
    img.src = src
  })
}

function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fontSize: number,
  maxWidth: number,
  color: string,
) {
  const font = fontLoaded ? '700' : 'bold'
  ctx.font = `${font} ${fontSize}px "FredokaCanvas", "Fredoka", sans-serif`
  ctx.fillStyle = color
  ctx.textBaseline = 'top'

  let display = text
  while (ctx.measureText(display).width > maxWidth && display.length > 3) {
    display = display.slice(0, -1)
  }
  if (display !== text) display += '\u2026'

  ctx.fillText(display, x, y)
}

function tintQrCode(img: HTMLImageElement, color: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth || 256
  canvas.height = img.naturalHeight || 256
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0)

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data
  const [r, g, b] = hexToRgb(color)
  const dr = r as number
  const dg = g as number
  const db = b as number

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue
    const luminance = 0.299 * (data[i] ?? 0) + 0.587 * (data[i + 1] ?? 0) + 0.114 * (data[i + 2] ?? 0)
    if (luminance < 128) {
      data[i] = dr
      data[i + 1] = dg
      data[i + 2] = db
    }
  }

  ctx.putImageData(imageData, 0, 0)
  return canvas
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export interface CardData {
  qrImage: string
  firstName: string
  lastName: string
  section: string
}

export async function generateCardImage(data: CardData): Promise<string> {
  await ensureFredokaFont()

  const canvas = document.createElement('canvas')
  canvas.width = CARD_W
  canvas.height = CARD_H
  const ctx = canvas.getContext('2d')!

  const templateSrc = '/images/template_card_id.png'
  const [templateImg, qrImg] = await Promise.all([
    loadImage(templateSrc),
    loadImage(data.qrImage),
  ])

  ctx.drawImage(templateImg, 0, 0, CARD_W, CARD_H)

  const tintedQr = tintQrCode(qrImg, COLOR_QR)
  ctx.drawImage(tintedQr, QR_X, QR_Y, QR_SIZE, QR_SIZE)

  drawText(ctx, data.firstName.toUpperCase(), NAME_X, PRENOMS_Y, NAME_FONT_SIZE, 530, COLOR_PRENOMS)
  drawText(ctx, data.lastName.toUpperCase(), NAME_X, NOM_Y, NAME_FONT_SIZE, 530, COLOR_NOM)
  drawText(ctx, data.section.toUpperCase(), SECTION_X, SECTION_Y, SECTION_FONT_SIZE, 860, COLOR_SECTION)


  return canvas.toDataURL('image/png')
}

export function downloadCardPng(dataUrl: string, data: CardData) {
  const base64 = dataUrl.split(',')[1]
  if (!base64) return
  const bin = atob(base64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  downloadBlob(new Blob([arr], { type: 'image/png' }), `carte-${data.firstName}-${data.lastName}.png`)
}

export async function downloadCardPdf(dataUrl: string, data: CardData) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()

  const margin = 10
  const availW = pageW - margin * 2
  const availH = pageH - margin * 2

  const ratio = Math.min(availW / CARD_W, availH / CARD_H)
  const imgW = CARD_W * ratio
  const imgH = CARD_H * ratio
  const x = (pageW - imgW) / 2
  const y = (pageH - imgH) / 2

  doc.addImage(dataUrl, 'PNG', x, y, imgW, imgH)
  doc.save(`carte-${data.firstName}-${data.lastName}.pdf`)
}
