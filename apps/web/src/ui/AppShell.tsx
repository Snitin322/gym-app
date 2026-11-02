import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { ChevronLeft, type LucideIcon } from 'lucide-react'

export interface TabItem {
  to: string
  label: string
  icon: LucideIcon
  /** Other screens that belong to this tab (it stays highlighted on them). */
  also?: string[]
}

function isUnder(pathname: string, path: string) {
  return pathname === path || pathname.startsWith(`${path}/`)
}

function useActiveTab(items: TabItem[]) {
  const { pathname } = useLocation()
  return items.find((t) => [t.to, ...(t.also ?? [])].some((p) => isUnder(pathname, p)))?.to
}

/**
 * The app frame: the screen's content and a bottom tab bar (like a native app).
 * Content keeps clear of the tab bar and the iPhone home indicator. With a sidebar (the front desk),
 * laptops get a left-hand menu instead of the tab bar, and a wider content column.
 */
export function AppShell({
  tabs,
  sidebar,
  children,
}: {
  tabs: TabItem[]
  sidebar?: { header: ReactNode; items: TabItem[] }
  children: ReactNode
}) {
  const activeTab = useActiveTab(tabs)
  const activeSide = useActiveTab(sidebar?.items ?? [])
  return (
    <div className="flex min-h-dvh">
      {sidebar && (
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 border-r border-line bg-surface px-3 py-5 lg:flex">
          <div className="px-2">{sidebar.header}</div>
          <nav aria-label="Menu">
            <ul className="flex flex-col gap-1">
              {sidebar.items.map(({ to, label, icon: Icon }) => (
                <li key={to}>
                  <Link
                    to={to}
                    aria-current={activeSide === to ? 'page' : undefined}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${
                      activeSide === to ? 'bg-accent text-accent-ink' : 'text-muted hover:bg-surface-2 hover:text-ink'
                    }`}
                  >
                    <Icon aria-hidden="true" size={20} />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <main
          className={`mx-auto flex w-full flex-1 flex-col gap-4 px-4 pt-4 pb-28 ${
            sidebar ? 'max-w-xl lg:max-w-3xl lg:px-8 lg:pt-8 lg:pb-12' : 'max-w-xl'
          }`}
        >
          {children}
        </main>
      </div>
      <nav
        aria-label="Main"
        className={`fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur ${
          sidebar ? 'lg:hidden' : ''
        }`}
      >
        <ul className="mx-auto grid max-w-xl" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
          {tabs.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <Link
                to={to}
                aria-current={activeTab === to ? 'page' : undefined}
                className={`flex flex-col items-center gap-1 py-2.5 text-xs ${
                  activeTab === to ? 'font-semibold text-accent' : 'text-muted'
                }`}
              >
                <Icon aria-hidden="true" size={22} strokeWidth={2} />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}

/** A screen's title bar: big title (with optional line under it), an optional back link and actions. */
export function PageHeader({
  title,
  subtitle,
  back,
  action,
}: {
  title: ReactNode
  subtitle?: ReactNode
  back?: { to: string; label: string }
  action?: ReactNode
}) {
  return (
    <header className="flex flex-col gap-1">
      {back && (
        <Link to={back.to} className="-ml-1 flex items-center gap-0.5 self-start text-sm text-muted hover:text-ink">
          <ChevronLeft aria-hidden="true" size={18} />
          {back.label}
        </Link>
      )}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {action}
      </div>
      {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
    </header>
  )
}

/** A section title inside a screen, with an optional link or action on the right. */
export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mt-2 flex items-center justify-between gap-3">
      <h2 className="text-base font-semibold">{children}</h2>
      {action}
    </div>
  )
}

/** Round initials badge for a person. */
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      className="flex shrink-0 items-center justify-center rounded-full bg-accent/15 font-semibold text-accent"
    >
      {initials}
    </span>
  )
}
