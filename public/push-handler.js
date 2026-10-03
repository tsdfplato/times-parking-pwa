self.addEventListener('push', (event) => {
  let data

  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = {
      title: 'タイムズ Parking Information',
      body: event.data ? event.data.text() : '空車情報を確認してください',
    }
  }

  const title = data.title || 'タイムズ Parking Information'
  const options = {
    body: data.body || '空車情報を確認してください',
    icon: data.icon || './times-icon.svg',
    badge: './notification-badge.png',
    tag: data.tag || 'times-parking-status',
    renotify: true,
    data: {
      url: data.url || './',
    },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = new URL(
    event.notification.data?.url || './',
    self.location.origin,
  ).href

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        const existingClient = clientList.find(
          (client) => client.url === targetUrl,
        )

        if (existingClient) {
          return existingClient.focus()
        }

        return self.clients.openWindow(targetUrl)
      }),
  )
})
