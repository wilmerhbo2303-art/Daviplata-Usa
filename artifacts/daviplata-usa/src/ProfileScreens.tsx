import { useRef } from 'react';
import type { ReactNode } from 'react';
import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  CreditCard,
  FileText,
  Gauge,
  Image,
  KeyRound,
  LockKeyhole,
  Mail,
  ReceiptText,
  Search,
  TreeDeciduous,
  Users,
  UserRound,
  X,
} from 'lucide-react';

export type ProfileSection = 'security' | 'requests' | 'terms' | null;

type ProfileMenuScreenProps = {
  name: string;
  phone: string;
  photoUrl: string;
  expandedSection: ProfileSection;
  onClose: () => void;
  onOpenPhoto: () => void;
  onLogout: () => void;
  onToggleSection: (section: Exclude<ProfileSection, null>) => void;
  onOption: (label: string) => void;
};

function ProfileOption({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button className="profile-option-row" onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

export function ProfileMenuScreen({
  name,
  phone,
  photoUrl,
  expandedSection,
  onClose,
  onOpenPhoto,
  onLogout,
  onToggleSection,
  onOption,
}: ProfileMenuScreenProps) {
  const sections: Array<{ key: Exclude<ProfileSection, null>; title: string }> = [
    { key: 'security', title: 'Seguridad y Preferencias' },
    { key: 'requests', title: 'Solicitudes y consultas' },
    { key: 'terms', title: 'Términos y condiciones' },
  ];

  return (
    <main className="profile-screen" data-testid="profile-screen">
      <button className="profile-close" onClick={onClose} aria-label="Cerrar perfil">
        <X size={23} strokeWidth={1.8} />
      </button>

      <section className="profile-identity">
        <button className="profile-avatar" onClick={onOpenPhoto} aria-label="Agregar o cambiar foto de perfil">
          {photoUrl && <img src={photoUrl} alt="Foto de perfil" />}
        </button>
        <strong className="profile-name">{name}</strong>
        <span className="profile-phone">{phone}</span>
        <button className="profile-planet-link" onClick={() => onOption('Cuidado del planeta')}>
          <span>Conoce cómo cuidas el planeta al usar DaviPlata</span>
          <TreeDeciduous size={21} strokeWidth={1.8} />
        </button>
      </section>

      <div className="profile-accordion-list">
        {sections.map(({ key, title }) => {
          const isExpanded = expandedSection === key;
          return (
            <section className="profile-accordion" key={key}>
              <button
                className="profile-accordion-heading"
                onClick={() => onToggleSection(key)}
                aria-expanded={isExpanded}
              >
                <span>{title}</span>
                {isExpanded ? <ChevronUp size={22} /> : <ChevronDown size={22} />}
              </button>

              {isExpanded && key === 'security' && (
                <div className="profile-options">
                  <ProfileOption icon={<Gauge />} label="Topes" onClick={() => onOption('Topes')} />
                  <ProfileOption icon={<LockKeyhole />} label="Cambiar clave" onClick={() => onOption('Cambiar clave')} />
                  <ProfileOption icon={<Mail />} label="Cambiar correo" onClick={() => onOption('Cambiar correo')} />
                </div>
              )}

              {isExpanded && key === 'requests' && (
                <div className="profile-options">
                  <ProfileOption icon={<FileText />} label="Certificaciones" onClick={() => onOption('Certificaciones')} />
                  <ProfileOption icon={<ReceiptText />} label="Extractos" onClick={() => onOption('Extractos')} />
                </div>
              )}

              {isExpanded && key === 'terms' && (
                <div className="profile-options">
                  <ProfileOption icon={<FileText />} label="Reglamento" onClick={() => onOption('Reglamento')} />
                  <ProfileOption icon={<BookOpen />} label="Condiciones de uso" onClick={() => onOption('Condiciones de uso')} />
                  <ProfileOption icon={<Users />} label="Tratamiento de datos personales" onClick={() => onOption('Tratamiento de datos personales')} />
                  <ProfileOption icon={<Search />} label="Consulta y reporte" onClick={() => onOption('Consulta y reporte')} />
                  <ProfileOption icon={<UserRound />} label="Datos sensibles" onClick={() => onOption('Datos sensibles')} />
                  <ProfileOption icon={<CreditCard />} label="Tarifas y límites" onClick={() => onOption('Tarifas y límites')} />
                </div>
              )}
            </section>
          );
        })}
      </div>

      <button className="profile-logout" onClick={onLogout}>Salir de DaviPlata</button>
    </main>
  );
}

export function ProfilePhotoScreen({
  onBack,
  onHelp,
  onSelectImage,
}: {
  onBack: () => void;
  onHelp: () => void;
  onSelectImage: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <main className="profile-photo-screen" data-testid="profile-photo-screen">
      <header className="profile-photo-header">
        <button onClick={onBack} aria-label="Volver al perfil"><ArrowLeft size={24} /></button>
        <strong>Perfil</strong>
        <span aria-hidden="true" />
      </header>
      <h1>Tome una foto para su perfil</h1>
      <input
        ref={inputRef}
        className="profile-photo-file-input"
        type="file"
        accept="image/*"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) onSelectImage(file);
          event.currentTarget.value = '';
        }}
        aria-label="Seleccionar foto de perfil"
      />
      <button className="profile-photo-help" onClick={onHelp} aria-label="¿Necesita ayuda?">
        <CircleHelp size={19} />
        <span>¿Necesita<br />Ayuda?</span>
      </button>
      <button className="profile-select-image" onClick={() => inputRef.current?.click()}>
        <Image size={29} strokeWidth={1.8} />
        <span>Seleccione una imagen</span>
      </button>
    </main>
  );
}
