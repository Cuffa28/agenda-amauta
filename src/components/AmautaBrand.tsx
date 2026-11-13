/** Official vector artwork extracted from the supplied Amauta brand PDF. */
export function AmautaBrand({ dark = false }: { dark?: boolean }) {
  return <div className={`amauta-brand ${dark ? 'brand-on-dark' : ''}`}>
    <img className="brand-logo" src={dark ? '/brand/amauta-logo-inverse.svg' : '/brand/amauta-logo.svg'} width="331" height="90" alt="Amauta · Inversiones Financieras" />
  </div>;
}

export function InitialsAvatar({ name, small = false }: { name: string; small?: boolean }) {
  const parts = name.trim().split(/\s+/);
  const initials = ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[1]?.[0] || '' : parts[0]?.[1] || '')).toUpperCase();
  return <span aria-hidden="true" className={`initials-avatar ${small ? 'avatar-small' : ''}`}>{initials || '—'}</span>;
}
