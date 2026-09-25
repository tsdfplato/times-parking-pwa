import express from 'express'
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'

const app = express()
const port = 8787

app.use((_request, response, next) => {
  response.setHeader('Access-Control-Allow-Origin', 'http://localhost:5173')
  next()
})

const sourceUrl =
  'https://times-info.net/P27-osaka/C103/park-detail-BUK0060527/'

const targetIds = {
  BUK0060527: 1,
  BUK0077629: 2,
  BUK0090120: 3,
  BUK0061797: 4,
  BUK0018415: 5,
  BUK0064561: 6,
}

const chromePaths = [
  `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env['ProgramFiles(x86)']}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
]

const chromePath = chromePaths.find((path) => fs.existsSync(path))

if (!chromePath) {
  throw new Error('Google Chromeが見つかりません。')
}

let cache = null
let cacheTime = 0
let browser = null

function normalizeStatus(value) {
  if (value.includes('空')) return '空車'
  if (value.includes('満')) return '満車'
  if (value.includes('混')) return '混雑'
  return '不明'
}

async function getBrowser() {
  if (!browser) {
    browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: true,
      args: ['--no-first-run', '--disable-gpu'],
    })
  }

  return browser
}

async function fetchStatus(force = false) {
  // 通常更新時のみ、60秒間のキャッシュを利用する
  if (!force && cache && Date.now() - cacheTime < 60_000) {
    return { ...cache, cached: true }
  }

  const chrome = await getBrowser()
  const page = await chrome.newPage()

  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    )

    await page.goto(sourceUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    })

    await page.waitForSelector('#areaBukListItems .s_mankuuText', {
      timeout: 15_000,
    })

    const data = await page.evaluate(() => {
      const items = [
        ...document.querySelectorAll(
          '#areaBukListItems a[href*="park-detail-"]',
        ),
      ]

      return {
        updatedText: document.body.innerText,
        parks: items.map((link) => {
          const statusElement = link.querySelector('.s_mankuuText')
          const nameElement = link.querySelector(
            '.p-map_nearParking_parking_list_parkingName',
          )
          const distanceElement = link.querySelector(
            '.p-map_nearParking_parking_list_dist, .p-map_nearParking_parking_list_dist_bold',
          )

          const href = link.getAttribute('href') ?? ''
          const statusText = statusElement?.textContent?.trim() ?? ''
          const allName =
            nameElement?.textContent?.replace(/\s+/g, ' ').trim() ?? ''

          return {
            href,
            statusText,
            name: allName.replace(statusText, '').trim(),
            distance:
              distanceElement?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
          }
        }),
      }
    })

    const parks = data.parks
      .map((park) => {
        const id = Object.keys(targetIds).find((parkingId) =>
          park.href.includes(parkingId),
        )

        if (!id) return null

        return {
          no: targetIds[id],
          id,
          name: park.name,
          status: normalizeStatus(park.statusText),
          distance: park.distance || '本駐車場',
        }
      })
      .filter(Boolean)
      .sort((a, b) => a.no - b.no)

    if (parks.length !== 6) {
      throw new Error(`6件の駐車場を取得できませんでした（${parks.length}件）`)
    }

    const updatedMatch = data.updatedText.match(
      /(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2})現在/,
    )

    cache = {
      updatedAt: updatedMatch?.[1] ?? null,
      fetchedAt: new Date().toISOString(),
      parks,
      cached: false,
    }

    cacheTime = Date.now()
    return cache
  } finally {
    await page.close()
  }
}

app.get('/api/status', async (request, response) => {
  try {
    // ?fresh=1 の時は、キャッシュを使わず公式ページを読み直す
    const force = request.query.fresh === '1'
    response.json(await fetchStatus(force))
  } catch (error) {
    response.status(502).json({
      error: error instanceof Error ? error.message : '取得できませんでした。',
    })
  }
})

app.listen(port, () => {
  console.log(`取得サーバー起動中: http://localhost:${port}/api/status`)
})