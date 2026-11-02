import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router'
import { ChevronLeft, type LucideIcon } from 'lucide-react'

export interface TabItem {
  to: string
  label: string
  icon: LucideIcon
}

/**
 * The app frame on a phone: the screen's content, and a bottom tab bar (like a native app).
 * Content keeps clear of the tab bar and the iPhone home indicator.
 */
export function AppShell({ tabs, children }: { tabs: TabItem[]; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 pt-4 pb-28">{children}</main>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        <ul className="mx-auto grid max-w-xl" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
          {tabs.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-1 py-2.5 text-xs ${isActive ? 'font-semibold text-accent' : 'text-muted'}`
                }
              >
                <Icon aria-hidden="true" size={22} strokeWidth={2} />
                {label}
              </NavLink>
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
