import { useEffect, useRef, useState } from 'react';
import { BrowserQRCodeReader } from '@zxing/browser';
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Building2,
  Calculator,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Copy,
  CreditCard,
  Droplet,
  Flame,
  Grid2X2,
  Heart,
  Home,
  Image,
  Lightbulb,
  LogOut,
  Menu,
  MoreVertical,
  Plus,
  QrCode,
  ReceiptText,
  ScanLine,
  Search,
  Send,
  ShoppingBag,
  Store,
  Truck,
  Tv,
  UserRound,
  Wallet,
  X,
} from 'lucide-react';
import './davi-feature-screens.css';

type BackProps = { onBack: () => void };
type NativeQrDetector = new (options?: { formats?: string[] }) => {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
};

export type DaviRecipient = {
  id: string;
  name: string;
  key: string;
  bank: string;
  rail: 'daviplata' | 'breb';
};

export type TelegramSupportContact = {
  role: 'Dueño' | 'Administrador';
  name: string;
  username: string;
};

function FeatureHeader({ title, onBack, showClose = true }: { title: string; onBack: () => void; showClose?: boolean }) {
  return (
    <header className="feature-header">
      <button onClick={onBack} aria-label="Volver"><ArrowLeft size={23} /></button>
      <strong>{title}</strong>
      {showClose ? <button onClick={onBack} aria-label="Cerrar"><X size={23} /></button> : <span />}
    </header>
  );
}

function QrOptionIcon({ kind }: { kind: 'scan' | 'receive' | 'receipt' }) {
  if (kind === 'scan') {
    return (
      <svg className="qr-option-icon" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <path d="M5 10V7a2 2 0 0 1 2-2h3M18 5h3a2 2 0 0 1 2 2v3M23 18v3a2 2 0 0 1-2 2h-3M10 23H7a2 2 0 0 1-2-2v-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M7 14h14" stroke="#d52331" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="3 3" />
      </svg>
    );
  }
  if (kind === 'receive') {
    return (
      <svg className="qr-option-icon" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <rect x="4" y="4" width="7" height="7" rx="1.2" stroke="currentColor" strokeWidth="1.6" />
        <rect x="17" y="4" width="7" height="7" rx="1.2" stroke="currentColor" strokeWidth="1.6" />
        <rect x="4" y="17" width="7" height="7" rx="1.2" stroke="currentColor" strokeWidth="1.6" />
        <path d="M18 18h2v2m2-2h2v2m-6 2h2m2 0h2m-7 2h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="m15.5 13.8 2 2 4-4" stroke="#d52331" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg className="qr-option-icon" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <rect x="6.5" y="4.5" width="15" height="20" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M10 10h8M10 14h2m3 0h2m-7 4h2m3 0h2" stroke="#d52331" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M11 4.5v-2h6v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function QrOptionsSheet({
  expanded = false,
  onClose,
  onScan,
  onReceive,
  onConfirm,
}: {
  expanded?: boolean;
  onClose: () => void;
  onScan: () => void;
  onReceive: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="qr-sheet-backdrop" onClick={onClose}>
      <section
        className={`qr-options-sheet${expanded ? ' qr-options-sheet-expanded' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="qr-options-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="qr-sheet-handle" />
        <h2 id="qr-options-title">Opciones con código QR</h2>
        <button className="qr-option-row" onClick={onScan}>
          <QrOptionIcon kind="scan" />
          <span>Pasar Plata o Comprar por QR</span>
        </button>
        <button className="qr-option-row" onClick={onReceive}>
          <QrOptionIcon kind="receive" />
          <span>Mi QR para Recibir Plata</span>
        </button>
        <button className="qr-option-row" onClick={onConfirm}>
          <QrOptionIcon kind="receipt" />
          <span>Confirmar comprobante</span>
        </button>
      </section>
    </div>
  );
}

export function QrScannerScreen({
  purpose,
  onBack,
  onDecoded,
  onHelp,
}: BackProps & {
  purpose: 'pay' | 'receipt';
  onDecoded: (value: string, signal?: AbortSignal) => boolean | string | Promise<boolean | string>;
  onHelp: () => void;
}) {
  const [notice, setNotice] = useState('');
  const [scanning, setScanning] = useState(false);
  const [decoding, setDecoding] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const readerRef = useRef<BrowserQRCodeReader | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(false);
  const isScanningRef = useRef(false);
  const decodingRef = useRef(false);
  const decodeAbortRef = useRef<AbortController | null>(null);
  const cameraAttemptRef = useRef(0);
  const scanTimerRef = useRef<number | null>(null);
  const title = purpose === 'receipt' ? 'Confirmar comprobante' : 'Comprar';

  const stopCamera = () => {
    cameraAttemptRef.current += 1;
    isScanningRef.current = false;
    if (scanTimerRef.current !== null) window.clearTimeout(scanTimerRef.current);
    scanTimerRef.current = null;
    const video = videoRef.current;
    const stream = streamRef.current ?? video?.srcObject as MediaStream | null;
    streamRef.current = null;
    stream?.getTracks().forEach((track) => track.stop());
    if (video) {
      video.pause();
      video.srcObject = null;
    }
    if (mountedRef.current) setScanning(false);
  };

  const handleDecoded = async (value: string) => {
    if (!mountedRef.current || decodingRef.current) return;
    stopCamera();
    const controller = new AbortController();
    decodeAbortRef.current = controller;
    decodingRef.current = true;
    setDecoding(true);
    setNotice('Leyendo el código QR…');
    try {
      const response = await onDecoded(value, controller.signal);
      if (!mountedRef.current || controller.signal.aborted) return;
      setNotice(typeof response === 'string' ? response : '');
    } catch {
      if (mountedRef.current && !controller.signal.aborted) {
        setNotice('No se pudo consultar la información del QR. Intenta de nuevo.');
      }
    } finally {
      if (decodeAbortRef.current === controller) decodeAbortRef.current = null;
      decodingRef.current = false;
      if (mountedRef.current) setDecoding(false);
    }
  };

  const startCamera = async () => {
    if (decodingRef.current) return;
    if (isScanningRef.current) {
      stopCamera();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !videoRef.current) {
      if (mountedRef.current) setNotice('No se pudo abrir la cámara. Revisa el permiso o elige una imagen del código QR.');
      return;
    }

    const attempt = ++cameraAttemptRef.current;
    setNotice('');
    isScanningRef.current = true;
    setScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' } },
      });
      if (!mountedRef.current || attempt !== cameraAttemptRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        stopCamera();
        return;
      }
      video.srcObject = stream;
      await video.play();

      const reader = readerRef.current ?? new BrowserQRCodeReader();
      readerRef.current = reader;
      const scanFrame = async () => {
        if (!mountedRef.current || attempt !== cameraAttemptRef.current || !isScanningRef.current) return;
        const target = videoRef.current;
        if (target && target.readyState >= 2 && target.videoWidth > 0) {
          try {
            const result = await reader.decodeOnceFromVideoElement(target);
            if (mountedRef.current && attempt === cameraAttemptRef.current) {
              await handleDecoded(result.getText());
              return;
            }
          } catch {
            // A frame without a readable QR is expected; keep the scanner waiting.
          }
        }
        if (mountedRef.current && attempt === cameraAttemptRef.current && isScanningRef.current) {
          scanTimerRef.current = window.setTimeout(() => { void scanFrame(); }, 220);
        }
      };
      void scanFrame();
    } catch {
      if (!mountedRef.current || attempt !== cameraAttemptRef.current) return;
      stopCamera();
      setNotice('No se pudo abrir la cámara. Revisa el permiso o elige una imagen del código QR.');
    }
  };

  const decodeImage = async (file?: File) => {
    if (!file || !mountedRef.current || decodingRef.current) return;
    stopCamera();
    const imageUrl = URL.createObjectURL(file);
    const controller = new AbortController();
    decodeAbortRef.current = controller;
    decodingRef.current = true;
    setDecoding(true);
    setNotice('Leyendo el código QR…');
    let restartCamera = true;
    let statusMessage = '';

    try {
      let rawValue = '';
      const Detector = (window as Window & { BarcodeDetector?: NativeQrDetector }).BarcodeDetector;
      if (Detector) {
        try {
          const image = new window.Image();
          image.decoding = 'async';
          image.src = imageUrl;
          await image.decode();
          const results = await new Detector({ formats: ['qr_code'] }).detect(image);
          rawValue = results.find((result) => result.rawValue?.trim())?.rawValue?.trim() ?? '';
        } catch {
          // Use ZXing if the browser detector is unavailable or cannot read this image.
        }
      }

      if (!rawValue) {
        const reader = readerRef.current ?? new BrowserQRCodeReader();
        readerRef.current = reader;
        rawValue = (await reader.decodeFromImageUrl(imageUrl)).getText();
      }
      if (!mountedRef.current || controller.signal.aborted) return;

      const response = await onDecoded(rawValue, controller.signal);
      if (!mountedRef.current || controller.signal.aborted) return;
      statusMessage = typeof response === 'string' ? response : '';
      setNotice(statusMessage);
      restartCamera = Boolean(statusMessage);
    } catch {
      if (mountedRef.current && !controller.signal.aborted) {
        statusMessage = 'No se detectó un QR legible en esa imagen. El escáner sigue activo.';
        setNotice(statusMessage);
      }
    } finally {
      URL.revokeObjectURL(imageUrl);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (decodeAbortRef.current === controller) decodeAbortRef.current = null;
      decodingRef.current = false;
      if (mountedRef.current) {
        setDecoding(false);
        if (restartCamera && !controller.signal.aborted) {
          await startCamera();
          if (mountedRef.current && statusMessage) setNotice(statusMessage);
        }
      }
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    void startCamera();
    return () => {
      mountedRef.current = false;
      decodeAbortRef.current?.abort();
      decodeAbortRef.current = null;
      stopCamera();
    };
  }, []);

  return (
    <main className="feature-screen qr-scan-screen">
      <FeatureHeader title={title} onBack={() => { decodeAbortRef.current?.abort(); stopCamera(); onBack(); }} />
      <p className="qr-scan-instruction">
        {purpose === 'receipt'
          ? 'Para confirmar el comprobante, escanee el código QR que le muestra a su cliente o elíjalo desde la galería de imágenes de su celular.'
          : 'Para comprar, ubique el código QR en el recuadro o elija una imagen desde su galería.'}
      </p>
      <div className="qr-camera-surface" onClick={() => { if (!scanning && !decoding) void startCamera(); }}>
        <video ref={videoRef} className={`qr-camera-video ${scanning ? 'qr-camera-video-active' : ''}`} muted playsInline autoPlay />
        <div className="qr-camera-frame">
          <span />
          <span />
          <span />
          <span />
        </div>
      </div>
      {notice && <p className="feature-inline-notice" role="status">{notice}</p>}
      <input
        ref={fileInputRef}
        className="qr-file-input"
        type="file"
        accept="image/*"
        aria-label="Elegir imagen con código QR"
        onChange={(event) => { void decodeImage(event.target.files?.[0]); }}
      />
      <button
        className="qr-gallery-button"
        disabled={decoding}
        onClick={() => { fileInputRef.current?.click(); }}
      >
        <Image size={19} strokeWidth={1.8} />
        <span>{decoding ? 'Leyendo QR…' : 'Elegir imagen'}</span>
      </button>
      <button className="qr-help-bubble" type="button" onClick={onHelp} aria-label="¿Necesitas ayuda?">
        ¿Necesita<br />Ayuda?
      </button>
    </main>
  );
}

export function TopesScreen({ onBack, onIncrease, onHelp }: BackProps & { onIncrease: () => void; onHelp: () => void }) {
  return (
    <main className="topes-screen">
      <FeatureHeader title="Topes" onBack={onBack} />
      <p className="topes-intro">El Tope mensual para su DaviPlata<br />es de <strong>$11.024.727</strong></p>
      <div className="topes-chart" aria-label="Saldo disponible de demostración">
        <svg viewBox="0 0 220 220" aria-hidden="true">
          <circle cx="110" cy="110" r="86" className="topes-ring-track" />
          <circle cx="110" cy="110" r="86" className="topes-ring-progress" />
          <circle cx="110" cy="110" r="67" className="topes-ring-inner" />
        </svg>
        <div className="topes-chart-copy">
          <strong>$7.566.041</strong>
          <span>¿Cuánto puedo<br />recibir?</span>
          <CircleHelp size={14} />
        </div>
      </div>
      <div className="topes-legend">
        <div>
          <span className="topes-legend-title"><i />Cuánto ha recibido<br />durante este mes:</span>
          <strong>$3.458.308</strong>
        </div>
        <div>
          <span className="topes-legend-title"><i />Cuánto tenía al<br />inicio del mes: <CircleHelp size={13} /></span>
          <strong>$378</strong>
        </div>
      </div>
      <button className="topes-increase-button" onClick={onIncrease}>Aumentar Topes</button>
      <p className="topes-demo-note">Valores ilustrativos · no corresponden a límites reales.</p>
      <button className="feature-help-bubble" type="button" onClick={onHelp} aria-label="¿Necesitas ayuda?">
        ¿Necesita<br />Ayuda?
      </button>
    </main>
  );
}

export function BusinessHomeScreen({
  balance,
  onPersonal,
  onTopes,
  onMenu,
  onNotifications,
  onLogout,
  onTransfer,
  onWithdraw,
  onQr,
}: {
  balance: string;
  onPersonal: () => void;
  onTopes: () => void;
  onMenu: () => void;
  onNotifications: () => void;
  onLogout: () => void;
  onTransfer: () => void;
  onWithdraw: () => void;
  onQr: () => void;
}) {
  return (
    <main className="business-screen">
      <header className="business-header">
        <button aria-label="Menú" onClick={onMenu}><Menu size={23} /></button>
        <div className="business-wordmark"><span>Davi</span><small>plata</small></div>
        <button aria-label="Notificaciones" onClick={onNotifications}><Bell size={21} /></button>
        <button aria-label="Salir" onClick={onLogout}><LogOut size={20} /></button>
      </header>
      <div className="business-tabs">
        <button onClick={onPersonal}>Mi DaviPlata</button>
        <button className="selected">Mi Negocio</button>
      </div>
      <button className="business-limits" onClick={onTopes}>Topes <span>◉</span></button>
      <section className="business-balance">
        <span>¿Cuánto tengo?</span>
        <strong>{balance}</strong>
        <small>Disponible</small>
      </section>
      <div className="business-actions">
        <button onClick={onTransfer}><span><ArrowRight size={28} /></span>Pasar plata</button>
        <button onClick={onWithdraw}><span><ArrowLeft size={28} /></span>Sacar plata</button>
      </div>
      <section className="business-sell">
        <h1>Trabajos HTML</h1>
        <div className="business-sell-card">
          <strong>Vender</strong>
          <p>Elija una opción para recibir el pago de su venta.</p>
          <button onClick={onQr}><QrCode size={25} /><span>Código QR</span></button>
        </div>
      </section>
    </main>
  );
}

const shopCategories = ['Cines', 'Halloween', 'Nuevo', 'Apuestas'];
const shopItems = [
  { name: 'CINE COLOMBIA', mark: 'CC', color: 'blue', category: 'Cines' },
  { name: 'CINEMARK', mark: 'CINEMARK', color: 'red', category: 'Cines' },
  { name: 'ROYAL FILMS', mark: 'ROYAL FILMS', color: 'navy', category: 'Cines' },
  { name: 'Cinépolis', mark: '✦ Cinépolis', color: 'gold', category: 'Cines' },
  { name: 'Procinal', mark: 'Procinal', color: 'red', category: 'Cines' },
  { name: 'CineLand', mark: 'CineLand', color: 'purple', category: 'Cines' },
  { name: 'Cineprox', mark: 'Cineprox', color: 'blue', category: 'Cines' },
  { name: 'DaviPlata', mark: 'NUEVO', color: 'red', category: 'Nuevo' },
  { name: 'Halloween', mark: 'HALLOWEEN', color: 'purple', category: 'Halloween' },
  { name: 'Apuestas', mark: 'ALIADO', color: 'navy', category: 'Apuestas' },
];

export function VirtualShopScreen({ onBack }: BackProps) {
  const [category, setCategory] = useState('Cines');
  const [selectedStore, setSelectedStore] = useState('');
  const filteredItems = shopItems.filter((item) => item.category === category);
  return (
    <main className="feature-screen shop-screen">
      <FeatureHeader title="Tienda Virtual" onBack={onBack} showClose={false} />
      <section className="shop-heading">
        <strong>Nuestros aliados</strong>
        <button onClick={() => setCategory('Cines')} aria-label="Categorías"><Grid2X2 size={23} /><small>Cine</small></button>
      </section>
      <div className="shop-categories" role="tablist" aria-label="Categorías de la tienda">
        {shopCategories.map((item) => (
          <button key={item} role="tab" aria-selected={category === item} className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>
            {item}
          </button>
        ))}
      </div>
      <section className="shop-grid">
        {filteredItems.map((item) => (
          <button className="shop-card" key={item.name} onClick={() => setSelectedStore(item.name)}>
            <strong className={`shop-brand ${item.color}`}>{item.mark}</strong>
            <span>Bonos de boletería y confitería</span>
          </button>
        ))}
      </section>
      <div className="feature-disclosure shop-disclosure">Tienda de demostración · no se realizan compras reales</div>
      {selectedStore && (
        <div className="feature-modal-backdrop" onClick={() => setSelectedStore('')}>
          <section className="feature-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <button className="feature-modal-close" onClick={() => setSelectedStore('')} aria-label="Cerrar"><X size={20} /></button>
            <ShoppingBag size={30} />
            <h2>{selectedStore}</h2>
            <p>Los bonos y compras están desactivados en esta demostración.</p>
            <button className="feature-red-button" onClick={() => setSelectedStore('')}>Entendido</button>
          </section>
        </div>
      )}
    </main>
  );
}

type DiscountSlide = {
  brand: string;
  title: string;
  detail: string;
  action: string;
  kind: string;
  highlight?: string;
  code?: string;
  terms?: string;
};

const discountSlides: DiscountSlide[] = [
  {
    brand: 'DaviPlata',
    title: 'Aprovecha descuentos y promociones exclusivas pagando con tus Tarjetas DaviPlata.',
    detail: 'Descubre beneficios disponibles para ti.',
    action: 'Conoce más',
    kind: 'intro',
  },
  {
    brand: 'VANGO',
    title: 'Paga tus viajes con tu Tarjeta Débito o Crédito Digital DaviPlata Mastercard',
    detail: 'Recibe 20% de dto. automático. Tope: $3.000 por recorrido.',
    action: 'Conoce más',
    kind: 'travel',
    terms: 'Válido hasta el 25 de octubre de 2026.',
  },
  {
    brand: 'MINCA',
    title: 'Recibe 10% de dto. en vehículos y 30% de dto. en accesorios',
    detail: 'Pagando en puntos físicos con tu Tarjeta Débito o Crédito Digital DaviPlata.',
    action: 'Conoce más',
    kind: 'vehicle',
    terms: 'Aplica hasta el 15 de noviembre de 2026.',
  },
  {
    brand: 'Farmatodo',
    title: 'de descuento',
    highlight: '$25.000',
    detail: 'Por compras de mínimo $140.000 con la Tarjeta Débito o Crédito DaviPlata en la app o página web de Farmatodo.',
    action: 'Redímelo',
    kind: 'pharmacy',
    code: 'DAVIM',
    terms: 'Válido del 1 de septiembre al 31 de diciembre de 2026.',
  },
  {
    brand: 'Ta-Da',
    title: 'de descuento',
    highlight: '35%',
    detail: 'Los jueves en compras de cervezas desde $50.000 en la app TaDa Delivery Colombia. Paga con tu Tarjeta Débito o Crédito Digital DaviPlata.',
    action: 'Redímelo',
    kind: 'food',
    code: 'TADAFEST',
    terms: 'Tope de descuento $20.000 por compra. Vigencia del 20 de agosto al 31 de diciembre de 2026 o hasta agotar 15.000 cupones.',
  },
  {
    brand: 'Pizza Hut',
    title: 'de descuento',
    highlight: '40%',
    detail: 'Los miércoles en pizzas medianas de la carta en recetas Lover’s y Supremas, pagando con tu Tarjeta Débito o Crédito Digital DaviPlata Mastercard.',
    action: 'Redímelo',
    kind: 'pizza',
    code: 'PIZZADAY',
    terms: 'Válido todos los miércoles del 12 de agosto al 30 de diciembre de 2026.',
  },
];

export function DiscountsScreen({ onBack }: BackProps) {
  const [index, setIndex] = useState(0);
  const [notice, setNotice] = useState('');
  const slide = discountSlides[index];
  const handleOfferAction = async () => {
    if (slide.code) {
      try {
        await navigator.clipboard.writeText(slide.code);
        setNotice(`Código ${slide.code} copiado. Promoción solo de demostración.`);
      } catch {
        setNotice(`Código ${slide.code}. Promoción solo de demostración.`);
      }
      return;
    }
    setNotice('Esta promoción es solo una muestra y no se puede canjear.');
  };
  const move = (direction: number) => {
    setIndex((current) => (current + direction + discountSlides.length) % discountSlides.length);
    setNotice('');
  };
  return (
    <main className={`discounts-screen discount-${slide.kind}`}>
      <button className="discounts-close" onClick={onBack} aria-label="Cerrar"><X size={24} /></button>
      {index === 0 ? (
        <section className="discounts-intro">
          <p>Aprovecha descuentos y promociones exclusivas</p>
          <h1>pagando con tus<br />Tarjetas DaviPlata.</h1>
          <div className="discount-person-art" aria-hidden="true">
            <div className="discount-person-head" />
            <div className="discount-person-body" />
            <div className="discount-ticket-art"><PercentMark /></div>
          </div>
        </section>
      ) : (
        <section className="discount-offer">
          <div className="discount-offer-top">
            <span className="discount-brand-pill">{slide.brand}</span>
            {slide.highlight && <strong className="discount-highlight">{slide.highlight}</strong>}
            <h1>{slide.title}</h1>
          </div>
          <div className="discount-offer-bottom">
            <p>{slide.detail}</p>
            <div className="discount-card-art" aria-hidden="true">
              <div className="demo-bank-card card-back"><span>DaviPlata</span><i /></div>
              <div className="demo-bank-card card-front"><span>DaviPlata</span><i /></div>
            </div>
            {slide.code && <button className="discount-code-pill" onClick={handleOfferAction}>Usa el código: <strong>{slide.code}</strong><Copy size={16} /></button>}
            <small>{slide.terms ?? 'Promoción de muestra · no canjeable'}</small>
          </div>
          {!slide.code && <button className="discount-offer-action" onClick={handleOfferAction}>{slide.action}</button>}
        </section>
      )}
      <div className="discounts-controls">
        <button onClick={() => move(-1)} aria-label="Promoción anterior"><ChevronLeft size={30} /></button>
        <div className="discounts-dots" aria-label={`Promoción ${index + 1} de ${discountSlides.length}`}>
          {discountSlides.map((item, dotIndex) => <button key={item.kind} className={dotIndex === index ? 'active' : ''} onClick={() => setIndex(dotIndex)} aria-label={`Ver promoción ${dotIndex + 1}`} />)}
        </div>
        <button onClick={() => move(1)} aria-label="Siguiente promoción"><ChevronRight size={30} /></button>
      </div>
      {notice && <div className="discount-notice" role="status">{notice}</div>}
    </main>
  );
}

function PercentMark() {
  return <span className="percent-mark">%</span>;
}

const billCategories = [
  { name: 'Agua', icon: Droplet },
  { name: 'Energía', icon: Lightbulb },
  { name: 'Gas', icon: Flame },
  { name: 'Televisión y Telefonía', icon: Tv },
  { name: 'Salud', icon: Heart },
  { name: 'Conjuntos Residenciales', icon: Building2 },
  { name: 'Inmobiliarias', icon: Home },
  { name: 'Impuestos', icon: Calculator },
  { name: 'Multas de tránsito', icon: Truck },
  { name: 'Otros servicios', icon: Grid2X2 },
];

export function BillsScreen({ onBack, balance }: BackProps & { balance: string }) {
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [reference, setReference] = useState('');
  const [notice, setNotice] = useState('');
  const filteredCategories = billCategories.filter((category) => category.name.toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es')));
  const closeModal = () => {
    setSelectedCategory('');
    setReference('');
    setNotice('');
  };
  return (
    <main className="feature-screen bills-screen">
      <FeatureHeader title="Pagar facturas" onBack={onBack} />
      <div className="bill-available"><span>Disponible</span><strong>{balance}</strong></div>
      <h1 className="bill-title">Elige el servicio o convenio<br />que quieres pagar</h1>
      <div className="bill-search-row">
        <label><Search size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar servicio o convenio" /></label>
        <button aria-label="Escanear factura" onClick={() => setNotice('El escáner de facturas es solo de demostración.')}><ScanLine size={25} /></button>
      </div>
      {notice && !selectedCategory && <div className="feature-inline-notice" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Cerrar aviso"><X size={15} /></button></div>}
      <section className="bill-category-grid">
        {filteredCategories.map(({ name, icon: Icon }) => (
          <button key={name} onClick={() => { setSelectedCategory(name); setNotice(''); }}>
            <span><Icon size={29} strokeWidth={1.45} /></span>
            <small>{name}</small>
          </button>
        ))}
        {!filteredCategories.length && <p className="bill-empty">No encontramos ese servicio.</p>}
      </section>
      <div className="feature-disclosure">Simulación · no se consulta ni paga ninguna factura real</div>
      {selectedCategory && (
        <div className="feature-modal-backdrop" onClick={closeModal}>
          <section className="feature-modal bill-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <button className="feature-modal-close" onClick={closeModal} aria-label="Cerrar"><X size={20} /></button>
            <ReceiptText size={31} />
            <h2>{selectedCategory}</h2>
            <p>Ingresa una referencia ficticia para ver el siguiente paso de demostración.</p>
            <label className="bill-reference-field"><span>Referencia de pago</span><input value={reference} onChange={(event) => { setReference(event.target.value); setNotice(''); }} placeholder="Número de referencia" inputMode="numeric" /></label>
            {notice && <p className="feature-inline-notice">{notice}</p>}
            <button
              className="feature-red-button"
              disabled={reference.trim().length < 4}
              onClick={() => setNotice('Consulta simulada. No se realizó ningún pago ni se enviaron datos.')}
            >
              Continuar
            </button>
          </section>
        </div>
      )}
    </main>
  );
}

export function RecipientsScreen({
  onBack,
  items,
  onSave,
  onDelete,
}: BackProps & {
  items: DaviRecipient[];
  onSave: (recipient: Omit<DaviRecipient, 'id'>) => boolean;
  onDelete: (id: string) => void;
}) {
  const [rail, setRail] = useState<'daviplata' | 'breb'>('daviplata');
  const [modalOpen, setModalOpen] = useState(false);
  const [formRail, setFormRail] = useState<'daviplata' | 'breb'>('daviplata');
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [bank, setBank] = useState('');
  const [error, setError] = useState('');
  const [menuId, setMenuId] = useState('');
  const visibleItems = items.filter((item) => item.rail === rail);
  const closeModal = () => {
    setModalOpen(false);
    setName('');
    setKey('');
    setBank('');
    setError('');
  };
  const openNewRecipient = () => {
    setFormRail(rail);
    setModalOpen(true);
    setError('');
  };
  const saveRecipient = () => {
    const cleanName = name.trim();
    const cleanKey = key.trim();
    const cleanBank = formRail === 'daviplata' ? 'DaviPlata' : bank.trim();
    const phoneDigits = cleanKey.replace(/\D/g, '');
    if (!cleanName) {
      setError('Escribe el nombre del destinatario.');
      return;
    }
    if (formRail === 'daviplata' && phoneDigits.length !== 10) {
      setError('Ingresa un celular de 10 dígitos.');
      return;
    }
    if (formRail === 'breb' && cleanKey.length < 5) {
      setError('La llave de prueba debe tener al menos 5 caracteres.');
      return;
    }
    if (formRail === 'breb' && !cleanBank) {
      setError('Escribe el banco destino.');
      return;
    }
    const saved = onSave({
      name: cleanName,
      key: formRail === 'daviplata' ? phoneDigits : cleanKey,
      bank: cleanBank,
      rail: formRail,
    });
    if (!saved) {
      setError('Ya existe un destinatario de prueba con ese dato.');
      return;
    }
    setRail(formRail);
    closeModal();
  };
  const formattedDestination = (item: DaviRecipient) =>
    item.rail === 'daviplata'
      ? `Celular: ${item.key.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3')}`
      : `Llave: ${item.key} · ${item.bank}`;

  return (
    <main className="recipients-screen">
      <header className="recipients-header">
        <button onClick={onBack} aria-label="Volver"><ArrowLeft size={24} /></button>
        <h1>Destinatarios</h1>
        <span />
      </header>
      <div className="recipients-tabs" role="tablist" aria-label="Tipo de destinatario">
        <button className={rail === 'daviplata' ? 'selected' : ''} onClick={() => { setRail('daviplata'); setMenuId(''); }}>Daviplata</button>
        <button className={rail === 'breb' ? 'selected' : ''} onClick={() => { setRail('breb'); setMenuId(''); }}>Bre-B</button>
      </div>
      <section className="recipients-list" aria-label={`Destinatarios ${rail === 'daviplata' ? 'DaviPlata' : 'Bre-B'}`}>
        {visibleItems.map((item) => (
          <article className="recipient-card" key={item.id}>
            <UserRound size={22} />
            <div><strong>{item.name}</strong><span>{formattedDestination(item)}</span></div>
            <button className="recipient-menu-button" onClick={() => setMenuId((current) => current === item.id ? '' : item.id)} aria-label={`Opciones de ${item.name}`}>
              <MoreVertical size={21} />
            </button>
            {menuId === item.id && (
              <div className="recipient-menu">
                <button onClick={() => { onDelete(item.id); setMenuId(''); }}>Eliminar</button>
              </div>
            )}
          </article>
        ))}
        {!visibleItems.length && <p className="recipients-empty">No hay destinatarios guardados en esta lista.</p>}
      </section>
      <p className="recipients-disclosure">Datos de prueba guardados solo en este dispositivo.</p>
      <button className="recipient-add-button" onClick={openNewRecipient} aria-label="Agregar destinatario"><Plus size={25} strokeWidth={2.4} /></button>
      {modalOpen && (
        <div className="feature-modal-backdrop" onClick={closeModal}>
          <section className="feature-modal recipient-modal" role="dialog" aria-modal="true" aria-labelledby="recipient-modal-title" onClick={(event) => event.stopPropagation()}>
            <h2 id="recipient-modal-title">Nuevo destinatario</h2>
            <div className="recipients-tabs recipient-modal-tabs" role="tablist" aria-label="Tipo de destinatario nuevo">
              <button className={formRail === 'daviplata' ? 'selected' : ''} onClick={() => { setFormRail('daviplata'); setError(''); }}>Daviplata</button>
              <button className={formRail === 'breb' ? 'selected' : ''} onClick={() => { setFormRail('breb'); setError(''); }}>Bre-B</button>
            </div>
            <label className="recipient-field"><span>Nombre</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre del destinatario" autoComplete="off" /></label>
            <label className="recipient-field">
              <span>{formRail === 'daviplata' ? 'Número de celular' : 'Llave Bre-B'}</span>
              <input value={key} onChange={(event) => setKey(event.target.value)} placeholder={formRail === 'daviplata' ? 'Número de celular' : 'Ingresa una llave de prueba'} inputMode={formRail === 'daviplata' ? 'numeric' : 'text'} autoComplete="off" />
            </label>
            {formRail === 'breb' && <label className="recipient-field"><span>Banco destino</span><input value={bank} onChange={(event) => setBank(event.target.value)} placeholder="Banco destino" autoComplete="off" /></label>}
            {error && <p className="recipient-form-error" role="alert">{error}</p>}
            <button className="feature-red-button" onClick={saveRecipient}>Guardar cambios</button>
            <button className="recipient-cancel-button" onClick={closeModal}>Cancelar</button>
          </section>
        </div>
      )}
    </main>
  );
}

export function TelegramRechargeSheet({
  contacts,
  onClose,
}: {
  contacts: TelegramSupportContact[];
  onClose: () => void;
}) {
  return (
    <div className="recharge-contact-overlay" onClick={onClose}>
      <section className="recharge-contact-modal" role="dialog" aria-modal="true" aria-labelledby="recharge-contact-title" onClick={(event) => event.stopPropagation()}>
        <h2 id="recharge-contact-title">Recargar cuenta</h2>
        <p>Contacta a uno de los administradores para realizar tu recarga</p>
        <div className="recharge-contact-list">
          {contacts.map((contact) => {
            const { username, href } = getTelegramContact(contact.username);
            return (
              <article className="recharge-contact-card" key={contact.role}>
                <div className="recharge-contact-name">
                  <strong>{contact.name.trim() || contact.role}</strong>
                  {contact.name.trim() && <small>{contact.role}</small>}
                </div>
                <span className="telegram-brand-icon" aria-hidden="true"><Send size={19} fill="currentColor" /></span>
                <span className="recharge-contact-handle">{username ? `@${username}` : 'Falta usuario público'}</span>
                {href
                  ? <a href={href} target="_blank" rel="noreferrer" aria-label={`Abrir chat de Telegram con ${contact.name}`}>Abrir chat</a>
                  : <button type="button" disabled>Configurar</button>}
              </article>
            );
          })}
        </div>
        <button className="recharge-contact-close" onClick={onClose}>Cerrar</button>
      </section>
    </div>
  );
}

function getTelegramContact(value: string) {
  const raw = value.trim();
  const simpleHandle = raw.replace(/^@/, '');
  if (/^[A-Za-z0-9_]{5,32}$/.test(simpleHandle)) {
    return { username: simpleHandle, href: `https://t.me/${simpleHandle}` };
  }
  const urlText = /^https?:\/\//i.test(raw) ? raw : raw.startsWith('t.me/') ? `https://${raw}` : '';
  if (!urlText) return { username: '', href: '' };
  try {
    const url = new URL(urlText);
    const host = url.hostname.toLocaleLowerCase('en');
    if (!['t.me', 'www.t.me', 'telegram.me', 'www.telegram.me'].includes(host)) {
      return { username: '', href: '' };
    }
    const username = (url.pathname.split('/').filter(Boolean)[0] ?? '').replace(/^@/, '');
    if (!/^[A-Za-z0-9_]{5,32}$/.test(username)) return { username: '', href: '' };
    return { username, href: `https://t.me/${username}` };
  } catch {
    return { username: '', href: '' };
  }
}
