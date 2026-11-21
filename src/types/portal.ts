export interface PortalBusinessSettings {
  id?: string;
  name: string;
  tagline?: string | null;
  staffLabel?: string | null;
  currencySymbol?: string | null;
  logoUrl?: string | null;
  addressText?: string | null;
  googleMapsUrl?: string | null;
  phoneWhatsapp?: string | null;
  bookingHorizonDays?: number | null;
  minLeadTimeMinutes?: number | null;
  minCancelNoticeHours?: number | null;
  maxActiveBookings?: number | null;
  updatedAt?: string | Date | null;
}

export interface PortalUser {
  id: string;
  name: string;
  email: string;
  role: string;
  phone?: string | null;
  avatarUrl?: string | null;
  googleId?: string | null;
  isBlocked: boolean;
  noShowCount?: number | null;
  completedCount?: number | null;
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
  type: string;
  startAt: string | Date;
  endAt: string | Date;
  reason?: string | null;
  staffName?: string | null;
}

export interface PortalStaffMember {
  id: string;
  userId?: string | null;
  displayName: string;
  name?: string | null;
  specialty?: string | null;
  specialtyTitle?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  isActive?: boolean;
  customHorizonDays?: number | null;
  customLeadTimeMin?: number | null;
  user?: PortalUser | null;
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
  staff?: Array<{ staffId: string }>;
}

export interface PortalAppointment {
  id: string;
  startAt: string | Date;
  endAt: string | Date;
  status: string;
  staffId?: string;
  serviceId?: string;
  customerId?: string;
  customerNotes?: string | null;
  staffMoveReason?: string | null;
  rescheduleVersion?: number | null;
  canCancel?: boolean;
  isFreeCancellationBecauseOfStaff?: boolean;
  service?: PortalService | null;
  staff?: PortalStaffMember | null;
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
