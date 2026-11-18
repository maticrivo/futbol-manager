self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  event.waitUntil(self.registration.showNotification(data.title ?? 'Football', {
    body: data.body, icon: '/icon-192.png', data: { url: data.url ?? '/' },
  }))
})
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/'
  event.waitUntil(clients.matchAll({ type: 'window' }).then((list) => {
    const open = list.find((c) => c.url.includes(url))
    return open ? open.focus() : clients.openWindow(url)
  }))
})
