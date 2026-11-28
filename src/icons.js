// Category icons: simple one-colour line icons drawn for Money Atlas (24×24 grid, 1.8px rounded strokes).
// Each value is the inner SVG markup; colour comes from `currentColor`, so icons follow the theme.

export const ICONS = {
  onigiri: '<path d="M12 4c-1.2 0-2 .8-2.6 1.8L5 15c-1 2 .3 4 2.5 4h9c2.2 0 3.5-2 2.5-4L14.6 5.8C14 4.8 13.2 4 12 4z"/><path d="M9.5 14h5v5h-5z"/>',
  bowl: '<path d="M4 11h16a8 8 0 0 1-16 0z"/><path d="M9 4v3M12 3v4M15 4v3"/>',
  cart: '<path d="M3 4h2l2.2 10.2a1 1 0 0 0 1 .8h8.6a1 1 0 0 0 1-.8L19.5 8H6.2"/><circle cx="9" cy="19" r="1.3"/><circle cx="17" cy="19" r="1.3"/>',
  cup: '<path d="M5 9h11v4a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M8.5 3.5v2.5M12 3.5v2.5"/><path d="M4 21h13"/>',
  beer: '<path d="M6 8h9v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z"/><path d="M15 10h2a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2"/><path d="M6 8c0-2 1.3-3.3 3-3.3.9-1.1 3.1-1.1 4 0 1.5 0 2 1.3 2 3.3"/><path d="M9.5 11.5v5M12 11.5v5"/>',
  wine: '<path d="M8 3h8l-.4 5a3.6 3.6 0 0 1-7.2 0z"/><path d="M12 12v8M8.5 20.5h7"/>',
  gamepad: '<path d="M6.5 8h11a4 4 0 0 1 3.9 4.8l-.7 3.3a2.3 2.3 0 0 1-3.9 1.1L15 15H9l-1.8 2.2a2.3 2.3 0 0 1-3.9-1.1l-.7-3.3A4 4 0 0 1 6.5 8z"/><path d="M7.5 10.5v3.5M5.75 12.25h3.5"/><circle cx="16" cy="11" r=".6" fill="currentColor"/><circle cx="17.8" cy="13" r=".6" fill="currentColor"/>',
  film: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9.5h18M3 14.5h18M8 5v4.5M16 5v4.5M8 14.5V19M16 14.5V19"/>',
  music: '<path d="M9 17.5V6l10-2v11.5"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="15.5" r="2.5"/>',
  ball: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17M4 9.5c3.5 1.6 12.5 1.6 16 0M4 14.5c3.5-1.6 12.5-1.6 16 0"/>',
  dumbbell: '<path d="M6.5 7v10M3.5 9.5v5M17.5 7v10M20.5 9.5v5M6.5 12h11"/>',
  bottle: '<path d="M10 3h4v3l2 2v11a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V8l2-2z"/><path d="M8 12h8"/>',
  box: '<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/>',
  train: '<rect x="6" y="3" width="12" height="14" rx="3"/><path d="M6 10h12M9 17l-2 4M15 17l2 4"/><circle cx="9.5" cy="13.5" r=".7" fill="currentColor"/><circle cx="14.5" cy="13.5" r=".7" fill="currentColor"/>',
  car: '<path d="M3 13l2-5a2 2 0 0 1 1.9-1.3h10.2A2 2 0 0 1 19 8l2 5v3.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M3 13h18M6.5 17.5V20M17.5 17.5V20"/><circle cx="7" cy="15" r=".8" fill="currentColor"/><circle cx="17" cy="15" r=".8" fill="currentColor"/>',
  fuel: '<path d="M5 20V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v15M4 20h12M5 10h10"/><path d="M15 8l3 3v6a1.5 1.5 0 0 0 3 0V9.5L18.5 7"/>',
  plane: '<path d="M12 3a1.5 1.5 0 0 1 1.5 1.5V10l7 4.5V16l-7-2.5v4l2 1.5V20L12 19l-3.5 1v-1l2-1.5v-4l-7 2.5v-1.5l7-4.5V4.5A1.5 1.5 0 0 1 12 3z"/>',
  bed: '<path d="M3 19V7M3 14h18v5M21 14a3 3 0 0 0-3-3h-7v3"/><circle cx="7" cy="10.5" r="1.7"/>',
  scissors: '<circle cx="6" cy="7" r="2.5"/><circle cx="6" cy="17" r="2.5"/><path d="M8.2 8.3L20 18M8.2 15.7L20 6"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M18.5 16v4M16.5 18h4"/>',
  pill: '<path d="M10.5 19.5a4.95 4.95 0 0 1-7-7l9-9a4.95 4.95 0 0 1 7 7z"/><path d="M8 8l8 8"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.3a4.2 4.2 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z"/>',
  cross: '<path d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z"/>',
  book: '<path d="M4 18.5V5.5A2.5 2.5 0 0 1 6.5 3H20v18H6.5A2.5 2.5 0 0 1 4 18.5z"/><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20M8.5 7.5h7"/>',
  study: '<path d="M2.5 9L12 4.5 21.5 9 12 13.5z"/><path d="M6.5 11v5c3 2 8 2 11 0v-5M21.5 9v5"/>',
  pen: '<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/>',
  palette: '<path d="M12 21a9 9 0 1 1 9-9c0 2-1.5 3-3.5 3H15a2 2 0 0 0-1.5 3.3A1.6 1.6 0 0 1 12 21z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="14.5" cy="7" r="1"/>',
  laptop: '<rect x="5" y="5" width="14" height="10" rx="1.5"/><path d="M3 19h18"/>',
  camera: '<path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>',
  shirt: '<path d="M8 4l-5 3 2 4 2-1v10h10V10l2 1 2-4-5-3a4 4 0 0 1-8 0z"/>',
  shoe: '<path d="M3 15.5V11l4-1 2-4 3 1-1 3 8.4 2.8a2.5 2.5 0 0 1 1.6 2.4v1.3z"/><path d="M3 15.5h18V19H3z"/>',
  gift: '<rect x="4" y="10" width="16" height="10" rx="1"/><rect x="3" y="7" width="18" height="3" rx="1"/><path d="M12 7v13"/><path d="M12 7S10.5 3 8.5 3.5 8 7 12 7zM12 7s1.5-4 3.5-3.5S16 7 12 7z"/>',
  paw: '<circle cx="6.5" cy="10.5" r="1.6"/><circle cx="10" cy="6.8" r="1.6"/><circle cx="14" cy="6.8" r="1.6"/><circle cx="17.5" cy="10.5" r="1.6"/><path d="M7.8 17c0-3 2-5.3 4.2-5.3S16.2 14 16.2 17a2 2 0 0 1-2.6 1.9c-1.1-.3-2.1-.3-3.2 0A2 2 0 0 1 7.8 17z"/>',
  person: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  home: '<path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M8.6 14.6A6 6 0 1 1 15.4 14.6c-.9.8-1.4 1.6-1.4 2.4h-4c0-.8-.5-1.6-1.4-2.4z"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  wifi: '<path d="M4.5 10a11 11 0 0 1 15 0M7.5 13.3a6.5 6.5 0 0 1 9 0"/><circle cx="12" cy="17.5" r="1" fill="currentColor"/>',
  repeat: '<path d="M17 3l3 3-3 3M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 0 1-3 3H4"/>',
  shield: '<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/>',
  bank: '<path d="M3 9l9-5 9 5M5 9.5V18M9.5 9.5V18M14.5 9.5V18M19 9.5V18M3 20.5h18"/>',
  wallet: '<path d="M4 7a2 2 0 0 1 2-2h11v4"/><path d="M4 7v11a2 2 0 0 0 2 2h14V9H6a2 2 0 0 1-2-2z"/><circle cx="16" cy="14.5" r="1" fill="currentColor"/>',
  sprout: '<path d="M12 20v-8M12 12c0-4 3-7 8-7 0 5-3 7-8 7zM12 14.5c0-3-2.5-5-7-5 0 4 2.5 5 7 5z"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.2"/>',
};

export const ICON_KEYS = Object.keys(ICONS);

/** Starting icon for each built-in category. */
export const DEFAULT_ICON_KEYS = {
  food: 'onigiri', cafe: 'cup', drinks: 'beer', hobby: 'gamepad', daily: 'bottle', transport: 'train', beauty: 'scissors',
  books: 'book', design: 'palette', other: 'box', clothing: 'shirt', travel: 'plane', car: 'car',
  housing: 'home', insurance: 'shield', phone: 'phone', subscriptions: 'repeat', loan: 'bank',
};

/** SVG markup for an icon key; unknown values (e.g. an emoji from an older version) render as text. */
export function iconSvg(key, size = 18) {
  const inner = ICONS[key];
  if (!inner) return `<span class="ic-text">${String(key ?? '').replace(/[&<>"']/g, '')}</span>`;
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}
