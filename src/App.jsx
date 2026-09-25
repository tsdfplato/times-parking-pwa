import { useCallback, useEffect, useState } from 'react'
import './App.css'

const MAP_URL =
  'https://www.google.com/maps/d/u/0/embed?mid=1sXRW3-SgAC1gtUy8siwDWRTeKiKGfTA&ehbc=2E312F'

const TIMES_LOGO =
  'https://times-info.net/common/responsive/images/logo.png'

function getStatusClass(status) {
  if (status === '空車') return 'status-free'
  if (status === '混雑') return 'status-busy'
  if (status === '満車') return 'status-full'
  return 'status-unknown'
}

function formatUpdatedAt(value) {
  if (!value) return '取得中'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function App() {
  const [parks, setParks] = useState([])
  const [updatedAt, setUpdatedAt] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadStatus = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const url =
        `${import.meta.env.BASE_URL}status.json?t=${Date.now()}`

      const response = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      })

      if (!response.ok) {
        throw new Error('満空情報を取得できませんでした')
      }

      const data = await response.json()

      setParks(Array.isArray(data.parks) ? data.parks : [])

      setUpdatedAt(
        formatUpdatedAt(data.fetchedAt || data.updatedAt),
      )
    } catch (fetchError) {
      console.error(fetchError)
      setError('満空情報を取得できませんでした')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStatus()

    const timer = window.setInterval(loadStatus, 60000)

    const reloadLatestStatus = () => {
      loadStatus()
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        loadStatus()
      }
    }

    window.addEventListener('focus', reloadLatestStatus)
    window.addEventListener('pageshow', reloadLatestStatus)

    document.addEventListener(
      'visibilitychange',
      handleVisibility,
    )

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .getRegistration()
        .then((registration) => registration?.update())
        .catch(() => {})
    }

    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', reloadLatestStatus)
      window.removeEventListener('pageshow', reloadLatestStatus)

      document.removeEventListener(
        'visibilitychange',
        handleVisibility,
      )
    }
  }, [loadStatus])

  const scrollToMap = () => {
    document
      .getElementById('parking-map')
      ?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <img
            className="times-logo"
            src={TIMES_LOGO}
            alt="Times"
          />

          <div className="brand-text">
            <div className="brand-japanese">
              タイムズの駐車場検索
            </div>

            <h1>タイムズ Parking Information</h1>
          </div>
        </div>

        <p className="subtitle">
          タイムズ駐車場　空車情報
        </p>
      </header>

      <section className="update-panel">
        <p>5分ごとにクラウドで自動更新</p>

        <p className="updated-time">
          最終更新：{updatedAt || '取得中'}
        </p>

        <button
          className="update-button"
          type="button"
          onClick={loadStatus}
          disabled={loading}
        >
          {loading ? '更新中…' : '更新'}
        </button>

        {error && (
          <p className="error-message">
            {error}
          </p>
        )}
      </section>

      <main className="content">
        <section
          id="parking-map"
          className="map-panel"
          aria-label="駐車場地図"
        >
          <iframe
            className="parking-map"
            src={MAP_URL}
            title="タイムズ駐車場地図"
            loading="eager"
            allowFullScreen
          />
        </section>

        <section className="parking-list">
          {parks.map((park) => {
            const officialUrl =
              `https://times-info.net/P27-osaka/C103/park-detail-${park.id}/`

            const googleMapsUrl =
              `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(park.name)}`

            return (
              <article
                className="parking-card"
                key={park.id}
              >
                <button
                  className="number-button"
                  type="button"
                  onClick={scrollToMap}
                  aria-label={`地図の${park.no}番を確認`}
                >
                  {park.no}
                </button>

                <div className="parking-information">
                  <h2>{park.name}</h2>

                  <p className="distance">
                    {park.distance}
                  </p>

                  <div className="parking-links">
                    <a
                      className="official-link"
                      href={officialUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      公式情報
                    </a>

                    <a
                      className="map-link"
                      href={googleMapsUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Googleマップ
                    </a>
                  </div>
                </div>

                <div
                  className={
                    `parking-status ${getStatusClass(park.status)}`
                  }
                >
                  {park.status || '不明'}
                </div>
              </article>
            )
          })}

          {!loading && parks.length === 0 && (
            <p className="empty-message">
              駐車場情報がありません
            </p>
          )}
        </section>
      </main>
    </div>
  )
}

export default App