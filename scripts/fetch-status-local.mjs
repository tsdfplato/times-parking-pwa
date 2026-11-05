import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { chromium } from 'playwright'

const projectRoot = process.cwd()

const outputPath = path.join(
  projectRoot,
  'public',
  'status-local.json',
)

const parks = [
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

function normalizeUpdatedAt(value) {
  return String(value || '')
    .replace(/\s*現在\s*$/, '')
    .trim()
}

async function readPark(context, park) {
  const page = await context.newPage()

  const url =
    `https://times-info.net/P27-osaka/C103/` +
    `park-detail-${park.id}/?t=${Date.now()}`

  try {
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    })

    if (!response) {
      throw new Error('HTTP応答がありません')
    }

    if (!response.ok()) {
      throw new Error(`HTTP ${response.status()}`)
    }

    await page.waitForSelector('#mankuuText', {
      timeout: 30000,
    })

    await page.waitForFunction(
      () => {
        const status =
          document
            .querySelector('#mankuuText')
            ?.textContent
            ?.trim() || ''

        return /^(空車|混雑|満車)$/.test(status)
      },
      null,
      {
        timeout: 30000,
      },
    )

    const data = await page.evaluate(() => ({
      status:
        document
          .querySelector('#mankuuText')
          ?.textContent
          ?.trim() || '',
      updatedAt:
        document
          .querySelector('.c-topInfo_updateTime_time')
          ?.textContent
          ?.trim() || '',
    }))

    if (!/^(空車|混雑|満車)$/.test(data.status)) {
      throw new Error(
        `状態を取得できませんでした：${data.status}`,
      )
    }

    const updatedAt = normalizeUpdatedAt(data.updatedAt)

    if (!updatedAt) {
      throw new Error('更新時刻を取得できませんでした')
    }

    return {
      no: park.no,
      id: park.id,
      name: park.name,
      distance: park.distance,
      status: data.status,
      officialUpdatedAt: updatedAt,
    }
  } finally {
    await page.close()
  }
}

async function main() {
  let browser

  try {
    browser = await chromium.launch({
      channel: 'chrome',
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-background-networking',
      ],
    })

    const context = await browser.newContext({
      locale: 'ja-JP',
      timezoneId: 'Asia/Tokyo',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/156.0.0.0 Safari/537.36',
      extraHTTPHeaders: {
        'Accept-Language': 'ja-JP,ja;q=0.9,en;q=0.7',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    })

    const results = []

    for (const park of parks) {
      process.stdout.write(
        `${park.no}. ${park.name}：取得中… `,
      )

      const result = await readPark(context, park)
      results.push(result)

      console.log(
        `${result.status}（${result.officialUpdatedAt}）`,
      )
    }

    const officialUpdatedAt =
      results[0]?.officialUpdatedAt || ''

    const inconsistentTime =
      results.some(
        (park) =>
          park.officialUpdatedAt !== officialUpdatedAt,
      )

    if (inconsistentTime) {
      console.warn(
        '注意：駐車場ごとに公式更新時刻が異なります',
      )
    }

    const output = {
      updatedAt: officialUpdatedAt,
      fetchedAt: new Date().toISOString(),
      source: 'local-playwright',
      parks: results.map(
        ({ officialUpdatedAt: ignored, ...park }) => park,
      ),
    }

    await fs.mkdir(path.dirname(outputPath), {
      recursive: true,
    })

    await fs.writeFile(
      outputPath,
      JSON.stringify(output, null, 2) + '\n',
      'utf8',
    )

    console.log('')
    console.log('===== 正式取得処理成功 =====')
    console.log(JSON.stringify(output, null, 2))
    console.log('')
    console.log(`保存先：${outputPath}`)
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}

main().catch((error) => {
  console.error('')
  console.error('===== 正式取得処理失敗 =====')
  console.error(error.stack || error.message || String(error))
  process.exitCode = 1
})