const STATUS_URL =

  'https://tsdfplato.github.io/times-parking-pwa/status.json'



const SCHEDULE_PREFIX = 'schedule:'

const PUSH_PREFIX = 'push:'

const LAST_LINE_USER_KEY = 'line:last-user'

const MAX_STATUS_AGE_MS = 10 * 60 * 1000



const PARK_DISPLAY_NAMES = {

  BUK0060527: '野田6丁目駐車場',

  BUK0077629: '野田6丁目第2駐車場',

  BUK0090120: '野田6丁目第3駐車場',

  BUK0061797: 'JR野田駅西第2駐車場',

  BUK0018415: '福島吉野駐車場',

  BUK0064561: '吉野5丁目第3駐車場',

}



const corsHeaders = {

  'Access-Control-Allow-Origin': '*',

  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',

  'Access-Control-Allow-Headers':

    'Content-Type, X-API-Token',

}



function json(data, status = 200) {

  return new Response(JSON.stringify(data), {

    status,

    headers: {

      ...corsHeaders,

      'Content-Type': 'application/json; charset=utf-8',

      'Cache-Control': 'no-store',

    },

  })

}



function isAuthorized(request, env) {

  return (

    Boolean(env.API_TOKEN) &&

    request.headers.get('X-API-Token') === env.API_TOKEN

  )

}



function normalizeRepeat(value) {

  const type = value?.type || 'none'



  if (

    ![

      'none',

      'daily',

      'weekdays',

      'weekly',

      'interval',

    ].includes(type)

  ) {

    throw new Error('繰り返し設定が正しくありません')

  }



  const weekdays = Array.isArray(value?.weekdays)

    ? [...new Set(value.weekdays.map(Number))].filter(

        (day) =>

          Number.isInteger(day) &&

          day >= 0 &&

          day <= 6,

      )

    : []



  if (type === 'weekly' && weekdays.length === 0) {

    throw new Error('繰り返す曜日を選択してください')

  }



  const intervalHours = Number(value?.intervalHours)



  if (

    type === 'interval' &&

    (

      !Number.isInteger(intervalHours) ||

      intervalHours < 1 ||

      intervalHours > 168

    )

  ) {

    throw new Error(

      '時間間隔は1～168時間で指定してください',

    )

  }



  return {

    type,

    weekdays:

      type === 'weekly' ? weekdays : [],

    intervalHours:

      type === 'interval' ? intervalHours : null,

  }

}



function nextNotifyAt(schedule, fromTime) {

  const repeat = schedule.repeat || {

    type: 'none',

  }



  const current = new Date(schedule.notifyAt)



  if (Number.isNaN(current.getTime())) {

    return null

  }



  if (repeat.type === 'none') {

    return null

  }



  if (repeat.type === 'interval') {

    const step =

      repeat.intervalHours * 60 * 60 * 1000



    let next = current.getTime()



    while (next <= fromTime) {

      next += step

    }



    return new Date(next).toISOString()

  }



  const allowedDays =

    repeat.type === 'daily'

      ? [0, 1, 2, 3, 4, 5, 6]

      : repeat.type === 'weekdays'

        ? [1, 2, 3, 4, 5]

        : repeat.weekdays



  const next = new Date(current)



  for (let count = 0; count < 370; count += 1) {

    next.setUTCDate(next.getUTCDate() + 1)



    const jstDay = new Date(

      next.getTime() + 9 * 60 * 60 * 1000,

    ).getUTCDay()



    if (

      next.getTime() > fromTime &&

      allowedDays.includes(jstDay)

    ) {

      return next.toISOString()

    }

  }



  return null

}



async function listSchedules(env) {

  const listed = await env.SCHEDULES.list({

    prefix: SCHEDULE_PREFIX,

  })



  const schedules = await Promise.all(

    listed.keys.map((key) =>

      env.SCHEDULES.get(key.name, 'json'),

    ),

  )



  return schedules

    .filter(Boolean)

    .sort(

      (scheduleA, scheduleB) =>

        new Date(scheduleA.notifyAt) -

        new Date(scheduleB.notifyAt),

    )

}



async function fetchParkingStatus() {

  const response = await fetch(

    `${STATUS_URL}?t=${Date.now()}`,

    {

      headers: {

        'Cache-Control': 'no-cache',

      },

    },

  )



  if (!response.ok) {

    throw new Error(

      `空車情報の取得に失敗しました: ${response.status}`,

    )

  }



  return response.json()

}



async function sendLine(env, message) {

  if (

    !env.LINE_CHANNEL_ACCESS_TOKEN ||

    !env.LINE_USER_ID

  ) {

    throw new Error(

      'LINEのアクセストークンまたはユーザーIDが設定されていません',

    )

  }



  const response = await fetch(

    'https://api.line.me/v2/bot/message/push',

    {

      method: 'POST',

      headers: {

        Authorization:

          `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,



        'Content-Type':

          'application/json; charset=utf-8',

      },

      body: JSON.stringify({

        to: env.LINE_USER_ID,

        messages: [

          {

            type: 'text',

            text: message,

          },

        ],

      }),

    },

  )



  if (!response.ok) {

    const responseText = await response.text()



    throw new Error(

      `LINE通知に失敗しました: ${response.status} ${responseText}`,

    )

  }

}

function base64UrlToBytes(value) {
  const base64 = String(value)
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(String(value).length / 4) * 4, '=')
  const binary = atob(base64)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function bytesToBase64Url(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value)
  let binary = ''
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index])
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function concatBytes(...values) {
  const arrays = values.map((value) =>
    value instanceof Uint8Array ? value : new Uint8Array(value),
  )
  const result = new Uint8Array(
    arrays.reduce((total, value) => total + value.length, 0),
  )
  let offset = 0
  for (const value of arrays) {
    result.set(value, offset)
    offset += value.length
  }
  return result
}

async function hmacSha256(keyBytes, dataBytes) {
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return new Uint8Array(
    await crypto.subtle.sign('HMAC', key, dataBytes),
  )
}

async function hkdfExtract(salt, inputKeyMaterial) {
  return hmacSha256(salt, inputKeyMaterial)
}

async function hkdfExpand(pseudoRandomKey, info, length) {
  let previous = new Uint8Array(0)
  let output = new Uint8Array(0)
  let counter = 1

  while (output.length < length) {
    previous = await hmacSha256(
      pseudoRandomKey,
      concatBytes(previous, info, new Uint8Array([counter])),
    )
    output = concatBytes(output, previous)
    counter += 1
  }

  return output.slice(0, length)
}

function ecdsaSignatureToJose(signature) {
  const bytes =
    signature instanceof Uint8Array
      ? signature
      : new Uint8Array(signature)

  if (bytes.length === 64) return bytes
  if (bytes[0] !== 0x30) {
    throw new Error('VAPID署名の形式が正しくありません')
  }

  let offset = 2
  if (bytes[1] & 0x80) {
    offset = 2 + (bytes[1] & 0x7f)
  }
  if (bytes[offset] !== 0x02) {
    throw new Error('VAPID署名のR値がありません')
  }
  const rLength = bytes[offset + 1]
  const r = bytes.slice(offset + 2, offset + 2 + rLength)
  offset += 2 + rLength
  if (bytes[offset] !== 0x02) {
    throw new Error('VAPID署名のS値がありません')
  }
  const sLength = bytes[offset + 1]
  const s = bytes.slice(offset + 2, offset + 2 + sLength)
  const result = new Uint8Array(64)
  result.set(r.slice(Math.max(0, r.length - 32)), 32 - Math.min(32, r.length))
  result.set(s.slice(Math.max(0, s.length - 32)), 64 - Math.min(32, s.length))
  return result
}

async function createVapidAuthorization(env, endpoint) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    throw new Error('VAPIDキーが設定されていません')
  }

  const publicKey = base64UrlToBytes(env.VAPID_PUBLIC_KEY)
  const privateKey = base64UrlToBytes(env.VAPID_PRIVATE_KEY)
  if (publicKey.length !== 65 || publicKey[0] !== 4) {
    throw new Error('VAPID公開鍵が正しくありません')
  }

  const key = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      x: bytesToBase64Url(publicKey.slice(1, 33)),
      y: bytesToBase64Url(publicKey.slice(33, 65)),
      d: bytesToBase64Url(privateKey),
      ext: true,
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )

  const encoder = new TextEncoder()
  const header = bytesToBase64Url(
    encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })),
  )
  const payload = bytesToBase64Url(
    encoder.encode(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: env.VAPID_SUBJECT || 'mailto:tsdfplato@users.noreply.github.com',
      }),
    ),
  )
  const unsignedToken = `${header}.${payload}`
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    encoder.encode(unsignedToken),
  )
  const joseSignature = ecdsaSignatureToJose(signature)

  return `vapid t=${unsignedToken}.${bytesToBase64Url(joseSignature)}, k=${env.VAPID_PUBLIC_KEY}`
}

async function encryptPushPayload(subscription, payload) {
  const encoder = new TextEncoder()
  const userPublicKey = base64UrlToBytes(subscription.keys.p256dh)
  const authSecret = base64UrlToBytes(subscription.keys.auth)
  const serverKeys = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  )
  const userKey = await crypto.subtle.importKey(
    'raw',
    userPublicKey,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: userKey },
      serverKeys.privateKey,
      256,
    ),
  )
  const serverPublicKey = new Uint8Array(
    await crypto.subtle.exportKey('raw', serverKeys.publicKey),
  )
  const authenticationPrk = await hkdfExtract(authSecret, sharedSecret)
  const keyInfo = concatBytes(
    encoder.encode('WebPush: info\0'),
    userPublicKey,
    serverPublicKey,
  )
  const inputKeyMaterial = await hkdfExpand(authenticationPrk, keyInfo, 32)
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const pseudoRandomKey = await hkdfExtract(salt, inputKeyMaterial)
  const contentEncryptionKey = await hkdfExpand(
    pseudoRandomKey,
    encoder.encode('Content-Encoding: aes128gcm\0'),
    16,
  )
  const nonce = await hkdfExpand(
    pseudoRandomKey,
    encoder.encode('Content-Encoding: nonce\0'),
    12,
  )
  const aesKey = await crypto.subtle.importKey(
    'raw',
    contentEncryptionKey,
    'AES-GCM',
    false,
    ['encrypt'],
  )
  const plaintext = concatBytes(encoder.encode(payload), new Uint8Array([2]))
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce, tagLength: 128 },
      aesKey,
      plaintext,
    ),
  )
  const recordSize = new Uint8Array([0, 0, 16, 0])

  return concatBytes(
    salt,
    recordSize,
    new Uint8Array([serverPublicKey.length]),
    serverPublicKey,
    ciphertext,
  )
}

async function listPushSubscriptions(env) {
  const listed = await env.SCHEDULES.list({ prefix: PUSH_PREFIX })
  const subscriptions = await Promise.all(
    listed.keys.map(async ({ name }) => {
      const value = await env.SCHEDULES.get(name, 'json')
      return value ? { key: name, ...value } : null
    }),
  )
  return subscriptions.filter(Boolean)
}

async function sendWebPush(env, subscriptionRecord, notification) {
  const subscription = subscriptionRecord.subscription
  const body = await encryptPushPayload(
    subscription,
    JSON.stringify(notification),
  )
  const authorization = await createVapidAuthorization(
    env,
    subscription.endpoint,
  )
  return fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '300',
      Urgency: 'high',
    },
    body,
  })
}

async function sendWebPushToAll(env, message) {
  const subscriptions = await listPushSubscriptions(env)
  const [title, ...bodyLines] = message.split('\n')
  let sent = 0
  let failed = 0

  for (const record of subscriptions) {
    try {
      const response = await sendWebPush(env, record, {
        title: title || 'タイムズ Parking Information',
        body: bodyLines.join('\n') || title,
        icon: 'https://tsdfplato.github.io/times-parking-pwa/times-icon.svg',
        badge: 'https://tsdfplato.github.io/times-parking-pwa/notification-badge.png',
        url: 'https://tsdfplato.github.io/times-parking-pwa/',
        tag: 'times-parking-status',
      })
      if (response.ok) {
        sent += 1
      } else {
        failed += 1
        if (response.status === 404 || response.status === 410) {
          await env.SCHEDULES.delete(record.key)
        }
        console.error(`push ${response.status}: ${await response.text()}`)
      }
    } catch (error) {
      failed += 1
      console.error(`push error: ${error?.message || String(error)}`)
    }
  }

  return { total: subscriptions.length, sent, failed }
}

async function sendPreferredNotification(env, message) {
  const pushResult = await sendWebPushToAll(env, message)
  if (pushResult.sent > 0) return { channel: 'web-push', ...pushResult }
  await sendLine(env, message)
  return { channel: 'line', ...pushResult }
}



function formatShortTime(value) {

  if (!value) {

    return '--:--'

  }



  const textMatch = String(value).match(

    /(?:^|\s)(\d{1,2}:\d{2})(?:\s|$)/,

  )



  if (textMatch) {

    return textMatch[1]

  }



  const date = new Date(value)



  if (Number.isNaN(date.getTime())) {

    return '--:--'

  }



  return new Intl.DateTimeFormat('ja-JP', {

    timeZone: 'Asia/Tokyo',

    hour: '2-digit',

    minute: '2-digit',

    hour12: false,

  }).format(date)

}



function createParkingMessage(

  statusData,

  parkIds,

  recovered = false,

) {

  const parks = Array.isArray(statusData.parks)

    ? statusData.parks

    : []



  const selected = parks

    .filter((park) => parkIds.includes(park.id))

    .sort((parkA, parkB) => parkA.no - parkB.no)



  if (selected.length === 0) {

    return 'タイムズ 駐車場情報を取得できません'

  }



  const updatedAt =

    statusData.updatedAt || statusData.fetchedAt



  const time = formatShortTime(updatedAt)



  const parkingLines = selected

    .map((park) => {

      const name =

        PARK_DISPLAY_NAMES[park.id] || park.name



      return `${name} ${park.status || '不明'}`

    })

    .join('\n')



  const heading = recovered

    ? `タイムズ公式${time}更新情報（復旧）`

    : `タイムズ公式${time}更新情報`



  return `${heading}\n${parkingLines}`

}



function statusAgeMs(statusData, now) {

  const fetchedTime = new Date(

    statusData?.fetchedAt || '',

  ).getTime()



  if (Number.isNaN(fetchedTime)) {

    return Number.POSITIVE_INFINITY

  }



  return Math.max(0, now - fetchedTime)

}



async function saveDelayedSchedule(

  env,

  schedule,

  now,

  statusData,

) {

  if (!schedule.delayAlertedAt) {

    const lastTime = formatShortTime(

      statusData?.updatedAt ||

        statusData?.fetchedAt,

    )



    await sendPreferredNotification(

      env,

      `タイムズ公式${lastTime}時点\n情報取得遅延中`,

    )

  }



  await env.SCHEDULES.put(

    `${SCHEDULE_PREFIX}${schedule.id}`,

    JSON.stringify({

      ...schedule,

      delayAlertedAt:

        schedule.delayAlertedAt ||

        new Date(now).toISOString(),



      lastRetryAt:

        new Date(now).toISOString(),

    }),

  )

}



async function runDueSchedules(env) {

  const now = Date.now()

  const schedules = await listSchedules(env)



  const due = schedules.filter(

    (schedule) =>

      new Date(schedule.notifyAt).getTime() <= now,

  )



  if (due.length === 0) {

    return

  }



  let statusData = null



  try {

    statusData = await fetchParkingStatus()

  } catch (error) {

    console.error(

      `status fetch: ${

        error?.message || String(error)

      }`,

    )

  }



  const dataIsFresh =

    statusData &&

    statusAgeMs(statusData, now) <=

      MAX_STATUS_AGE_MS



  for (const schedule of due) {

    try {

      if (!dataIsFresh) {

        await saveDelayedSchedule(

          env,

          schedule,

          now,

          statusData,

        )



        continue

      }



      await sendPreferredNotification(

        env,

        createParkingMessage(

          statusData,

          schedule.parkIds || [],

          Boolean(schedule.delayAlertedAt),

        ),

      )



      const next = nextNotifyAt(schedule, now)



      if (next) {

        await env.SCHEDULES.put(

          `${SCHEDULE_PREFIX}${schedule.id}`,

          JSON.stringify({

            ...schedule,

            notifyAt: next,

            lastNotifiedAt:

              new Date(now).toISOString(),



            delayAlertedAt: null,

            lastRetryAt: null,

          }),

        )

      } else {

        await env.SCHEDULES.delete(

          `${SCHEDULE_PREFIX}${schedule.id}`,

        )

      }

    } catch (error) {

      console.error(

        `schedule ${schedule.id}: ${

          error?.message || String(error)

        }`,

      )

    }

  }

}



async function handleLineWebhook(request, env) {

  try {

    const body = await request.json()



    const events = Array.isArray(body.events)

      ? body.events

      : []



    const event = events.find(

      (item) => item?.source?.userId,

    )



    if (event?.source?.userId) {

      await env.SCHEDULES.put(

        LAST_LINE_USER_KEY,

        JSON.stringify({

          userId: event.source.userId,

          receivedAt:

            new Date().toISOString(),

        }),

      )

    }



    return json({

      ok: true,

    })

  } catch (error) {

    return json(

      {

        ok: false,

        error: error.message,

      },

      400,

    )

  }

}



async function handleRequest(request, env) {

  if (request.method === 'OPTIONS') {

    return new Response(null, {

      status: 204,

      headers: corsHeaders,

    })

  }



  const url = new URL(request.url)



  if (

    url.pathname === '/line-webhook' &&

    request.method === 'POST'

  ) {

    return handleLineWebhook(request, env)

  }



  if (

    url.pathname === '/health' &&

    request.method === 'GET'

  ) {

    return json({

      ok: true,

      service: 'times-parking-notifier',

      currentTime:

        new Date().toISOString(),



      lineTokenConfigured:

        Boolean(env.LINE_CHANNEL_ACCESS_TOKEN),



      lineUserIdConfigured:

        Boolean(env.LINE_USER_ID),



      kvConfigured:

        Boolean(env.SCHEDULES),

      vapidPublicKeyConfigured:

        Boolean(env.VAPID_PUBLIC_KEY),

      vapidPrivateKeyConfigured:

        Boolean(env.VAPID_PRIVATE_KEY),

    })

  }



  if (!isAuthorized(request, env)) {

    return json(

      {

        ok: false,

        error: '認証に失敗しました',

      },

      401,

    )

  }



  if (

    url.pathname === '/line-user' &&

    request.method === 'GET'

  ) {

    const lineUser = await env.SCHEDULES.get(

      LAST_LINE_USER_KEY,

      'json',

    )



    return json({

      ok: true,

      lineUser: lineUser || null,

    })

  }



  if (

    url.pathname === '/test' &&

    request.method === 'POST'

  ) {

    try {

      await sendLine(

        env,

        'タイムズ通知テスト Galaxy・Garmin確認',

      )



      return json({

        ok: true,

      })

    } catch (error) {

      return json(

        {

          ok: false,

          error: error.message,

        },

        502,

      )

    }

  }



  if (

    url.pathname === '/push-public-key' &&

    request.method === 'GET'

  ) {

    return json({

      ok: true,

      publicKey: env.VAPID_PUBLIC_KEY || '',

    })

  }



  if (

    url.pathname === '/push-subscriptions' &&

    request.method === 'POST'

  ) {

    try {

      const body = await request.json()

      const subscription = body.subscription



      if (

        !subscription?.endpoint ||

        !subscription?.keys?.p256dh ||

        !subscription?.keys?.auth ||

        !String(subscription.endpoint).startsWith('https://')

      ) {

        return json(

          {

            ok: false,

            error: '通知購読情報が正しくありません',

          },

          400,

        )

      }



      const deviceId =

        typeof body.deviceId === 'string' && body.deviceId

          ? body.deviceId

          : crypto.randomUUID()



      await env.SCHEDULES.put(

        `${PUSH_PREFIX}${deviceId}`,

        JSON.stringify({

          deviceId,

          subscription,

          userAgent:

            request.headers.get('User-Agent') || '',

          updatedAt:

            new Date().toISOString(),

        }),

      )



      return json({ ok: true, deviceId })

    } catch (error) {

      return json(

        { ok: false, error: error.message },

        400,

      )

    }

  }



  if (

    url.pathname === '/test-push' &&

    request.method === 'POST'

  ) {

    const result = await sendWebPushToAll(

      env,

      `タイムズ通知テスト\n野田6丁目駐車場 通知テスト`,

    )



    if (result.sent === 0) {

      return json(

        {

          ok: false,

          error: 'PWA通知の登録先がありません',

          result,

        },

        404,

      )

    }



    return json({ ok: true, result })

  }



  const pushDeleteMatch = url.pathname.match(

    /^\/push-subscriptions\/([^/]+)$/,

  )



  if (

    pushDeleteMatch &&

    request.method === 'DELETE'

  ) {

    const deviceId = decodeURIComponent(

      pushDeleteMatch[1],

    )



    await env.SCHEDULES.delete(

      `${PUSH_PREFIX}${deviceId}`,

    )



    return json({ ok: true })

  }



  if (

    url.pathname === '/schedules' &&

    request.method === 'GET'

  ) {

    return json({

      ok: true,

      schedules: await listSchedules(env),

    })

  }



  if (

    url.pathname === '/schedules' &&

    request.method === 'POST'

  ) {

    try {

      const body = await request.json()

      const notifyAt = new Date(body.notifyAt)



      if (

        Number.isNaN(notifyAt.getTime()) ||

        notifyAt.getTime() <= Date.now()

      ) {

        return json(

          {

            ok: false,

            error: '通知日時が正しくありません',

          },

          400,

        )

      }



      const parkIds = Array.isArray(body.parkIds)

        ? [

            ...new Set(

              body.parkIds.filter(

                (id) => typeof id === 'string',

              ),

            ),

          ]

        : []



      if (parkIds.length === 0) {

        return json(

          {

            ok: false,

            error: '駐車場を選択してください',

          },

          400,

        )

      }



      const repeat = normalizeRepeat(body.repeat)



      const schedule = {

        id: crypto.randomUUID(),

        notifyAt: notifyAt.toISOString(),

        parkIds,

        repeat,

        createdAt:

          new Date().toISOString(),

      }



      await env.SCHEDULES.put(

        `${SCHEDULE_PREFIX}${schedule.id}`,

        JSON.stringify(schedule),

      )



      return json(

        {

          ok: true,

          schedule,

        },

        201,

      )

    } catch (error) {

      return json(

        {

          ok: false,

          error: error.message,

        },

        400,

      )

    }

  }



  const deleteMatch = url.pathname.match(

    /^\/schedules\/([^/]+)$/,

  )



  if (

    deleteMatch &&

    request.method === 'DELETE'

  ) {

    const id = decodeURIComponent(deleteMatch[1])



    await env.SCHEDULES.delete(

      `${SCHEDULE_PREFIX}${id}`,

    )



    return json({

      ok: true,

    })

  }



  return json(

    {

      ok: false,

      error: 'Not Found',

    },

    404,

  )

}



export default {

  fetch(request, env) {

    return handleRequest(request, env)

  },



  scheduled(_event, env, ctx) {

    ctx.waitUntil(runDueSchedules(env))

  },

}
