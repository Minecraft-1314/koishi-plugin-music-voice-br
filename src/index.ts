import { Context, Schema, h, isNullable, Session } from 'koishi'
import { } from 'koishi-plugin-puppeteer'

import os from 'node:os';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import url from 'node:url';

export const name = 'music-voice'
export const inject = {
  required: ["logger", "http", "i18n"],
  optional: ['puppeteer']
}

export const usage = `
---
<a target="_blank" href="https://github.com/idranme/koishi-plugin-music-voice">➤ 食用方法点此获取</a>
本插件旨在提供开箱即用的语音点歌功能。
因各种不可抗力因素，目前仅支持使用网易云音乐。
---
## 开启插件前，请确保以下服务已经启用！
### 所需服务：
- [puppeteer服务](/market?keyword=puppeteer) （可选安装）
此外可能还需要这些服务才能发送语音：
- [ffmpeg服务](/market?keyword=ffmpeg)  （可选安装）（此服务可能额外依赖[downloads服务](/market?keyword=downloads)）
- [silk服务](/market?keyword=silk)  （可选安装）
---
`

export interface PluginConfig {
  commandName: string;
  commandAlias: string;
  generationTip: string;
  recallMessages: string[];
  waitForTimeout: number;
  imageMode: boolean;
  screenshotQuality: number;
  searchListCount: number;
  nextPageCommand: string;
  prevPageCommand: string;
  exitCommandList: string[];
  menuExitCommandTip: boolean;
  maxSongDuration: number;
  enableRateLimit: boolean;
  rateLimitScope?: 'user' | 'channel' | 'platform';
  rateLimitInterval?: number;
  type: 'apis' | 'custom';
  metingAPI?: string;
  text?: string;
  useProxy: boolean;
  srcToWhat: 'text' | 'audio' | 'audiobuffer' | 'video' | 'file';
  loggerinfo: boolean;
}

export const Config: Schema<PluginConfig> = Schema.intersect([
  Schema.object({
    commandName: Schema.string().description('使用的指令名称').default('music'),
    commandAlias: Schema.string().description('使用的指令别名').default('mdff'),
    generationTip: Schema.string().description('生成语音时返回的文字提示内容').default('生成语音中…'),
    recallMessages: Schema.array(Schema.union([
      Schema.const('generationTip').description('生成提示语（生成语音中…）'),
      Schema.const('songList').description('歌单消息'),
      Schema.const('promptTimeout').description('超时提示（输入超时，已取消点歌）'),
      Schema.const('exitPrompt').description('退出提示（已退出歌曲选择）'),
      Schema.const('invalidNumber').description('序号错误提示（序号输入错误，已退出歌曲选择）'),
      Schema.const('durationExceeded').description('时长超限提示（歌曲持续时间超出限制）'),
      Schema.const('getSongFailed').description('获取失败提示（获取歌曲失败，请稍后再试）'),
    ]))
      .role('checkbox')
      .default(['generationTip', 'songList'])
      .description('勾选后将 撤回/不发送 对应的提示消息（勾选=撤回/不发送，不勾选=不撤回/发送）'),
    waitForTimeout: Schema.natural().min(1).step(1).description('等待用户选择歌曲序号的最长时间 （秒）').default(45),
  }).description('基础设置'),

  Schema.object({
    imageMode: Schema.boolean().description('开启后 返回图片歌单（需要puppeteer服务）<br>关闭后 返回文本歌单').default(false),
  }).description('歌单设置'),

  Schema.union([
    Schema.object({
      imageMode: Schema.const(true).required(),
      screenshotQuality: Schema.number().min(1).max(100).default(80).description('截图质量 (1-100, 仅对 jpeg 有效)'),
    }),
    Schema.object({}),
  ]),

  Schema.object({
    searchListCount: Schema.natural().description('搜索的歌曲列表的数量').default(20),
    nextPageCommand: Schema.string().description('翻页指令-下一页').default('下一页'),
    prevPageCommand: Schema.string().description('翻页指令-上一页').default('上一页'),
    exitCommandList: Schema.array(String).role('table').description('退出选择指令。<br>一行一个指令（此指令 在歌单内容中默认没有使用提示）').default(["0", "不听了"]),
    menuExitCommandTip: Schema.boolean().description('是否在歌单内容的后面，加上`退出选择指令`的文字提示').default(false),
    maxSongDuration: Schema.natural().min(1).step(1).description('歌曲最长持续时间（分钟）<br>超过此时长的音频 不会被发送').default(30),
  }).description('进阶设置'),

  Schema.object({
    enableRateLimit: Schema.boolean().description('是否启用频率限制').default(false),
  }).description('频率限制'),
  Schema.union([
    Schema.object({
      enableRateLimit: Schema.const(true).required(),
      rateLimitScope: Schema.union([
        Schema.const('user').description('对单个用户限制'),
        Schema.const('channel').description('对单个频道限制'),
        Schema.const('platform').description('对单个平台限制'),
      ]).description('频率限制作用范围').default('user'),
      rateLimitInterval: Schema.natural().min(1).step(1).description('频率限制间隔时间（秒）').default(60),
    }),
    Schema.object({}),
  ]),

  Schema.object({
    type: Schema.union([
      Schema.const('apis').description('预设API'),
      Schema.const('custom').description('自定义API')
    ]).description("获取音乐直链的后端").default("apis"),
  }).description('请求设置'),
  Schema.union([
    Schema.object({
      type: Schema.const('apis'),
      metingAPI: Schema.union([
        Schema.const('https://api.injahow.cn/meting/').description('`api.injahow.cn`'),
        Schema.const('https://api.qijieya.cn/meting/').description('`api.qijieya.cn`'),
        Schema.const('https://api.moeyao.cn/meting/').description('`api.moeyao.cn`'),
        Schema.const('https://meting.jinghuashang.cn/').description('`meting.jinghuashang.cn`'),
        Schema.const('https://meting.qjqq.cn/').description('`meting.qjqq.cn`'),
        Schema.const('https://api.crowya.com/meting/').description('`api.crowya.com`'),
        Schema.const('https://meting-api.mlj-dragon.cn/meting/').description('`meting-api.mlj-dragon.cn`'),
        Schema.const('https://api.amarea.cn/meting/').description('`api.amarea.cn`'),
      ]).description("后端API地址<br>选择一个可以访问的API").default("https://api.injahow.cn/meting/"),
    }),
    Schema.object({
      type: Schema.const('custom').required(),
      text: Schema.string().default("https://api.injahow.cn/meting/").description("自定义后端API地址<br>填入一个可以访问的API地址").role('link'),
    }),
  ]),

  Schema.object({
    useProxy: Schema.boolean().description('是否使用 `Apifox Web Proxy` 代理请求（适用于海外用户）').default(false),
    srcToWhat: Schema.union([
      Schema.const('text').description('文本 h.text'),
      Schema.const('audio').description('语音 h.audio'),
      Schema.const('audiobuffer').description('语音（buffer） h.audio'),
      Schema.const('video').description('视频 h.video'),
      Schema.const('file').description('文件 h.file'),
    ]).role('radio').default("audio").description('歌曲信息的的返回格式'),
  }).description('调试设置'),

  Schema.object({
    loggerinfo: Schema.boolean().default(false).description("日志调试模式"),
  }).description('开发者选项'),
]) as Schema<PluginConfig>;

interface SongData {
  id: number;
  name: string;
  artists: string;
  albumName: string;
  duration: number;
  lrc?: string;
}

interface NetEaseSearchResponse {
  result?: {
    songs?: NetEaseSongItem[];
  };
}

interface NetEaseSongItem {
  id: number;
  name: string;
  artists: { name: string }[];
  album: { name: string };
  duration: number;
}

async function toBase64(filePath: string): Promise<string> {
  try {
    const buffer = await fs.promises.readFile(filePath)
    const ext = path.extname(filePath).toLowerCase()
    let mime = 'application/octet-stream'
    if (ext === '.png') mime = 'image/png'
    else if (ext === '.jpg' || ext === '.jpeg') mime = 'image/jpeg'
    else if (ext === '.otf') mime = 'font/otf'
    else if (ext === '.ttf') mime = 'font/ttf'
    return `data:${mime};base64,${buffer.toString('base64')}`
  } catch (e) {
    return ''
  }
}

async function searchNetEase(keyword: string, limit: number = 10, offset: number = 0, config: PluginConfig, ctx: Context, logger: any): Promise<SongData[]> {
  const searchApiUrl = `http://music.163.com/api/search/get/web?csrf_token=hlpretag=&hlposttag=&s=${encodeURIComponent(keyword)}&type=1&offset=${offset}&total=true&limit=${limit}`;

  try {
    let searchApiResponse: string;

    if (config.useProxy) {
      const proxyUrl = 'https://web-proxy.apifox.cn/api/v1/request';
      searchApiResponse = await ctx.http.post(proxyUrl, {}, {
        headers: {
          'api-u': searchApiUrl,
          'api-o0': 'method=GET, timings=true, timeout=3000',
          'Content-Type': 'application/json'
        }
      });
    } else {
      searchApiResponse = await ctx.http.get(searchApiUrl);
    }

    const parsedSearchApiResponse: NetEaseSearchResponse = typeof searchApiResponse === 'string' 
      ? JSON.parse(searchApiResponse) 
      : searchApiResponse;
    const searchData = parsedSearchApiResponse.result;

    if (!searchData || !searchData.songs || searchData.songs.length === 0) {
      return [];
    }

    const songList: SongData[] = searchData.songs.map((song) => {
      return {
        id: song.id,
        name: song.name,
        artists: song.artists.map(artist => artist.name).join('/'),
        albumName: song.album.name,
        duration: song.duration
      };
    });
    return songList;
  } catch (error) {
    return [];
  }
}

async function generateSongListImage(songData: SongData[], startIndex: number, config: PluginConfig, fontFilePath: string, backgroundImagePath: string, ctx: Context, logger: any) {
  if (!ctx.puppeteer) {
    return null;
  }

  if (!fs.existsSync(fontFilePath) || !fs.existsSync(backgroundImagePath)) {
    return null;
  }

  const fontBase64 = await toBase64(fontFilePath);
  const bgBase64 = await toBase64(backgroundImagePath);

  if (!fontBase64 || !bgBase64) {
    return null;
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
        const songIndex = index + startIndex + 1;
        const desc = `${song.artists} - ${song.albumName}`;
        return `
        <div class="card has-desc">
          <div class="cmd-name">${songIndex}. ${song.name}</div>
          <div class="cmd-desc">${desc}</div>
        </div>
      `
      }).join('')}
  </div>
</body>
</html>
  `;

  let page: any;
  try {
    page = await ctx.puppeteer.page();
    await page.setViewport({ width: 1280, height: 100, deviceScaleFactor: 1 });
    await page.setContent(html);
    await page.waitForNetworkIdle();

    const image = await page.screenshot({
      type: 'jpeg',
      quality: config.screenshotQuality,
      encoding: 'binary',
      fullPage: true
    });

    return image;
  } catch (err) {
    return null;
  } finally {
    if (page) await page.close();
  }
}

function formatSongList(data: SongData[], platform: string, startIndex: number, isImageMode: boolean = true) {
  const separator = isImageMode ? '<br/>' : '\n';
  const formatted = data.map((song, index) => {
    let item = `${index + startIndex + 1}. ${song.name} -- ${song.artists} -- ${song.albumName}`
    return item
  }).join(separator)
  if (isImageMode) {
    return `<b>${platform}</b>:<br/>${formatted}`
  } else {
    return `${platform}:\n${formatted}`
  }
}

async function downloadFile(url: string, logger: any): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || '';
    
    let ext = '.mp3';
    if (contentType.includes('audio/mpeg')) {
      ext = '.mp3';
    } else if (contentType.includes('audio/mp4')) {
      ext = '.m4a';
    } else if (contentType.includes('audio/wav')) {
      ext = '.wav';
    } else if (contentType.includes('audio/flac')) {
      ext = '.flac';
    }
    
    const filename = crypto.randomBytes(8).toString('hex') + ext;
    const filePath = path.join(os.tmpdir(), filename);
    fs.writeFileSync(filePath, Buffer.from(buffer));
    return filePath;
  } catch (error) {
    logger.error('文件下载失败:', error);
    return null;
  }
}

export function apply(ctx: Context, config: PluginConfig) {
  ctx.on('ready', async () => {
    const logger = ctx.logger('music-voice')
    const rateLimitMap = new Map<string, number>();

    const pluginRoot = __dirname;
    const sourceDir = path.resolve(pluginRoot, '../source');
    const fontFilePath = path.resolve(sourceDir, '荆南麦圆体.otf');
    const backgroundImagePath = path.resolve(sourceDir, 'qzbknd.png');

    ctx.i18n.define("zh-CN", {
      commands: {
        [config.commandName]: {
          description: `搜索歌曲并播放网易云音乐`,
          messages: {
            "nokeyword": `请输入歌曲相关信息。\n➣示例：${ctx.root.config.prefix[0]}${config.commandName} 蔚蓝档案`,
            "songlisterror": "无法获取歌曲列表，请稍后再试。",
            "invalidKeyword": "无法获取歌曲列表，请尝试更换关键词。",
            "exitCommandTip": "退出选择请发 [{0}] 中的任意内容<br/><br/>",
            "imageGenerationFailed": "生成图片歌单失败，请检查 puppeteer 服务是否正常。",
            "imageListPrompt": "{0}请在 {1} 秒内，\n输入歌曲对应的序号",
            "textListPrompt": "{0}<br/><br/>{1}请在 {2} 秒内，\n输入歌曲对应的序号",
            "promptTimeout": "输入超时，已取消点歌。",
            "exitPrompt": "已退出歌曲选择。",
            "invalidNumber": "序号输入错误，已退出歌曲选择。",
            "durationExceeded": "歌曲持续时间超出限制。",
            "getSongFailed": "获取歌曲失败，请稍后再试。",
            "noMoreSongs": "没有更多歌曲了。",
            "alreadyOnFirstPage": "已经是第一页了。",
            "rateLimitExceeded": "操作过于频繁，请在 {0} 秒后再试。",
            "resourceError": "图片歌单资源加载失败，请检查 source 目录下是否存在 荆南麦圆体.otf 和 qzbknd.png 文件。"
          }
        },
      },
    });

    ctx.command(`${config.commandName || "music"} <keyword:text>`)
      .alias(config.commandAlias || "mdff")
      .option('number', '-n <number:number> 歌曲序号')
      .action(async ({ session, options }, keyword) => {
        if (!session) return;
        if (!keyword) return session.text(".nokeyword")

        if (config.enableRateLimit) {
          let rateLimitKey: string;
          switch (config.rateLimitScope) {
            case 'user':
              rateLimitKey = `${session.platform}:${session.userId}`;
              break;
            case 'channel':
              rateLimitKey = `${session.platform}:${session.channelId}`;
              break;
            case 'platform':
              rateLimitKey = session.platform;
              break;
            default:
              rateLimitKey = `${session.platform}:${session.userId}`;
          }

          const now = Date.now();
          const lastUseTime = rateLimitMap.get(rateLimitKey);

          if (lastUseTime) {
            const timePassed = (now - lastUseTime) / 1000;
            const rateLimitInterval = config.rateLimitInterval ?? 60;
            const remainingTime = rateLimitInterval - timePassed;

            if (remainingTime > 0) {
              return session.text(".rateLimitExceeded", [Math.ceil(remainingTime).toString()]);
            }
          }

          rateLimitMap.set(rateLimitKey, now);
        }

        logger.info(session.stripped.content)
        let neteaseData: SongData[] = [];
        let selected: SongData;
        const originalMessageId = session.messageId || '';
        let quoteId = session.messageId || '';
        let songListMessageId: string | null = null;

        if (options && options.number !== undefined) {
          try {
            neteaseData = await searchNetEase(keyword, config.searchListCount, 0, config, ctx, logger);
          } catch (err) {
            const errorMessage = (err as Error).message || '未知错误';
            logger.warn('获取网易云音乐数据时发生错误', errorMessage);
            return session.text(".songlisterror");
          }

          if (!neteaseData.length) return session.text(".invalidKeyword");

          const serialNumber = options.number;
          if (!Number.isInteger(serialNumber) || serialNumber < 1 || serialNumber > neteaseData.length) {
            return `${h.quote(quoteId)}` + session.text(".invalidNumber");
          }
          selected = neteaseData[serialNumber - 1];
        } else {
          let currentPage = 0;
          const pageSize = config.searchListCount;

          while (true) {
            try {
              neteaseData = await searchNetEase(keyword, pageSize, currentPage * pageSize, config, ctx, logger);
            } catch (err) {
              const errorMessage = (err as Error).message || '未知错误';
              logger.warn('获取网易云音乐数据时发生错误', errorMessage);
              return session.text(".songlisterror");
            }

            if (!neteaseData.length) {
              if (currentPage === 0) {
                return session.text(".invalidKeyword");
              } else {
                await session.send(`${h.quote(quoteId)}` + session.text(".noMoreSongs"));
                currentPage--;
                continue;
              }
            }

            const listStartIndex = currentPage * pageSize;
            const exitCommands = config.exitCommandList;
            const exitCommandTip = config.menuExitCommandTip ? session.text(".exitCommandTip", [exitCommands.join(', ')]) : '';

            if (config.imageMode) {
              const imageBuffer = await generateSongListImage(neteaseData, listStartIndex, config, fontFilePath, backgroundImagePath, ctx, logger);
              if (!imageBuffer) {
                return session.text(".resourceError");
              }
              const promptMessage = session.text(".imageListPrompt", [exitCommandTip.replaceAll('<br/>', '\n'), config.waitForTimeout]);
              const songListMsg = await session.send([
                h.quote(quoteId),
                h.image(imageBuffer, 'image/jpeg'),
                h.text(promptMessage),
              ]);
              songListMessageId = songListMsg[0] || null;
              quoteId = songListMsg[0] || '';
            } else {
              const neteaseListText = formatSongList(neteaseData, 'NetEase Music', listStartIndex, false);
              const listText = `${neteaseListText}`;
              const textPrompt = session.text(".textListPrompt", [listText, exitCommandTip, config.waitForTimeout])
                .replaceAll('<br/>', '\n');
              const payload = `${h.quote(quoteId)}${textPrompt}`;
              const msg = await session.send(payload);
              songListMessageId = msg.at(-1) || null;
              quoteId = msg.at(-1) || '';
            }

            const input = await session.prompt((promptSession: Session) => {
              quoteId = promptSession.messageId || '';
              const elements = promptSession.elements || [];
              return h.select(elements, 'text').join('');
            }, { timeout: config.waitForTimeout * 1000 });

            if (isNullable(input)) {
              if (config.recallMessages.includes('songList') && songListMessageId && session.channelId) {
                try {
                  await session.bot.deleteMessage(session.channelId, songListMessageId);
                } catch (err) {
                  logger.warn('撤回歌单消息失败', err);
                }
              }
              if (!config.recallMessages.includes('promptTimeout')) {
                await session.send(`${h.quote(originalMessageId)}` + session.text(".promptTimeout"));
              }
              return;
            }

            if (exitCommands.includes(input)) {
              if (config.recallMessages.includes('songList') && songListMessageId && session.channelId) {
                try {
                  await session.bot.deleteMessage(session.channelId, songListMessageId);
                } catch (err) {
                  logger.warn('撤回歌单消息失败', err);
                }
              }
              if (!config.recallMessages.includes('exitPrompt')) {
                await session.send(`${h.quote(originalMessageId)}` + session.text(".exitPrompt"));
              }
              return;
            }

            if (input.trim() === config.nextPageCommand) {
              currentPage++;
              continue;
            }

            if (input.trim() === config.prevPageCommand) {
              if (currentPage > 0) {
                currentPage--;
                continue;
              } else {
                await session.send(`${h.quote(quoteId)}` + session.text(".alreadyOnFirstPage"));
                continue;
              }
            }

            const serialNumber = +input;
            const selectStartIndex = currentPage * pageSize + 1;
            const selectEndIndex = currentPage * pageSize + neteaseData.length;

            if (!Number.isInteger(serialNumber) || serialNumber < selectStartIndex || serialNumber > selectEndIndex) {
              if (config.recallMessages.includes('songList') && songListMessageId && session.channelId) {
                try {
                  await session.bot.deleteMessage(session.channelId, songListMessageId);
                } catch (err) {
                  logger.warn('撤回歌单消息失败', err);
                }
              }
              if (!config.recallMessages.includes('invalidNumber')) {
                await session.send(`${h.quote(originalMessageId)}` + session.text(".invalidNumber"));
              }
              return;
            }

            selected = neteaseData[serialNumber - selectStartIndex];
            break;
          }
        }
        
        if (!selected) return;
        
        const interval = selected.duration / 1000;
        const [tipMessageId] = await session.send(h.quote(quoteId) + `` + h.text(config.generationTip))
        try {
          let src: string = '';
          if (config.type === 'apis') {
            src = `${config.metingAPI}?type=url&id=${selected.id}`;
          } else if (config.type === 'custom') {
            src = `${config.text}?type=url&id=${selected.id}`;
          }
          logger.info(selected)
          logger.info(src)
          logger.info(config.srcToWhat)
          if (interval * 1000 > config.maxSongDuration * 1000 * 60) {
            if (config.recallMessages.includes('generationTip') && tipMessageId && session.channelId) {
              try {
                await session.bot.deleteMessage(session.channelId, tipMessageId);
              } catch (err) {
                logger.warn('撤回提示消息失败', err);
              }
            }
            if (config.recallMessages.includes('songList') && songListMessageId && session.channelId) {
              try {
                await session.bot.deleteMessage(session.channelId, songListMessageId);
              } catch (err) {
                logger.warn('撤回歌单消息失败', err);
              }
            }
            if (!config.recallMessages.includes('durationExceeded')) {
              await session.send(`${h.quote(originalMessageId)}` + session.text(".durationExceeded"));
            }
            return;
          }
          switch (config.srcToWhat) {
            case 'text':
              await session.send(h.text(src));
              break;
            case 'audio':
              await session.send(h.audio(src));
              break;
            case 'audiobuffer': {
              const response = await ctx.http.get(src, { responseType: 'arraybuffer' });
              const buffer = Buffer.from(response);
              await session.send(h.audio(buffer, 'audio/mpeg'));
              break;
            }
            case 'video': {
              await session.send(h.video(src));
              break;
            }
            case 'file': {
              const tempFilePath = await downloadFile(src, logger);
              if (!tempFilePath) break;
              const fileUrl = url.pathToFileURL(tempFilePath).href;
              logger.info(fileUrl)
              await session.send(h.file(fileUrl));
              try {
                fs.unlinkSync(tempFilePath);
              } catch (err) {
                logger.warn('删除临时文件失败', err);
              }
              break;
            }
            default:
              ctx.logger.error(`Unsupported send type: ${config.srcToWhat}`);
              return;
          }

          if (config.recallMessages.includes('generationTip') && tipMessageId && session.channelId) {
            try {
              await session.bot.deleteMessage(session.channelId, tipMessageId);
            } catch (err) {
              logger.warn('撤回提示消息失败', err);
            }
          }
          if (config.recallMessages.includes('songList') && songListMessageId && session.channelId) {
            try {
              await session.bot.deleteMessage(session.channelId, songListMessageId);
            } catch (err) {
              logger.warn('撤回歌单消息失败', err);
            }
          }
        } catch (error) {
          if (config.recallMessages.includes('generationTip') && tipMessageId && session.channelId) {
            try {
              await session.bot.deleteMessage(session.channelId, tipMessageId);
            } catch (err) {
              logger.warn('撤回提示消息失败', err);
            }
          }
          if (config.recallMessages.includes('songList') && songListMessageId && session.channelId) {
            try {
              await session.bot.deleteMessage(session.channelId, songListMessageId);
            } catch (err) {
              logger.warn('撤回歌单消息失败', err);
            }
          }
          logger.error('获取歌曲详情或发送语音失败', error);
          if (!config.recallMessages.includes('getSongFailed')) {
            await session.send(`${h.quote(originalMessageId)}` + session.text(".getSongFailed"));
          }
          return;
        }
      })
  })
}