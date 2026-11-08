import { useEffect, useRef, useState } from 'react';

/**
 * トークスクリプトの文字色・塗りつぶし(要望: 作成・編集時に全ての文字の色と塗りつぶしを変えられる)。
 * HTML は保存しない。[{ t: 文字, c?: 文字色, b?: 塗りつぶし }] の形で持ち、表示は React の span で組み立てる
 * (他の人が入れた文字がそのまま HTML として動くことがないように)。
 */
export type RichRun = { t: string; c?: string; b?: string };

/** 文字色の候補(スプレッドシート風) */
const TEXT_COLORS = ['#191c22', '#d23b3b', '#ea580c', '#b45309', '#12894a', '#0891b2', '#3453d1', '#7c3aed', '#db2777', '#6b7280'];
/** 塗りつぶしの候補(淡い色) */
const FILL_COLORS = ['#fff3a3', '#fde2e2', '#ffe8cc', '#dcfce7', '#dbeafe', '#ede9fe', '#fce7f3', '#e5e7eb'];

const toHex = (css: string): string | undefined => {
  const v = css.trim().toLowerCase();
  if (!v || v === 'transparent' || v === 'inherit' || v === 'initial') return undefined;
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  if (/^#[0-9a-f]{3}$/.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(v);
  if (!m || (m[4] !== undefined && Number(m[4]) === 0)) return undefined;
  return `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;
};

const BLOCK = new Set(['DIV', 'P', 'LI']);

/** 編集欄の中身(DOM)を色付きの文字に変える */
function domToRuns(root: HTMLElement): RichRun[] {
  const runs: RichRun[] = [];
  const push = (t: string, c?: string, b?: string) => {
    if (!t) return;
    const last = runs[runs.length - 1];
    if (last && last.c === c && last.b === b) last.t += t;
    else runs.push({ t, ...(c ? { c } : {}), ...(b ? { b } : {}) });
  };
  const text = () => runs.map((r) => r.t).join('');
  const walk = (node: Node, c?: string, b?: string) => {
    if (node.nodeType === Node.TEXT_NODE) return push((node.textContent ?? '').replace(/ /g, ' '), c, b);
    if (!(node instanceof HTMLElement)) return;
    if (node.tagName === 'BR') return push('\n', c, b);
    const color = toHex(node.style.color) ?? (node.tagName === 'FONT' ? toHex(node.getAttribute('color') ?? '') : undefined) ?? c;
    const fill = toHex(node.style.backgroundColor) ?? b;
    // div/p で区切られた行は改行にする(先頭や直前が改行のときは足さない)
    if (BLOCK.has(node.tagName) && text() && !text().endsWith('\n')) push('\n', c, b);
    node.childNodes.forEach((n) => walk(n, color, fill));
  };
  root.childNodes.forEach((n) => walk(n));
  // 末尾の余分な改行は落とす
  while (runs.length && runs[runs.length - 1].t.endsWith('\n')) {
    const last = runs[runs.length - 1];
    last.t = last.t.replace(/\n+$/, '');
    if (!last.t) runs.pop();
  }
  return runs;
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 編集欄に入れる HTML(自分たちで組み立てた span と改行だけ) */
function runsToHtml(runs: RichRun[]): string {
  return runs
    .map((r) => {
      const body = escapeHtml(r.t).replace(/\n/g, '<br>');
      const style = [r.c ? `color:${r.c}` : '', r.b ? `background-color:${r.b}` : ''].filter(Boolean).join(';');
      return style ? `<span style="${style}">${body}</span>` : body;
    })
    .join('');
}

const runsOf = (rich: RichRun[] | null | undefined, plain: string): RichRun[] => (rich && rich.length ? rich : plain ? [{ t: plain }] : []);

/** 色付きの文字の表示 */
export function RichView({ rich, plain, style }: { rich: RichRun[] | null | undefined; plain: string; style?: React.CSSProperties }) {
  const runs = runsOf(rich, plain);
  return (
    <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', ...style }}>
      {runs.map((r, i) => (
        <span key={i} style={r.c || r.b ? { color: r.c, background: r.b, borderRadius: r.b ? 2 : undefined } : undefined}>
          {r.t}
        </span>
      ))}
    </span>
  );
}

/**
 * 色付きの文字の編集欄。文字を選んで「文字色」「塗りつぶし」を押すと、その部分だけ色が変わる。
 * 入力欄から離れたときに保存する(色が1つも無ければ rich は null で、プレーンの文字として保存)。
 */
export function RichEditor({
  rich,
  plain,
  onSave,
  singleLine,
  placeholder,
  label,
  minHeight,
  big,
}: {
  rich: RichRun[] | null | undefined;
  plain: string;
  onSave: (rich: RichRun[] | null, plain: string) => void;
  singleLine?: boolean;
  placeholder?: string;
  label: string;
  minHeight?: number;
  /** 題名用に大きく太く */
  big?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const focused = useRef(false);
  const [palette, setPalette] = useState<'text' | 'fill' | null>(null);
  // 色のボタンは編集中の欄にだけ出す(画面が色のボタンだらけにならないように)
  const [active, setActive] = useState(false);
  const [empty, setEmpty] = useState(!plain);
  const current = JSON.stringify(runsOf(rich, plain));

  // 他の人の更新は、入力中でなければ反映する
  useEffect(() => {
    if (focused.current || !ref.current) return;
    ref.current.innerHTML = runsToHtml(runsOf(rich, plain));
    setEmpty(!plain);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  const commit = () => {
    if (!ref.current) return;
    let runs = domToRuns(ref.current);
    if (singleLine) runs = runs.map((r) => ({ ...r, t: r.t.replace(/\n/g, ' ') }));
    const text = runs.map((r) => r.t).join('');
    const hasColor = runs.some((r) => r.c || r.b);
    const next = hasColor ? runs : null;
    if (JSON.stringify(runsOf(next, text)) !== current) onSave(next, text);
  };

  /** 選んでいる文字に色を付ける(選んでいなければ、この後に打つ文字の色) */
  const apply = (kind: 'text' | 'fill', color: string | null) => {
    ref.current?.focus();
    document.execCommand('styleWithCSS', false, 'true');
    if (kind === 'text') document.execCommand('foreColor', false, color ?? '#191c22');
    else if (!document.execCommand('hiliteColor', false, color ?? 'transparent')) document.execCommand('backColor', false, color ?? 'transparent');
    setPalette(null);
  };

  // ツールバーを押しても入力欄から離れない(選んだ文字を保ったまま色を付ける)
  const keep = (e: React.PointerEvent | React.MouseEvent) => e.preventDefault();
  const tool: React.CSSProperties = { fontSize: 11, padding: '1px 7px', display: 'inline-flex', alignItems: 'center', gap: 4 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: 1 }}>
      {active && <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" onPointerDown={keep} onMouseDown={keep} onClick={() => setPalette(palette === 'text' ? null : 'text')} style={tool} aria-pressed={palette === 'text'}>
          <span style={{ fontWeight: 900, textDecoration: 'underline', textDecorationColor: 'var(--color-danger)', textDecorationThickness: 2 }}>A</span>
          文字色
        </button>
        <button type="button" onPointerDown={keep} onMouseDown={keep} onClick={() => setPalette(palette === 'fill' ? null : 'fill')} style={tool} aria-pressed={palette === 'fill'}>
          <span style={{ width: 11, height: 11, borderRadius: 2, background: FILL_COLORS[0], border: '1px solid var(--color-border-strong)' }} />
          塗りつぶし
        </button>
        {palette && (
          <span style={{ display: 'inline-flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
            {(palette === 'text' ? TEXT_COLORS : FILL_COLORS).map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                onPointerDown={keep}
                onMouseDown={keep}
                onClick={() => apply(palette, c)}
                style={{ width: 20, height: 20, padding: 0, borderRadius: 4, background: c, border: '1px solid var(--color-border-strong)', boxShadow: 'none' }}
              />
            ))}
            <button type="button" onPointerDown={keep} onMouseDown={keep} onClick={() => apply(palette, null)} style={{ ...tool, padding: '1px 5px' }}>
              {palette === 'text' ? '黒に戻す' : 'なし'}
            </button>
          </span>
        )}
      </div>}
      <div style={{ position: 'relative' }}>
        <div
          ref={ref}
          role="textbox"
          aria-label={label}
          aria-multiline={!singleLine}
          contentEditable
          suppressContentEditableWarning
          onFocus={() => {
            focused.current = true;
            setActive(true);
          }}
          onBlur={() => {
            focused.current = false;
            setActive(false);
            setPalette(null);
            commit();
          }}
          onInput={() => setEmpty(!(ref.current?.textContent ?? '').length)}
          onKeyDown={(e) => {
            if (singleLine && e.key === 'Enter') {
              e.preventDefault();
              (e.currentTarget as HTMLDivElement).blur();
            }
          }}
          // 貼り付けは文字だけ(他の画面の書式は持ち込まない)
          onPaste={(e) => {
            e.preventDefault();
            const t = e.clipboardData.getData('text/plain');
            document.execCommand('insertText', false, singleLine ? t.replace(/\r?\n/g, ' ') : t);
          }}
          style={{
            minHeight: singleLine ? undefined : (minHeight ?? 70),
            padding: '4px 7px',
            fontSize: big ? 14 : 13,
            fontWeight: big ? 800 : undefined,
            lineHeight: 1.6,
            border: '1px solid var(--color-border-strong)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-surface)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            outline: 'none',
          }}
        />
        {empty && placeholder && (
          <span aria-hidden style={{ position: 'absolute', left: 8, top: 5, fontSize: big ? 14 : 13, color: 'var(--color-text-faint)', pointerEvents: 'none' }}>
            {placeholder}
          </span>
        )}
      </div>
    </div>
  );
}
