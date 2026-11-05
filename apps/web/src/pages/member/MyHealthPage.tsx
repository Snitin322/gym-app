import { useState } from 'react'
import { useMyProfile, useSaveMyProfile, useWithdrawMyProfile } from '../../api/coaching'
import { errorMessage } from '../../lib/format'
import { PageHeader } from '../../ui/AppShell'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Form'
import { ErrorText } from '../../ui/Screen'
import { Sheet } from '../../ui/Sheet'
import { useDoneToast } from '../../ui/toast-context'
import { ProfileForm, ProfileSummary } from '../ClientProfile'
import { MemberShell } from './MemberShell'

/** Profile → Health details: what the member shares with their coach, and agreeing to share it. */
export function MyHealthPage() {
  const query = useMyProfile()
  const save = useSaveMyProfile()
  const withdraw = useWithdrawMyProfile()
  const [panel, setPanel] = useState<'edit' | 'delete' | null>(null)
  const [agreed, setAgreed] = useState(false)
  const close = () => setPanel(null)
  const done = useDoneToast(close)
  const view = query.data
  const coach = view?.coach?.name

  return (
    <MemberShell>
      <PageHeader title="Health details" back={{ to: '/profile', label: 'Profile' }} />
      {query.isPending && (
        <div aria-busy="true" aria-label="Loading" className="h-32 animate-pulse rounded-2xl bg-surface-2" />
      )}
      <ErrorText>{errorMessage(query.error)}</ErrorText>
      {view && (
        <>
          <p className="text-sm text-muted">
            {coach ? `${coach} uses these` : 'Your coach uses these'} to plan your training and diet safely. Only you,
            your coach and the gym owner can see them.
          </p>
          <ProfileSummary profile={view.profile} emptyText="Tell your coach about your body, goal, health and food." />
          <Button onClick={() => setPanel('edit')}>{view.profile ? 'Update my details' : 'Add my details'}</Button>
          {(view.profile || view.healthConsentAt) && (
            <Button variant="secondary" onClick={() => setPanel('delete')}>
              Delete my health details
            </Button>
          )}
        </>
      )}

      {view && panel === 'edit' && (
        <Sheet open title="Your details" onClose={close}>
          <ProfileForm
            self
            initial={view.profile}
            loading={save.isPending}
            error={errorMessage(save.error)}
            onCancel={close}
            onSubmit={(input) =>
              save.mutate(
                { ...input, ...(view.healthConsentAt ? {} : { healthConsent: agreed }) },
                { onSuccess: done('Details saved') },
              )
            }
            footer={
              !view.healthConsentAt && (
                <label className="flex cursor-pointer items-start gap-3 py-1">
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    className="mt-1 size-5 accent-[var(--color-accent)]"
                  />
                  <span>I agree to share these health details with my coach and the gym owner.</span>
                </label>
              )
            }
          />
        </Sheet>
      )}

      {panel === 'delete' && (
        <Sheet open title="Delete health details?" onClose={close}>
          <div className="flex flex-col gap-4">
            <Card>
              <p>
                Your details are deleted and your coach can no longer see them. Your membership and workout plan stay as
                they are.
              </p>
            </Card>
            <ErrorText>{errorMessage(withdraw.error)}</ErrorText>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={close}>
                Back
              </Button>
              <Button
                className="!bg-danger !text-bg"
                loading={withdraw.isPending}
                onClick={() => withdraw.mutate(undefined, { onSuccess: done('Health details deleted') })}
              >
                Delete
              </Button>
            </div>
          </div>
        </Sheet>
      )}
    </MemberShell>
  )
}
