import { Context } from 'koishi'
import type { PluginConfig, SongData } from './types'
import { escapeHtml, toBase64 } from './util'

export interface ImageGenerationResult {
  ok: true
  image: Buffer
}

export interface ImageGenerationFailure {
  ok: false
  reason: 'puppeteer' | 'resource' | 'render'
}

export type ImageGenerationOutcome = ImageGenerationResult | ImageGenerationFailure

export async function generateSongListImage(songData: SongData[], startIndex: number, config: PluginConfig, fontFilePath: string, backgroundImagePath: string, ctx: Context): Promise<ImageGenerationOutcome> {
  if (!ctx.puppeteer) {
    return { ok: false, reason: 'puppeteer' }
  }

  const [fontBase64, bgBase64] = await Promise.all([
    toBase64(fontFilePath),
    toBase64(backgroundImagePath),
  ])

  if (!fontBase64 || !bgBase64) {
    return { ok: false, reason: 'resource' }
  }

  const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <style>
    @font-face {
      font-family: 'JingNan';
      src: url('${fontBase64}');
    }
    * {
      box-sizing: border-box;
    }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      min-height: 100vh;
    }
    body {
      padding: 40px 20px;
      font-family: 'JingNan', sans-serif;
      background-image: url('${bgBase64}');
      background-size: 100% auto;
      background-position: top center;
      background-repeat: repeat-y;
      background-attachment: scroll;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .title {
      font-size: 64px;
      color: #333;
      margin-bottom: 40px;
      text-shadow: 2px 2px 4px rgba(255,255,255,0.8);
      font-weight: bold;
    }
    .container {
      column-count: 3;
      column-gap: 20px;
      width: 100%;
      max-width: 1200px;
    }
    @media (max-width: 900px) {
      .container {
        column-count: 2;
      }
    }
    @media (max-width: 600px) {
      .container {
        column-count: 1;
      }
    }
    .card {
      break-inside: avoid;
      margin-bottom: 20px;
      background: rgba(255, 255, 255, 0.88);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border-radius: 20px;
      padding: 20px 25px;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.5);
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .cmd-name {
      font-size: 36px;
      font-weight: bold;
      color: #ff5e5e;
      word-break: break-all;
    }
    .has-desc .cmd-name {
      margin-bottom: 10px;
      border-bottom: 3px dashed #ffadad;
      padding-bottom: 6px;
      font-size: 32px;
    }
    .cmd-desc {
      font-size: 22px;
      color: #333;
      line-height: 1.4;
      word-break: break-all;
    }
    .no-desc {
      align-items: center;
      text-align: center;
      min-height: 100px;
    }
  </style>
</head>
<body>
  <div class="title">✨ 网易云音乐歌单 ✨</div>
  <div class="container">
    ${songData.map((song, index) => {
      const songIndex = index + startIndex + 1
      const desc = `${song.artists} - ${song.albumName}`
      return `
        <div class="card has-desc">
          <div class="cmd-name">${songIndex}. ${escapeHtml(song.name)}</div>
          <div class="cmd-desc">${escapeHtml(desc)}</div>
        </div>
      `
    }).join('')}
  </div>
</body>
</html>
  `

  let page: any
  try {
    page = await ctx.puppeteer.page()
    await page.setViewport({ width: 1280, height: 100, deviceScaleFactor: 1 })
    await page.setContent(html)
    await page.waitForNetworkIdle()
    const image = await page.screenshot({
      type: 'jpeg',
      quality: config.screenshotQuality ?? 80,
      encoding: 'binary',
      fullPage: true
    })
    return { ok: true, image }
  } catch (err) {
    return { ok: false, reason: 'render' }
  } finally {
    if (page) await page.close()
  }
}
