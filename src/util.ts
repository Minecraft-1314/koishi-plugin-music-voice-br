import os from 'node:os'
import fs from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'
import { Context, Logger, Session } from 'koishi'

const base64Cache = new Map<string, string>()

export async function toBase64(filePath: string): Promise<string> {
  try {
    const stat = await fs.promises.stat(filePath)
    const key = `${filePath}:${stat.mtimeMs}:${stat.size}`
    const cached = base64Cache.get(key)
    if (cached) return cached
    const buffer = await fs.promises.readFile(filePath)
    const ext = path.extname(filePath).toLowerCase()
    let mime = 'application/octet-stream'
    if (ext === '.png') mime = 'image/png'
    else if (ext === '.jpg' || ext === '.jpeg') mime = 'image/jpeg'
    else if (ext === '.otf') mime = 'font/otf'
    else if (ext === '.ttf') mime = 'font/ttf'
    const data = `data:${mime};base64,${buffer.toString('base64')}`
    base64Cache.set(key, data)
    return data
  } catch {
    return ''
  }
}

const htmlEntities: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => htmlEntities[char])
}

export function extFromBuffer(buffer: Buffer, fallbackUrl: string): string {
  if (buffer.length > 3 && buffer.subarray(0, 4).toString() === 'fLaC') return '.flac'
  if (buffer.length > 11 && buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WAVE') return '.wav'
  if (buffer.length > 7 && buffer.subarray(4, 8).toString() === 'ftyp') return '.m4a'
  if (buffer.length > 2 && buffer.subarray(0, 3).toString() === 'ID3') return '.mp3'
  if (buffer.length > 1 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) return '.mp3'
  const clean = fallbackUrl.split('?')[0].toLowerCase()
  if (clean.endsWith('.flac')) return '.flac'
  if (clean.endsWith('.wav')) return '.wav'
  if (clean.endsWith('.m4a')) return '.m4a'
  return '.mp3'
}

export async function downloadFile(ctx: Context, src: string, logger: Logger): Promise<string | null> {
  try {
    const response = await ctx.http.get(src, { responseType: 'arraybuffer' })
    const buffer = Buffer.from(response)
    const ext = extFromBuffer(buffer, src)
    const filename = crypto.randomBytes(8).toString('hex') + ext
    const filePath = path.join(os.tmpdir(), filename)
    await fs.promises.writeFile(filePath, buffer)
    return filePath
  } catch (error) {
    logger.error('文件下载失败:', error)
    return null
  }
}

export async function tryDeleteMessage(session: Session, messageId: string | null, label: string, logger: Logger): Promise<void> {
  if (!messageId || !session.channelId) return
  try {
    await session.bot.deleteMessage(session.channelId, messageId)
  } catch (err) {
    logger.warn(`撤回${label}消息失败`, err)
  }
}

export function toMessageIds(msg: string | string[]): string[] {
  if (Array.isArray(msg)) {
    return msg.filter((id): id is string => typeof id === 'string' && id.length > 0)
  }
  return msg && msg.length > 0 ? [msg] : []
}

export function lastMessageId(msg: string | string[]): string {
  const ids = toMessageIds(msg)
  return ids[ids.length - 1] || ''
}

export async function tryDeleteMessages(session: Session, messageIds: string[], label: string, logger: Logger): Promise<void> {
  if (!session.channelId) return
  for (const messageId of messageIds) {
    await tryDeleteMessage(session, messageId, label, logger)
  }
}
