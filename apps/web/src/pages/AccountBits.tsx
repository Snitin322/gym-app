import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ChevronRight, LogOut } from 'lucide-react'
import { ROLE_LABELS, formatPhone } from '../lib/format'
import { useAuth, useSignedInUser } from '../auth/AuthContext'
import { Avatar } from '../ui/AppShell'
import { Button } from '../ui/Button'
import { Card } from '../ui/Form'

/** The signed-in person: initials, name, number, role and gym. */
export function AccountCard() {
  const user = useSignedInUser()
  return (
    <Card className="flex items-center gap-3">
      <Avatar name={user.name} size={48} />
      <div className="min-w-0">
        <p className="truncate font-semibold">{user.name}</p>
        <p className="text-sm text-muted">{formatPhone(user.phone)}</p>
        <p className="text-sm text-muted">
          {user.role === 'member' ? user.gym.name : `${ROLE_LABELS[user.role]} · ${user.gym.name}`}
        </p>
      </div>
    </Card>
  )
}

export function LogOutButton() {
  const { signOut } = useAuth()
  const [signingOut, setSigningOut] = useState(false)
  return (
    <Button
      variant="secondary"
      loading={signingOut}
      onClick={() => {
        setSigningOut(true)
        void signOut()
      }}
    >
      <span className="flex items-center justify-center gap-2">
        <LogOut aria-hidden="true" size={18} /> Log out
      </span>
    </Button>
  )
}

/** A tappable row that opens another screen (settings-style list). */
export function LinkRow({ to, title, text, icon }: { to: string; title: string; text?: string; icon?: ReactNode }) {
  return (
    <Link to={to} className="flex items-center gap-3 rounded-2xl bg-surface p-4 ring-1 ring-line/70 hover:bg-surface-2">
      {icon && (
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        {text && <span className="block text-sm text-muted">{text}</span>}
      </span>
      <ChevronRight aria-hidden="true" size={20} className="shrink-0 text-muted" />
    </Link>
  )
}
