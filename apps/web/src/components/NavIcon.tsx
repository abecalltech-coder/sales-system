/**
 * サイドバー用の線画アイコン集。絵文字だと環境ごとに描画が荒れて安っぽく見えるため、
 * currentColor で色が変わる 16px の stroke アイコンに統一している。
 */
export type IconName =
  | 'chart'
  | 'edit'
  | 'inbox'
  | 'calendar'
  | 'calendarCheck'
  | 'document'
  | 'user'
  | 'building'
  | 'sliders'
  | 'form'
  | 'puzzle'
  | 'link'
  | 'list'
  | 'gear';

const PATHS: Record<IconName, JSX.Element> = {
  chart: (
    <>
      <path d="M3 3v18h18" />
      <path d="M7 15l3-4 3 3 4-7" />
    </>
  ),
  edit: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </>
  ),
  inbox: (
    <>
      <path d="M4 13h4l2 3h4l2-3h4" />
      <path d="M5 5h14l2 8v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5Z" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 9.5h18M8 3v4M16 3v4" />
    </>
  ),
  calendarCheck: (
    <>
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 9.5h18M8 3v4M16 3v4" />
      <path d="M9 14.5l2 2 4-4" />
    </>
  ),
  document: (
    <>
      <path d="M6 2h8l6 6v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z" />
      <path d="M14 2v6h6M8.5 13h7M8.5 17h7" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c1.2-3.6 4-5 7-5s5.8 1.4 7 5" />
    </>
  ),
  building: (
    <>
      <path d="M4 21V6l8-3 8 3v15" />
      <path d="M4 21h16M9 9h.01M15 9h.01M9 13h.01M15 13h.01M10 21v-4h4v4" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </>
  ),
  form: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </>
  ),
  puzzle: (
    <path d="M9 3.5a1.5 1.5 0 0 1 3 0c0 .5-.2 1 .3 1.5H15a1 1 0 0 1 1 1v2.2c.5.5 1 .3 1.5.3a1.5 1.5 0 0 1 0 3c-.5 0-1-.2-1.5.3V17a1 1 0 0 1-1 1h-2.7c-.5-.5-.3-1-.3-1.5a1.5 1.5 0 0 0-3 0c0 .5.2 1-.3 1.5H6a1 1 0 0 1-1-1v-2.7c-.5-.5-1-.3-1.5-.3a1.5 1.5 0 0 1 0-3c.5 0 1 .2 1.5-.3V6a1 1 0 0 1 1-1h2.7c.5-.5.3-1 .3-1.5Z" />
  ),
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3A4 4 0 0 0 13 5.3l-1.5 1.5" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1.5-1.5" />
    </>
  ),
  list: (
    <>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />
    </>
  ),
};

export function NavIcon({ name, active }: { name: IconName; active?: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 1.9 : 1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  );
}
