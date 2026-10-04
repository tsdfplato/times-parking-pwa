import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import './App.css'

const MAP_URL =
  'https://www.google.com/maps/d/u/0/embed?mid=1sXRW3-SgAC1gtUy8siwDWRTeKiKGfTA&ehbc=2E312F'
const TIMES_LOGO =
  'https://times-info.net/common/responsive/images/logo.png'
const NOTIFIER_URL =
  'https://times-parking-notifier.kubota-mlc.workers.dev'
const API_TOKEN_STORAGE_KEY = 'times-parking-notifier-api-token'
const PUSH_DEVICE_ID_STORAGE_KEY = 'times-parking-push-device-id'
const STATUS_STORAGE_KEY = 'times-parking-previous-status'
const CHANGE_STORAGE_KEY = 'times-parking-status-changes'
const CHANGE_DISPLAY_MS = 10 * 60 * 1000
const CLOUD_STOP_MINUTES = 15
const WEEKDAYS = [
  { value: 1, label: '月' },
  { value: 2, label: '火' },
  { value: 3, label: '水' },
  { value: 4, label: '木' },
  { value: 5, label: '金' },
  { value: 6, label: '土' },
  { value: 0, label: '日' },
]

function getStatusClass(status) {
  if (status === '空車') return 'status-free'
  if (status === '混雑') return 'status-busy'
  if (status === '満車') return 'status-full'
  return 'status-unknown'
}

function getChangeClass(status) {
  if (status === '空車') return 'change-good'
  if (status === '混雑') return 'change-warning'
  if (status === '満車') return 'change-bad'
  return 'change-unknown'
}

function parseDateValue(value) {
  if (!value) return null

  const match = value.match(
    /^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})$/,
  )

  if (match) {
    const [, year, month, day, hour, minute] = match
    const date = new Date(
      `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute}:00+09:00`,
    )
    return Number.isNaN(date.getTime()) ? null : date
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatUpdatedAt(value) {
  const date = parseDateValue(value)
  if (!date) return value || '取得中'

  return date.toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatRelativeTime(value, currentTime) {
  const date = parseDateValue(value)
  if (!date) return ''

  const minutes = Math.max(
    0,
    Math.floor((currentTime - date.getTime()) / 60000),
  )

  if (minutes === 0) return 'たった今'
  if (minutes === 1) return '1分前'
  if (minutes < 60) return `${minutes}分前`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}時間前`
  return `${Math.floor(hours / 24)}日前`
}

function formatScheduleDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatRepeat(schedule) {
  const repeat = schedule?.repeat
  if (!repeat || repeat.type === 'none') return '1回のみ'
  if (repeat.type === 'daily') return '毎日'
  if (repeat.type === 'weekdays') return '平日（月～金）'
  if (repeat.type === 'interval') {
    return `${repeat.intervalHours || 1}時間ごと`
  }
  if (repeat.type === 'weekly') {
    const labels = WEEKDAYS.filter((day) =>
      repeat.weekdays?.includes(day.value),
    ).map((day) => day.label)
    return labels.length ? `毎週 ${labels.join('・')}` : '毎週'
  }
  return '1回のみ'
}

function getInitialScheduleDate() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return formatter.format(new Date())
}

function loadStoredObject(key) {
  try {
    const saved = localStorage.getItem(key)
    return saved ? JSON.parse(saved) : {}
  } catch {
    return {}
  }
}

function urlBase64ToUint8Array(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from(rawData, (character) =>
    character.charCodeAt(0),
  )
}

function App() {
  const [parks, setParks] = useState([])
  const [changes, setChanges] = useState({})
  const [officialUpdatedAt, setOfficialUpdatedAt] = useState('')
  const [cloudFetchedAt, setCloudFetchedAt] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [currentTime, setCurrentTime] = useState(0)
  const [selectedPark, setSelectedPark] = useState(null)
  const [showMap, setShowMap] = useState(false)
  const [installPrompt, setInstallPrompt] = useState(null)
  const [isGalaxyView, setIsGalaxyView] = useState(false)
  const [showSchedulePanel, setShowSchedulePanel] = useState(false)
  const [scheduleDate, setScheduleDate] = useState(getInitialScheduleDate)
  const [scheduleTime, setScheduleTime] = useState('00:00')
  const [repeatType, setRepeatType] = useState('none')
  const [repeatWeekdays, setRepeatWeekdays] = useState([])
  const [intervalHours, setIntervalHours] = useState(1)
  const [selectedParkIds, setSelectedParkIds] = useState([])
  const [schedules, setSchedules] = useState([])
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [scheduleMessage, setScheduleMessage] = useState('')
  const [scheduleError, setScheduleError] = useState('')
  const [notifierToken, setNotifierToken] = useState(() =>
    localStorage.getItem(API_TOKEN_STORAGE_KEY) || '',
  )
  const [tokenInput, setTokenInput] = useState('')
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushLoading, setPushLoading] = useState(false)
  const [pushMessage, setPushMessage] = useState('')
  const dateInputRef = useRef(null)
  const timeDialogRef = useRef(null)
  const [draftHour, setDraftHour] = useState('00')
  const [draftMinute, setDraftMinute] = useState('00')

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  const notifierHeaders = useMemo(
    () => ({
      'X-API-Token': notifierToken,
      'Content-Type': 'application/json; charset=utf-8',
    }),
    [notifierToken],
  )

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return
    }

    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setPushEnabled(Boolean(subscription)))
      .catch(() => setPushEnabled(false))
  }, [])

  const enablePushNotifications = async () => {
    if (!notifierToken) {
      setScheduleError('先にAPIトークンをGalaxyへ保存してください')
      return
    }

    if (
      !('serviceWorker' in navigator) ||
      !('PushManager' in window) ||
      !('Notification' in window)
    ) {
      setScheduleError('この端末はPWA直接通知に対応していません')
      return
    }

    setPushLoading(true)
    setScheduleError('')
    setPushMessage('')

    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        throw new Error('通知を許可してください')
      }

      const keyResponse = await fetch(
        `${NOTIFIER_URL}/push-public-key`,
        { headers: notifierHeaders },
      )
      const keyData = await keyResponse.json()
      if (!keyResponse.ok || !keyData.publicKey) {
        throw new Error(keyData.error || '通知用公開鍵を取得できませんでした')
      }

      const registration = await navigator.serviceWorker.ready
      let subscription = await registration.pushManager.getSubscription()

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(keyData.publicKey),
        })
      }

      let deviceId = localStorage.getItem(PUSH_DEVICE_ID_STORAGE_KEY)
      if (!deviceId) {
        deviceId = crypto.randomUUID()
        localStorage.setItem(PUSH_DEVICE_ID_STORAGE_KEY, deviceId)
      }

      const saveResponse = await fetch(
        `${NOTIFIER_URL}/push-subscriptions`,
        {
          method: 'POST',
          headers: notifierHeaders,
          body: JSON.stringify({
            deviceId,
            subscription: subscription.toJSON(),
          }),
        },
      )
      const saveData = await saveResponse.json()
      if (!saveResponse.ok || !saveData.ok) {
        throw new Error(saveData.error || 'PWA通知を登録できませんでした')
      }

      setPushEnabled(true)
      setPushMessage('PWA直接通知を有効にしました')
    } catch (pushError) {
      console.error(pushError)
      setScheduleError(
        pushError.message || 'PWA直接通知を有効にできませんでした',
      )
    } finally {
      setPushLoading(false)
    }
  }

  const testPushNotification = async () => {
    setPushLoading(true)
    setScheduleError('')
    setPushMessage('')

    try {
      const response = await fetch(`${NOTIFIER_URL}/test-push`, {
        method: 'POST',
        headers: notifierHeaders,
      })
      const data = await response.json()
      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'PWA通知テストに失敗しました')
      }
      setPushMessage('PWA直接通知を送信しました')
    } catch (pushError) {
      console.error(pushError)
      setScheduleError(
        pushError.message || 'PWA通知テストに失敗しました',
      )
    } finally {
      setPushLoading(false)
    }
  }

  const loadStatus = useCallback(async (manual = false) => {
    setLoading(true)
    setError('')
    if (manual) setSuccessMessage('')

    try {
      const response = await fetch(
        `${import.meta.env.BASE_URL}status.json?t=${Date.now()}`,
        {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache',
          },
        },
      )

      if (!response.ok) {
        throw new Error('空車情報を取得できませんでした')
      }

      const data = await response.json()
      const nextParks = Array.isArray(data.parks) ? data.parks : []
      const previousStatuses = loadStoredObject(STATUS_STORAGE_KEY)
      const storedChanges = loadStoredObject(CHANGE_STORAGE_KEY)
      const now = Date.now()
      const nextStatuses = {}
      const nextChanges = {}

      Object.entries(storedChanges).forEach(([id, change]) => {
        if (
          change?.detectedAt &&
          now - change.detectedAt < CHANGE_DISPLAY_MS
        ) {
          nextChanges[id] = change
        }
      })

      nextParks.forEach((park) => {
        const previousStatus = previousStatuses[park.id]
        nextStatuses[park.id] = park.status

        if (previousStatus && previousStatus !== park.status) {
          nextChanges[park.id] = {
            before: previousStatus,
            after: park.status,
            detectedAt: now,
          }
        }
      })

      localStorage.setItem(
        STATUS_STORAGE_KEY,
        JSON.stringify(nextStatuses),
      )
      localStorage.setItem(
        CHANGE_STORAGE_KEY,
        JSON.stringify(nextChanges),
      )

      setParks(nextParks)
      setChanges(nextChanges)
      setOfficialUpdatedAt(data.updatedAt || data.fetchedAt || '')
      setCloudFetchedAt(data.fetchedAt || data.updatedAt || '')
      setCurrentTime(now)

      if (manual) {
        setSuccessMessage('最新データを確認しました')
        window.setTimeout(() => setSuccessMessage(''), 4000)
      }
    } catch (fetchError) {
      console.error(fetchError)
      setError('空車情報を取得できませんでした')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadSchedules = useCallback(async () => {
    setScheduleLoading(true)
    setScheduleError('')

    try {
      const response = await fetch(`${NOTIFIER_URL}/schedules`, {
        method: 'GET',
        cache: 'no-store',
        headers: notifierHeaders,
      })
      const data = await response.json()

      if (!response.ok || !data.ok) {
        throw new Error(data.error || '通知予定を取得できませんでした')
      }

      setSchedules(
        Array.isArray(data.schedules)
          ? [...data.schedules].sort(
              (a, b) => new Date(a.notifyAt) - new Date(b.notifyAt),
            )
          : [],
      )
    } catch (fetchError) {
      console.error(fetchError)
      setScheduleError('通知予定を取得できませんでした')
    } finally {
      setScheduleLoading(false)
    }
  }, [notifierHeaders])

  useEffect(() => {
    const userAgent = navigator.userAgent || ''
    setIsGalaxyView(/Android/i.test(userAgent))

    const initialLoadTimer = window.setTimeout(() => loadStatus(), 0)
    const statusTimer = window.setInterval(() => loadStatus(), 60000)
    const clockTimer = window.setInterval(() => {
      const now = Date.now()
      setCurrentTime(now)
      setChanges((currentChanges) => {
        const activeChanges = Object.fromEntries(
          Object.entries(currentChanges).filter(
            ([, change]) => now - change.detectedAt < CHANGE_DISPLAY_MS,
          ),
        )
        localStorage.setItem(
          CHANGE_STORAGE_KEY,
          JSON.stringify(activeChanges),
        )
        return activeChanges
      })
    }, 60000)

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') loadStatus()
    }
    const refreshOnReturn = () => loadStatus()
    const captureInstallPrompt = (event) => {
      event.preventDefault()
      setInstallPrompt(event)
    }

    window.addEventListener('focus', refreshOnReturn)
    window.addEventListener('pageshow', refreshOnReturn)
    window.addEventListener('beforeinstallprompt', captureInstallPrompt)
    document.addEventListener('visibilitychange', refreshWhenVisible)

    return () => {
      window.clearTimeout(initialLoadTimer)
      window.clearInterval(statusTimer)
      window.clearInterval(clockTimer)
      window.removeEventListener('focus', refreshOnReturn)
      window.removeEventListener('pageshow', refreshOnReturn)
      window.removeEventListener(
        'beforeinstallprompt',
        captureInstallPrompt,
      )
      document.removeEventListener(
        'visibilitychange',
        refreshWhenVisible,
      )
    }
  }, [loadStatus])

  useEffect(() => {
    if (isGalaxyView && notifierToken) loadSchedules()
  }, [isGalaxyView, notifierToken, loadSchedules])

  const sortedParks = useMemo(
    () => [...parks].sort((a, b) => a.no - b.no),
    [parks],
  )

  const statusCounts = useMemo(
    () =>
      parks.reduce(
        (counts, park) => {
          if (park.status === '空車') counts.free += 1
          if (park.status === '混雑') counts.busy += 1
          if (park.status === '満車') counts.full += 1
          return counts
        },
        { free: 0, busy: 0, full: 0 },
      ),
    [parks],
  )

  const cloudAgeMinutes = useMemo(() => {
    const fetchedDate = parseDateValue(cloudFetchedAt)
    if (!fetchedDate) return null
    return Math.max(
      0,
      Math.floor((currentTime - fetchedDate.getTime()) / 60000),
    )
  }, [cloudFetchedAt, currentTime])

  const updateStopped =
    cloudAgeMinutes !== null && cloudAgeMinutes >= CLOUD_STOP_MINUTES

  const selectPark = (park) => {
    setSelectedPark(park)
    setShowMap(true)
    window.setTimeout(() => {
      document.getElementById('parking-map')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    }, 50)
  }

  const installApp = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    setInstallPrompt(null)
  }

  const toggleSchedulePark = (parkId) => {
    setSelectedParkIds((current) =>
      current.includes(parkId)
        ? current.filter((id) => id !== parkId)
        : [...current, parkId],
    )
  }

  const openDatePicker = () => {
    const input = dateInputRef.current
    if (!input) return
    if (typeof input.showPicker === 'function') input.showPicker()
    else input.focus()
  }

  const openTimePicker = () => {
    const [hour = '00', minute = '00'] = scheduleTime.split(':')
    setDraftHour(hour)
    setDraftMinute(minute)
    timeDialogRef.current?.showModal()
  }

  const confirmTimePicker = () => {
    setScheduleTime(`${draftHour}:${draftMinute}`)
    timeDialogRef.current?.close()
  }

  const toggleRepeatWeekday = (weekday) => {
    setRepeatWeekdays((current) =>
      current.includes(weekday)
        ? current.filter((day) => day !== weekday)
        : [...current, weekday],
    )
  }

  const saveNotifierToken = (event) => {
    event.preventDefault()
    const nextToken = tokenInput.trim()

    if (!nextToken) {
      setScheduleError('APIトークンを入力してください')
      return
    }

    localStorage.setItem(API_TOKEN_STORAGE_KEY, nextToken)
    setNotifierToken(nextToken)
    setTokenInput('')
    setScheduleError('')
    setScheduleMessage('APIトークンをGalaxyに保存しました')
    window.setTimeout(() => setScheduleMessage(''), 4000)
  }

  const clearNotifierToken = () => {
    if (!window.confirm('Galaxyに保存したAPIトークンを削除しますか？')) {
      return
    }

    localStorage.removeItem(API_TOKEN_STORAGE_KEY)
    setNotifierToken('')
    setSchedules([])
    setScheduleMessage('')
    setScheduleError('')
  }

  const addSchedule = async (event) => {
    event.preventDefault()
    setScheduleMessage('')
    setScheduleError('')

    if (!scheduleDate || !scheduleTime) {
      setScheduleError('通知する日付と時刻を指定してください')
      return
    }

    if (selectedParkIds.length === 0) {
      setScheduleError('通知する駐車場を1か所以上選んでください')
      return
    }


    if (repeatType === 'weekly' && repeatWeekdays.length === 0) {
      setScheduleError('繰り返す曜日を1つ以上選んでください')
      return
    }

    const notifyAt = new Date(
      `${scheduleDate}T${scheduleTime}:00+09:00`,
    )

    if (
      Number.isNaN(notifyAt.getTime()) ||
      notifyAt.getTime() <= Date.now()
    ) {
      setScheduleError('現在より後の日時を指定してください')
      return
    }

    setScheduleLoading(true)

    try {
      const response = await fetch(`${NOTIFIER_URL}/schedules`, {
        method: 'POST',
        headers: notifierHeaders,
        body: JSON.stringify({
          notifyAt: notifyAt.toISOString(),
          parkIds: selectedParkIds,
          repeat: {
            type: repeatType,
            weekdays:
              repeatType === 'weekly' ? repeatWeekdays : [],
            intervalHours:
              repeatType === 'interval' ? Number(intervalHours) : null,
          },
        }),
      })
      const data = await response.json()

      if (!response.ok || !data.ok) {
        throw new Error(data.error || '通知予定を登録できませんでした')
      }

      setSelectedParkIds([])
      setScheduleMessage('通知予定を登録しました')
      await loadSchedules()
      window.setTimeout(() => setScheduleMessage(''), 4000)
    } catch (fetchError) {
      console.error(fetchError)
      setScheduleError(
        fetchError.message || '通知予定を登録できませんでした',
      )
    } finally {
      setScheduleLoading(false)
    }
  }

  const deleteSchedule = async (scheduleId) => {
    if (!window.confirm('この通知予定を削除しますか？')) return

    setScheduleLoading(true)
    setScheduleMessage('')
    setScheduleError('')

    try {
      const response = await fetch(
        `${NOTIFIER_URL}/schedules/${encodeURIComponent(scheduleId)}`,
        {
          method: 'DELETE',
          headers: notifierHeaders,
        },
      )
      const data = await response.json()

      if (!response.ok || !data.ok) {
        throw new Error(data.error || '通知予定を削除できませんでした')
      }

      setScheduleMessage('通知予定を削除しました')
      await loadSchedules()
      window.setTimeout(() => setScheduleMessage(''), 4000)
    } catch (fetchError) {
      console.error(fetchError)
      setScheduleError(
        fetchError.message || '通知予定を削除できませんでした',
      )
    } finally {
      setScheduleLoading(false)
    }
  }

  const getScheduleParkNames = (parkIds) => {
    if (!Array.isArray(parkIds) || parkIds.length === 0) {
      return '駐車場未選択'
    }

    return parkIds
      .map((id) => parks.find((park) => park.id === id))
      .filter(Boolean)
      .sort((a, b) => a.no - b.no)
      .map((park) => `${park.no}. ${park.name}`)
      .join('、')
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <img className="times-logo" src={TIMES_LOGO} alt="Times" />
        </div>
        <p className="subtitle">タイムズ駐車場 空車情報</p>
      </header>

      {needRefresh && (
        <section className="version-notice" role="alert">
          <strong>新しいバージョンがあります</strong>
          <button
            type="button"
            onClick={() => updateServiceWorker(true)}
          >
            更新
          </button>
          <button
            className="notice-close"
            type="button"
            onClick={() => setNeedRefresh(false)}
            aria-label="閉じる"
          >
            ×
          </button>
        </section>
      )}

      {installPrompt && (
        <section className="install-notice">
          <span>この端末にアプリとしてインストールできます</span>
          <button type="button" onClick={installApp}>
            インストール
          </button>
        </section>
      )}

      <section
        className={`update-panel ${updateStopped ? 'stopped' : ''}`}
      >
        {updateStopped && (
          <div className="stopped-alert" role="alert">
            情報更新停止中
          </div>
        )}
        <button
          className="update-button"
          type="button"
          onClick={() => loadStatus(true)}
          disabled={loading}
        >
          {loading ? '更新中…' : '更新'}
        </button>
        {successMessage && (
          <p className="success-message" role="status">
            ✓ {successMessage}
          </p>
        )}
        <div className="time-grid">
          <p>
            <strong>公式最終更新：</strong>
            {formatUpdatedAt(officialUpdatedAt)}
            <span>
              （{formatRelativeTime(officialUpdatedAt, currentTime)}）
            </span>
          </p>
          <p>
            <strong>クラウド確認：</strong>
            {formatUpdatedAt(cloudFetchedAt)}
            <span>
              （{formatRelativeTime(cloudFetchedAt, currentTime)}）
            </span>
          </p>
        </div>
        {updateStopped && (
          <p className="stopped-message">
            クラウド確認が{cloudAgeMinutes}
            分間止まっています。表示中の情報が古い可能性があります。
          </p>
        )}
        {error && <p className="error-message">{error}</p>}
        <p className="update-description">
          <span>空車情報は公式サイトから取得しています。</span>
          <span>通常は0～10分前の情報を表示します。</span>
        </p>
        <p className="cloud-update-note">
          5分ごとにクラウドで自動更新
        </p>
      </section>

      {isGalaxyView && (
        <section className="next-notification-panel">
          <div className="next-notification-title">
            <span aria-hidden="true">🔔</span>
            <strong>次回通知</strong>
          </div>

          {!notifierToken ? (
            <p>通知設定が未登録です</p>
          ) : scheduleLoading && schedules.length === 0 ? (
            <p>通知予定を確認中…</p>
          ) : schedules.length > 0 ? (
            <>
              <strong className="next-notification-date">
                {formatScheduleDate(schedules[0].notifyAt)}
              </strong>
              <span className="next-notification-repeat">
                {formatRepeat(schedules[0])}
              </span>
              <p>
                {getScheduleParkNames(schedules[0].parkIds)}
              </p>
            </>
          ) : (
            <p>登録済みの通知はありません</p>
          )}

          <button
            type="button"
            onClick={() => {
              setShowSchedulePanel(true)
              window.setTimeout(() => {
                document
                  .getElementById('registered-schedules')
                  ?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start',
                  })
              }, 50)
            }}
          >
            登録済み通知を確認
          </button>
        </section>
      )}
      <section className="status-summary" aria-label="空車状況集計">
        <div className="summary-item summary-free">
          <span>空車</span>
          <strong>{statusCounts.free}</strong>
        </div>
        <div className="summary-item summary-busy">
          <span>混雑</span>
          <strong>{statusCounts.busy}</strong>
        </div>
        <div className="summary-item summary-full">
          <span>満車</span>
          <strong>{statusCounts.full}</strong>
        </div>
      </section>

      {isGalaxyView && (
        <section id="schedule-panel" className="schedule-panel">
          <button
            className="schedule-toggle-button"
            type="button"
            onClick={() => setShowSchedulePanel((current) => !current)}
          >
            {showSchedulePanel ? '通知予約を閉じる' : '空車情報を日時指定で通知'}
          </button>

          {showSchedulePanel && (
            <div className="schedule-content">
              <h2>Galaxy・Garminへの通知予約</h2>
              <p className="schedule-description">
                指定日時に、選択した駐車場の空車情報を通知します。
              </p>

              {!notifierToken ? (
                <form
                  className="schedule-token-form"
                  onSubmit={saveNotifierToken}
                >
                  <label htmlFor="notifier-token">
                    初回設定：APIトークン
                  </label>
                  <input
                    id="notifier-token"
                    type="password"
                    value={tokenInput}
                    onChange={(event) =>
                      setTokenInput(event.target.value)
                    }
                    autoComplete="off"
                    placeholder="APIトークンを貼り付け"
                  />
                  <button type="submit">Galaxyに保存</button>
                  <p>
                    トークンはGitHubへ送らず、このGalaxy内だけに保存します。
                  </p>
                </form>
              ) : (
                <>
                  <div className="schedule-token-status">
                    <span>通知サーバー接続設定：保存済み</span>
                    <button type="button" onClick={clearNotifierToken}>
                      設定削除
                    </button>
                  </div>

                  <div className="push-notification-settings">
                    <strong>PWA直接通知</strong>
                    <p>
                      LINEを使わず、タイムズアプリからGalaxyへ直接通知します。
                    </p>
                    {!pushEnabled ? (
                      <button
                        type="button"
                        onClick={enablePushNotifications}
                        disabled={pushLoading}
                      >
                        {pushLoading
                          ? '設定中…'
                          : 'PWA直接通知を有効にする'}
                      </button>
                    ) : (
                      <div className="push-enabled-actions">
                        <span>✓ 直接通知：有効</span>
                        <button
                          type="button"
                          onClick={testPushNotification}
                          disabled={pushLoading}
                        >
                          {pushLoading ? '送信中…' : '通知テスト'}
                        </button>
                      </div>
                    )}
                    {pushMessage && (
                      <p className="push-success" role="status">
                        ✓ {pushMessage}
                      </p>
                    )}
                  </div>

                  <form onSubmit={addSchedule}>
                <div className="schedule-datetime">
                  <label>
                    日付
                    <span className="schedule-picker-field">
  <input
    ref={dateInputRef}
    type="date"
    value={scheduleDate}
    min={getInitialScheduleDate()}
    onChange={(event) =>
      setScheduleDate(event.target.value)
    }
    required
  />
  <svg
    className="schedule-calendar-icon"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M8 3v4M16 3v4M3 10h18" />
  </svg>
</span>
                  </label>
                  <label>
                    時刻
                    <button
                      type="button"
                      className="schedule-time-button"
                      onClick={openTimePicker}
                    >
                      <span>{scheduleTime}</span>
                      <span aria-hidden="true">🕒</span>
                    </button>
                  </label>
                </div>

                <fieldset className="schedule-repeat">
                  <legend>繰り返し</legend>
                  <select
                    value={repeatType}
                    onChange={(event) => setRepeatType(event.target.value)}
                  >
                    <option value="none">1回のみ</option>
                    <option value="daily">毎日</option>
                    <option value="weekdays">平日（月～金）</option>
                    <option value="weekly">曜日を指定</option>
                    <option value="interval">時間ごと</option>
                  </select>

                  {repeatType === 'weekly' && (
                    <div className="weekday-selector">
                      {WEEKDAYS.map((day) => (
                        <button
                          type="button"
                          key={day.value}
                          className={
                            repeatWeekdays.includes(day.value)
                              ? 'selected'
                              : ''
                          }
                          onClick={() => toggleRepeatWeekday(day.value)}
                          aria-pressed={repeatWeekdays.includes(day.value)}
                        >
                          {day.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {repeatType === 'interval' && (
                    <label className="interval-selector">
                      <select
                        value={intervalHours}
                        onChange={(event) =>
                          setIntervalHours(event.target.value)
                        }
                      >
                        {[1, 2, 3, 4, 6, 8, 12, 24].map((hours) => (
                          <option value={hours} key={hours}>
                            {hours}時間ごと
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </fieldset>

                <fieldset className="schedule-parks">
                  <legend>通知する駐車場（複数選択可）</legend>
                  {sortedParks.map((park) => (
                    <label key={park.id}>
                      <input
                        type="checkbox"
                        checked={selectedParkIds.includes(park.id)}
                        onChange={() => toggleSchedulePark(park.id)}
                      />
                      <span className="schedule-park-number">
                        {park.no}
                      </span>
                      <span>{park.name}</span>
                    </label>
                  ))}
                </fieldset>

                <button
                  className="schedule-add-button"
                  type="submit"
                  disabled={scheduleLoading}
                >
                  {scheduleLoading ? '処理中…' : 'この日時で通知予約'}
                </button>
                  </form>

                  <div id="registered-schedules" className="schedule-list-heading">
                    <h3>登録済み通知</h3>
                    <button
                      type="button"
                      onClick={loadSchedules}
                      disabled={scheduleLoading}
                    >
                      再読込
                    </button>
                  </div>

                  {schedules.length === 0 ? (
                    <p className="schedule-empty">
                      登録済みの通知はありません
                    </p>
                  ) : (
                    <div className="schedule-list">
                      {schedules.map((schedule) => (
                        <article
                          className="schedule-item"
                          key={schedule.id}
                        >
                          <div>
                            <strong>
                              {formatScheduleDate(schedule.notifyAt)}
                            </strong>
                            <p className="schedule-repeat-label">
                              🔁 {formatRepeat(schedule)}
                            </p>
                            <p>
                              {getScheduleParkNames(schedule.parkIds)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              deleteSchedule(schedule.id)
                            }
                            disabled={scheduleLoading}
                          >
                            削除
                          </button>
                        </article>
                      ))}
                    </div>
                  )}
                </>
              )}

              {scheduleMessage && (
                <p className="schedule-success" role="status">
                  ✓ {scheduleMessage}
                </p>
              )}
              {scheduleError && (
                <p className="schedule-error" role="alert">
                  {scheduleError}
                </p>
              )}

            </div>
          )}
        </section>
      )}

      <dialog className="time-picker-dialog" ref={timeDialogRef}>
        <form method="dialog" onSubmit={(event) => event.preventDefault()}>
          <h2>通知時刻を選択</h2>
          <div className="time-selectors">
            <label>
              時
              <select
                value={draftHour}
                onChange={(event) => setDraftHour(event.target.value)}
              >
                {Array.from({ length: 24 }, (_, hour) =>
                  String(hour).padStart(2, '0'),
                ).map((hour) => (
                  <option value={hour} key={hour}>{hour}</option>
                ))}
              </select>
            </label>
            <span>:</span>
            <label>
              分
              <select
                value={draftMinute}
                onChange={(event) => setDraftMinute(event.target.value)}
              >
                {Array.from({ length: 60 }, (_, minute) =>
                  String(minute).padStart(2, '0'),
                ).map((minute) => (
                  <option value={minute} key={minute}>{minute}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="time-picker-actions">
            <button
              type="button"
              onClick={() => timeDialogRef.current?.close()}
            >
              キャンセル
            </button>
            <button type="button" onClick={confirmTimePicker}>
              設定
            </button>
          </div>
        </form>
      </dialog>

      <main className="content">
        <section id="parking-map" className="map-panel">
          <div className="map-heading">
            <div className="selected-parking">
              {selectedPark
                ? `選択中：${selectedPark.no}番 ${selectedPark.name}`
                : '駐車場カードを押すと選択番号を表示します'}
            </div>
            <button
              className="map-toggle-button"
              type="button"
              onClick={() => setShowMap((current) => !current)}
            >
              {showMap ? '地図を隠す' : '地図を表示'}
            </button>
          </div>
          {showMap && (
            <iframe
              className="parking-map"
              src={MAP_URL}
              title="タイムズ駐車場地図"
              loading="eager"
              allowFullScreen
            />
          )}
        </section>

        <section className="parking-list">
          {sortedParks.map((park) => {
            const officialUrl =
              `https://times-info.net/P27-osaka/C103/park-detail-${park.id}/`
            const routeUrl =
              `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${park.name} 大阪府大阪市`)}&travelmode=driving`
            const change = changes[park.id]
            const selected = selectedPark?.id === park.id

            return (
              <article
                className={`parking-card ${change ? 'parking-card-changed' : ''} ${selected ? 'parking-card-selected' : ''}`}
                key={park.id}
                onClick={() => selectPark(park)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    selectPark(park)
                  }
                }}
                role="button"
                tabIndex="0"
              >
                <div className="number-button">{park.no}</div>
                <div className="parking-information">
                  <h2>{park.name}</h2>
                  {change && (
                    <div
                      className={`status-change ${getChangeClass(change.after)}`}
                    >
                      {change.before} → {change.after}
                    </div>
                  )}
                  <p className="distance">{park.distance}</p>
                  <div className="parking-links">
                    <a
                      className="official-link"
                      href={officialUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(event) => event.stopPropagation()}
                    >
                      公式情報
                    </a>
                    <a
                      className="map-link"
                      href={routeUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(event) => event.stopPropagation()}
                    >
                      経路案内
                    </a>
                  </div>
                </div>
                <div
                  className={`parking-status ${getStatusClass(park.status)}`}
                >
                  {park.status || '不明'}
                </div>
              </article>
            )
          })}
          {!loading && parks.length === 0 && (
            <p className="empty-message">
              駐車場の空車情報がありません
            </p>
          )}
        </section>
      </main>
    </div>
  )
}

export default App
