import type { ReactNode } from 'react';
const paths: Record<string, ReactNode> = {
  menu: <path d="M4 6h16M4 12h16M4 18h16"/>, pause: <path d="M8 5v14M16 5v14"/>, play: <path d="m8 5 11 7-11 7Z"/>,
  map: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z"/><path d="M9 3v15M15 6v15"/></>,
  pin: <><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/></>,
  copy: <><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
  close: <path d="m6 6 12 12M18 6 6 18"/>, plus: <path d="M12 5v14M5 12h14"/>, minus: <path d="M5 12h14"/>,
  heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>,
  user: <><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></>,
  chevron: <path d="m9 5 7 7-7 7"/>, back: <path d="m15 5-7 7 7 7"/>,
  expand: <><path d="m7 9 5-5 5 5M7 15l5 5 5-5"/></>,
  locate: <><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></>,
  walk: <><circle cx="14" cy="4" r="2"/><path d="m7 12 3-5 5 2 3 4M10 7l-1 9-4 5M9 14l5 2 1 5"/></>,
  bell: <><path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5l-2 3ZM10 21h4"/></>,
};
export function Icon({ name }: { name: keyof typeof paths }) { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>; }
