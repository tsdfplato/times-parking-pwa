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

const REQUEST_HEADERS = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ja-JP,ja;q=0.9,en;q=0.5',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
}

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

function decodeHtml(value = '') {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, decimal) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)),
    )
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
}

function stripTags(value = '') {
  return decodeHtml(value.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function readElementText(html, matcher) {
  return stripTags(html.match(matcher)?.[1] || '')
}

function normalizeStatus(value = '') {
  const text = value.replace(/\s+/g, '')
  if (text.includes('満')) return '満車'
  if (text.includes('混')) return '混雑'
  if (text.includes('空')) return '空車'
  if (text.includes('休') || text.includes('閉')) return '休止'
  return '不明'
}

async function downloadHtml(park, attempt) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)

  try {
    const response = await fetch(`${PARK_URL(park.id)}?t=${Date.now()}`, {
      headers: REQUEST_HEADERS,
      redirect: 'follow',
      signal: controller.signal,
    })
    const html = await response.text()

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}; URL=${response.url}; body=${stripTags(html).slice(0, 180)}`,
      )
    }

    console.log(
      `${park.id} HTTP取得成功 (${attempt}/3): ${html.length} bytes`,
    )
    return html
  } finally {
    clearTimeout(timeout)
  }
}

async function readPark(park) {
  let lastError

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const html = await downloadHtml(park, attempt)
      const rawStatus = readElementText(
        html,
        /<[^>]+id=["']mankuuText["'][^>]*>([\s\S]*?)<\/[^>]+>/i,
      )
      const rawUpdatedAt = readElementText(
        html,
        /<[^>]+class=["'][^"']*c-topInfo_updateTime_time[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i,
      )
      const status = normalizeStatus(rawStatus)
      const updatedAt = rawUpdatedAt
        .replace(/現在/g, '')
        .replace(/\s+/g, ' ')
        .trim()

      if (status === '不明' || !updatedAt) {
        const title = readElementText(
          html,
          /<title[^>]*>([\s\S]*?)<\/title>/i,
        )
        throw new Error(
          `公式情報を解析できません; title=${title || '不明'}; status=${rawStatus || 'なし'}; updatedAt=${rawUpdatedAt || 'なし'}; html=${html.length} bytes`,
        )
      }

      return { ...park, status, updatedAt }
    } catch (error) {
      lastError = error
      console.warn(
        `${park.id} 取得失敗 (${attempt}/3): ${error.message}`,
      )
      if (attempt < 3) await wait(attempt * 2000)
    }
  }

  throw lastError
}

const fetchedParks = []

for (const park of PARKS) {
  fetchedParks.push(await readPark(park))
  await wait(500)
}

const updatedTimes = [...new Set(fetchedParks.map((park) => park.updatedAt))]

if (updatedTimes.length !== 1) {
  throw new Error(
    `公式更新時刻が駐車場間で一致しません: ${updatedTimes.join(', ')}`,
  )
}

const updatedAt = updatedTimes[0]
const parks = fetchedParks.map(({ updatedAt: _updatedAt, ...park }) => park)
const result = {
  updatedAt,
  fetchedAt: new Date().toISOString(),
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
  parks.map((park) => ({
    番号: park.no,
    駐車場: park.name,
    状態: park.status,
  })),
)
