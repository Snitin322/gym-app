import type { IsoDate } from './dates'
import type { DeskPaymentMethod } from './payments'

/** A member to contact: their membership is ending soon, or has ended. */
export interface DashboardMember {
  memberId: string
  name: string
  phone: string
  planName: string
  endDate: IsoDate
}

export interface DashboardDue {
  memberId: string
  name: string
  phone: string
  duePaise: number
}

export interface DashboardPtPackage {
  memberId: string
  name: string
  phone: string
  packageName: string
  trainerName: string
  sessionsLeft: number
  expiresOn: IsoDate
}

/** Money taken (paid payments). Owner only. */
export interface DashboardRevenue {
  todayPaise: number
  monthPaise: number
  lastMonthPaise: number
  /** This month, by method (desk methods plus online). */
  monthByMethod: Partial<Record<DeskPaymentMethod | 'razorpay', number>>
}

export interface DashboardView {
  today: IsoDate
  members: {
    active: number
    joinedThisMonth: number
    frozen: number
    noPlan: number
    /** Ending within the next 7 days, soonest first. */
    expiringSoon: DashboardMember[]
    /** Ended in the last 30 days and not renewed, most recent first. */
    recentlyExpired: DashboardMember[]
  }
  /** Null for admins: only the owner sees money taken. */
  revenue: DashboardRevenue | null
  dues: { totalPaise: number; members: DashboardDue[] }
  pt: {
    bookedThisWeek: number
    completedThisWeek: number
    noShowsThisWeek: number
    openDisputes: number
    unmarked: number
    /** Sessions left and the use-by date within 7 days. */
    runningOut: DashboardPtPackage[]
  }
  workouts: { withPlan: number; trackedThisWeek: number }
}

/** A WhatsApp chat with the message typed in (staff press send). Free: no Meta template needed. */
export function whatsappLink(phone: string, message: string) {
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`
}
