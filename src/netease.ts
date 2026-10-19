import { Context } from 'koishi'
import type { NetEaseSearchResponse, PluginConfig, SongData } from './types'

export async function searchNetEase(keyword: string, limit: number, offset: number, config: PluginConfig, ctx: Context): Promise<SongData[]> {
  const searchApiUrl = `http://music.163.com/api/search/get/web?csrf_token=hlpretag=&hlposttag=&s=${encodeURIComponent(keyword)}&type=1&offset=${offset}&total=true&limit=${limit}`
  let searchApiResponse: string

  if (config.useProxy) {
    const proxyUrl = 'https://web-proxy.apifox.cn/api/v1/request'
    searchApiResponse = await ctx.http.post(proxyUrl, {}, {
      headers: {
        'api-u': searchApiUrl,
        'api-o0': 'method=GET, timings=true, timeout=3000',
        'Content-Type': 'application/json'
      }
    })
  } else {
    searchApiResponse = await ctx.http.get(searchApiUrl)
  }

  const parsed: NetEaseSearchResponse = typeof searchApiResponse === 'string'
    ? JSON.parse(searchApiResponse)
    : searchApiResponse
  const searchData = parsed.result

  if (!searchData || !searchData.songs || searchData.songs.length === 0) {
    return []
  }

  return searchData.songs.map((song) => ({
    id: song.id,
    name: song.name,
    artists: song.artists.map(artist => artist.name).join('/'),
    albumName: song.album.name,
    duration: song.duration
  }))
}
