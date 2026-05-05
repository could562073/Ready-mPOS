interface IconProps {
  name: string;
  size?: number;
  color?: string;
  stroke?: number;
  className?: string;
}

// 內嵌 SVG 圖示集 — 無外部依賴
export function Icon({ name, size = 20, color = 'currentColor', stroke = 2, className }: IconProps) {
  const props = {
    width: size, height: size, viewBox: '0 0 24 24',
    fill: 'none', stroke: color,
    strokeWidth: stroke, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
    className,
  };
  switch (name) {
    case 'home':        return <svg {...props}><path d="M3 11l9-8 9 8v10a2 2 0 01-2 2h-4v-7h-6v7H5a2 2 0 01-2-2V11z"/></svg>;
    case 'pencil':      return <svg {...props}><path d="M12 20h9M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>;
    case 'chart':       return <svg {...props}><path d="M3 3v18h18M7 14l4-4 4 4 5-6"/></svg>;
    case 'settings':    return <svg {...props}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 008 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H2a2 2 0 110-4h.09A1.65 1.65 0 004.6 8a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V2a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H22a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>;
    case 'plus':        return <svg {...props}><path d="M12 5v14M5 12h14"/></svg>;
    case 'check':       return <svg {...props}><path d="M20 6L9 17l-5-5"/></svg>;
    case 'arrow-up':    return <svg {...props}><path d="M12 19V5M5 12l7-7 7 7"/></svg>;
    case 'arrow-down':  return <svg {...props}><path d="M12 5v14M19 12l-7 7-7-7"/></svg>;
    case 'cash':        return <svg {...props}><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 10v.01M18 14v.01"/></svg>;
    case 'card':        return <svg {...props}><rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20M6 15h2"/></svg>;
    case 'bike':        return <svg {...props}><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6h3l3 6M5.5 17.5l4-9h6l3 6"/></svg>;
    case 'package':     return <svg {...props}><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><path d="M3.27 6.96L12 12l8.73-5.04M12 22V12"/></svg>;
    case 'users':       return <svg {...props}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>;
    case 'tag':         return <svg {...props}><path d="M20.59 13.41L13.42 20.58a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><circle cx="7" cy="7" r="1.5" fill={color}/></svg>;
    case 'cloud':       return <svg {...props}><path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/></svg>;
    case 'cloud-check': return <svg {...props}><path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/><path d="M9 14l2 2 4-4"/></svg>;
    case 'wifi-off':    return <svg {...props}><path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.58 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01"/></svg>;
    case 'camera':      return <svg {...props}><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>;
    case 'calendar':    return <svg {...props}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>;
    case 'chevron-r':   return <svg {...props}><path d="M9 6l6 6-6 6"/></svg>;
    case 'chevron-l':   return <svg {...props}><path d="M15 6l-9 6 9 6"/></svg>;
    case 'chevron-d':   return <svg {...props}><path d="M6 9l6 6 6-6"/></svg>;
    case 'sparkle':     return <svg {...props}><path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5z"/></svg>;
    case 'receipt':     return <svg {...props}><path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 1 2V2H4z"/><path d="M8 7h8M8 11h8M8 15h5"/></svg>;
    case 'trend-up':    return <svg {...props}><path d="M23 6l-9.5 9.5-5-5L1 18M17 6h6v6"/></svg>;
    case 'trend-down':  return <svg {...props}><path d="M23 18l-9.5-9.5-5 5L1 6M17 18h6v-6"/></svg>;
    case 'wallet':      return <svg {...props}><path d="M21 12V7H5a2 2 0 010-4h14v4"/><path d="M3 5v14a2 2 0 002 2h16v-5"/><path d="M18 12a2 2 0 100 4h4v-4h-4z"/></svg>;
    case 'sync':        return <svg {...props}><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>;
    case 'x':           return <svg {...props}><path d="M18 6L6 18M6 6l12 12"/></svg>;
    case 'circle-dot':  return <svg {...props}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/></svg>;
    default:            return null;
  }
}
