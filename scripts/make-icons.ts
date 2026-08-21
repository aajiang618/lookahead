/**
 * The home-screen icon, drawn rather than pasted.
 *
 * iOS wants a real PNG for `apple-touch-icon`, and the app's mark is four
 * corner brackets around a cross — pure axis-aligned stroke, so it rasterises
 * exactly with filled rectangles and needs no drawing library.
 * Generating it keeps the icon honest: it is built from the same three colours
 * as the interface, and regenerating after a palette change is one command.
 *
 *   node --experimental-strip-types scripts/make-icons.ts
 */

import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const GROUND = [0xff, 0xff, 0xff]
const INK = [0x14, 0x18, 0x1b]
const CAUTION = [0xb4, 0x53, 0x09]

type RGB = number[]

class Canvas {
  data: Uint8Array
  size: number
  constructor(size: number) {
    this.size = size
    this.data = new Uint8Array(size * size * 4)
  }
  fill(colour: RGB) {
    for (let i = 0; i < this.size * this.size; i++) this.px(i, colour)
  }
  private px(index: number, c: RGB) {
    const o = index * 4
    this.data[o] = c[0]
    this.data[o + 1] = c[1]
    this.data[o + 2] = c[2]
    this.data[o + 3] = 255
  }
  rect(x: number, y: number, w: number, h: number, c: RGB) {
    const x0 = Math.round(x)
    const y0 = Math.round(y)
    const x1 = Math.round(x + w)
    const y1 = Math.round(y + h)
    for (let py = Math.max(0, y0); py < Math.min(this.size, y1); py++) {
      for (let px = Math.max(0, x0); px < Math.min(this.size, x1); px++) {
        this.px(py * this.size + px, c)
      }
    }
  }
  png(): Buffer {
    const { size, data } = this
    // One filter byte (0 = none) per scanline, then the raw RGBA row.
    const raw = Buffer.alloc(size * (size * 4 + 1))
    for (let y = 0; y < size; y++) {
      raw[y * (size * 4 + 1)] = 0
      Buffer.from(data.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1)
    }
    const chunk = (type: string, body: Buffer) => {
      const out = Buffer.alloc(body.length + 12)
      out.writeUInt32BE(body.length, 0)
      out.write(type, 4, 'ascii')
      body.copy(out, 8)
      out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)) >>> 0, 8 + body.length)
      return out
    }
    const ihdr = Buffer.alloc(13)
    ihdr.writeUInt32BE(size, 0)
    ihdr.writeUInt32BE(size, 4)
    ihdr[8] = 8 // bit depth
    ihdr[9] = 6 // colour type: RGBA
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ])
  }
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf: Buffer): number {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return c ^ -1
}

/**
 * The mark: four corner brackets and a boresight cross.
 *
 * `inset` is the fraction of the canvas the mark leaves clear, so the maskable
 * variant can hold the whole mark inside the safe circle a launcher may crop to
 * while the plain one sits closer to the edge.
 */
function drawMark(canvas: Canvas, inset: number) {
  const s = canvas.size
  canvas.fill(GROUND)

  const pad = s * inset
  const span = s - pad * 2
  const stroke = Math.max(2, Math.round(s * 0.055))
  const arm = span * 0.3

  const bracket = (x: number, y: number, dx: number, dy: number) => {
    // Horizontal arm, then vertical arm, both growing away from the corner.
    canvas.rect(dx > 0 ? x : x - arm, y, arm, stroke, INK)
    canvas.rect(x - (dx > 0 ? 0 : stroke), dy > 0 ? y : y - arm, stroke, arm, INK)
  }
  bracket(pad, pad, 1, 1)
  bracket(pad + span - stroke, pad, -1, 1)
  bracket(pad, pad + span - stroke, 1, -1)
  bracket(pad + span - stroke, pad + span - stroke, -1, -1)

  const mid = s / 2
  const cross = span * 0.19
  canvas.rect(mid - stroke / 2, mid - cross, stroke, cross * 2, CAUTION)
  canvas.rect(mid - cross, mid - stroke / 2, cross * 2, stroke, CAUTION)
}

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, '..', 'public')
mkdirSync(out, { recursive: true })

const icons: Array<[string, number, number]> = [
  ['icon-192.png', 192, 0.16],
  ['icon-512.png', 512, 0.16],
  // Maskable: launchers may crop to a circle, so keep the mark well inside.
  ['icon-maskable-512.png', 512, 0.26],
  // iOS ignores transparency and rounds the corners itself.
  ['apple-touch-icon.png', 180, 0.18],
]

for (const [name, size, inset] of icons) {
  const canvas = new Canvas(size)
  drawMark(canvas, inset)
  writeFileSync(join(out, name), canvas.png())
  console.log(`  wrote public/${name}  ${size}x${size}`)
}
