import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Weekly Football',
    short_name: 'Football',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a7d3a',
    theme_color: '#0a7d3a',
    lang: 'en',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  }
}
