export function AmautaMark({ className = '' }: { className?: string }) {
  return <svg className={className} viewBox="0 0 48 48" fill="none" aria-hidden="true">
    <path d="M7 35 21 10h6l14 25h-8L24 18l-9 17H7Z" fill="currentColor"/>
    <path d="M18 32h12l4 7H14l4-7Z" fill="currentColor" opacity=".55"/>
  </svg>;
}

export function AmautaBrand({ dark = false }: { dark?: boolean }) {
  return <div className={`amauta-brand ${dark ? 'brand-on-dark' : ''}`}>
    <span className="brand-symbol"><AmautaMark/></span>
    <div><span className="brand-wordmark">amauta<span>.</span></span><span className="brand-caption">INVERSIONES</span></div>
  </div>;
}

export function InitialsAvatar({ name, small = false }: { name: string; small?: boolean }) {
  const parts = name.trim().split(/\s+/);
  const initials = ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[1]?.[0] || '' : parts[0]?.[1] || '')).toUpperCase();
  return <span aria-hidden="true" className={`initials-avatar ${small ? 'avatar-small' : ''}`}>{initials || '—'}</span>;
}
