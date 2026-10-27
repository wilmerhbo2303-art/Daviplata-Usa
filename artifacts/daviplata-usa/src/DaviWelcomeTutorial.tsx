import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import introBackground from '../../../attached_assets/8f1d631b63da61e8b2de26ffa2ad1995_1793091264675.jpg';
import './davi-welcome-tutorial.css';

const communityLinks = [
  { label: 'DUEÑO SATAN', url: 'https://t.me/SatanAntiCristos', style: 'owner' },
  { label: 'Grupo', url: 'https://t.me/OrgSatanasMuerte', style: 'group' },
  { label: 'Canal de referencias', url: 'https://t.me/referenciassatanas', style: 'reference' },
  { label: 'Administrador', url: 'https://t.me/ice_cubeOP', style: 'admin' },
  { label: 'Referencias 2', url: 'https://t.me/icecubeOP', style: 'reference-two' },
] as const;

function DaviMiniLogo() {
  return (
    <span className="davi-intro-mini-logo" aria-hidden="true">
      <img src={`${import.meta.env.BASE_URL}daviplata-logo.png`} alt="" />
    </span>
  );
}

export default function DaviWelcomeTutorial({ onDismiss }: { onDismiss: (remember: boolean) => void }) {
  const [step, setStep] = useState(0);
  const dialogRef = useRef<HTMLElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const root = document.getElementById('root');
    const previousInert = root?.inert ?? false;
    const previousOverflow = document.body.style.overflow;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (root) root.inert = true;
    document.body.style.overflow = 'hidden';

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    requestAnimationFrame(() => dialogRef.current?.focus({ preventScroll: true }));

    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      if (root) root.inert = previousInert;
      document.body.style.overflow = previousOverflow;
      if (previousFocusRef.current?.isConnected) previousFocusRef.current.focus({ preventScroll: true });
    };
  }, [onDismiss]);

  const content = (
    <div className="davi-intro-overlay">
      <section
        className="davi-intro-card"
        style={{
          backgroundImage: `linear-gradient(180deg, rgba(26, 4, 17, .58), rgba(15, 2, 15, .9)), url("${introBackground}")`,
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="davi-intro-title"
        tabIndex={-1}
        ref={dialogRef}
      >
        <button className="davi-intro-close" type="button" onClick={() => onDismiss(false)} aria-label="Cerrar">
          ×
        </button>
        <div className="davi-intro-scroll">
          <div className="davi-intro-brand"><DaviMiniLogo /></div>
          {step === 0 ? (
            <>
              <h1 id="davi-intro-title">Comunidad</h1>
              <p className="davi-intro-community-name">『𝕯𝖊𝖒𝖔𝖓𝕷𝖔𝖗𝖉⁶⁶⁶』</p>
              <p className="davi-intro-note">
                DaviPlata USA es un simulador independiente; no es la app oficial de DaviPlata.
              </p>
              <p className="davi-intro-copy">Encuentra nuestros canales de contacto y referencias en Telegram.</p>
              <div className="davi-intro-links">
                {communityLinks.map((link) => (
                  <a
                    key={link.label}
                    className={`davi-intro-link davi-intro-link-${link.style}`}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <DaviMiniLogo />
                    <span>{link.label}</span>
                    <span className="davi-intro-external" aria-hidden="true">↗</span>
                  </a>
                ))}
              </div>
            </>
          ) : (
            <>
              <h1 id="davi-intro-title">¿Cómo instalar DaviPlata USA?</h1>
              <p className="davi-intro-note">
                DaviPlata USA es un simulador independiente; no es la app oficial de DaviPlata.
              </p>
              <section className="davi-intro-platform" aria-labelledby="davi-intro-android">
                <h2 id="davi-intro-android">Pasos (Android)</h2>
                <ol>
                  <li>Abre este sitio en Chrome.</li>
                  <li>Toca ⋮ y elige “Instalar app” o “Añadir a pantalla principal”.</li>
                  <li>Confirma la instalación.</li>
                </ol>
              </section>
              <section className="davi-intro-platform" aria-labelledby="davi-intro-iphone">
                <h2 id="davi-intro-iphone">Pasos (iPhone)</h2>
                <ol>
                  <li>Abre este sitio en Safari.</li>
                  <li>Toca Compartir y luego “Añadir a pantalla de inicio”.</li>
                  <li>Toca “Añadir” para terminar.</li>
                </ol>
              </section>
            </>
          )}
        </div>
        <footer className="davi-intro-footer">
          <button className="davi-intro-secondary" type="button" onClick={() => onDismiss(true)}>
            No mostrar más
          </button>
          <span className="davi-intro-dots" aria-label={`Pantalla ${step + 1} de 2`}>
            {step === 0 ? '● ○' : '○ ●'}
          </span>
          <button
            className="davi-intro-primary"
            type="button"
            onClick={() => step === 0 ? setStep(1) : onDismiss(false)}
          >
            {step === 0 ? 'Siguiente' : 'Cerrar'}
          </button>
        </footer>
      </section>
    </div>
  );

  return createPortal(content, document.body);
}
