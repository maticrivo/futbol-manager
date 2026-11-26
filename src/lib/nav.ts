export function isAdminTabActive(pathname: string): boolean {
  return pathname.startsWith('/admin')
}

export function isPrimaryNavActive(href: string, pathname: string): boolean {
  if (href === '/') {
    return pathname === '/' || pathname.startsWith('/match')
  }
  return pathname.startsWith(href)
}
