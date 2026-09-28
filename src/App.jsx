import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import './App.css'

const MAP_URL = 'https://www.google.com/maps/d/u/0/embed?mid=1sXRW3-SgAC1gtUy8siwDWRTeKiKGfTA&ehbc=2E312F'
const TIMES_LOGO = 'https://times-info.net/common/responsive/images/logo.png'
const STATUS_STORAGE_KEY = 'times-parking-previous-status'
const CHANGE_STORAGE_KEY = 'times-parking-status-changes'
const CHANGE_DISPLAY_MS = 10 * 60 * 1000
const CLOUD_STOP_MINUTES = 15

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
  const match = value.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})$/)
  if (match) {
    const [, year, month, day, hour, minute] = match
    const date = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute}:00+09:00`)
    return Number.isNaN(date.getTime()) ? null : date
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatUpdatedAt(value) {
  const date = parseDateValue(value)
  if (!date) return value || '取得中'
  return date.toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

function formatRelativeTime(value, currentTime) {
  const date = parseDateValue(value)
  if (!date) return ''
  const minutes = Math.max(0, Math.floor((currentTime - date.getTime()) / 60000))
  if (minutes === 0) return 'たった今'
  if (minutes === 1) return '1分前'
  if (minutes < 60) return `${minutes}分前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}時間前`
  return `${Math.floor(hours / 24)}日前`
}

function loadStoredObject(key) {
  try {
    const saved = localStorage.getItem(key)
    return saved ? JSON.parse(saved) : {}
  } catch {
    return {}
  }
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

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  const loadStatus = useCallback(async (manual = false) => {
    setLoading(true)
    setError('')
    if (manual) setSuccessMessage('')
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}status.json?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
      })
      if (!response.ok) throw new Error('空車情報を取得できませんでした')

      const data = await response.json()
      const nextParks = Array.isArray(data.parks) ? data.parks : []
      const previousStatuses = loadStoredObject(STATUS_STORAGE_KEY)
      const storedChanges = loadStoredObject(CHANGE_STORAGE_KEY)
      const now = Date.now()
      const nextStatuses = {}
      const nextChanges = {}

      Object.entries(storedChanges).forEach(([id, change]) => {
        if (change?.detectedAt && now - change.detectedAt < CHANGE_DISPLAY_MS) nextChanges[id] = change
      })
      nextParks.forEach((park) => {
        const previousStatus = previousStatuses[park.id]
        nextStatuses[park.id] = park.status
        if (previousStatus && previousStatus !== park.status) {
          nextChanges[park.id] = { before: previousStatus, after: park.status, detectedAt: now }
        }
      })

      localStorage.setItem(STATUS_STORAGE_KEY, JSON.stringify(nextStatuses))
      localStorage.setItem(CHANGE_STORAGE_KEY, JSON.stringify(nextChanges))
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

  useEffect(() => {
    const initialLoadTimer = window.setTimeout(() => loadStatus(), 0)
    const statusTimer = window.setInterval(() => loadStatus(), 60000)
    const clockTimer = window.setInterval(() => {
      const now = Date.now()
      setCurrentTime(now)
      setChanges((currentChanges) => {
        const activeChanges = Object.fromEntries(Object.entries(currentChanges).filter(([, change]) => now - change.detectedAt < CHANGE_DISPLAY_MS))
        localStorage.setItem(CHANGE_STORAGE_KEY, JSON.stringify(activeChanges))
        return activeChanges
      })
    }, 60000)
    const refreshWhenVisible = () => { if (document.visibilityState === 'visible') loadStatus() }
    const refreshOnReturn = () => loadStatus()
    const captureInstallPrompt = (event) => { event.preventDefault(); setInstallPrompt(event) }
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
      window.removeEventListener('beforeinstallprompt', captureInstallPrompt)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [loadStatus])

  const sortedParks = useMemo(() => [...parks].sort((a, b) => a.no - b.no), [parks])
  const statusCounts = useMemo(() => parks.reduce((counts, park) => {
    if (park.status === '空車') counts.free += 1
    if (park.status === '混雑') counts.busy += 1
    if (park.status === '満車') counts.full += 1
    return counts
  }, { free: 0, busy: 0, full: 0 }), [parks])

  const cloudAgeMinutes = useMemo(() => {
    const fetchedDate = parseDateValue(cloudFetchedAt)
    if (!fetchedDate) return null
    return Math.max(0, Math.floor((currentTime - fetchedDate.getTime()) / 60000))
  }, [cloudFetchedAt, currentTime])
  const updateStopped = cloudAgeMinutes !== null && cloudAgeMinutes >= CLOUD_STOP_MINUTES

  const selectPark = (park) => {
    setSelectedPark(park)
    setShowMap(true)
    window.setTimeout(() => document.getElementById('parking-map')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  const installApp = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    setInstallPrompt(null)
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <img className="times-logo" src={TIMES_LOGO} alt="Times" />
          <div className="brand-text">
            <div className="brand-japanese">タイムズの駐車場検索</div>
            <h1>タイムズ Parking Information</h1>
          </div>
        </div>
        <p className="subtitle">タイムズ駐車場 空車情報</p>
      </header>

      {needRefresh && (
        <section className="version-notice" role="alert">
          <strong>新しいバージョンがあります</strong>
          <button type="button" onClick={() => updateServiceWorker(true)}>更新</button>
          <button className="notice-close" type="button" onClick={() => setNeedRefresh(false)} aria-label="閉じる">×</button>
        </section>
      )}

      {installPrompt && (
        <section className="install-notice">
          <span>この端末にアプリとしてインストールできます</span>
          <button type="button" onClick={installApp}>インストール</button>
        </section>
      )}

      <section className={`update-panel ${updateStopped ? 'stopped' : ''}`}>
        {updateStopped && <div className="stopped-alert" role="alert">情報更新停止中</div>}
        <button className="update-button" type="button" onClick={() => loadStatus(true)} disabled={loading}>
          {loading ? '更新中…' : '更新'}
        </button>
        {successMessage && <p className="success-message" role="status">✓ {successMessage}</p>}
        <div className="time-grid">
          <p><strong>公式最終更新：</strong>{formatUpdatedAt(officialUpdatedAt)}<span>（{formatRelativeTime(officialUpdatedAt, currentTime)}）</span></p>
          <p><strong>クラウド確認：</strong>{formatUpdatedAt(cloudFetchedAt)}<span>（{formatRelativeTime(cloudFetchedAt, currentTime)}）</span></p>
        </div>
        {updateStopped && <p className="stopped-message">クラウド確認が{cloudAgeMinutes}分間止まっています。表示中の情報が古い可能性があります。</p>}
        {error && <p className="error-message">{error}</p>}
        <p className="update-description"><span>空車情報は公式サイトから取得しています。</span><span>通常は0～10分前の情報を表示します。</span></p>
        <p className="cloud-update-note">5分ごとにクラウドで自動更新</p>
      </section>

      <section className="status-summary" aria-label="空車状況集計">
        <div className="summary-item summary-free"><span>空車</span><strong>{statusCounts.free}</strong></div>
        <div className="summary-item summary-busy"><span>混雑</span><strong>{statusCounts.busy}</strong></div>
        <div className="summary-item summary-full"><span>満車</span><strong>{statusCounts.full}</strong></div>
      </section>

      <main className="content">
        <section id="parking-map" className="map-panel">
          <div className="map-heading">
            <div className="selected-parking">{selectedPark ? `選択中：${selectedPark.no}番 ${selectedPark.name}` : '駐車場カードを押すと選択番号を表示します'}</div>
            <button className="map-toggle-button" type="button" onClick={() => setShowMap((current) => !current)}>{showMap ? '地図を隠す' : '地図を表示'}</button>
          </div>
          {showMap && <iframe className="parking-map" src={MAP_URL} title="タイムズ駐車場地図" loading="eager" allowFullScreen />}
        </section>

        <section className="parking-list">
          {sortedParks.map((park) => {
            const officialUrl = `https://times-info.net/P27-osaka/C103/park-detail-${park.id}/`
            const routeUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${park.name} 大阪府大阪市`)}&travelmode=driving`
            const change = changes[park.id]
            const selected = selectedPark?.id === park.id
            return (
              <article className={`parking-card ${change ? 'parking-card-changed' : ''} ${selected ? 'parking-card-selected' : ''}`} key={park.id} onClick={() => selectPark(park)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectPark(park) } }} role="button" tabIndex="0">
                <div className="number-button">{park.no}</div>
                <div className="parking-information">
                  <h2>{park.name}</h2>
                  {change && <div className={`status-change ${getChangeClass(change.after)}`}>{change.before} → {change.after}</div>}
                  <p className="distance">{park.distance}</p>
                  <div className="parking-links">
                    <a className="official-link" href={officialUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>公式情報</a>
                    <a className="map-link" href={routeUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>経路案内</a>
                  </div>
                </div>
                <div className={`parking-status ${getStatusClass(park.status)}`}>{park.status || '不明'}</div>
              </article>
            )
          })}
          {!loading && parks.length === 0 && <p className="empty-message">駐車場の空車情報がありません</p>}
        </section>
      </main>
    </div>
  )
}

export default App
