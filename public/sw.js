self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  event.waitUntil(self.registration.showNotification(data.title ?? 'Football', {
    body: data.body, icon: '/icon-192.png', data: { url: data.url ?? '/' },
  }))
})
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const dataUrl = event.notification.data?.url ?? '/'
  const target = new URL(dataUrl, self.location.origin)
  event.waitUntil(clients.matchAll({ type: 'window' }).then((list) => {
    const open = list.find((c) => new URL(c.url).pathname === target.pathname)
    return open ? open.focus() : clients.openWindow(target.href)
  }))
})
