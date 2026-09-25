import { chromium } from 'playwright'
import { writeFile, mkdir } from 'node:fs/promises'

const SOURCE_URL =
  'https://times-info.net/P27-osaka/C103/park-detail-BUK0060527/'

const PARKS = [
  {
    no: 1,
    id: 'BUK0060527',
    name: 'タイムズ野田６丁目',
    distance: '本駐車場',
  },
  {
    no: 2,
    id: 'BUK0077629',
    name: 'タイムズ野田６丁目第２',
    distance: '本駐車場から19m',
  },
  {
    no: 3,
    id: 'BUK0090120',
    name: 'タイムズ野田６丁目第３',
    distance: '本駐車場から38m',
  },
  {
    no: 4,
    id: 'BUK0061797',
    name: 'タイムズＪＲ野田駅西第２',
    distance: '本駐車場から324m',
  },
  {
    no: 5,
    id: 'BUK0018415',
    name: 'タイムズ福島吉野',
    distance: '本駐車場から367m',
  },
  {
    no: 6,
    id: 'BUK0064561',
    name: 'タイムズ吉野５丁目第３',
    distance: '本駐車場から405m',
  },
]

function normalizeStatus(value = '') {
  const text = value.replace(/\s+/g, '')

  if (text.includes('満')) return '満車'
  if (text.includes('混')) return '混雑'
  if (text.includes('空')) return '空車'
  if (text.includes('休')) return '休止'
  if (text.includes('閉')) return '休止'

  return '不明'
}

const browser = await chromium.launch({
  headless: true,
})

try {
  const page = await browser.newPage({
    locale: 'ja-JP',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
  })

  await page.goto(SOURCE_URL, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  })

  await page.waitForSelector('.s_mankuuText', {
    state: 'attached',
    timeout: 60000,
  })

  const pageData = await page.evaluate(() => {
    const statusElements = Array.from(
      document.querySelectorAll('.s_mankuuText'),
    )

    const items = statusElements.map((statusElement) => {
      const container =
        statusElement.closest('li') ||
        statusElement.closest('article') ||
        statusElement.parentElement

      const link = container?.querySelector('a[href*="park-detail-"]')
      const href = link?.href || ''
      const idMatch = href.match(/park-detail-(BUK\d+)/)

      return {
        id: idMatch?.[1] || '',
        status: statusElement.textContent?.trim() || '',
        text: container?.textContent?.trim() || '',
      }
    })

    const bodyText = document.body.innerText
    const updatedMatch = bodyText.match(
      /(\d{4}[\/年]\d{1,2}[\/月]\d{1,2}日?\s+\d{1,2}:\d{2})/,
    )

    return {
      items,
      updatedAt: updatedMatch?.[1] || null,
    }
  })

  const parks = PARKS.map((park) => {
    const found = pageData.items.find((item) => item.id === park.id)

    return {
      ...park,
      status: normalizeStatus(found?.status || found?.text),
    }
  })

  const now = new Date()

  const result = {
    updatedAt: pageData.updatedAt || now.toLocaleString('ja-JP'),
    fetchedAt: now.toISOString(),
    parks,
  }

  await mkdir('public', { recursive: true })

  await writeFile(
    'public/status.json',
    JSON.stringify(result, null, 2),
    'utf8',
  )

  console.log('status.json を更新しました。')
  console.table(
    parks.map((park) => ({
      番号: park.no,
      駐車場: park.name,
      状態: park.status,
    })),
  )
} finally {
  await browser.close()
}