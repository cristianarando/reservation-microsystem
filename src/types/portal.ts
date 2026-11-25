export type UserRole = "CUSTOMER" | "PROVIDER" | "ADMIN";

export type AppointmentStatus =
  | "CONFIRMED"
  | "RESCHEDULED_BY_STAFF"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW"
  | "NO_SHOW_ARCHIVED";

export type TimeOffType =
  | "LATE_START"
  | "EARLY_LEAVE"
  | "FULL_DAY_OFF"
  | "CUSTOM_BLOCK"
  | "VACATION";

export interface PortalBusinessSettings {
  id?: string | number;
  name: string;
  tagline?: string | null;
  staffLabel?: string | null;
  currencySymbol?: string | null;
  logoUrl?: string | null;
  addressText?: string | null;
  googleMapsUrl?: string | null;
  phoneWhatsapp?: string | null;
  slotStepMin?: number | null;
  bookingHorizonDays?: number | null;
  minLeadTimeMinutes?: number | null;
  minCancelNoticeHours?: number | null;
  maxActiveBookings?: number | null;
  themePrimaryHex?: string | null;
  themeSurfaceHex?: string | null;
  timezone?: string | null;
  pushHideDetails?: boolean | null;
  updatedAt?: string | Date | null;
}

export interface PortalUser {
  id: string;
  name: string;
  email: string;
  role: UserRole | string;
  phone?: string | null;
  avatarUrl?: string | null;
  isBlocked: boolean;
  noShowCount?: number | null;
  completedCount?: number | null;
  adminNotes?: string | null;
  notifyAllStaff?: boolean;
  pendingStaffUpgrade?: boolean;
  staffProfile?: { id: string } | null;
}

export interface PortalWorkingShift {
  id?: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

export interface PortalTimeOff {
  id: string;
  staffId?: string;
  type: TimeOffType | string;
  startAt: string | Date;
  endAt: string | Date;
  reason?: string | null;
  publicNote?: string | null;
  staffName?: string | null;
  createdAt?: string | Date;
}

export interface PortalStaffMember {
  id: string;
  userId?: string | null;
  displayName: string;
  specialtyTitle?: string | null;
  avatarUrl?: string | null;
  isActive?: boolean;
  customHorizonDays?: number | null;
  customLeadTimeMin?: number | null;
  user?: (Partial<PortalUser> & { id: string; email: string; role: string }) | null;
  workingShifts: PortalWorkingShift[];
  timeOffs?: PortalTimeOff[];
  services?: Array<{ serviceId: string }>;
}

export interface PortalService {
  id: string;
  name: string;
  description?: string | null;
  durationMin: number;
  bufferAfterMin?: number | null;
  price: number;
  isActive?: boolean;
  sortOrder?: number;
  staff?: Array<{ staffId: string }>;
}

export interface PortalAppointment {
  id: string;
  startAt: string | Date;
  endAt: string | Date;
  status: AppointmentStatus | string;
  staffId?: string;
  serviceId?: string;
  customerId?: string;
  priceSnapshot?: number;
  customerNotes?: string | null;
  staffMoveReason?: string | null;
  previousStartAt?: string | Date | null;
  allowFreeCancel?: boolean;
  rescheduleVersion?: number | null;
  customerRescheduleCount?: number | null;
  isOverbooking?: boolean;
  canCancel?: boolean;
  cancelReason?: string;
  isFreeCancellationBecauseOfStaff?: boolean;
  canReschedule?: boolean;
  rescheduleReason?: string;
  remainingReschedules?: number;
  service?: PortalService | null;
  staff?: (Partial<PortalStaffMember> & { id: string; displayName: string }) | null;
  customer?: Partial<PortalUser> | null;
}

export interface PortalNotification {
  id: string;
  type?: string | null;
  title?: string | null;
  message?: string | null;
  isRead: boolean;
  appointmentId?: string | null;
  createdAt?: string | Date;
}

export interface PortalHistoryPayload {
  items?: PortalAppointment[];
  nextCursor?: string | null;
  hasMore?: boolean;
  totalCount?: number;
}

export interface PortalBootstrapData {
  settings?: PortalBusinessSettings | null;
  services?: PortalService[];
  staff?: PortalStaffMember[];
  currentUser?: PortalUser | null;
  userAppointments?: PortalAppointment[];
  allAppointments?: PortalAppointment[];
  allUsers?: PortalUser[];
  notifications?: PortalNotification[];
  userHistory?: PortalHistoryPayload | null;
  impersonatorId?: string | null;
  serverNowIso?: string;
}

export interface ServiceModalDraft {
  id?: string;
  name: string;
  description: string;
  durationMin: number;
  bufferAfterMin?: number;
  price: number;
  isActive?: boolean;
  staffIds?: string[];
}

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
