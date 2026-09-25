import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import './App.css'

const MAP_URL =
  'https://www.google.com/maps/d/u/0/embed?mid=1sXRW3-SgAC1gtUy8siwDWRTeKiKGfTA&ehbc=2E312F'

const TIMES_LOGO =
  'https://times-info.net/common/responsive/images/logo.png'

const STORAGE_KEY = 'times-parking-previous-status'

const STATUS_ORDER = {
  空車: 0,
  混雑: 1,
  満車: 2,
  不明: 3,
}

const PARK_COORDINATES = {
  BUK0060527: {
    latitude: 34.683917,
    longitude: 135.473454,
  },
  BUK0077629: {
    latitude: 34.683762,
    longitude: 135.473362,
  },
  BUK0090120: {
    latitude: 34.68359,
    longitude: 135.4732,
  },
  BUK0061797: {
    latitude: 34.686444,
    longitude: 135.471676,
  },
  BUK0018415: {
    latitude: 34.68535,
    longitude: 135.47055,
  },
  BUK0064561: {
    latitude: 34.685761,
    longitude: 135.469629,
  },
}

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

function formatUpdatedAt(value) {
  if (!value) return '取得中'

  const officialFormat =
    /^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})$/

  if (officialFormat.test(value)) {
    return value
  }

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

function loadPreviousStatuses() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)

    if (!saved) {
      return {}
    }

    return JSON.parse(saved)
  } catch {
    return {}
  }
}

function calculateDistance(
  latitude1,
  longitude1,
  latitude2,
  longitude2,
) {
  const earthRadius = 6371000
  const toRadians = (degrees) => (degrees * Math.PI) / 180

  const latitudeDifference = toRadians(latitude2 - latitude1)
  const longitudeDifference = toRadians(longitude2 - longitude1)

  const value =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(toRadians(latitude1)) *
      Math.cos(toRadians(latitude2)) *
      Math.sin(longitudeDifference / 2) ** 2

  return (
    earthRadius *
    2 *
    Math.atan2(Math.sqrt(value), Math.sqrt(1 - value))
  )
}

function formatDistance(distance) {
  if (!Number.isFinite(distance)) {
    return ''
  }

  if (distance < 1000) {
    return `現在地から約${Math.round(distance / 10) * 10}m`
  }

  return `現在地から約${(distance / 1000).toFixed(1)}km`
}

function App() {
  const [parks, setParks] = useState([])
  const [changes, setChanges] = useState({})
  const [officialUpdatedAt, setOfficialUpdatedAt] = useState('')
  const [cloudFetchedAt, setCloudFetchedAt] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [currentTime, setCurrentTime] = useState(Date.now())
  const [sortMode, setSortMode] = useState('status')
  const [currentPosition, setCurrentPosition] = useState(null)
  const [locationLoading, setLocationLoading] = useState(false)
  const [locationError, setLocationError] = useState('')
  const [selectedPark, setSelectedPark] = useState(null)

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
      const nextParks =
        Array.isArray(data.parks) ? data.parks : []

      const previousStatuses = loadPreviousStatuses()
      const detectedChanges = {}
      const nextStatuses = {}

      nextParks.forEach((park) => {
        nextStatuses[park.id] = park.status

        const previousStatus = previousStatuses[park.id]

        if (
          previousStatus &&
          previousStatus !== park.status
        ) {
          detectedChanges[park.id] = {
            before: previousStatus,
            after: park.status,
          }
        }
      })

      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(nextStatuses),
      )

      setParks(nextParks)
      setChanges(detectedChanges)

      setOfficialUpdatedAt(
        data.updatedAt || data.fetchedAt || '',
      )

      setCloudFetchedAt(
        data.fetchedAt || data.updatedAt || '',
      )

      setCurrentTime(Date.now())
    } catch (fetchError) {
      console.error(fetchError)
      setError('満空情報を取得できませんでした')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStatus()

    const statusTimer = window.setInterval(
      loadStatus,
      60000,
    )

    const clockTimer = window.setInterval(() => {
      setCurrentTime(Date.now())
    }, 60000)

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
      window.clearInterval(statusTimer)
      window.clearInterval(clockTimer)

      window.removeEventListener(
        'focus',
        reloadLatestStatus,
      )

      window.removeEventListener(
        'pageshow',
        reloadLatestStatus,
      )

      document.removeEventListener(
        'visibilitychange',
        handleVisibility,
      )
    }
  }, [loadStatus])

  const parksWithDistance = useMemo(() => {
    return parks.map((park) => {
      const coordinates = PARK_COORDINATES[park.id]

      if (!coordinates || !currentPosition) {
        return {
          ...park,
          currentDistance: null,
        }
      }

      return {
        ...park,
        currentDistance: calculateDistance(
          currentPosition.latitude,
          currentPosition.longitude,
          coordinates.latitude,
          coordinates.longitude,
        ),
      }
    })
  }, [parks, currentPosition])

  const sortedParks = useMemo(() => {
    const fixedPark = parksWithDistance.find(
      (park) => park.no === 1,
    )

    const otherParks = parksWithDistance
      .filter((park) => park.no !== 1)
      .sort((parkA, parkB) => {
        if (sortMode === 'location') {
          const distanceA =
            parkA.currentDistance ?? Number.MAX_SAFE_INTEGER

          const distanceB =
            parkB.currentDistance ?? Number.MAX_SAFE_INTEGER

          if (distanceA !== distanceB) {
            return distanceA - distanceB
          }

          return parkA.no - parkB.no
        }

        const orderA =
          STATUS_ORDER[parkA.status] ?? STATUS_ORDER.不明

        const orderB =
          STATUS_ORDER[parkB.status] ?? STATUS_ORDER.不明

        if (orderA !== orderB) {
          return orderA - orderB
        }

        return parkA.no - parkB.no
      })

    return fixedPark
      ? [fixedPark, ...otherParks]
      : otherParks
  }, [parksWithDistance, sortMode])

  const statusCounts = useMemo(() => {
    return parks.reduce(
      (counts, park) => {
        if (park.status === '空車') counts.free += 1
        if (park.status === '混雑') counts.busy += 1
        if (park.status === '満車') counts.full += 1

        return counts
      },
      {
        free: 0,
        busy: 0,
        full: 0,
      },
    )
  }, [parks])

  const ageMinutes = useMemo(() => {
    if (!cloudFetchedAt) return null

    const fetchedTime = new Date(cloudFetchedAt).getTime()

    if (Number.isNaN(fetchedTime)) return null

    return Math.max(
      0,
      Math.floor((currentTime - fetchedTime) / 60000),
    )
  }, [cloudFetchedAt, currentTime])

  const staleLevel = useMemo(() => {
    if (ageMinutes === null) return ''

    if (ageMinutes >= 30) return 'danger'
    if (ageMinutes >= 10) return 'warning'

    return ''
  }, [ageMinutes])

  const scrollToMap = (park) => {
    setSelectedPark(park)

    window.setTimeout(() => {
      document
        .getElementById('parking-map')
        ?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        })
    }, 50)
  }

  const selectStatusSort = () => {
    setSortMode('status')
    setLocationError('')
  }

  const selectLocationSort = () => {
    if (!navigator.geolocation) {
      setLocationError(
        'この端末では現在地を取得できません',
      )
      return
    }

    setLocationLoading(true)
    setLocationError('')

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCurrentPosition({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        })

        setSortMode('location')
        setLocationLoading(false)
      },
      (positionError) => {
        console.error(positionError)

        setLocationError(
          '現在地を取得できませんでした。位置情報を許可してください。',
        )

        setLocationLoading(false)
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 60000,
      },
    )
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

      <section className={`update-panel ${staleLevel}`}>
        <p>5分ごとにクラウドで自動更新</p>

        <p className="updated-time">
          公式最終更新：
          {formatUpdatedAt(officialUpdatedAt)}
        </p>

        {staleLevel === 'warning' && (
          <p className="stale-message">
            クラウド取得から{ageMinutes}分経過しています
          </p>
        )}

        {staleLevel === 'danger' && (
          <p className="stale-message">
            情報が古い可能性があります
            （クラウド取得から{ageMinutes}分経過）
          </p>
        )}

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

      <section className="status-summary">
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

      <section className="sort-panel">
        <button
          className={
            `sort-button ${
              sortMode === 'status' ? 'active' : ''
            }`
          }
          type="button"
          onClick={selectStatusSort}
        >
          空車順
        </button>

        <button
          className={
            `sort-button ${
              sortMode === 'location' ? 'active' : ''
            }`
          }
          type="button"
          onClick={selectLocationSort}
          disabled={locationLoading}
        >
          {locationLoading ? '現在地取得中…' : '現在地順'}
        </button>

        {locationError && (
          <p className="location-error">
            {locationError}
          </p>
        )}
      </section>

      <main className="content">
        <section
          id="parking-map"
          className="map-panel"
          aria-label="駐車場地図"
        >
          <div className="selected-parking">
            {selectedPark
              ? `選択中：${selectedPark.no}番　${selectedPark.name}`
              : '駐車場カードを押すと選択番号を表示します'}
          </div>

          <iframe
            className="parking-map"
            src={MAP_URL}
            title="タイムズ駐車場地図"
            loading="eager"
            allowFullScreen
          />
        </section>

        <section className="parking-list">
          {sortedParks.map((park) => {
            const officialUrl =
              `https://times-info.net/P27-osaka/C103/park-detail-${park.id}/`

            const destination =
              `${park.name} 大阪府大阪市`

            const routeUrl =
              `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`

            const change = changes[park.id]
            const isSelected =
              selectedPark?.id === park.id

            return (
              <article
                className={
                  `parking-card ${
                    change ? 'parking-card-changed' : ''
                  } ${
                    isSelected ? 'parking-card-selected' : ''
                  }`
                }
                key={park.id}
                onClick={() => scrollToMap(park)}
                onKeyDown={(event) => {
                  if (
                    event.key === 'Enter' ||
                    event.key === ' '
                  ) {
                    event.preventDefault()
                    scrollToMap(park)
                  }
                }}
                role="button"
                tabIndex="0"
                aria-label={`${park.no}番 ${park.name}を地図で確認`}
              >
                <div className="number-button">
                  {park.no}
                </div>

                <div className="parking-information">
                  <h2>{park.name}</h2>

                  {change && (
                    <div
                      className={
                        `status-change ${getChangeClass(change.after)}`
                      }
                    >
                      {change.before} → {change.after}
                    </div>
                  )}

                  <p className="distance">
                    {sortMode === 'location' &&
                    park.currentDistance !== null
                      ? formatDistance(park.currentDistance)
                      : park.distance}
                  </p>

                  <div className="parking-links">
                    <a
                      className="official-link"
                      href={officialUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(event) => {
                        event.stopPropagation()
                      }}
                    >
                      公式情報
                    </a>

                    <a
                      className="map-link"
                      href={routeUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(event) => {
                        event.stopPropagation()
                      }}
                    >
                      経路案内
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