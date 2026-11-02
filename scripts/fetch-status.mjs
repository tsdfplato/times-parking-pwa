import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'

const PARKS = [
  { no: 1, id: 'BUK0060527', name: 'タイムズ野田６丁目', distance: '本駐車場' },
  { no: 2, id: 'BUK0077629', name: 'タイムズ野田６丁目第２', distance: '本駐車場から19m' },
  { no: 3, id: 'BUK0090120', name: 'タイムズ野田６丁目第３', distance: '本駐車場から38m' },
  { no: 4, id: 'BUK0061797', name: 'タイムズＪＲ野田駅西第２', distance: '本駐車場から324m' },
  { no: 5, id: 'BUK0018415', name: 'タイムズ福島吉野', distance: '本駐車場から367m' },
  { no: 6, id: 'BUK0064561', name: 'タイムズ吉野５丁目第３', distance: '本駐車場から405m' },
]

const PARK_URL = (id) =>
  `https://times-info.net/P27-osaka/C103/park-detail-${id}/`

function normalizeStatus(value = '') {
  const text = value.replace(/\s+/g, '')
  if (text.includes('満')) return '満車'
  if (text.includes('混')) return '混雑'
  if (text.includes('空')) return '空車'
  if (text.includes('休') || text.includes('閉')) return '休止'
  return '不明'
}

async function readPark(context, park) {
  let lastError

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const page = await context.newPage()

    try {
      await page.goto(PARK_URL(park.id), {
        waitUntil: 'domcontentloaded',
        timeout: 45000,
      })

      const statusElement = page.locator('#mankuuText')
      await statusElement.waitFor({ state: 'attached', timeout: 20000 })

      const status = normalizeStatus(await statusElement.textContent())
      const updatedText =
        (await page
          .locator('.c-topInfo_updateTime_time')
          .textContent({ timeout: 10000 })) || ''
      const updatedAt = updatedText
        .replace(/現在/g, '')
        .replace(/\s+/g, ' ')
        .trim()

      if (status === '不明' || !updatedAt) {
        throw new Error(`公式情報を解析できません: ${park.id}`)
      }

      return { ...park, status, updatedAt }
    } catch (error) {
      lastError = error
      console.warn(
        `${park.id} 取得失敗 (${attempt}/2): ${error.message}`,
      )
    } finally {
      await page.close()
    }
  }

  throw lastError
}

const browser = await chromium.launch({ headless: true })

try {
  const context = await browser.newContext({
    locale: 'ja-JP',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
  })

  const fetchedParks = await Promise.all(
    PARKS.map((park) => readPark(context, park)),
  )
  const now = new Date()
  const updatedAt = fetchedParks[0].updatedAt
  const parks = fetchedParks.map(({ updatedAt: _updatedAt, ...park }) => park)

  const result = {
    updatedAt,
    fetchedAt: now.toISOString(),
    parks,
  }

  await mkdir('public', { recursive: true })
  await writeFile(
    'public/status.json',
    JSON.stringify(result, null, 2),
    'utf8',
  )

  console.log(`status.json を更新しました（公式 ${updatedAt}）`)
  console.table(
    parks.map((park) => ({ 番号: park.no, 駐車場: park.name, 状態: park.status })),
  )
} finally {
  await browser.close()
}
