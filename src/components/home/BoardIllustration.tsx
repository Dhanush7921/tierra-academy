/** Static SVG fallback of the hero board (no WebGL / reduced data / reduced motion). */
export function BoardIllustration({ className }: { className?: string }) {
  const pins = Array.from({ length: 19 }, (_, i) => 70 + i * 24);
  return (
    <svg viewBox="0 0 600 340" className={className} role="img" aria-label="Illustration of an ESP32 microcontroller board with glowing copper traces">
      <defs>
        <linearGradient id="bi-pcb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#13304a" /><stop offset="1" stopColor="#0b1d2f" /></linearGradient>
        <linearGradient id="bi-trace" x1="0" x2="1"><stop offset="0" stopColor="#ff7a00" /><stop offset="1" stopColor="#ffd60a" /></linearGradient>
        <filter id="bi-glow"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      <ellipse cx="300" cy="300" rx="260" ry="26" fill="#ff7a00" opacity="0.18" />
      <rect x="40" y="70" width="520" height="200" rx="14" fill="url(#bi-pcb)" stroke="#2b4a66" />
      {pins.map((x) => <g key={x}><rect x={x - 4} y="76" width="8" height="8" rx="2" fill="#f2c15c" /><rect x={x - 4} y="256" width="8" height="8" rx="2" fill="#f2c15c" /></g>)}
      <g filter="url(#bi-glow)" stroke="url(#bi-trace)" strokeWidth="4" fill="none" strokeLinecap="round">
        <path d="M250 150 H330 V110 H380" /><path d="M250 170 H350 V130 H430" /><path d="M250 190 H370 V230 H460" /><path d="M250 210 H330 V250" />
        <path d="M420 150 H500" /><path d="M420 175 H520" />
      </g>
      <rect x="70" y="105" width="190" height="130" rx="8" fill="#14161c" />
      <rect x="110" y="112" width="140" height="116" rx="6" fill="#d9dde4" />
      <text x="180" y="165" textAnchor="middle" fontFamily="monospace" fontSize="14" fill="#3a3f48">ESP32-WROOM</text>
      <text x="180" y="185" textAnchor="middle" fontFamily="monospace" fontSize="11" fill="#3a3f48">TIERRA</text>
      <path d="M80 115 V225 M92 115 V225 M80 115 H92 M80 225 H92" stroke="#c8743a" strokeWidth="3" fill="none" />
      <rect x="400" y="190" width="44" height="44" rx="4" fill="#14161c" />
      <rect x="520" y="140" width="40" height="60" rx="4" fill="#c9ced6" />
      <circle cx="490" cy="110" r="6" fill="#ff3b30" filter="url(#bi-glow)" />
      <circle cx="510" cy="110" r="6" fill="#3b82f6" filter="url(#bi-glow)" />
    </svg>
  );
}
