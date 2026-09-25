import { useEffect, useState } from 'react'
import './App.css'

const MAP_URL =
  'https://www.google.com/maps/d/u/0/embed?mid=1sXRW3-SgAC1gtUy8siwDWRTeKiKGfTA&ehbc=2E312F'

const TIMES_LOGO = 'https://times-info.net/common/responsive/images/logo.png'

function statusClass(status) {
  if (status === '空車') return 'available'
  if (status === '混雑') return 'crowded'
  if (status === '満車') return 'full'
  if (status === '閉鎖') return 'closed'
  return 'unknown'
}

function App() {
  const [parks, setParks] = useState([])
  const [updatedAt, setUpdatedAt] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function loadStatus() {
    try {
      setError('')

      const response = await fetch(
        `${import.meta.env.BASE_URL}status.json?t=${Date.now()}`,
        { cache: 'no-store' },
      )

      if (!response.ok) {
        throw new Error('満空情報を取得できませんでした。')
      }

      const data = await response.json()

      if (!Array.isArray(data.parks)) {
        throw new Error('満空情報の形式が正しくありません。')
      }

      setParks(data.parks)
      setUpdatedAt(data.updatedAt ?? '')
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }

  function openParkingMap(name) {
    window.open(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`,
      '_blank',
      'noopener,noreferrer',
    )
  }

  useEffect(() => {
    loadStatus()

    const intervalId = window.setInterval(loadStatus, 60000)

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        loadStatus()
      }
    }

    window.addEventListener('focus', loadStatus)
    document.addEventListener('visibilitychange', refreshWhenVisible)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', loadStatus)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [])

  return (
    <main className="app">
      <header className="app-header">
        <img className="times-logo" src={TIMES_LOGO} alt="Times" />
        <div>
          <h1>タイムズ Parking Information</h1>
          <p>野田・吉野周辺のタイムズ駐車場 満空情報</p>
        </div>
      </header>

      <section className="status-bar">
        <span>5分ごとにクラウドで自動更新</span>
        <span>{updatedAt ? `最終更新：${updatedAt}` : '更新準備中'}</span>
        <button type="button" onClick={loadStatus}>
          更新
        </button>
      </section>

      <section className="content">
        <div className="map-panel">
          <iframe
            className="parking-map"
            title="野田・吉野 タイムズ駐車場マップ"
            src={MAP_URL}
            loading="eager"
          />
        </div>

        <div className="parking-list">
          {loading && <p className="message">満空情報を取得中です…</p>}

          {error && <p className="message error-message">{error}</p>}

          {!loading &&
            !error &&
            parks.map((park) => (
              <article className="parking-card" key={park.id}>
                <button
                  type="button"
                  className="park-number"
                  onClick={() => openParkingMap(park.name)}
                  aria-label={`${park.name}をGoogleマップで開く`}
                >
                  {park.no}
                </button>

                <div className="park-details">
                  <h2>{park.name}</h2>
                  <p>{park.distance}</p>
                </div>

                <span className={`status ${statusClass(park.status)}`}>
                  {park.status}
                </span>

                <button
                  type="button"
                  className="route-button"
                  onClick={() => openParkingMap(park.name)}
                >
                  地図
                </button>
              </article>
            ))}
        </div>
      </section>
    </main>
  )
}

export default App