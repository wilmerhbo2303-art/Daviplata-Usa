import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import QRCode from 'react-qr-code';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bell,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Eye,
  FileText,
  Fingerprint,
  KeyRound,
  Plus,
  Search,
  Send,
  Share2,
  Smartphone,
  UserRound,
  X,
} from 'lucide-react';
import { ProfileMenuScreen, ProfilePhotoScreen, type ProfileSection } from './ProfileScreens';
import { lookupDaviplataBrebKey } from './lib/breb-lookup';
import { parseBrebQrPayload } from './lib/qr-payload';
import {
  BillsScreen,
  BusinessHomeScreen,
  DiscountsScreen,
  QrOptionsSheet,
  QrScannerScreen,
  RecipientsScreen,
  TelegramRechargeSheet,
  TopesScreen,
  VirtualShopScreen,
  type DaviRecipient,
  type TelegramSupportContact,
} from './DaviFeatureScreens';
import DaviWelcomeTutorial from './DaviWelcomeTutorial';
import './daviplata.css';

const DAVI_INTRO_DISMISSED_KEY = 'davi-usa:intro-dismissed';

type Screen =
  | 'onboarding'
  | 'admin'
  | 'welcome'
  | 'pin'
  | 'home'
  | 'profile'
  | 'profile-picture'
  | 'recipients'
  | 'transfer'
  | 'amount'
  | 'receipt'
  | 'movements'
  | 'movement-detail'
  | 'user-qr'
  | 'qr-scanner'
  | 'topes'
  | 'discounts'
  | 'help'
  | 'shop'
  | 'services';
type AccessAnimation =
  | 'launcher'
  | 'splash-red'
  | 'splash-cream'
  | 'splash-dark'
  | 'to-pin'
  | 'wrong-pin'
  | 'home-dark'
  | 'home-cream'
  | null;
type TransferRail = 'daviplata' | 'davivienda' | 'breb' | 'banks';
type DemoContact = {
  id: string;
  name: string;
  key: string;
  bank: string;
  rail?: 'daviplata' | 'breb';
};
type DemoMovement = {
  id: string;
  date: string;
  direction: 'sent' | 'received';
  rail: TransferRail;
  amount: number;
  recipient: string;
  key: string;
  bank: string;
  message: string;
  accountType?: 'Ahorros' | 'Corriente';
  approvalNumber?: string;
};
type DemoData = {
  balance: number;
  contacts: DemoContact[];
  movements: DemoMovement[];
};
type DocumentType =
  | 'Cédula de Ciudadanía'
  | 'Cédula de Extranjería'
  | 'Tarjeta de Identidad';
type DemoUser = {
  id: string;
  name: string;
  documentType: DocumentType;
  documentNumber: string;
  phone: string;
  pin: string;
  balance: number;
  createdAt: string;
  displayBalance: number | null;
  premiumExpiresAt: number | null;
  premiumEnabled: boolean;
  boldExpiresAt: number | null;
  boldEnabled: boolean;
  smsCredits: number;
  smsEnabled: boolean;
  blocked: boolean;
  isTrial: boolean;
  trialExpiresAt: number | null;
};
type AdminEditValues = {
  name: string;
  documentType: DocumentType;
  documentNumber: string;
  phone: string;
  pin: string;
  balance: string;
  displayBalance: string;
  premiumDays: string;
  originalPremiumDays: string;
  boldDays: string;
  originalBoldDays: string;
  smsCredits: string;
};

const STORAGE_KEY = 'daviplata-usa-video-demo-v2';
const USERS_STORAGE_KEY = 'daviplata-usa-profiles-v1';
const ACTIVE_PROFILE_STORAGE_KEY = 'daviplata-usa-active-profile-v1';
const STARTING_BALANCE = 5_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const TRIAL_DURATION_MS = 60 * 60 * 1000;
const ACCESS_ANIMATION_DURATION: Record<Exclude<AccessAnimation, null>, number> = {
  launcher: 500,
  'splash-red': 1_900,
  'splash-cream': 450,
  'splash-dark': 1_050,
  'to-pin': 1_900,
  'wrong-pin': 1_050,
  'home-dark': 1_650,
  'home-cream': 1_000,
};
const documentTypes: DocumentType[] = [
  'Cédula de Ciudadanía',
  'Cédula de Extranjería',
  'Tarjeta de Identidad',
];
const rails: { id: TransferRail; label: string; icon: string }[] = [
  { id: 'daviplata', label: 'A DaviPlata', icon: 'dP' },
  { id: 'davivienda', label: 'Davivienda', icon: 'D' },
  { id: 'breb', label: 'Por Bre-B', icon: 'Bre-B' },
  { id: 'banks', label: 'A otros bancos', icon: 'bank' },
];
const bankOptions = ['Bancolombia', 'Banco de Bogotá', 'BBVA Colombia', 'Banco Popular', 'Banco Caja Social', 'Banco Agrario'];
const initialContacts: DemoContact[] = [
  { id: 'ct-1', name: 'Andrea M. Torres', key: '@3210000001', bank: 'Nequi' },
  { id: 'ct-2', name: 'Daniel F. Gómez', key: '@3040000002', bank: 'Nequi' },
  { id: 'ct-3', name: 'Alba N. Muñoz', key: '@demoalba4560', bank: 'Nequi' },
  { id: 'ct-4', name: 'Camila P. Rojas', key: '3100000004', bank: 'DaviPlata' },
  { id: 'ct-5', name: 'Mateo R. Silva', key: '@3210000005', bank: 'DaviPlata' },
  { id: 'ct-6', name: 'Luis A. Parra', key: '3200000008', bank: 'Davivienda' },
  { id: 'ct-7', name: 'Sofía V. Díaz', key: '3000000007', bank: 'Transfiya' },
];

function recipientRail(contact: DemoContact): 'daviplata' | 'breb' | null {
  if (contact.rail) return contact.rail;
  if (contact.key.startsWith('@')) return 'breb';
  return contact.bank === 'DaviPlata' ? 'daviplata' : null;
}

function encodeCredentialId(value: ArrayBuffer) {
  let binary = '';
  new Uint8Array(value).forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeCredentialId(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function makeWebAuthnChallenge() {
  return crypto.getRandomValues(new Uint8Array(32));
}

function isInstalledWebApp() {
  if (typeof window === 'undefined') return false;
  const standaloneDisplay = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standaloneDisplay || iosStandalone;
}

function daysAgo(days: number, hours = 12) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hours, 0, 0, 0);
  return date.toISOString();
}

function makeInitialData(balance = STARTING_BALANCE): DemoData {
  return {
    balance,
    contacts: initialContacts,
    movements: [
      { id: 'DEMO-001', date: daysAgo(0, 19), direction: 'sent', rail: 'breb', amount: 1, recipient: 'Andrea M. Torres', key: '@3210000001', bank: 'Nequi', message: '' },
      { id: 'DEMO-002', date: daysAgo(0, 18), direction: 'sent', rail: 'breb', amount: 1, recipient: 'Daniel F. Gómez', key: '@3040000002', bank: 'Nequi', message: '' },
      { id: 'DEMO-003', date: daysAgo(0, 16), direction: 'sent', rail: 'breb', amount: 60000, recipient: 'Contacto demo', key: '@3210000003', bank: 'Nequi', message: '' },
      { id: 'DEMO-004', date: daysAgo(0, 15), direction: 'received', rail: 'breb', amount: 60000, recipient: 'Contacto demo', key: '@3210000004', bank: 'Nequi', message: '' },
      { id: 'DEMO-005', date: daysAgo(0, 14), direction: 'sent', rail: 'breb', amount: 50000, recipient: 'Contacto demo', key: '@3210000005', bank: 'Nequi', message: '' },
      { id: 'DEMO-006', date: daysAgo(0, 13), direction: 'received', rail: 'breb', amount: 50000, recipient: 'Contacto demo', key: '@3210000006', bank: 'Nequi', message: '' },
      { id: 'DEMO-007', date: daysAgo(2, 10), direction: 'received', rail: 'breb', amount: 1, recipient: 'Contacto demo', key: '@3210000007', bank: 'Nequi', message: '' },
    ],
  };
}

function loadDemoData(): DemoData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DemoData>;
      if (
        typeof parsed.balance === 'number' &&
        Array.isArray(parsed.contacts) &&
        Array.isArray(parsed.movements)
      ) {
        return {
          balance: parsed.balance,
          contacts: parsed.contacts,
          movements: parsed.movements,
        };
      }
    }
  } catch {
    // Keep the simulator usable if local storage is blocked or corrupted.
  }
  return makeInitialData();
}

function loadUsers(): DemoUser[] {
  try {
    const stored = localStorage.getItem(USERS_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((raw): DemoUser[] => {
      const item = raw as Partial<DemoUser>;
      if (
        typeof item.id !== 'string' ||
        typeof item.name !== 'string' ||
        !documentTypes.includes(item.documentType as DocumentType) ||
        typeof item.documentNumber !== 'string' ||
        typeof item.phone !== 'string' ||
        typeof item.balance !== 'number'
      ) return [];
      const trialExpiresAt = typeof item.trialExpiresAt === 'number' && Number.isFinite(item.trialExpiresAt)
        ? item.trialExpiresAt
        : null;
      if (item.isTrial === true && trialExpiresAt !== null && trialExpiresAt <= Date.now()) {
        removeUserLocalData(item.id);
        return [];
      }
      const premiumExpiresAt = typeof item.premiumExpiresAt === 'number' && Number.isFinite(item.premiumExpiresAt)
        ? item.premiumExpiresAt
        : null;
      const boldExpiresAt = typeof item.boldExpiresAt === 'number' && Number.isFinite(item.boldExpiresAt)
        ? item.boldExpiresAt
        : null;
      const smsCredits = typeof item.smsCredits === 'number' && Number.isFinite(item.smsCredits)
        ? Math.max(0, Math.floor(item.smsCredits))
        : 0;
      return [{
        id: item.id,
        name: item.name,
        documentType: item.documentType as DocumentType,
        documentNumber: item.documentNumber,
        phone: item.phone,
        pin: typeof item.pin === 'string' && /^\d{4}$/.test(item.pin) ? item.pin : '1234',
        balance: item.balance,
        createdAt: item.createdAt ?? new Date().toISOString(),
        displayBalance: typeof item.displayBalance === 'number' && Number.isFinite(item.displayBalance)
          ? Math.max(0, item.displayBalance)
          : null,
        premiumExpiresAt,
        premiumEnabled: item.premiumEnabled === true && entitlementDaysRemaining(premiumExpiresAt) > 0,
        boldExpiresAt,
        boldEnabled: item.boldEnabled === true && entitlementDaysRemaining(boldExpiresAt) > 0,
        smsCredits,
        smsEnabled: item.smsEnabled === true && smsCredits > 0,
        blocked: item.blocked === true,
        isTrial: item.isTrial === true,
        trialExpiresAt,
      }];
    });
  } catch {
    return [];
  }
}

function loadAccountData(user: DemoUser): DemoData {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}:${user.id}`);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DemoData>;
      if (
        typeof parsed.balance === 'number' &&
        Array.isArray(parsed.contacts) &&
        Array.isArray(parsed.movements)
      ) {
        return {
          balance: parsed.balance,
          contacts: parsed.contacts,
          movements: parsed.movements,
        };
      }
    }
  } catch {
    // Start with a clean demo balance if this profile has no saved activity.
  }
  return {
    balance: user.balance,
    contacts: initialContacts,
    movements: [],
  };
}

function normalizeDigits(value: string) {
  return value.replace(/\D/g, '');
}

function parseLocalizedAmount(value: string) {
  const cleaned = value.trim().replace(/[^\d,.-]/g, '');
  const normalized = cleaned.includes(',')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned.replace(/,/g, '');
  return Number(normalized);
}

function generateUniquePhone(users: DemoUser[]) {
  let result = '';
  do {
    result = `3${Math.floor(100_000_000 + Math.random() * 900_000_000)}`;
  } while (users.some((user) => normalizeDigits(user.phone) === result));
  return result;
}

function parseNonnegativeInteger(value: string) {
  if (!value.trim()) return 0;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : Number.NaN;
}

function entitlementDaysRemaining(expiresAt: number | null, now = Date.now()) {
  return expiresAt !== null && expiresAt > now ? Math.ceil((expiresAt - now) / DAY_MS) : 0;
}

function entitlementExpiry(days: number, now = Date.now()) {
  return days > 0 ? now + days * DAY_MS : null;
}

function isTrialExpired(user: DemoUser, now = Date.now()) {
  return user.isTrial && user.trialExpiresAt !== null && user.trialExpiresAt <= now;
}

function removeUserLocalData(userId: string) {
  try {
    localStorage.removeItem(`${STORAGE_KEY}:${userId}`);
    localStorage.removeItem(`davi-usa:biometric:${userId}`);
  } catch {
    // The profile is removed from the user list even if browser storage is unavailable.
  }
}

function generateDocumentNumber(users: DemoUser[]) {
  let result = '';
  do {
    result = String(Math.floor(100_000_000 + Math.random() * 100_000_000));
  } while (users.some((user) => user.documentNumber === result));
  return result;
}

function maskedPhone(value: string) {
  const digits = normalizeDigits(value);
  return `*** *** ${digits.slice(-4)}`;
}

function money(value: number, fractionDigits = 2) {
  const formatted = new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
  return `$${formatted}`;
}

function shortMoney(value: number) {
  return `$${new Intl.NumberFormat('es-CO', {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value)}`;
}

function transferMoney(value: number) {
  return money(value, Number.isInteger(value) ? 0 : 2);
}

function maskedName(value: string) {
  const parts = value.trim().split(/\s+/);
  if (parts.length < 2) return `${parts[0]?.slice(0, 2) ?? 'Co'}****`;
  return `${parts[0].slice(0, 2)}**** ${parts[parts.length - 1].slice(0, 3)}****`;
}

function dateHeading(value: string) {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return 'Hoy';
  const month = new Intl.DateTimeFormat('es-CO', { month: 'long' }).format(date);
  return `${month[0].toLocaleUpperCase('es-CO')}${month.slice(1)} ${date.getDate()} - ${date.getFullYear()}`;
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function DaviLogo({ light = false }: { light?: boolean }) {
  return (
    <span className={`davi-logo ${light ? 'davi-logo-light' : ''}`}>
      <img src={`${import.meta.env.BASE_URL}daviplata-logo.png`} alt="DaviPlata" />
    </span>
  );
}

function SimulationMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`simulation-mark ${compact ? 'simulation-mark-compact' : ''}`}>
      <span className="simulation-dot" />
      <span>SIMULACIÓN · NO ES DINERO REAL</span>
    </div>
  );
}

function EntitlementToggleRow({
  label,
  detail,
  enabled,
  disabled,
  onToggle,
}: {
  label: string;
  detail: string;
  enabled: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="entitlement-row">
      <div>
        <strong>{label}</strong>
        <small>{detail}</small>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={`${label}: ${enabled ? 'activado' : 'desactivado'}`}
        disabled={disabled}
        className={`entitlement-switch ${enabled ? 'is-enabled' : ''}`}
        onClick={onToggle}
      >
        <span />
      </button>
    </div>
  );
}

function App() {
  const previewScreen = new URLSearchParams(window.location.search).get('preview');
  const previewPinError =
    import.meta.env.DEV &&
    previewScreen === 'pin' &&
    new URLSearchParams(window.location.search).get('pinError') === '1';
  const previewableScreens: Screen[] = ['onboarding', 'admin', 'welcome', 'pin', 'home', 'profile', 'profile-picture', 'recipients', 'transfer', 'amount', 'receipt', 'movements', 'movement-detail', 'user-qr', 'qr-scanner', 'topes', 'discounts', 'shop', 'services'];
  const adminRoute =
    window.location.pathname.replace(/\/+$/, '').endsWith('/admin') ||
    new URLSearchParams(window.location.search).get('admin') === '1';
  const [users, setUsers] = useState<DemoUser[]>(loadUsers);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(() => {
    try {
      const savedId = localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY);
      return users.some((user) => user.id === savedId && !user.blocked && !isTrialExpired(user)) ? savedId : null;
    } catch {
      return null;
    }
  });
  const [data, setData] = useState<DemoData>(() => {
    const savedUser = users.find((user) => user.id === activeProfileId);
    return savedUser ? loadAccountData(savedUser) : loadDemoData();
  });
  const [screen, setScreen] = useState<Screen>(() =>
    import.meta.env.DEV && previewScreen && previewableScreens.includes(previewScreen as Screen)
      ? previewScreen as Screen
      : adminRoute ? 'admin' : activeProfileId ? 'welcome' : 'onboarding',
  );
  const [accessAnimation, setAccessAnimation] = useState<AccessAnimation>(() =>
    adminRoute || (import.meta.env.DEV && Boolean(previewScreen))
      ? null
      : isInstalledWebApp() ? 'launcher' : 'splash-red',
  );
  const [documentType, setDocumentType] = useState<DocumentType | ''>('');
  const [documentTypeOpen, setDocumentTypeOpen] = useState(true);
  const [documentNumber, setDocumentNumber] = useState('');
  const [loginPhone, setLoginPhone] = useState('');
  const [onboardingError, setOnboardingError] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminDocumentType, setAdminDocumentType] = useState<DocumentType>(documentTypes[0]);
  const [adminPhone, setAdminPhone] = useState('');
  const [adminPin, setAdminPin] = useState('');
  const [adminPremiumDays, setAdminPremiumDays] = useState('0');
  const [adminBoldDays, setAdminBoldDays] = useState('0');
  const [adminSmsCredits, setAdminSmsCredits] = useState('0');
  const [adminAccessPin, setAdminAccessPin] = useState('');
  const [adminAuthStatus, setAdminAuthStatus] = useState<'checking' | 'locked' | 'unlocked'>(() =>
    adminRoute ? 'checking' : 'locked',
  );
  const [adminAccessError, setAdminAccessError] = useState('');
  const [adminBalance, setAdminBalance] = useState('0');
  const [adminError, setAdminError] = useState('');
  const [createdUserId, setCreatedUserId] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [adminEdit, setAdminEdit] = useState<AdminEditValues | null>(null);
  const [adminEditError, setAdminEditError] = useState('');
  const [entitlementClock, setEntitlementClock] = useState(() => Date.now());
  const [qrReturnTo, setQrReturnTo] = useState<Screen>(() =>
    import.meta.env.DEV && previewScreen === 'welcome' ? 'welcome' : 'home',
  );
  const [topesReturnTo, setTopesReturnTo] = useState<Screen>('home');
  const [pin, setPin] = useState(previewPinError ? '1234' : '');
  const [pinErrorOpen, setPinErrorOpen] = useState(previewPinError);
  const [hiddenBalance, setHiddenBalance] = useState(() =>
    import.meta.env.DEV && new URLSearchParams(window.location.search).get('hiddenBalance') === '1',
  );
  const [homeMode, setHomeMode] = useState<'personal' | 'business'>(() =>
    import.meta.env.DEV && new URLSearchParams(window.location.search).get('mode') === 'business'
      ? 'business'
      : 'personal',
  );
  const [profileSection, setProfileSection] = useState<ProfileSection>('security');
  const [profilePhotoUrl, setProfilePhotoUrl] = useState('');
  const profilePhotoObjectUrl = useRef<string | null>(null);
  const transferLookupAbortRef = useRef<AbortController | null>(null);
  const [rail, setRail] = useState<TransferRail>('daviplata');
  const [transferKey, setTransferKey] = useState('');
  const [verifiedRecipient, setVerifiedRecipient] = useState<DemoContact | null>(null);
  const [recipientName, setRecipientName] = useState('');
  const [destinationBank, setDestinationBank] = useState('DaviPlata');
  const [destinationAccountType, setDestinationAccountType] = useState<'' | 'Ahorros' | 'Corriente'>('');
  const [transferMessage, setTransferMessage] = useState('');
  const [amountText, setAmountText] = useState('');
  const [transferError, setTransferError] = useState('');
  const [transferNotice, setTransferNotice] = useState('');
  const [transferLookupBusy, setTransferLookupBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState<'working' | 'success'>('working');
  const successSoundRef = useRef<HTMLAudioElement | null>(null);
  const [currentMovement, setCurrentMovement] = useState<DemoMovement | null>(() =>
    import.meta.env.DEV && (previewScreen === 'receipt' || previewScreen === 'movement-detail')
      ? {
          id: 'DUSA-DEMO-PREVIEW',
          date: new Date().toISOString(),
          direction: 'sent',
           rail: 'daviplata',
          amount: 1,
          recipient: 'Andrea M. Torres',
           key: '3000003762',
           bank: 'DaviPlata',
          message: '',
           approvalNumber: '626866',
        }
      : null,
  );
  const [movementFilter, setMovementFilter] = useState('Todos los movimientos');
  const [movementLoading, setMovementLoading] = useState(() => screen === 'movements');
  const movementHoldTimerRef = useRef<number | null>(null);
  const movementHoldOriginRef = useRef<{ x: number; y: number } | null>(null);
  const movementClickSuppressionRef = useRef(false);
  const movementClickSuppressionTimerRef = useRef<number | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [sheet, setSheet] = useState<'meter' | 'withdraw' | 'quick' | 'notification' | 'recharge' | 'qr-options' | null>(() => {
    if (!import.meta.env.DEV) return null;
    const requested = new URLSearchParams(window.location.search).get('sheet');
    return requested === 'qr-options' || requested === 'notification' || requested === 'recharge' ? requested : null;
  });
  const [welcomeTutorialOpen, setWelcomeTutorialOpen] = useState(
    () => import.meta.env.DEV && previewScreen === 'intro',
  );
  const tutorialCheckedRef = useRef(false);
  const [displayBalanceDraft, setDisplayBalanceDraft] = useState('');
  const [scanPurpose, setScanPurpose] = useState<'pay' | 'receipt'>('pay');
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!movementLoading) return;
    const timeout = window.setTimeout(() => setMovementLoading(false), 2100);
    return () => window.clearTimeout(timeout);
  }, [movementLoading]);

  useEffect(() => {
    if (!adminRoute) return;
    let current = true;
    void fetch('/api/daviplata/admin/session', { credentials: 'same-origin' })
      .then(async (response) => response.ok ? response.json() as Promise<{ authenticated?: boolean }> : null)
      .then((result) => {
        if (current) setAdminAuthStatus(result?.authenticated ? 'unlocked' : 'locked');
      })
      .catch(() => {
        if (current) {
          setAdminAuthStatus('locked');
          setAdminAccessError('No se pudo comprobar la sesión del panel. Intenta de nuevo.');
        }
      });
    return () => { current = false; };
  }, [adminRoute]);

  useEffect(() => {
    if (!accessAnimation) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = reducedMotion ? 120 : ACCESS_ANIMATION_DURATION[accessAnimation];
    const timeout = window.setTimeout(() => {
      switch (accessAnimation) {
        case 'launcher':
          setAccessAnimation('splash-red');
          break;
        case 'splash-red':
          setAccessAnimation('splash-cream');
          break;
        case 'splash-cream':
          setAccessAnimation('splash-dark');
          break;
        case 'splash-dark':
          setAccessAnimation(null);
          break;
        case 'to-pin':
          setPin('');
          setScreen('pin');
          setAccessAnimation(null);
          break;
        case 'wrong-pin':
          setPinErrorOpen(true);
          setAccessAnimation(null);
          break;
        case 'home-dark':
          setAccessAnimation('home-cream');
          break;
        case 'home-cream':
          setPin('');
          setScreen('home');
          setAccessAnimation(null);
          break;
      }
    }, duration);
    return () => window.clearTimeout(timeout);
  }, [accessAnimation]);

  useEffect(() => {
    if (
      accessAnimation !== null ||
      adminRoute ||
      (import.meta.env.DEV && Boolean(previewScreen)) ||
      tutorialCheckedRef.current
    ) return;

    tutorialCheckedRef.current = true;
    try {
      if (localStorage.getItem(DAVI_INTRO_DISMISSED_KEY) === '1') return;
    } catch {
      // Show the introduction when browser storage is unavailable.
    }
    setWelcomeTutorialOpen(true);
  }, [accessAnimation, adminRoute, previewScreen]);

  useEffect(() => {
    try {
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
    } catch {
      // Keep profiles usable in memory if browser storage is unavailable.
    }
  }, [users]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      setEntitlementClock(now);
      setUsers((current) => {
        let changed = false;
        const next = current.map((user) => {
          const premiumExpired = user.premiumEnabled && entitlementDaysRemaining(user.premiumExpiresAt, now) === 0;
          const boldExpired = user.boldEnabled && entitlementDaysRemaining(user.boldExpiresAt, now) === 0;
          if (!premiumExpired && !boldExpired) return user;
          changed = true;
          return {
            ...user,
            ...(premiumExpired ? { premiumEnabled: false } : {}),
            ...(boldExpired ? { boldEnabled: false } : {}),
          };
        });
        return changed ? next : current;
      });
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const now = Date.now();
    const nextExpiry = users
      .filter((user) => user.isTrial && user.trialExpiresAt !== null && user.trialExpiresAt > now)
      .reduce((nearest, user) => Math.min(nearest, user.trialExpiresAt as number), Number.POSITIVE_INFINITY);
    if (!Number.isFinite(nextExpiry)) return;
    const timeout = window.setTimeout(() => {
      const expiredIds = new Set(users
        .filter((user) => user.isTrial && user.trialExpiresAt !== null && user.trialExpiresAt <= Date.now())
        .map((user) => user.id));
      if (!expiredIds.size) return;
      expiredIds.forEach(removeUserLocalData);
      setUsers((current) => current.filter((user) => !expiredIds.has(user.id)));
      if (activeProfileId && expiredIds.has(activeProfileId)) {
        setActiveProfileId(null);
        if (screen !== 'admin') {
          setDocumentType('');
          setDocumentNumber('');
          setLoginPhone('');
          setScreen('onboarding');
          setToast('El usuario de prueba venció y fue eliminado.');
        }
      }
    }, Math.max(0, nextExpiry - now + 50));
    return () => window.clearTimeout(timeout);
  }, [users, activeProfileId, screen]);

  useEffect(() => {
    try {
      if (activeProfileId) {
        localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, activeProfileId);
      } else {
        localStorage.removeItem(ACTIVE_PROFILE_STORAGE_KEY);
      }
    } catch {
      // The current session remains usable if browser storage is unavailable.
    }
  }, [activeProfileId]);

  useEffect(() => {
    if (!activeProfileId) return;
    try {
      localStorage.setItem(`${STORAGE_KEY}:${activeProfileId}`, JSON.stringify(data));
      setUsers((current) => current.map((user) =>
        user.id === activeProfileId && user.balance !== data.balance
          ? { ...user, balance: data.balance }
          : user,
      ));
    } catch {
      // The active session still works without persistence.
    }
  }, [activeProfileId, data]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2300);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => () => {
    if (profilePhotoObjectUrl.current) URL.revokeObjectURL(profilePhotoObjectUrl.current);
    if (movementHoldTimerRef.current !== null) window.clearTimeout(movementHoldTimerRef.current);
    if (movementClickSuppressionTimerRef.current !== null) {
      window.clearTimeout(movementClickSuppressionTimerRef.current);
    }
  }, []);

  const sortedMovements = useMemo(
    () => [...data.movements].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    ),
    [data.movements],
  );

  const shownMovements = useMemo(() => {
    const query = searchText.trim().toLocaleLowerCase('es');
    return sortedMovements.filter((movement) => {
      const matchesType =
        movementFilter === 'Todos los movimientos' ||
        (movementFilter === 'Recibió Plata' && movement.direction === 'received') ||
        (movementFilter === 'Pasó Plata' && movement.direction === 'sent') ||
        (movementFilter === 'Por Bre-B' && movement.rail === 'breb');
      const matchesSearch =
        !query ||
        `${movement.recipient} ${movement.key} ${movement.bank} ${movement.id}`
          .toLocaleLowerCase('es')
          .includes(query);
      return matchesType && matchesSearch;
    });
  }, [movementFilter, searchText, sortedMovements]);

  const availableContacts = data.contacts.filter((contact) => {
    if (rail === 'breb') return recipientRail(contact) === 'breb';
    if (rail === 'daviplata') return recipientRail(contact) === 'daviplata';
    if (rail === 'davivienda') return contact.bank === 'Davivienda';
    return Boolean(destinationBank) && contact.bank === destinationBank;
  });
  const findMatchingRecipient = (key = transferKey) => {
    const digits = key.replace(/\D/g, '');
    const savedRecipient = availableContacts.find((contact) => rail === 'breb'
      ? contact.key.trim().toLocaleLowerCase('es') === key.trim().toLocaleLowerCase('es')
      : contact.key.replace(/\D/g, '') === digits,
    ) ?? null;
    if (savedRecipient) return savedRecipient;
    if (
      rail === 'breb' &&
      verifiedRecipient &&
      verifiedRecipient.key.trim().toLocaleLowerCase('es') === key.trim().toLocaleLowerCase('es')
    ) {
      return verifiedRecipient;
    }
    return null;
  };
  const recipientRequiredMessage = rail === 'breb'
    ? 'No se pudo verificar esta llave. Revisa los datos o registra el destinatario.'
    : 'Este destinatario no está en Destinatarios. Agrégalo antes de continuar.';
  const recipientItems: DaviRecipient[] = data.contacts.flatMap((contact) => {
    const kind = recipientRail(contact);
    return kind ? [{ ...contact, rail: kind }] : [];
  });
  const activeProfile = users.find((user) => user.id === activeProfileId) ?? null;
  const effectiveBalance = Math.max(0, Math.min(data.balance, activeProfile?.displayBalance ?? data.balance));
  useEffect(() => {
    if (sheet !== 'notification' || !activeProfile) return;
    setDisplayBalanceDraft(String(activeProfile.displayBalance ?? data.balance));
  }, [sheet, activeProfileId, activeProfile?.displayBalance, data.balance]);

  const dismissWelcomeTutorial = useCallback((remember: boolean) => {
    if (remember) {
      try {
        localStorage.setItem(DAVI_INTRO_DISMISSED_KEY, '1');
      } catch {
        // Dismiss this session even if browser storage is unavailable.
      }
    }
    setWelcomeTutorialOpen(false);
  }, []);
  const openWelcomeTutorial = useCallback(() => setWelcomeTutorialOpen(true), []);

  const createdUser = users.find((user) => user.id === createdUserId) ?? null;
  const previewWelcome = import.meta.env.DEV && previewScreen === 'welcome';
  const previewProfile = import.meta.env.DEV && (previewScreen === 'profile' || previewScreen === 'profile-picture');
  const welcomeName = activeProfile?.name ?? (previewWelcome ? 'NATHALEY' : '');
  const welcomePhone = activeProfile?.phone ?? (previewWelcome ? '3000003762' : '');
  const profileName = activeProfile?.name ?? (previewProfile ? 'NATHALEY ESPINOSA' : 'Mi perfil');
  const profilePhone = activeProfile?.phone ?? (previewProfile ? '3143333762' : '');
  const telegramContacts: TelegramSupportContact[] = [
    { role: 'Dueño', name: '𝚂𝙰𝚃𝙰𝙽『𝕯𝖊𝖒𝖔𝖓𝕷𝖔𝖗𝖉⁶⁶⁶』', username: 't.me/SatanAntiCristos' },
    { role: 'Administrador', name: '◤𝑰𝒄𝒆 𝒄𝒖𝒃𝒆 『𝕯𝖊𝖒𝖔𝖓𝕷𝖔𝖗𝖉⁶⁶⁶』 ◢', username: 'https://t.me/ice_cubeOP' },
  ];

  const saveRecipient = (recipient: Omit<DaviRecipient, 'id'>) => {
    const duplicate = data.contacts.some((contact) =>
      recipientRail(contact) === recipient.rail &&
      contact.key.trim().toLocaleLowerCase('es') === recipient.key.trim().toLocaleLowerCase('es'),
    );
    if (duplicate) return false;
    const saved: DemoContact = {
      ...recipient,
      id: `recipient-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    };
    setData((current) => ({ ...current, contacts: [saved, ...current.contacts] }));
    return true;
  };

  const deleteRecipient = (id: string) => {
    setData((current) => ({
      ...current,
      contacts: current.contacts.filter((contact) => contact.id !== id),
    }));
  };

  const go = (next: Screen) => {
    setScreen(next);
    setMovementLoading(next === 'movements');
    setConfirmOpen(false);
    setSheet(null);
    if (next !== 'receipt' && next !== 'movement-detail') setCurrentMovement(null);
  };

  const startPinEntry = () => {
    if (accessAnimation) return;
    if (activeProfile?.blocked || (activeProfile && isTrialExpired(activeProfile))) {
      setActiveProfileId(null);
      setScreen('onboarding');
      if (activeProfile?.isTrial) {
        removeUserLocalData(activeProfile.id);
        setUsers((current) => current.filter((user) => user.id !== activeProfile.id));
        setToast('El usuario de prueba venció y fue eliminado.');
      } else {
        setToast('El acceso de este usuario está bloqueado.');
      }
      return;
    }
    setPin('');
    setPinErrorOpen(false);
    setAccessAnimation('to-pin');
  };

  const handleProfilePhotoChange = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setToast('Selecciona un archivo de imagen.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setToast('La imagen debe pesar menos de 8 MB.');
      return;
    }
    if (profilePhotoObjectUrl.current) URL.revokeObjectURL(profilePhotoObjectUrl.current);
    const objectUrl = URL.createObjectURL(file);
    profilePhotoObjectUrl.current = objectUrl;
    setProfilePhotoUrl(objectUrl);
    go('profile');
  };

  const showProfileOption = (label: string) => {
    if (label === 'Topes' || label === 'Tarifas y límites') {
      setTopesReturnTo('profile');
      go('topes');
      return;
    }
    setToast(`${label}: opción de demostración.`);
  };

  const continueFromOnboarding = () => {
    const normalizedDocument = normalizeDigits(documentNumber);
    const normalizedPhone = normalizeDigits(loginPhone);
    const matchingUser = users.find((user) =>
      user.documentType === documentType &&
      normalizeDigits(user.documentNumber) === normalizedDocument &&
      normalizeDigits(user.phone) === normalizedPhone,
    );
    if (!matchingUser) {
      setOnboardingError('No encontramos esos datos. Verifica el documento y el número de celular.');
      return;
    }
    if (matchingUser.blocked) {
      setOnboardingError('El acceso de este usuario está bloqueado. Contacta al administrador.');
      return;
    }
    if (isTrialExpired(matchingUser)) {
      removeUserLocalData(matchingUser.id);
      setUsers((current) => current.filter((user) => user.id !== matchingUser.id));
      setOnboardingError('El usuario de prueba venció y fue eliminado.');
      return;
    }
    setOnboardingError('');
    setActiveProfileId(matchingUser.id);
    try {
      localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, matchingUser.id);
    } catch {
      // The user can still continue for this session if storage is blocked.
    }
    setData(loadAccountData(matchingUser));
    setHiddenBalance(false);
    setScreen('welcome');
  };

  const createAdminUser = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = adminName.trim();
    const phone = normalizeDigits(adminPhone);
    const userPin = normalizeDigits(adminPin);
    const balance = parseLocalizedAmount(adminBalance);
    const premiumDays = parseNonnegativeInteger(adminPremiumDays);
    const boldDays = parseNonnegativeInteger(adminBoldDays);
    const smsCredits = parseNonnegativeInteger(adminSmsCredits);
    if (
      !name ||
      phone.length < 7 ||
      phone.length > 12 ||
      users.some((user) => normalizeDigits(user.phone) === phone) ||
      userPin.length !== 4 ||
      !Number.isFinite(balance) ||
      balance < 0 ||
      !Number.isFinite(premiumDays) ||
      !Number.isFinite(boldDays) ||
      !Number.isFinite(smsCredits)
    ) {
      setAdminError('Revisa el nombre, celular único, PIN, saldo y cupos.');
      return;
    }
    const now = Date.now();
    const user: DemoUser = {
      id: `davi-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      documentType: adminDocumentType,
      documentNumber: generateDocumentNumber(users),
      phone,
      pin: userPin,
      balance,
      createdAt: new Date(now).toISOString(),
      displayBalance: null,
      premiumExpiresAt: entitlementExpiry(premiumDays, now),
      premiumEnabled: false,
      boldExpiresAt: entitlementExpiry(boldDays, now),
      boldEnabled: false,
      smsCredits,
      smsEnabled: false,
      blocked: false,
      isTrial: false,
      trialExpiresAt: null,
    };
    setUsers((current) => [...current, user]);
    setCreatedUserId(user.id);
    setAdminName('');
    setAdminPhone('');
    setAdminPin('');
    setAdminBalance('0');
    setAdminPremiumDays('0');
    setAdminBoldDays('0');
    setAdminSmsCredits('0');
    setAdminError('');
  };

  const createTestUser = () => {
    const now = Date.now();
    const user: DemoUser = {
      id: `davi-trial-${now}-${Math.random().toString(36).slice(2, 7)}`,
      name: 'Prueba',
      documentType: 'Cédula de Ciudadanía',
      documentNumber: generateDocumentNumber(users),
      phone: generateUniquePhone(users),
      pin: String(Math.floor(1000 + Math.random() * 9000)),
      balance: 5_000,
      createdAt: new Date(now).toISOString(),
      displayBalance: null,
      premiumExpiresAt: null,
      premiumEnabled: false,
      boldExpiresAt: null,
      boldEnabled: false,
      smsCredits: 0,
      smsEnabled: false,
      blocked: false,
      isTrial: true,
      trialExpiresAt: now + TRIAL_DURATION_MS,
    };
    setUsers((current) => [...current, user]);
    setCreatedUserId(user.id);
    setToast('Usuario Prueba creado. Se eliminará en una hora.');
  };

  const copyProfileDetails = async (user: DemoUser) => {
    const premiumDays = entitlementDaysRemaining(user.premiumExpiresAt, entitlementClock);
    const boldDays = entitlementDaysRemaining(user.boldExpiresAt, entitlementClock);
    const trialExpiry = user.trialExpiresAt
      ? new Date(user.trialExpiresAt).toLocaleString('es-CO')
      : '';
    const details = [
      `Nombre: ${user.name}`,
      `Tipo de documento: ${user.documentType}`,
      `Cédula: ${user.documentNumber}`,
      `Celular: ${user.phone}`,
      `PIN: ${user.pin}`,
      `Saldo total: ${money(user.balance)}`,
      `Saldo mostrado: ${money(user.displayBalance === null ? user.balance : Math.min(user.balance, user.displayBalance))}`,
      `Premium: ${user.premiumEnabled && premiumDays > 0 ? 'Activado' : 'Desactivado'} · ${premiumDays} días`,
      `Bold: ${user.boldEnabled && boldDays > 0 ? 'Activado' : 'Desactivado'} · ${boldDays} días`,
      `SMS: ${user.smsEnabled && user.smsCredits > 0 ? 'Activado' : 'Desactivado'} · ${user.smsCredits} créditos`,
      `Acceso: ${user.blocked ? 'Bloqueado' : 'Activo'}`,
      ...(user.isTrial ? [`Usuario temporal: vence ${trialExpiry}`] : []),
    ].join('\n');
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(details);
      } else {
        const field = document.createElement('textarea');
        field.value = details;
        field.style.position = 'fixed';
        field.style.opacity = '0';
        document.body.appendChild(field);
        field.select();
        const copied = document.execCommand('copy');
        field.remove();
        if (!copied) throw new Error('clipboard unavailable');
      }
      setToast('Datos del usuario copiados.');
    } catch {
      setToast('No se pudieron copiar los datos en este navegador.');
    }
  };

  const startEditingUser = (user: DemoUser) => {
    setEditingUserId(user.id);
    setAdminEdit({
      name: user.name,
      documentType: user.documentType,
      documentNumber: user.documentNumber,
      phone: user.phone,
      pin: user.pin,
      balance: String(user.balance),
      displayBalance: user.displayBalance === null ? '' : String(user.displayBalance),
      premiumDays: String(entitlementDaysRemaining(user.premiumExpiresAt, entitlementClock)),
      originalPremiumDays: String(entitlementDaysRemaining(user.premiumExpiresAt, entitlementClock)),
      boldDays: String(entitlementDaysRemaining(user.boldExpiresAt, entitlementClock)),
      originalBoldDays: String(entitlementDaysRemaining(user.boldExpiresAt, entitlementClock)),
      smsCredits: String(user.smsCredits),
    });
    setAdminEditError('');
  };

  const saveAdminUserEdit = (event: React.FormEvent<HTMLFormElement>, userId: string) => {
    event.preventDefault();
    if (!adminEdit) return;
    const currentUser = users.find((user) => user.id === userId);
    if (!currentUser) return;
    const name = currentUser.isTrial ? 'Prueba' : adminEdit.name.trim();
    const documentNumber = normalizeDigits(adminEdit.documentNumber);
    const phone = normalizeDigits(adminEdit.phone);
    const userPin = normalizeDigits(adminEdit.pin);
    const balance = parseLocalizedAmount(adminEdit.balance);
    const displayBalance = adminEdit.displayBalance.trim()
      ? parseLocalizedAmount(adminEdit.displayBalance)
      : null;
    const premiumDays = parseNonnegativeInteger(adminEdit.premiumDays);
    const boldDays = parseNonnegativeInteger(adminEdit.boldDays);
    const smsCredits = parseNonnegativeInteger(adminEdit.smsCredits);
    const duplicateDocument = users.some(
      (user) => user.id !== userId && user.documentNumber === documentNumber,
    );
    const duplicatePhone = users.some(
      (user) => user.id !== userId && normalizeDigits(user.phone) === phone,
    );
    if (
      !name ||
      documentNumber.length < 5 ||
      (!documentNumber.startsWith('1') && documentNumber !== currentUser.documentNumber) ||
      duplicateDocument ||
      phone.length < 7 ||
      phone.length > 12 ||
      duplicatePhone ||
      userPin.length !== 4 ||
      !Number.isFinite(balance) ||
      balance < 0 ||
      (displayBalance !== null && (!Number.isFinite(displayBalance) || displayBalance < 0)) ||
      !Number.isFinite(premiumDays) ||
      !Number.isFinite(boldDays) ||
      !Number.isFinite(smsCredits)
    ) {
      setAdminEditError('Revisa los datos, los cupos y que el celular o la cédula no estén repetidos.');
      return;
    }

    const now = Date.now();
    const premiumExpiresAt = adminEdit.premiumDays === adminEdit.originalPremiumDays
      ? currentUser.premiumExpiresAt
      : entitlementExpiry(premiumDays, now);
    const boldExpiresAt = adminEdit.boldDays === adminEdit.originalBoldDays
      ? currentUser.boldExpiresAt
      : entitlementExpiry(boldDays, now);
    const updatedUser: DemoUser = {
      ...currentUser,
      name,
      documentType: adminEdit.documentType,
      documentNumber,
      phone,
      pin: userPin,
      balance,
      displayBalance,
      premiumExpiresAt,
      premiumEnabled: currentUser.premiumEnabled && entitlementDaysRemaining(premiumExpiresAt, now) > 0,
      boldExpiresAt,
      boldEnabled: currentUser.boldEnabled && entitlementDaysRemaining(boldExpiresAt, now) > 0,
      smsCredits,
      smsEnabled: currentUser.smsEnabled && smsCredits > 0,
    };
    setUsers((current) => current.map((user) => user.id === userId ? updatedUser : user));
    if (activeProfileId === userId) {
      setData((current) => ({ ...current, balance }));
    }
    try {
      const storageKey = `${STORAGE_KEY}:${userId}`;
      const rawData = localStorage.getItem(storageKey);
      const parsed = rawData ? JSON.parse(rawData) as Partial<DemoData> : null;
      const accountData: DemoData = parsed &&
        typeof parsed.balance === 'number' &&
        Array.isArray(parsed.contacts) &&
        Array.isArray(parsed.movements)
        ? { balance, contacts: parsed.contacts, movements: parsed.movements }
        : { balance, contacts: initialContacts, movements: [] };
      localStorage.setItem(storageKey, JSON.stringify(accountData));
    } catch {
      // The updated profile remains usable in memory if browser storage fails.
    }
    setEditingUserId(null);
    setAdminEdit(null);
    setAdminEditError('');
    setToast('Perfil actualizado.');
  };

  const cancelEditingUser = () => {
    setEditingUserId(null);
    setAdminEdit(null);
    setAdminEditError('');
  };

  const toggleAdminUserBlocked = (user: DemoUser) => {
    setUsers((current) => current.map((item) => item.id === user.id ? { ...item, blocked: !user.blocked } : item));
    setToast(user.blocked ? 'Acceso del usuario habilitado.' : 'Acceso del usuario bloqueado.');
  };

  const deleteAdminUser = (user: DemoUser) => {
    if (!window.confirm(`¿Eliminar el usuario ${user.name} y sus datos de demostración?`)) return;
    removeUserLocalData(user.id);
    setUsers((current) => current.filter((item) => item.id !== user.id));
    if (createdUserId === user.id) setCreatedUserId(null);
    if (editingUserId === user.id) cancelEditingUser();
    if (activeProfileId === user.id) {
      setActiveProfileId(null);
      if (screen !== 'admin') setScreen('onboarding');
    }
    setToast('Usuario eliminado.');
  };

  const resetDisplayedBalance = (userId: string) => {
    setUsers((current) => current.map((user) => user.id === userId ? { ...user, displayBalance: null } : user));
    setAdminEdit((current) => current ? { ...current, displayBalance: '' } : current);
    setToast('Se restableció el saldo total para mostrar.');
  };

  const updateOwnDisplayedBalance = (value: string) => {
    setDisplayBalanceDraft(value);
    if (!activeProfile || !value.trim()) return;

    const parsed = parseLocalizedAmount(value);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    const nextBalance = Math.min(activeProfile.balance, parsed);
    setUsers((current) => current.map((user) =>
      user.id === activeProfile.id ? { ...user, displayBalance: nextBalance } : user,
    ));
    if (parsed > activeProfile.balance) {
      setDisplayBalanceDraft(String(activeProfile.balance));
      setToast('El saldo mostrado no puede superar el saldo total.');
    }
  };

  const toggleProfileFeature = (feature: 'premium' | 'bold' | 'sms') => {
    if (!activeProfile || activeProfile.blocked || isTrialExpired(activeProfile)) return;
    const available = feature === 'premium'
      ? entitlementDaysRemaining(activeProfile.premiumExpiresAt, Date.now()) > 0
      : feature === 'bold'
        ? entitlementDaysRemaining(activeProfile.boldExpiresAt, Date.now()) > 0
        : activeProfile.smsCredits > 0;
    if (!available) {
      setToast(feature === 'sms' ? 'No tienes créditos SMS disponibles.' : 'No tienes días disponibles para esta opción.');
      return;
    }
    setUsers((current) => current.map((user) => {
      if (user.id !== activeProfile.id) return user;
      if (feature === 'premium') return { ...user, premiumEnabled: !user.premiumEnabled };
      if (feature === 'bold') return { ...user, boldEnabled: !user.boldEnabled };
      return { ...user, smsEnabled: !user.smsEnabled };
    }));
  };

  const returnToOnboarding = () => {
    setActiveProfileId(null);
    try {
      localStorage.removeItem(ACTIVE_PROFILE_STORAGE_KEY);
    } catch {
      // The screen still returns to document entry in this session.
    }
    setDocumentType('');
    setDocumentTypeOpen(true);
    setDocumentNumber('');
    setLoginPhone('');
    setOnboardingError('');
    setScreen('onboarding');
  };

  const leaveAdmin = () => {
    void fetch('/api/daviplata/admin/session', { method: 'DELETE', credentials: 'same-origin' }).catch(() => {});
    const url = new URL(window.location.href);
    url.pathname = url.pathname.replace(/\/admin\/?$/, '/') || '/';
    url.searchParams.delete('admin');
    window.history.replaceState({}, '', url);
    setAdminAuthStatus('locked');
    setAdminAccessPin('');
    const signedInUser = users.find((user) => user.id === activeProfileId);
    if (signedInUser && !signedInUser.blocked && !(signedInUser.isTrial && signedInUser.trialExpiresAt !== null && signedInUser.trialExpiresAt <= Date.now())) {
      setScreen('welcome');
    } else {
      setActiveProfileId(null);
      setScreen('onboarding');
    }
  };

  const submitAdminAccess = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAdminAccessError('');
    setAdminAuthStatus('checking');
    try {
      const response = await fetch('/api/daviplata/admin/session', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: adminAccessPin }),
      });
      if (!response.ok) {
        setAdminAuthStatus('locked');
        setAdminAccessError(response.status === 503
          ? 'El acceso del panel aún no está configurado.'
          : response.status === 429
            ? 'Demasiados intentos. Espera antes de volver a probar.'
            : 'PIN incorrecto.');
        return;
      }
      const result = await response.json() as { authenticated?: boolean };
      if (!result.authenticated) {
        setAdminAuthStatus('locked');
        setAdminAccessError('No se pudo abrir la sesión del panel.');
        return;
      }
      setAdminAccessPin('');
      setAdminAuthStatus('unlocked');
    } catch {
      setAdminAuthStatus('locked');
      setAdminAccessError('No se pudo verificar el PIN. Intenta de nuevo.');
    }
  };

  const openUserQr = (returnTo: Screen) => {
    setQrReturnTo(returnTo);
    go('user-qr');
  };

  const openQrOptions = (returnTo: Screen) => {
    setQrReturnTo(returnTo);
    setSheet('qr-options');
  };

  const startTransfer = () => {
    transferLookupAbortRef.current?.abort();
    transferLookupAbortRef.current = null;
    setRail('daviplata');
    setTransferKey('');
    setVerifiedRecipient(null);
    setRecipientName('');
    setDestinationBank('DaviPlata');
    setDestinationAccountType('');
    setTransferMessage('');
    setAmountText('');
    setTransferError('');
    setTransferNotice('');
    setTransferLookupBusy(false);
    go('transfer');
  };

  const continueFromKey = async () => {
    const cleanedKey = transferKey.trim();
    const digits = transferKey.replace(/\D/g, '');
    const isValid = rail === 'breb'
      ? cleanedKey.length >= 5 && cleanedKey.length <= 80 && !/[\u0000-\u001f\u007f]/.test(cleanedKey)
      : rail === 'davivienda' || rail === 'banks'
        ? digits.length >= 6 && digits.length <= 20 &&
          Boolean(destinationAccountType) && Boolean(recipientName.trim()) &&
          (rail !== 'banks' || Boolean(destinationBank))
        : digits.length === 10;
    if (!isValid) {
      setTransferError(rail === 'breb'
        ? 'Ingresa una llave de prueba de mínimo 5 caracteres.'
        : rail === 'davivienda' || rail === 'banks'
          ? rail === 'banks'
            ? 'Elige el banco y el tipo de cuenta, y completa el número y el nombre.'
            : 'Elige el tipo de cuenta y completa el número y el nombre del destinatario.'
          : 'Ingresa un número celular de 10 dígitos.');
      return;
    }
    const matchingContact = findMatchingRecipient(cleanedKey);
    if (matchingContact) {
      setRecipientName(matchingContact.name);
      setDestinationBank(matchingContact.bank);
      setTransferError('');
      setTransferNotice('');
      go('amount');
      return;
    }
    if (rail === 'breb') {
      if (!activeProfile?.premiumEnabled || activeProfile.blocked) {
        setTransferError('Activa Premium para consultar el nombre y la entidad de una llave Bre-B.');
        return;
      }
      setTransferLookupBusy(true);
      setTransferError('');
      const controller = new AbortController();
      transferLookupAbortRef.current?.abort();
      transferLookupAbortRef.current = controller;
      try {
        const result = await lookupDaviplataBrebKey(cleanedKey, controller.signal);
        if (controller.signal.aborted) return;
        const recipient: DemoContact = {
          id: `breb-lookup-${cleanedKey.toLocaleLowerCase('es')}`,
          name: result.name,
          key: cleanedKey,
          bank: result.bank,
          rail: 'breb',
        };
        setVerifiedRecipient(recipient);
        setRecipientName(result.name);
        setDestinationBank(result.bank);
        setTransferNotice('');
        go('amount');
      } catch (error) {
        if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) return;
        setTransferError(error instanceof Error
          ? error.message
          : 'No se pudo consultar la llave Bre-B. Intenta de nuevo.');
      } finally {
        if (transferLookupAbortRef.current === controller) {
          transferLookupAbortRef.current = null;
          setTransferLookupBusy(false);
        }
      }
      return;
    }
    if (!matchingContact) {
      setTransferError(recipientRequiredMessage);
      return;
    }
  };

  const parseAmount = () => {
    const value = amountText.trim().replace(/\s/g, '');
    if (!value) return Number.NaN;

    const hasComma = value.includes(',');
    const hasDot = value.includes('.');
    let normalized = value;

    if (hasComma && hasDot) {
      const decimalSeparator = value.lastIndexOf(',') > value.lastIndexOf('.') ? ',' : '.';
      const decimalIndex = value.lastIndexOf(decimalSeparator);
      const whole = value.slice(0, decimalIndex).replace(/[.,]/g, '');
      const fraction = value.slice(decimalIndex + 1).replace(/[.,]/g, '');
      normalized = `${whole}.${fraction}`;
    } else if (hasComma || hasDot) {
      const separator = hasComma ? ',' : '.';
      const groupedThousands = /^[0-9]{1,3}(?:[.,][0-9]{3})+$/.test(value);
      if (groupedThousands) {
        normalized = value.replace(/[.,]/g, '');
      } else {
        const decimalIndex = value.lastIndexOf(separator);
        const whole = value.slice(0, decimalIndex).replace(/[.,]/g, '');
        const fraction = value.slice(decimalIndex + 1);
        normalized = `${whole}.${fraction}`;
      }
    }

    if (!/^\d+(?:\.\d+)?$/.test(normalized)) return Number.NaN;
    return Number(normalized);
  };

  const continueToConfirmation = () => {
    if (!findMatchingRecipient()) {
      setTransferError(recipientRequiredMessage);
      setConfirmOpen(false);
      return;
    }
    const value = parseAmount();
    if (!Number.isFinite(value) || value <= 0) {
      setTransferError('Ingresa un valor mayor que $0.');
      return;
    }
    if (value > effectiveBalance) {
      setTransferError('El valor supera el saldo simulado disponible.');
      return;
    }
    if (value > 3_000_000) {
      setTransferError('El máximo de este ensayo es $3.000.000.');
      return;
    }
    setTransferError('');
    setConfirmOpen(true);
  };

  const finishTransfer = () => {
    if (processing) return;
    const savedRecipient = findMatchingRecipient();
    if (!savedRecipient) {
      setConfirmOpen(false);
      setTransferError(recipientRequiredMessage);
      setScreen('transfer');
      return;
    }
    const value = parseAmount();
    if (!Number.isFinite(value) || value <= 0 || value > effectiveBalance) {
      setConfirmOpen(false);
      setTransferError('El valor supera el saldo simulado disponible.');
      setScreen('transfer');
      return;
    }
    const now = new Date();
    const id = `DUSA-DEMO-${now.toISOString().slice(0, 10).replaceAll('-', '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const movement: DemoMovement = {
      id,
      date: now.toISOString(),
      direction: 'sent',
      rail,
      amount: value,
      recipient: savedRecipient.name,
      key: transferKey,
      bank: savedRecipient.bank,
      message: transferMessage.trim(),
      ...((rail === 'davivienda' || rail === 'banks') && destinationAccountType ? { accountType: destinationAccountType } : {}),
      approvalNumber: String(Math.floor(100000 + Math.random() * 900000)),
    };
    setConfirmOpen(false);
    setProcessingStage('working');
    setProcessing(true);
    window.setTimeout(() => {
      setProcessingStage('success');
      if (successSoundRef.current) {
        successSoundRef.current.currentTime = 0;
        successSoundRef.current.volume = 0.8;
        void successSoundRef.current.play().catch(() => {});
      }
      window.setTimeout(() => {
        setData((current) => ({
          ...current,
          balance: Math.max(0, current.balance - value),
          movements: [movement, ...current.movements],
        }));
        if (activeProfileId) {
          setUsers((current) => current.map((user) => {
            if (user.id !== activeProfileId) return user;
            const smsCredits = user.smsEnabled && user.smsCredits > 0
              ? user.smsCredits - 1
              : user.smsCredits;
            return {
              ...user,
              displayBalance: user.displayBalance === null
                ? null
                : Math.max(0, user.displayBalance - value),
              smsCredits,
              smsEnabled: user.smsEnabled && smsCredits > 0,
            };
          }));
        }
        setCurrentMovement(movement);
        setProcessing(false);
        setScreen('receipt');
      }, 950);
    }, 2500);
  };

  const openMovementReceipt = (movement: DemoMovement) => {
    setCurrentMovement(movement);
    go('movement-detail');
  };

  const cancelMovementHold = () => {
    if (movementHoldTimerRef.current !== null) {
      window.clearTimeout(movementHoldTimerRef.current);
      movementHoldTimerRef.current = null;
    }
    movementHoldOriginRef.current = null;
  };

  const beginMovementHold = (movement: DemoMovement, x: number, y: number) => {
    cancelMovementHold();
    movementClickSuppressionRef.current = false;
    if (movementClickSuppressionTimerRef.current !== null) {
      window.clearTimeout(movementClickSuppressionTimerRef.current);
      movementClickSuppressionTimerRef.current = null;
    }
    movementHoldOriginRef.current = { x, y };
    movementHoldTimerRef.current = window.setTimeout(() => {
      movementHoldTimerRef.current = null;
      movementHoldOriginRef.current = null;
      movementClickSuppressionRef.current = true;
      const direction = movement.direction === 'sent' ? 'enviado a' : 'recibido de';
      const confirmed = window.confirm(
        `¿Eliminar el movimiento ${direction} ${movement.recipient} por ${shortMoney(movement.amount)}?`,
      );
      if (confirmed) {
        setData((current) => ({
          ...current,
          movements: current.movements.filter((item) => item.id !== movement.id),
        }));
      }
      movementClickSuppressionTimerRef.current = window.setTimeout(() => {
        movementClickSuppressionRef.current = false;
        movementClickSuppressionTimerRef.current = null;
      }, 1000);
    }, 650);
  };

  const moveMovementHold = (x: number, y: number) => {
    const origin = movementHoldOriginRef.current;
    if (origin && Math.hypot(x - origin.x, y - origin.y) > 12) cancelMovementHold();
  };

  const handleMovementClick = (movement: DemoMovement) => {
    if (movementClickSuppressionRef.current) {
      movementClickSuppressionRef.current = false;
      if (movementClickSuppressionTimerRef.current !== null) {
        window.clearTimeout(movementClickSuppressionTimerRef.current);
        movementClickSuppressionTimerRef.current = null;
      }
      return;
    }
    openMovementReceipt(movement);
  };

  const handleQrDecoded = async (rawValue: string, signal?: AbortSignal) => {
    if (scanPurpose === 'receipt') {
      if (rawValue.includes('DAVI-USA-SIMULADOR') && rawValue.includes('SIMULACIÓN')) {
        setToast('Comprobante de demostración reconocido localmente.');
        go(qrReturnTo);
        return true;
      }
      return 'Este QR no es un comprobante de esta simulación. No se consultó ningún servicio externo.';
    }

    const paymentQr = parseBrebQrPayload(rawValue);
    if (!paymentQr?.identifier || paymentQr.identifier.length < 5 || paymentQr.identifier.length > 80) {
      return 'No se encontró una llave Bre-B legible en el QR.';
    }
    const key = paymentQr.identifier.trim();
    const savedRecipient = data.contacts.find((contact) =>
      recipientRail(contact) === 'breb' &&
      contact.key.trim().toLocaleLowerCase('es') === key.toLocaleLowerCase('es'),
    );
    let resolvedName = savedRecipient?.name || paymentQr.name;
    let resolvedBank = savedRecipient?.bank || '';
    let notice = '';

    if (!savedRecipient && activeProfile?.premiumEnabled && !activeProfile.blocked) {
      try {
        const result = await lookupDaviplataBrebKey(key, signal);
        if (signal?.aborted) return true;
        resolvedName = resolvedName || result.name;
        resolvedBank = result.bank;
      } catch (error) {
        if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) return true;
        notice = 'No se pudo verificar completamente este QR. Revisa el nombre y la entidad antes de continuar.';
      }
    } else if (!savedRecipient) {
      notice = 'Premium permite consultar el nombre y la entidad. Se conservaron los datos incluidos en el QR.';
    }

    const recipient: DemoContact = {
      id: savedRecipient?.id ?? `breb-qr-${Date.now()}`,
      name: resolvedName || 'Nombre no disponible',
      key,
      bank: resolvedBank || 'Entidad Bre-B',
      rail: 'breb',
    };
    setVerifiedRecipient(recipient);
    setRail('breb');
    setTransferKey(recipient.key);
    setRecipientName(recipient.name);
    setDestinationBank(recipient.bank);
    setTransferMessage('');
    setAmountText('');
    setTransferError('');
    setTransferNotice(notice);
    go('amount');
    return true;
  };

  const addDemoAmount = (kind: 'meter' | 'withdraw', value: number) => {
    if (!Number.isFinite(value) || value <= 0) {
      setToast('Usa un valor válido para la demostración.');
      return;
    }
    if (kind === 'withdraw' && value > effectiveBalance) {
      setToast('El valor supera el saldo simulado.');
      return;
    }
    const movement: DemoMovement = {
      id: `DUSA-DEMO-${Date.now()}`,
      date: new Date().toISOString(),
      direction: kind === 'meter' ? 'received' : 'sent',
      rail: 'daviplata',
      amount: value,
      recipient: kind === 'meter' ? 'Ingreso de práctica' : 'Retiro de práctica',
      key: 'Solo simulación',
      bank: 'DaviPlata USA',
      message: '',
    };
    setData((current) => ({
      ...current,
      balance: kind === 'meter' ? current.balance + value : Math.max(0, current.balance - value),
      movements: [movement, ...current.movements],
    }));
    if (activeProfileId) {
      setUsers((current) => current.map((user) => user.id === activeProfileId
        ? {
            ...user,
            displayBalance: user.displayBalance === null
              ? null
              : Math.max(0, user.displayBalance + (kind === 'meter' ? value : -value)),
          }
        : user));
    }
    setSheet(null);
    setToast('Movimiento de demostración guardado.');
  };

  const addKeyDigit = (digit: string) => {
    if (pin.length >= 4 || accessAnimation || pinErrorOpen) return;
    const next = pin + digit;
    setPin(next);
    if (next.length === 4) {
      window.setTimeout(() => {
        if (!activeProfile || next === activeProfile.pin) {
          setAccessAnimation('home-dark');
        } else {
          setAccessAnimation('wrong-pin');
        }
      }, 260);
    }
  };

  const removePinDigit = () => {
    if (accessAnimation || pinErrorOpen) return;
    setPin((current) => current.slice(0, -1));
  };

  const retryPin = () => {
    setPinErrorOpen(false);
    setPin('');
  };

  const showPinRecovery = () => {
    setPinErrorOpen(false);
    setPin('');
    setToast('La recuperación de clave es una función de demostración.');
  };

  const startFingerprintDemo = async () => {
    if (activeProfile && (activeProfile.blocked || isTrialExpired(activeProfile))) {
      const expired = isTrialExpired(activeProfile);
      if (expired) {
        removeUserLocalData(activeProfile.id);
        setUsers((current) => current.filter((user) => user.id !== activeProfile.id));
      }
      returnToOnboarding();
      setToast(expired ? 'El usuario de prueba venció y fue eliminado.' : 'El acceso de este usuario está bloqueado.');
      return;
    }
    if (!window.isSecureContext || typeof window.PublicKeyCredential === 'undefined' || !navigator.credentials) {
      setToast('La huella no está disponible aquí. Usa tu PIN para ingresar.');
      return;
    }

    const storageKey = `davi-usa:biometric:${activeProfileId ?? 'demo-profile'}`;
    try {
      const savedCredentialId = localStorage.getItem(storageKey);
      if (savedCredentialId) {
        const assertion = await navigator.credentials.get({
          publicKey: {
            challenge: makeWebAuthnChallenge(),
            rpId: window.location.hostname,
            allowCredentials: [{ type: 'public-key', id: decodeCredentialId(savedCredentialId) }],
            userVerification: 'required',
            timeout: 60_000,
          },
        }) as PublicKeyCredential | null;
        if (!assertion || encodeCredentialId(assertion.rawId) !== savedCredentialId) {
          throw new Error('Credential mismatch');
        }
      } else {
        const credential = await navigator.credentials.create({
          publicKey: {
            challenge: makeWebAuthnChallenge(),
            rp: { name: 'DaviPlata USA · Simulador', id: window.location.hostname },
            user: {
              id: new TextEncoder().encode(activeProfileId ?? 'davi-usa-demo-profile'),
              name: 'usuario-demo',
              displayName: 'DaviPlata USA · Simulador',
            },
            pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
            authenticatorSelection: {
              authenticatorAttachment: 'platform',
              residentKey: 'preferred',
              userVerification: 'required',
            },
            timeout: 60_000,
            attestation: 'none',
          },
        }) as PublicKeyCredential | null;
        if (!credential) throw new Error('Credential creation cancelled');
        localStorage.setItem(storageKey, encodeCredentialId(credential.rawId));
      }
      setAccessAnimation('home-dark');
    } catch (error) {
      const cancelled = error instanceof DOMException && error.name === 'NotAllowedError';
      setToast(cancelled
        ? 'No se completó la verificación de huella.'
        : 'No fue posible verificar la huella en este dispositivo.');
    }
  };

  const receiptPayload = currentMovement
    ? [
        'DAVI-USA-SIMULADOR',
        'SIMULACIÓN — NO ES UN PAGO REAL',
        `APROBACIÓN:${currentMovement.approvalNumber ?? currentMovement.id.replace(/\D/g, '').slice(-6).padStart(6, '0')}`,
        `VALOR:${transferMoney(currentMovement.amount)}`,
        `DESTINO:${currentMovement.bank}`,
        ...(currentMovement.accountType ? [`TIPO_CUENTA:${currentMovement.accountType}`] : []),
        `BENEFICIARIO:${currentMovement.recipient}`,
        `REFERENCIA:${currentMovement.key}`,
        `FECHA:${currentMovement.date}`,
      ].join('|')
    : 'DAVI-USA-SIMULADOR|SIMULACIÓN — NO ES UN PAGO REAL';

  const shareMovementDetails = async () => {
    if (!currentMovement) return;
    const action = currentMovement.direction === 'sent' ? 'Pasó Plata' : 'Recibió Plata';
    const reference = currentMovement.rail === 'daviplata'
      ? `Al número ${formatMovementReference(currentMovement)}`
      : `A la llave ${formatMovementReference(currentMovement)}`;
    const details = [
      `${action} por ${movementRailName(currentMovement.rail)}`,
      `${reference} ${currentMovement.direction === 'received' ? 'desde' : 'de'} ${currentMovement.bank}`,
      `Valor: ${shortMoney(currentMovement.amount)}`,
      `Fecha y hora: ${movementDetailDateTime(currentMovement.date)}`,
      `Número de autorización: ${currentMovement.approvalNumber ?? currentMovement.id.replace(/\D/g, '').slice(-6).padStart(6, '0')}`,
      'SIMULACIÓN — NO ES UN PAGO REAL',
    ].join('\n');

    try {
      if (navigator.share) {
        await navigator.share({ title: 'Movimiento simulado', text: details });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(details);
        setToast('Resumen del movimiento copiado.');
      } else {
        setToast('Compartir no está disponible en este navegador.');
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setToast('No se pudo compartir el movimiento.');
      }
    }
  };

  const shareReceipt = async () => {
    const exportNode = document.querySelector<HTMLElement>('[data-testid="receipt-export"]');
    if (!exportNode) {
      setToast('No se encontró el comprobante para compartir.');
      return;
    }

    try {
      const imageUrl = await toPng(exportNode, {
        backgroundColor: '#f1f2f6',
        cacheBust: true,
        pixelRatio: 3,
        filter: (node) => !(node instanceof HTMLElement && node.classList.contains('receipt-share-control')),
      });
      const imageBlob = await (await fetch(imageUrl)).blob();
      const imageFile = new File([imageBlob], 'comprobante-daviplata-simulado.png', { type: 'image/png' });
      const shareData = {
        title: 'Comprobante simulado',
        text: 'SIMULACIÓN — NO ES UN PAGO REAL.',
        files: [imageFile],
      };

      if (navigator.share && navigator.canShare?.({ files: [imageFile] })) {
        await navigator.share(shareData);
      } else {
        const download = document.createElement('a');
        download.href = imageUrl;
        download.download = imageFile.name;
        download.click();
        setToast('Comprobante simulado descargado como imagen.');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setToast('No se pudo generar la imagen del comprobante.');
    }
  };

  const currentBalance = hiddenBalance ? '$ • • • • •' : money(effectiveBalance);

  return (
    <div className={`davi-app screen-${screen}`}>
      {screen === 'onboarding' && (
        <main className="onboarding-screen">
          <div className="onboarding-logo"><DaviLogo /></div>
          <h1>Ingresa tus datos</h1>
          <div className={`document-picker ${documentTypeOpen ? 'is-open' : ''}`}>
            <button
              type="button"
              className="document-picker-trigger"
              aria-expanded={documentTypeOpen}
              onClick={() => setDocumentTypeOpen((open) => !open)}
            >
              <span>{documentType || 'Tipo de documento'}</span>
              <ChevronDown size={22} />
            </button>
            {documentTypeOpen && (
              <div className="document-picker-options">
                {documentTypes.map((type) => (
                  <button
                    type="button"
                    key={type}
                    onClick={() => {
                      setDocumentType(type);
                      setDocumentTypeOpen(false);
                      setOnboardingError('');
                    }}
                  >
                    {type}
                  </button>
                ))}
              </div>
            )}
          </div>
          <label className="onboarding-field">
            <span className="sr-only">Número de documento</span>
            <input
              inputMode="numeric"
              autoComplete="off"
              value={documentNumber}
              onChange={(event) => {
                setDocumentNumber(normalizeDigits(event.target.value));
                setOnboardingError('');
              }}
              placeholder="Número de documento"
            />
          </label>
          <label className="onboarding-field">
            <span className="sr-only">Número de celular</span>
            <input
              inputMode="tel"
              autoComplete="tel"
              value={loginPhone}
              onChange={(event) => {
                setLoginPhone(normalizeDigits(event.target.value));
                setOnboardingError('');
              }}
              placeholder="Número de Celular"
            />
          </label>
          {onboardingError && <p className="onboarding-error" role="alert">{onboardingError}</p>}
          <button
            className="red-button onboarding-continue"
            onClick={continueFromOnboarding}
            disabled={
              !documentType ||
              normalizeDigits(documentNumber).length < 5 ||
              normalizeDigits(loginPhone).length < 7
            }
          >
            Continuar
          </button>
        </main>
      )}

      {screen === 'admin' && (adminAuthStatus === 'unlocked' ? (
        <main className="admin-screen">
          <header className="admin-header">
            <button className="plain-icon" onClick={leaveAdmin} aria-label="Ir al ingreso"><ArrowLeft size={23} /></button>
            <DaviLogo />
            <span />
          </header>
          <h1>Panel de administración</h1>
          <p className="admin-intro">Crea perfiles de prueba para el simulador DaviPlata USA.</p>
          <form className="admin-create-form" onSubmit={createAdminUser}>
            <label>
              Nombre
              <input required value={adminName} onChange={(event) => setAdminName(event.target.value)} placeholder="Nombre del usuario" />
            </label>
            <label>
              Tipo de documento
              <select value={adminDocumentType} onChange={(event) => setAdminDocumentType(event.target.value as DocumentType)}>
                {documentTypes.map((type) => <option value={type} key={type}>{type}</option>)}
              </select>
            </label>
            <label>
              Número de celular
              <input required inputMode="tel" value={adminPhone} onChange={(event) => setAdminPhone(normalizeDigits(event.target.value))} placeholder="Número elegido por ti" />
            </label>
            <label>
              PIN de 4 dígitos
              <input required inputMode="numeric" maxLength={4} value={adminPin} onChange={(event) => setAdminPin(normalizeDigits(event.target.value).slice(0, 4))} placeholder="Elige el PIN" />
            </label>
            <label>
              Balance inicial
              <input required inputMode="decimal" value={adminBalance} onChange={(event) => setAdminBalance(event.target.value)} placeholder="0" />
            </label>
            <label>
              Premium · días
              <input type="number" min="0" step="1" value={adminPremiumDays} onChange={(event) => setAdminPremiumDays(event.target.value)} />
            </label>
            <label>
              Bold · días
              <input type="number" min="0" step="1" value={adminBoldDays} onChange={(event) => setAdminBoldDays(event.target.value)} />
            </label>
            <label>
              SMS · créditos
              <input type="number" min="0" step="1" value={adminSmsCredits} onChange={(event) => setAdminSmsCredits(event.target.value)} />
            </label>
            <p className="admin-hint">La cédula se genera al azar al crear el perfil.</p>
            <p className="admin-data-note">Se guardan solo en este navegador. Usa datos y PIN ficticios, nunca claves reales.</p>
            {adminError && <p className="admin-error" role="alert">{adminError}</p>}
            <button className="red-button" type="submit">Crear usuario</button>
          </form>
          <button className="red-button admin-test-user-button" type="button" onClick={createTestUser}>
            Crear usuario de prueba · 1 hora
          </button>
          {createdUser && (
            <section className="admin-created" aria-live="polite">
              <strong>{createdUser.isTrial ? 'Usuario de prueba creado' : 'Usuario creado'}</strong>
              <span>Cédula: {createdUser.documentNumber}</span>
              <span>Celular: {createdUser.phone}</span>
              <span>Saldo: {money(createdUser.balance)}</span>
              <span>Premium: {entitlementDaysRemaining(createdUser.premiumExpiresAt, entitlementClock)} días · {createdUser.premiumEnabled ? 'activado' : 'desactivado'}</span>
              <span>Bold: {entitlementDaysRemaining(createdUser.boldExpiresAt, entitlementClock)} días · {createdUser.boldEnabled ? 'activado' : 'desactivado'}</span>
              <span>SMS: {createdUser.smsCredits} créditos · {createdUser.smsEnabled ? 'activado' : 'desactivado'}</span>
              {createdUser.isTrial && createdUser.trialExpiresAt && (
                <span>Se elimina: {new Date(createdUser.trialExpiresAt).toLocaleString('es-CO')}</span>
              )}
              <span>PIN inicial: {createdUser.pin}</span>
              <button className="admin-copy-button" type="button" onClick={() => void copyProfileDetails(createdUser)}>Copiar todos los datos</button>
            </section>
          )}
          <section className="admin-users">
            <h2>Usuarios creados</h2>
            {users.length ? users.map((user) => (
              <article className="admin-user-row" key={user.id}>
                <strong>{user.name}</strong>
                <span>{user.documentType}: {user.documentNumber}</span>
                <span>Celular: {user.phone}</span>
                <span>PIN: {user.pin}</span>
                <span>Saldo total: {money(user.balance)}</span>
                <span>Saldo en inicio: {money(user.displayBalance === null ? user.balance : Math.min(user.balance, user.displayBalance))}</span>
                <span>Premium: {entitlementDaysRemaining(user.premiumExpiresAt, entitlementClock)} días · {user.premiumEnabled ? 'activado' : 'desactivado'}</span>
                <span>Bold: {entitlementDaysRemaining(user.boldExpiresAt, entitlementClock)} días · {user.boldEnabled ? 'activado' : 'desactivado'}</span>
                <span>SMS: {user.smsCredits} créditos · {user.smsEnabled ? 'activado' : 'desactivado'}</span>
                <span>Acceso: {user.blocked ? 'Bloqueado' : 'Activo'}{user.isTrial && user.trialExpiresAt ? ` · prueba hasta ${new Date(user.trialExpiresAt).toLocaleString('es-CO')}` : ''}</span>
                <div className="admin-user-actions">
                  <button type="button" onClick={() => void copyProfileDetails(user)}>Copiar todos los datos</button>
                  <button type="button" onClick={() => startEditingUser(user)}>Editar usuario</button>
                  <button type="button" onClick={() => toggleAdminUserBlocked(user)}>{user.blocked ? 'Desbloquear acceso' : 'Bloquear acceso'}</button>
                  <button type="button" className="admin-delete-user" onClick={() => deleteAdminUser(user)}>Eliminar usuario</button>
                </div>
                {editingUserId === user.id && adminEdit && (
                  <form className="admin-edit-form" onSubmit={(event) => saveAdminUserEdit(event, user.id)}>
                    <label>
                      Nombre
                <input required value={adminEdit.name} readOnly={user.isTrial} onChange={(event) => setAdminEdit((current) => current ? { ...current, name: event.target.value } : current)} />
                    </label>
                    <label>
                      Tipo de documento
                      <select value={adminEdit.documentType} onChange={(event) => setAdminEdit((current) => current ? { ...current, documentType: event.target.value as DocumentType } : current)}>
                        {documentTypes.map((type) => <option value={type} key={type}>{type}</option>)}
                      </select>
                    </label>
                    <label>
                      Número de documento
                      <input required inputMode="numeric" value={adminEdit.documentNumber} onChange={(event) => setAdminEdit((current) => current ? { ...current, documentNumber: normalizeDigits(event.target.value) } : current)} />
                    </label>
                    <label>
                      Número de celular
                      <input required inputMode="tel" value={adminEdit.phone} onChange={(event) => setAdminEdit((current) => current ? { ...current, phone: normalizeDigits(event.target.value) } : current)} />
                    </label>
                    <label>
                      PIN
                      <input required inputMode="numeric" maxLength={4} value={adminEdit.pin} onChange={(event) => setAdminEdit((current) => current ? { ...current, pin: normalizeDigits(event.target.value).slice(0, 4) } : current)} />
                    </label>
                    <label>
                      Balance
                      <input required inputMode="decimal" value={adminEdit.balance} onChange={(event) => setAdminEdit((current) => current ? { ...current, balance: event.target.value } : current)} />
                    </label>
                    <label>
                      ¿Cuánto saldo quiere mostrar?
                      <input inputMode="decimal" value={adminEdit.displayBalance} onChange={(event) => setAdminEdit((current) => current ? { ...current, displayBalance: event.target.value } : current)} placeholder="Vacío = saldo total" />
                    </label>
                    <button className="admin-reset-balance" type="button" onClick={() => resetDisplayedBalance(user.id)}>
                      Restablecer para mostrar el saldo total
                    </button>
                    <label>
                      Premium · días
                      <input type="number" min="0" step="1" value={adminEdit.premiumDays} onChange={(event) => setAdminEdit((current) => current ? { ...current, premiumDays: event.target.value } : current)} />
                    </label>
                    <label>
                      Bold · días
                      <input type="number" min="0" step="1" value={adminEdit.boldDays} onChange={(event) => setAdminEdit((current) => current ? { ...current, boldDays: event.target.value } : current)} />
                    </label>
                    <label>
                      SMS · créditos
                      <input type="number" min="0" step="1" value={adminEdit.smsCredits} onChange={(event) => setAdminEdit((current) => current ? { ...current, smsCredits: event.target.value } : current)} />
                    </label>
                    {adminEditError && <p className="admin-error" role="alert">{adminEditError}</p>}
                    <div className="admin-user-actions">
                      <button type="submit">Guardar cambios</button>
                      <button type="button" onClick={cancelEditingUser}>Cancelar</button>
                    </div>
                  </form>
                )}
              </article>
            )) : <p className="admin-empty">Todavía no hay usuarios creados.</p>}
          </section>
          <button className="admin-back-link" onClick={leaveAdmin}>Ir al ingreso</button>
        </main>
      ) : (
        <main className="admin-screen admin-access-screen">
          <header className="admin-header">
            <button className="plain-icon" onClick={leaveAdmin} aria-label="Ir al ingreso"><ArrowLeft size={23} /></button>
            <DaviLogo />
            <span />
          </header>
          <h1>Panel de administración</h1>
          <p className="admin-intro">Acceso protegido. Ingresa el PIN para continuar.</p>
          {adminAuthStatus === 'checking' && <p role="status">Verificando acceso…</p>}
          <form className="admin-create-form" onSubmit={submitAdminAccess}>
            <input
              className="sr-only"
              type="text"
              name="username"
              autoComplete="username"
              value="admin"
              readOnly
              tabIndex={-1}
              aria-hidden="true"
            />
            <label>
              PIN de administrador
              <input
                required
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                value={adminAccessPin}
                onChange={(event) => { setAdminAccessPin(event.target.value); setAdminAccessError(''); }}
                aria-label="PIN de administrador"
              />
            </label>
            {adminAccessError && <p className="admin-error" role="alert">{adminAccessError}</p>}
            <button type="submit" disabled={!adminAccessPin || adminAuthStatus === 'checking'}>
              {adminAuthStatus === 'checking' ? 'Verificando…' : 'Entrar al panel'}
            </button>
          </form>
          <button className="admin-back-link" onClick={leaveAdmin}>Volver al ingreso</button>
        </main>
      ))}

      {screen === 'welcome' && (
        <main className="welcome-screen">
          <div className="welcome-logo"><DaviLogo /></div>
          <h1>¡Hola, {welcomeName.toLocaleUpperCase('es-CO')}!</h1>
          <div className="saved-phone-row">
            <div>
              <span>Número de celular</span>
              <strong>{maskedPhone(welcomePhone)}</strong>
            </div>
            <button onClick={returnToOnboarding}>
              Cambiar número
            </button>
          </div>
          <button className="red-button welcome-enter" onClick={startPinEntry} data-testid="button-login">
            Ingresar
          </button>
          <button className="underlined-button" onClick={returnToOnboarding}>
            Cambiar de usuario
          </button>
          <div className="welcome-shortcuts">
            <button onClick={() => openQrOptions('welcome')}>
              <span className="welcome-shortcut-icon"><QrMini /></span>
              <span>Código QR</span>
            </button>
            <button onClick={openWelcomeTutorial}>
              <span className="welcome-shortcut-icon"><HelpBubbleMark /></span>
              <span>¿Necesitas ayuda?</span>
            </button>
          </div>
        </main>
      )}

      {screen === 'pin' && (
        <main className="pin-screen">
          <div className="pin-header">
            <button className="plain-icon" aria-label="Volver" onClick={() => { setPin(''); go('welcome'); }}><ArrowLeft size={24} /></button>
            <DaviLogo />
            <span className="pin-header-spacer" />
          </div>
          <h1>Ingresa tu clave</h1>
          <div className="pin-dots" aria-label={`${pin.length} de 4 dígitos`}>
            {[0, 1, 2, 3].map((index) => <span className={pin.length > index ? 'filled' : ''} key={index} />)}
          </div>
          <div className="number-pad">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'delete'].map((key, index) => (
              key ? (
                <button
                  className="number-key"
                  key={key}
                  onClick={() => key === 'delete' ? removePinDigit() : addKeyDigit(key)}
                  aria-label={key === 'delete' ? 'Borrar' : key}
                  data-testid={`pin-${key}`}
                >
                  {key === 'delete' ? <BackspaceMark /> : key}
                </button>
              ) : <span className="number-key-empty" key={`empty-${index}`} />
            ))}
          </div>
          <div className="pin-footer">
            <button
              className="underlined-button forgot-pin"
              onClick={showPinRecovery}
              data-testid="button-forgot-pin"
            >
              ¿Olvidaste tu clave?
            </button>
            <button
              className="pin-biometric"
              onClick={startFingerprintDemo}
              aria-label="Ingresar con huella, acceso de demostración"
              data-testid="button-pin-biometric"
            >
              <Fingerprint size={31} strokeWidth={1.7} />
              <span>Ingresar con Huella</span>
            </button>
          </div>
          {pinErrorOpen && (
            <div className="pin-error-backdrop">
              <section
                className="pin-error-dialog"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="pin-error-title"
                aria-describedby="pin-error-copy"
              >
                <div className="pin-error-mark" aria-hidden="true">
                  <svg viewBox="0 0 44 48" fill="none">
                    <path d="M13 20v-4.5a9 9 0 0 1 18 0V20" />
                    <rect x="9" y="20" width="26" height="23" rx="4" />
                    <circle cx="22" cy="29" r="2" />
                    <path d="M22 31v5" />
                  </svg>
                  <span>×</span>
                </div>
                <h2 id="pin-error-title">Clave incorrecta</h2>
                <p id="pin-error-copy">
                  Por favor, vuelve a intentarlo o selecciona <strong>¿Olvidaste tu clave?</strong> si no la recuerdas y quieres crear una nueva.
                </p>
                <button className="pin-error-recovery" onClick={showPinRecovery}>
                  ¿Olvidaste tu clave?
                </button>
                <button className="pin-error-retry" onClick={retryPin}>
                  Reintentar
                </button>
              </section>
            </div>
          )}
        </main>
      )}

      {screen === 'home' && (
        homeMode === 'business' ? (
          <BusinessHomeScreen
            balance={currentBalance}
            onPersonal={() => setHomeMode('personal')}
            onTopes={() => { setTopesReturnTo('home'); go('topes'); }}
            onMenu={() => go('profile')}
            onNotifications={() => setSheet('notification')}
            onLogout={returnToOnboarding}
            onTransfer={startTransfer}
            onWithdraw={() => setSheet('withdraw')}
            onQr={() => openUserQr('home')}
          />
        ) : (
        <main className="home-screen">
          <header className="home-header">
            <button className="header-circle" onClick={() => go('profile')} aria-label="Perfil"><UserRound size={22} /></button>
            <DaviLogo />
            <div className="home-header-actions">
              <button className="header-circle notification-button" onClick={() => setSheet('notification')} aria-label="Notificaciones">
                <Bell size={21} />
              </button>
              <button className="header-circle" onClick={openWelcomeTutorial} aria-label="Ayuda"><HelpBubbleMark /></button>
            </div>
          </header>
          <div className="home-tabs">
            <button className={homeMode === 'personal' ? 'selected' : ''} onClick={() => setHomeMode('personal')}>Mi DaviPlata</button>
            <button onClick={() => setHomeMode('business')}>Mi Negocio</button>
          </div>
          <section className="balance-overview">
            <span>¿Cuánta Plata tengo?</span>
            <div className="balance-line">
              <strong className={hiddenBalance ? 'balance-hidden' : ''} data-testid="balance-value">{currentBalance}</strong>
              <button className="balance-eye" aria-label={hiddenBalance ? 'Mostrar saldo' : 'Ocultar saldo'} onClick={() => setHiddenBalance((value) => !value)}>
                {hiddenBalance ? (
                  <svg viewBox="0 0 28 22" fill="none" aria-hidden="true">
                    <path d="M3.2 13.4c2.9-4.4 6.5-6.6 10.8-6.6s7.9 2.2 10.8 6.6" />
                    <path d="m5.1 15.4-1.5 2.1m6.1-3.6-.7 2.4m5-2.4v2.5m5-2.5.7 2.4m4.6-.9 1.5 2.1" />
                  </svg>
                ) : <Eye size={23} />}
              </button>
            </div>
            <button className="available-label" onClick={() => setToast('Este saldo pertenece a una cuenta de demostración.')}>Ver más</button>
          </section>

          <section className="home-actions" aria-label="Acciones de demostración">
            <button onClick={() => setSheet('meter')}>
              <span className="round-action"><ArrowDown size={25} /></span><span>Meter</span>
            </button>
            <button onClick={startTransfer} data-testid="button-start-transfer">
              <span className="round-action"><ArrowRight size={26} /></span><span>Pasar</span>
            </button>
            <button onClick={() => setSheet('withdraw')}>
              <span className="round-action pink-action"><ArrowUp size={25} /></span><span>Sacar</span>
            </button>
            <button onClick={() => setSheet('quick')}>
              <span className="round-action plus-action"><Plus size={25} /></span><span>Más</span>
            </button>
          </section>

          <section className="promo-cards">
            <button className="promo-card pocket-card" onClick={() => setToast('Mis Bolsillos: vista de demostración.')}>
              <div className="promo-image"><img src={`${import.meta.env.BASE_URL}promo-pocket-reference.jpg`} alt="" /></div>
              <strong>Mis bolsillos</strong>
              <span>Ahorra, consulta y gana el 8.25% E.A</span>
            </button>
            <button className="promo-card digital-card" onClick={() => setToast('Tarjeta Débito Digital: vista de demostración.')}>
              <div className="promo-image">
                <img src={`${import.meta.env.BASE_URL}promo-card-reference.jpg`} alt="" />
                <span className="promo-new">Nuevo</span>
              </div>
              <strong>Tarjeta débito digital</strong>
              <span>Compra en internet y datáfonos</span>
            </button>
          </section>

          <nav className="home-bottom-nav" aria-label="Navegación DaviPlata">
            <button onClick={() => go('movements')} data-testid="nav-movements"><MovementNavIcon /><small>Movimientos</small></button>
            <button onClick={() => go('shop')} data-testid="nav-shop"><ShoppingBagNavIcon /><small>Tienda Virtual</small></button>
            <button className="nav-center" onClick={() => go('discounts')} aria-label="Ofertas y descuentos" data-testid="nav-discounts">
              <DiscountOrbitMark />
              <span className="discount-core"><DiscountTagMark /></span>
            </button>
            <button onClick={() => openQrOptions('home')} data-testid="nav-qr"><QrMini /><small>Código QR</small></button>
            <button onClick={() => go('services')} data-testid="nav-services"><ServicesNavIcon /><small>Pagar facturas</small></button>
          </nav>
        </main>
        )
      )}

      {screen === 'profile' && (
        <ProfileMenuScreen
          name={profileName.toLocaleUpperCase('es')}
          phone={profilePhone ? formatPhoneForReceipt(profilePhone) : ''}
          photoUrl={profilePhotoUrl}
          expandedSection={profileSection}
          onClose={() => go('home')}
          onOpenPhoto={() => go('profile-picture')}
          onLogout={returnToOnboarding}
          onToggleSection={(section) => setProfileSection((current) => current === section ? null : section)}
          onOption={showProfileOption}
        />
      )}

      {screen === 'recipients' && (
        <RecipientsScreen
          onBack={() => go('home')}
          items={recipientItems}
          onSave={saveRecipient}
          onDelete={deleteRecipient}
        />
      )}

      {screen === 'profile-picture' && (
        <ProfilePhotoScreen
          onBack={() => go('profile')}
          onHelp={() => setToast('La ayuda de fotos de perfil es una pantalla de demostración.')}
          onSelectImage={handleProfilePhotoChange}
        />
      )}

      {screen === 'transfer' && (
        <main className="flow-screen">
          <FlowHeader
            title="Pasar plata"
            onBack={() => {
              transferLookupAbortRef.current?.abort();
              transferLookupAbortRef.current = null;
              setTransferLookupBusy(false);
              go('home');
            }}
          />
          <div className="rail-strip" role="tablist" aria-label="Destino del envío">
            {rails.map((item) => (
              <button
                key={item.id}
                className={`rail-option ${rail === item.id ? 'active' : ''}`}
                disabled={transferLookupBusy}
                onClick={() => {
                  setRail(item.id);
                  setTransferKey('');
                  setVerifiedRecipient(null);
                  setRecipientName('');
                  setDestinationAccountType('');
                  setTransferMessage('');
                  setAmountText('');
                  setDestinationBank(
                    item.id === 'breb' ? 'Nequi' :
                    item.id === 'daviplata' ? 'DaviPlata' :
                    item.id === 'davivienda' ? 'Davivienda' :
                     '',
                  );
                  setTransferError('');
                  setTransferNotice('');
                }}
                role="tab"
                aria-selected={rail === item.id}
                data-testid={`rail-${item.id}`}
              >
                <span className={`rail-icon rail-icon-${item.id}`}>
                  {item.id === 'daviplata'
                    ? <DaviLogo light={rail === item.id} />
                    : item.id === 'davivienda'
                      ? <DaviviendaOptionMark />
                      : item.id === 'banks'
                        ? <OtherBanksMark />
                        : item.icon}
                </span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
          <section className="transfer-key-content">
            <h1>
              {rail === 'davivienda' || rail === 'banks'
                ? '¿A qué cuenta quieres Pasar Plata?'
                : rail === 'breb'
                  ? 'Ingresa la llave a la que le Pasarás Plata'
                  : 'Ingresa el número al que le Pasarás Plata'}
            </h1>
            {rail === 'davivienda' || rail === 'banks' ? (
              <>
                {rail === 'banks' && (
                  <label className="field-wrap account-type-field">
                    <select
                      value={destinationBank}
                      onChange={(event) => {
                        setDestinationBank(event.target.value);
                        setTransferError('');
                      }}
                      aria-label="Banco destino"
                      required
                      data-testid="input-destination-bank"
                    >
                      <option value="">Banco destino</option>
                      {bankOptions.map((bank) => <option value={bank} key={bank}>{bank}</option>)}
                    </select>
                    <ChevronDown size={20} aria-hidden="true" />
                  </label>
                )}
                <label className="field-wrap account-type-field">
                  <select
                    value={destinationAccountType}
                    onChange={(event) => {
                      setDestinationAccountType(event.target.value as '' | 'Ahorros' | 'Corriente');
                      setTransferError('');
                    }}
                    aria-label="Tipo de cuenta"
                    required
                    data-testid="input-account-type"
                  >
                    <option value="">Tipo de cuenta</option>
                    <option value="Ahorros">Cuenta de ahorros</option>
                    <option value="Corriente">Cuenta corriente</option>
                  </select>
                  <ChevronDown size={20} aria-hidden="true" />
                </label>
                <label className="field-wrap account-field">
                  <input
                    value={transferKey}
                    disabled={transferLookupBusy}
                    onChange={(event) => {
                      setTransferKey(event.target.value.replace(/\D/g, '').slice(0, 20));
                      setVerifiedRecipient(null);
                      setTransferError('');
                    }}
                    placeholder="Número de cuenta"
                    inputMode="numeric"
                    autoComplete="off"
                    data-testid="input-transfer-key"
                  />
                </label>
                <label className="field-wrap account-field">
                  <input
                    value={recipientName}
                    disabled={transferLookupBusy}
                    onChange={(event) => {
                      setRecipientName(event.target.value);
                      setTransferError('');
                    }}
                    placeholder="Nombre"
                    autoComplete="name"
                    data-testid="input-recipient-name"
                  />
                </label>
              </>
            ) : (
              <>
                <label className={`field-wrap ${rail === 'breb' ? 'with-field-label' : ''}`}>
                  {rail === 'breb' && <span>Llave</span>}
                  <input
                    value={transferKey}
                  disabled={transferLookupBusy}
                  maxLength={80}
                    onChange={(event) => {
                      setTransferKey(event.target.value);
                    setVerifiedRecipient(null);
                      setTransferError('');
                    setTransferNotice('');
                    }}
                    placeholder={rail === 'breb' ? 'Ingresa la llave' : 'Número de celular'}
                    inputMode={rail === 'breb' ? 'text' : 'numeric'}
                    autoComplete="off"
                    data-testid="input-transfer-key"
                  />
                  {transferKey && <button aria-label="Borrar llave" disabled={transferLookupBusy} onClick={() => { setTransferKey(''); setVerifiedRecipient(null); setRecipientName(''); setTransferNotice(''); }}><X size={18} /></button>}
                  {!transferKey && (rail === 'breb'
                    ? <KeyRound size={18} className="field-trailing-icon" />
                    : <Smartphone size={18} className="field-trailing-icon" />)}
                </label>
                {rail === 'breb' && <p className="field-hint">¡Pilas! La llave debe tener mínimo 5 caracteres</p>}
              </>
            )}
            <label className="field-wrap message-field">
              <input value={transferMessage} onChange={(event) => setTransferMessage(event.target.value)} placeholder="Mensaje (opcional)" maxLength={80} data-testid="input-transfer-message" />
            </label>
            {transferError && <p className="inline-error" role="alert">{transferError}</p>}
            {transferNotice && <p className="field-hint" role="status">{transferNotice}</p>}
          </section>
          <div className="flow-bottom-button">
            <button
              className="red-button"
              onClick={continueFromKey}
              disabled={
                transferLookupBusy ||
                !transferKey.trim() ||
                ((rail === 'davivienda' || rail === 'banks') && (!destinationAccountType || !recipientName.trim())) ||
                (rail === 'banks' && !destinationBank)
              }
              data-testid="button-continue-to-amount"
            >
              {transferLookupBusy ? 'Consultando llave…' : 'Continuar'}
            </button>
          </div>
        </main>
      )}

      {screen === 'amount' && (
        <main className="flow-screen amount-screen">
          <FlowHeader title="Pasar plata" onBack={() => go('transfer')} onClose={() => go('home')} />
          <div className="available-card"><span>Disponible</span><strong>{money(effectiveBalance)}</strong></div>
          <section className="amount-entry">
            <h1>¿Cuánta plata quieres pasar?</h1>
            <label className="amount-input-row">
              <span>$</span>
              <input
                type="text"
                inputMode="decimal"
                value={amountText}
                onChange={(event) => { setAmountText(event.target.value); setTransferError(''); }}
                placeholder="0"
                aria-label="Valor a pasar"
                data-testid="input-amount"
                style={{ width: `${Math.max(1.25, amountText.length + 0.5)}ch` }}
              />
            </label>
            <p>Ingresa un valor</p>
            {transferNotice && <p className="field-hint" role="status">{transferNotice}</p>}
            {transferError && <p className="inline-error amount-error" role="alert">{transferError}</p>}
          </section>
          <div className="flow-bottom-button">
            <button className="red-button" onClick={continueToConfirmation} disabled={!amountText.trim()} data-testid="button-review-amount">
              Continuar
            </button>
          </div>
          {confirmOpen && (
            <div className="sheet-backdrop" onClick={() => setConfirmOpen(false)}>
              <section className="confirm-sheet" onClick={(event) => event.stopPropagation()} aria-label="Revisa los datos">
                <div className="sheet-handle" />
                <h2>¡Dale una última revisada a tus datos!</h2>
                <div className="confirm-section">
                  <span>Estás Pasando Plata a:</span>
                  <strong>{maskedName(recipientName || 'Contacto de prueba')}</strong>
                  <b>{rail === 'davivienda' ? transferKey : formatPhoneForReceipt(transferKey)}</b>
                  {(rail === 'davivienda' || rail === 'banks') && destinationAccountType && <small>Cuenta de {destinationAccountType.toLowerCase()}</small>}
                  {rail === 'banks' && destinationBank && <small>{destinationBank}</small>}
                  {rail === 'breb' && destinationBank && <small>{destinationBank}</small>}
                </div>
                <div className="confirm-section"><span>Valor</span><strong className="confirm-amount">{transferMoney(parseAmount())}</strong></div>
                {transferNotice && <p className="field-hint" role="status">{transferNotice}</p>}
                <p className="confirm-warning">¿Todo está bien? Recuerda que después de pasar Plata, no podremos hacer ningún ajuste.</p>
                <div className="confirm-buttons">
                  <button className="outline-button" onClick={() => setConfirmOpen(false)} data-testid="button-edit-transfer">Modificar</button>
                  <button className="red-button" onClick={finishTransfer} data-testid="button-confirm-transfer">Pasar Plata</button>
                </div>
              </section>
            </div>
          )}
        </main>
      )}

      {screen === 'movement-detail' && currentMovement && (
        <main className="movement-detail-screen">
          <FlowHeader title="Movimientos" onBack={() => go('movements')} onClose={() => go('home')} />
          <section className="movement-detail-card" data-testid="movement-detail">
            <div className="movement-detail-heading">
              <strong>{currentMovement.direction === 'sent' ? 'Pasó' : 'Recibió'} Plata por {movementRailName(currentMovement.rail)}</strong>
              <b>
                {currentMovement.rail === 'daviplata' ? 'Al número ' : 'A la llave '}
                {formatMovementReference(currentMovement)}{' '}
                {currentMovement.direction === 'received' ? 'desde' : 'de'} {currentMovement.bank.toLocaleUpperCase('es-CO')}
              </b>
            </div>
            <div className="movement-detail-row">
              <span>Valor</span>
              <strong>{shortMoney(currentMovement.amount)}</strong>
            </div>
            <div className="movement-detail-row">
              <span>Fecha y hora de la transacción</span>
              <strong>{movementDetailDateTime(currentMovement.date)}</strong>
            </div>
            <div className="movement-detail-row">
              <span>Número de autorización</span>
              <strong>{currentMovement.approvalNumber ?? currentMovement.id.replace(/\D/g, '').slice(-6).padStart(6, '0')}</strong>
            </div>
            <button className="movement-detail-share" onClick={shareMovementDetails}>
              <Share2 size={21} />
              <span>Compartir</span>
            </button>
          </section>
        </main>
      )}

      {screen === 'receipt' && currentMovement && (
        <main className="receipt-screen">
          <div className="receipt-share-export" data-testid="receipt-export">
          <section className="receipt-paper" data-testid="receipt">
            <div className="receipt-legal-left" aria-label="Vigilado por la Superintendencia Financiera">
              <span className="receipt-superintendencia">SUPERINTENDENCIA FINANCIERA</span>
              <span className="receipt-vigilado">VIGILADO</span>
            </div>
            <span className="receipt-legal-side receipt-legal-right">Banco Davivienda S.A.</span>
            <DaviLogo />
            <h1>Transacción exitosa</h1>
            <div className="receipt-qr">
              <QRCode value={receiptPayload} size={136} level="H" title={`QR simulado ${currentMovement.id}`} />
              <span className="receipt-qr-mark" aria-hidden="true">
                <img
                  className="receipt-davivienda-mark"
                  src={`${import.meta.env.BASE_URL}davivienda-receipt-mark.png`}
                  alt=""
                />
              </span>
            </div>
            <p className="receipt-scan-note">Confirma la autenticidad del comprobante escaneando este QR desde tu app DaviPlata.</p>
            <div className="receipt-rail-label">
              {currentMovement.rail === 'daviplata'
                ? 'Pasaste Plata a otro DaviPlata'
                : currentMovement.rail === 'banks'
                  ? `Pasaste Plata a ${currentMovement.bank}`
                  : currentMovement.rail === 'davivienda'
                    ? 'Pasaste Plata a una cuenta Davivienda'
                : `Pasaste Plata por ${rails.find((item) => item.id === currentMovement.rail)?.label.replace('Por ', '') ?? currentMovement.bank}`}
            </div>
            <div className="receipt-beneficiary">
              <div>
                <strong>A {currentMovement.recipient}</strong>
                <b>{formatMovementReference(currentMovement)}</b>
              </div>
              <button className="receipt-share-control" onClick={shareReceipt} aria-label="Compartir comprobante simulado"><Share2 size={22} /><small>Compartir</small></button>
            </div>
            <div className="receipt-data">
              <ReceiptRow label="Valor" value={transferMoney(currentMovement.amount)} />
              <ReceiptRow label="Desde" value={`DaviPlata - ****${(activeProfile?.phone ?? '3000003762').replace(/\D/g, '').slice(-4)}`} />
              <ReceiptRow label="Entidad destino" value={receiptDestinationEntity(currentMovement)} />
              {currentMovement.accountType && <ReceiptRow label="Tipo de cuenta" value={`Cuenta de ${currentMovement.accountType.toLowerCase()}`} />}
              <ReceiptRow label="Mensaje" value={currentMovement.message || '\u00a0'} />
              <ReceiptRow label="Fecha y hora de la transacción" value={receiptDateTime(currentMovement.date)} />
              <ReceiptRow label="Número de aprobación" value={currentMovement.approvalNumber ?? currentMovement.id.replace(/\D/g, '').slice(-6).padStart(6, '0')} />
              <ReceiptRow label="Costo de la transacción" value="$ 0" />
            </div>
            <p className="receipt-issuer-note">Esta es una transacción realizada por REDEBAN</p>
          </section>
          <p className="receipt-tagline">Más que Mover Plata, es estar juntos.</p>
          </div>
          <div className="receipt-actions">
            <button className="red-button" onClick={() => go('home')} data-testid="button-finish-receipt">Finalizar</button>
          </div>
        </main>
      )}

      {screen === 'movements' && (
        <main className="movements-screen">
          <FlowHeader title="Movimientos" onBack={() => go('home')} onClose={() => go('home')} />
          {movementLoading && (
            <div
              className="movement-loading-overlay"
              role="status"
              aria-label="Por favor, espere. ¡Estamos cargando sus movimientos!"
              data-testid="movement-loading"
            >
              <strong className="movement-loading-wait">Por favor, espere</strong>
              <span className="movement-loading-spinner" aria-hidden="true" />
              <strong className="movement-loading-caption">¡Estamos cargando sus movimientos!</strong>
            </div>
          )}
          <section className="movement-balance">
            <span>¿Cuánto tengo?</span>
            <strong>{currentBalance}</strong>
            <small>Disponible</small>
          </section>
          <div className="movement-controls">
            <div className="filter-control">
              <button onClick={() => setFilterOpen((value) => !value)} aria-expanded={filterOpen} data-testid="movement-filter">
                {movementFilter} <ChevronDown size={16} />
              </button>
              {filterOpen && (
                <div className="filter-menu">
                  {['Servicios que ha pagado', 'Tarjeta Débito Digital', 'Todos los movimientos', 'Pasó Plata', 'Recibió Plata', 'Por Bre-B'].map((option) => (
                    <button key={option} onClick={() => { setMovementFilter(option); setFilterOpen(false); }}>{option}</button>
                  ))}
                </div>
              )}
            </div>
            <button className="control-small" onClick={() => setSearchOpen((value) => !value)}><Search size={16} /> Buscar</button>
            <button className="control-small" onClick={() => setToast('Extractos: función de demostración.')}>Extractos</button>
          </div>
          {searchOpen && <div className="movement-search"><Search size={17} /><input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Buscar movimiento" autoFocus /><button onClick={() => { setSearchText(''); setSearchOpen(false); }} aria-label="Cerrar búsqueda"><X size={17} /></button></div>}
          <div className="movement-list">
            {shownMovements.length ? shownMovements.map((movement, index) => {
              const previous = shownMovements[index - 1];
              const showHeading = !previous || dateHeading(previous.date) !== dateHeading(movement.date);
              const reference = movement.rail === 'daviplata'
                ? `Al número ${formatMovementReference(movement)}`
                : `A la llave ${formatMovementReference(movement)}`;
              return (
                <div key={movement.id}>
                  {showHeading && <h2 className="movement-date-heading">{dateHeading(movement.date)}</h2>}
                  <button
                    className="movement-row"
                    onClick={() => handleMovementClick(movement)}
                    onPointerDown={(event) => {
                      if (event.isPrimary && event.button === 0) {
                        beginMovementHold(movement, event.clientX, event.clientY);
                      }
                    }}
                    onPointerMove={(event) => moveMovementHold(event.clientX, event.clientY)}
                    onPointerUp={cancelMovementHold}
                    onPointerCancel={cancelMovementHold}
                    onPointerLeave={cancelMovementHold}
                    onContextMenu={(event) => event.preventDefault()}
                    data-testid={`movement-${movement.id}`}
                  >
                    <span className="movement-description">
                      <strong>{movement.direction === 'sent' ? 'Pasó Plata' : 'Recibió Plata'} por {movementRailName(movement.rail)}</strong>
                      <small>{reference} {movement.direction === 'received' ? 'desde' : 'de'} {movement.bank.toLocaleUpperCase('es-CO')}</small>
                      {movement.message && <small>{movement.message}</small>}
                    </span>
                    <strong className={movement.direction === 'received' ? 'positive-amount' : ''}>{movement.direction === 'sent' ? '-' : '+'}{shortMoney(movement.amount)}</strong>
                  </button>
                </div>
              );
            }) : <div className="empty-movements">No hay movimientos para este filtro.</div>}
          </div>
        </main>
      )}

      {screen === 'user-qr' && (
        <main className="simple-screen">
          <FlowHeader title="Código QR" onBack={() => go(qrReturnTo)} onClose={() => go(qrReturnTo)} />
          <SimulationMark />
          <section className="user-qr-card">
            <h1>Tu código QR</h1>
            <p>QR de demostración · no recibe pagos reales</p>
            <div className="receipt-qr"><QRCode value="DAVIPLATA USA SIMULATOR — QR DE PRUEBA — NO ES UN MEDIO DE PAGO REAL" size={180} level="H" /></div>
            <strong>SIMULACIÓN · NO REAL</strong>
          </section>
        </main>
      )}

      {screen === 'qr-scanner' && (
        <QrScannerScreen
          purpose={scanPurpose}
          onBack={() => go('home')}
          onDecoded={handleQrDecoded}
          onHelp={openWelcomeTutorial}
        />
      )}

      {screen === 'topes' && (
        <TopesScreen
          onBack={() => go(topesReturnTo)}
          onIncrease={() => setToast('El aumento de topes no está conectado en esta simulación.')}
          onHelp={openWelcomeTutorial}
        />
      )}

      {screen === 'discounts' && (
        <DiscountsScreen onBack={() => go('home')} />
      )}

      {screen === 'help' && (
        <SimpleInfoScreen title="¿Necesitas ayuda?" onBack={() => go('welcome')}>
          <p>Este simulador reproduce pantallas de práctica. Los envíos y comprobantes no mueven dinero real.</p>
          <p>La consulta Premium de llaves Bre-B comparte la llave consultada con un proveedor externo no oficial para obtener nombre y entidad.</p>
          <p>Los saldos, movimientos, QR y comprobantes permanecen simulados.</p>
          <button className="feature-red-button" onClick={openWelcomeTutorial}>Ver plantillas de inicio</button>
        </SimpleInfoScreen>
      )}

      {screen === 'shop' && (
        <VirtualShopScreen onBack={() => go('home')} />
      )}

      {screen === 'services' && (
        <BillsScreen balance={currentBalance} onBack={() => go('home')} />
      )}

      {sheet === 'qr-options' && (
        <QrOptionsSheet
          expanded={qrReturnTo === 'welcome'}
          onClose={() => setSheet(null)}
          onScan={() => { setScanPurpose('pay'); go('qr-scanner'); }}
          onReceive={() => openUserQr(qrReturnTo)}
          onConfirm={() => { setScanPurpose('receipt'); go('qr-scanner'); }}
        />
      )}

      {sheet && sheet !== 'qr-options' && sheet !== 'recharge' && (
        <div className="sheet-backdrop" onClick={() => setSheet(null)}>
          <section className="action-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="sheet-handle" />
            <button className="sheet-close" onClick={() => setSheet(null)} aria-label="Cerrar"><X size={20} /></button>
            {sheet === 'meter' || sheet === 'withdraw' ? (
              <DemoBalanceSheet
                mode={sheet}
                balance={effectiveBalance}
                onCancel={() => setSheet(null)}
                onConfirm={(value) => addDemoAmount(sheet, value)}
              />
            ) : sheet === 'quick' ? (
              <>
                <h2>Más opciones</h2>
                <button className="sheet-action" onClick={() => { setSheet(null); go('movements'); }}><FileText size={20} /> Movimientos <ChevronRight size={18} /></button>
                <button className="sheet-action" onClick={() => { setSheet(null); openUserQr('home'); }}><QrMini /> Código QR <ChevronRight size={18} /></button>
                <button className="sheet-action" onClick={() => { setSheet(null); startTransfer(); }}><Send size={20} /> Pasar Plata <ChevronRight size={18} /></button>
              </>
            ) : (
              <>
                <h2>Davi Satan</h2>
                <p>Simulador: no se envía dinero real. Premium comparte la llave Bre-B consultada con un proveedor externo no oficial para obtener nombre y entidad.</p>
                <button className="sheet-action" onClick={() => go('recipients')}>
                  <UserRound size={20} /> Destinatarios <ChevronRight size={18} />
                </button>
                <button className="sheet-action" onClick={() => setSheet('recharge')}>
                  <Plus size={20} /> Recargar cuenta <ChevronRight size={18} />
                </button>
                <div className="entitlement-controls">
                  <EntitlementToggleRow
                    label="Premium · nombres reales"
                    detail={activeProfile && entitlementDaysRemaining(activeProfile.premiumExpiresAt, entitlementClock) > 0
                      ? `${entitlementDaysRemaining(activeProfile.premiumExpiresAt, entitlementClock)} días disponibles · consulta de llaves Bre-B`
                      : 'Sin días Premium asignados por administración'}
                    enabled={activeProfile?.premiumEnabled === true}
                    disabled={!activeProfile || activeProfile.blocked || entitlementDaysRemaining(activeProfile.premiumExpiresAt, entitlementClock) <= 0}
                    onToggle={() => toggleProfileFeature('premium')}
                  />
                  <EntitlementToggleRow
                    label="Bold"
                    detail={activeProfile && entitlementDaysRemaining(activeProfile.boldExpiresAt, entitlementClock) > 0
                      ? `${entitlementDaysRemaining(activeProfile.boldExpiresAt, entitlementClock)} días disponibles`
                      : 'Sin días Bold asignados por administración'}
                    enabled={activeProfile?.boldEnabled === true}
                    disabled={!activeProfile || activeProfile.blocked || entitlementDaysRemaining(activeProfile.boldExpiresAt, entitlementClock) <= 0}
                    onToggle={() => toggleProfileFeature('bold')}
                  />
                  <EntitlementToggleRow
                    label="SMS"
                    detail={activeProfile && activeProfile.smsCredits > 0
                      ? `${activeProfile.smsCredits} créditos · descuenta uno por transferencia exitosa`
                      : 'Sin créditos SMS asignados por administración'}
                    enabled={activeProfile?.smsEnabled === true}
                    disabled={!activeProfile || activeProfile.blocked || (activeProfile?.smsCredits ?? 0) <= 0}
                    onToggle={() => toggleProfileFeature('sms')}
                  />
                  <div className="display-balance-control">
                    <div className="display-balance-heading">
                      <strong>¿Cuánto quiere mostrar?</strong>
                      <button
                        type="button"
                        onClick={() => {
                          if (!activeProfile) return;
                          resetDisplayedBalance(activeProfile.id);
                          setDisplayBalanceDraft(String(data.balance));
                        }}
                        disabled={!activeProfile}
                      >
                        Restablecer
                      </button>
                    </div>
                    <label className="display-balance-input">
                      <span aria-hidden="true">$</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        aria-label="Saldo que se mostrará"
                        value={displayBalanceDraft}
                        onChange={(event) => updateOwnDisplayedBalance(event.target.value)}
                        placeholder="0"
                        disabled={!activeProfile}
                      />
                    </label>
                    <small>El saldo total no cambia. Este monto también limita lo disponible para enviar.</small>
                  </div>
                </div>
                <p className="sheet-disclosure">Los beneficios y cupos solo pertenecen a este perfil simulado.</p>
                <button className="red-button" onClick={() => setSheet(null)}>Cerrar</button>
              </>
            )}
          </section>
        </div>
      )}

      {sheet === 'recharge' && (
        <TelegramRechargeSheet contacts={telegramContacts} onClose={() => setSheet(null)} />
      )}

      {accessAnimation && (
        <div
          className={`access-transition access-transition-${accessAnimation}`}
          role="status"
          aria-live="polite"
          aria-label="Cargando DaviPlata"
        >
          {accessAnimation === 'launcher' && (
            <div className="access-launcher-tile">
              <div className="access-launcher-red-icon"><DaviLogo light /></div>
            </div>
          )}
          {accessAnimation === 'splash-red' && (
            <div className="access-transition-logo access-transition-logo-draw"><DaviLogo light /></div>
          )}
          {['splash-dark', 'to-pin', 'wrong-pin', 'home-dark'].includes(accessAnimation) && (
            <div className="access-transition-logo access-transition-logo-pulse"><DaviLogo light /></div>
          )}
        </div>
      )}

      {processing && (
        <div className={`processing-overlay ${processingStage === 'success' ? 'processing-overlay-success' : ''}`} role="status" aria-live="polite">
          {processingStage === 'working' ? (
            <>
              <div className="processing-logo-motion"><DaviLogo light /></div>
              <strong>Por favor espera,<br />transacción en proceso...</strong>
              <span className="processing-spinner" />
            </>
          ) : (
            <>
              <span className="processing-success-check" aria-hidden="true">
                <svg viewBox="0 0 48 48" fill="none">
                  <path d="m12 25 8 8 17-18" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <strong>Transacción exitosa</strong>
            </>
          )}
        </div>
      )}

      <audio ref={successSoundRef} src={`${import.meta.env.BASE_URL}transaction-success.wav`} preload="auto" />
      {toast && <div className="demo-toast" role="status">{toast}</div>}
      {welcomeTutorialOpen && (
        <DaviWelcomeTutorial onDismiss={dismissWelcomeTutorial} />
      )}
    </div>
  );
}

function FlowHeader({
  title,
  onBack,
  onClose,
}: {
  title: string;
  onBack: () => void;
  onClose?: () => void;
}) {
  return (
    <header className="flow-header">
      <button onClick={onBack} aria-label="Volver"><ArrowLeft size={22} /></button>
      <strong>{title}</strong>
      {onClose ? <button onClick={onClose} aria-label="Cerrar"><X size={22} /></button> : <span />}
    </header>
  );
}

function ReceiptRow({ label, value }: { label: string; value: string }) {
  return <div className="receipt-row"><span>{label}</span><strong>{value}</strong></div>;
}

function formatPhoneForReceipt(value: string) {
  const compact = value.trim().replace(/\s/g, '');
  return /^\d{10}$/.test(compact)
    ? `${compact.slice(0, 3)} ${compact.slice(3, 6)} ${compact.slice(6)}`
    : value;
}

function formatMovementReference(movement: DemoMovement) {
  const value = movement.key.trim();
  if (movement.rail === 'breb') {
    const prefix = value.startsWith('@') ? '@' : '';
    const key = prefix ? value.slice(1).replace(/\s/g, '') : value.replace(/\s/g, '');
    return /^\d{10}$/.test(key)
      ? `${prefix}${key.slice(0, 3)} ${key.slice(3, 6)} ${key.slice(6)}`
      : value;
  }
  return movement.rail === 'daviplata' ? formatPhoneForReceipt(value) : value;
}

function movementRailName(rail: TransferRail) {
  if (rail === 'breb') return 'Bre-B';
  if (rail === 'daviplata') return 'DaviPlata';
  if (rail === 'davivienda') return 'Davivienda';
  return 'otro banco';
}

function movementDetailDateTime(value: string) {
  const date = new Date(value);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  const hour = date.getHours() % 12 || 12;
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const period = date.getHours() >= 12 ? 'p m' : 'a m';
  return `${day}/${month}/${year} - ${hour}:${minutes} ${period}`;
}

function receiptDestinationEntity(movement: DemoMovement) {
  if (movement.rail === 'daviplata') return 'DaviPlata';
  if (movement.rail === 'davivienda') return 'Davivienda';
  return movement.bank || rails.find((item) => item.id === movement.rail)?.label || '—';
}

function receiptDateTime(value: string) {
  const date = new Date(value);
  const months = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ];
  const hour = date.getHours() % 12 || 12;
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const period = date.getHours() >= 12 ? 'p. m.' : 'a. m.';
  return `${months[date.getMonth()]} ${date.getDate()} de ${date.getFullYear()} - ${hour}:${minutes} ${period}`;
}

function DaviviendaOptionMark() {
  return (
    <img
      className="davivienda-option-mark"
      src={`${import.meta.env.BASE_URL}davivienda-mark.png`}
      alt=""
      aria-hidden="true"
    />
  );
}

function OtherBanksMark() {
  return (
    <svg className="other-banks-mark" viewBox="0 0 44 44" fill="none" aria-hidden="true">
      <path d="M5 16 22 7l17 9M7 19h30M10 20v13M18 20v13M26 20v13M34 20v13M7 34h30M5 38h34" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function QrMini() {
  return (
    <svg className="qr-mini" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5 5h3v3H5zM16 5h3v3h-3zM5 16h3v3H5zM14 14h3v3h-3zM19 14v3h2M14 19h3v2M19 19h2v2" fill="currentColor" />
      <path d="M14 20h5" stroke="#d8222b" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function MovementNavIcon() {
  return (
    <svg className="bottom-nav-line-icon movement-nav-icon" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path d="M3 9h21m-5-5 5 5-5 5M25 19H4m5 5-5-5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ShoppingBagNavIcon() {
  return (
    <svg className="bottom-nav-line-icon" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path d="M5 9.5h18l1 15H4l1-15Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M10 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function DiscountTagMark() {
  return (
    <span className="discount-tag-mark" aria-hidden="true">
      <img src={`${import.meta.env.BASE_URL}daviplata-discount-tag.png`} alt="" />
      <span className="discount-percent">%</span>
    </span>
  );
}

function DiscountOrbitMark() {
  return (
    <svg className="discount-orbit-mark" viewBox="0 0 68 68" fill="none" aria-hidden="true">
      <path d="M47 7A30 30 0 0 1 62 34" stroke="#efa77e" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="2 4" />
      <path d="M62 40A30 30 0 0 1 49 60" stroke="#ef718a" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="2 4" />
    </svg>
  );
}

function ServicesNavIcon() {
  return (
    <svg className="bottom-nav-line-icon" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path d="M7 3.5h14a2 2 0 0 1 2 2v18H5v-18a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M9 7.5h10m-10 4h4m7 4.2c0-.9-.75-1.4-1.9-1.4s-1.9.5-1.9 1.3c0 2 3.8 1 3.8 3 0 .8-.75 1.4-1.9 1.4s-1.9-.5-1.9-1.4m1.9-5.2v6.8" stroke="#d8222b" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BackspaceMark() {
  return (
    <svg className="backspace-mark" viewBox="0 0 32 24" fill="none" aria-hidden="true">
      <path d="M10 3.5h19v17H10L2.5 12 10 3.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="m14 8 8 8m0-8-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function HelpBubbleMark() {
  return (
    <svg className="help-bubble-mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M16 5.5c-6.1 0-11 4.1-11 9.2 0 2.2.9 4.2 2.5 5.8l-.9 5.1 5.4-2.4c1.3.4 2.6.7 4 .7 6.1 0 11-4.1 11-9.2s-4.9-9.2-11-9.2Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M13.7 12.2c.2-1.4 1.2-2.2 2.6-2.2 1.5 0 2.5.9 2.5 2.2 0 1.1-.6 1.7-1.6 2.3-.9.5-1.2 1-1.2 1.9" stroke="#d8222b" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="16" cy="19.4" r="1" fill="#d8222b" />
    </svg>
  );
}

function SimpleInfoScreen({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <main className="simple-screen">
      <FlowHeader title={title} onBack={onBack} />
      <section className="simple-info-card">{children}</section>
    </main>
  );
}

function DemoBalanceSheet({
  mode,
  balance,
  onCancel,
  onConfirm,
}: {
  mode: 'meter' | 'withdraw';
  balance: number;
  onCancel: () => void;
  onConfirm: (value: number) => void;
}) {
  const [value, setValue] = useState('');
  const parsed = Number(value.replace(',', '.'));
  return (
    <>
      <h2>{mode === 'meter' ? 'Meter Plata' : 'Sacar Plata'}</h2>
      <p>{mode === 'meter' ? 'Ingreso ficticio para practicar' : `Saldo simulado: ${money(balance)}`}</p>
      <label className="sheet-amount-input"><span>$</span><input inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} placeholder="0" aria-label="Monto de demostración" /></label>
      <p className="sheet-disclosure">Solo cambia el saldo de prueba en este navegador.</p>
      <div className="confirm-buttons">
        <button className="outline-button" onClick={onCancel}>Cancelar</button>
        <button className="red-button" onClick={() => onConfirm(parsed)} disabled={!value || !Number.isFinite(parsed) || parsed <= 0}>Continuar</button>
      </div>
    </>
  );
}

export default App;
