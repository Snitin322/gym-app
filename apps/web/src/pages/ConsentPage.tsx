import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { acceptConsent } from '../api/auth'
import { useAuth, useSignedInUser } from '../auth/AuthContext'
import { errorMessage } from '../lib/format'
import { Button } from '../ui/Button'
import { ErrorText, Screen } from '../ui/Screen'

// DRAFT notice text (DPDP Act). Have it reviewed before real members use the app, and bump
// CURRENT_NOTICE_VERSION in packages/shared/src/auth.ts whenever the wording changes.
export function ConsentPage() {
  const user = useSignedInUser()
  const { updateUser, signOut } = useAuth()
  const [agreed, setAgreed] = useState(false)
  const accept = useMutation({ mutationFn: acceptConsent, onSuccess: updateUser })

  return (
    <Screen>
      <h1 className="text-2xl font-extrabold tracking-tight">Before you start</h1>
      <p className="text-muted">
        Hi {user.name}. {user.gym.name} uses this app to manage your membership. Here is how your data is used.
      </p>

      <section className="space-y-3 rounded-2xl bg-surface p-5 text-sm leading-relaxed">
        <div>
          <h2 className="font-semibold">What we store</h2>
          <p className="text-muted">
            Your name, mobile number, membership and payment records, PT sessions and gym check-ins.
          </p>
        </div>
        <div>
          <h2 className="font-semibold">Why</h2>
          <p className="text-muted">
            To run your membership: logins, renewals and receipts, session bookings and reminders on WhatsApp.
          </p>
        </div>
        <div>
          <h2 className="font-semibold">Who can see it</h2>
          <p className="text-muted">
            {user.gym.name} staff. Progress photos and body measurements only you and your trainer can see.
          </p>
        </div>
        <div>
          <h2 className="font-semibold">Your rights</h2>
          <p className="text-muted">
            You can ask to see, correct or delete your data at any time at the front desk. Payment records are kept as
            required by tax law.
          </p>
        </div>
      </section>

      <label className="flex cursor-pointer items-start gap-3 py-1">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(event) => setAgreed(event.target.checked)}
          className="mt-1 size-5 accent-[var(--color-accent)]"
        />
        <span>I agree to the terms of use and the privacy notice above.</span>
      </label>

      <ErrorText>{errorMessage(accept.error)}</ErrorText>
      <Button disabled={!agreed} loading={accept.isPending} onClick={() => accept.mutate()}>
        Agree and continue
      </Button>
      <Button variant="ghost" onClick={() => void signOut()}>
        Log out
      </Button>
    </Screen>
  )
}
