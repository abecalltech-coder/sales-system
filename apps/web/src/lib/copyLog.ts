import { api } from './api';

const MAX_TEXT = 3000;

/**
 * コピーを操作ログへ記録する(要望: 誰が・いつ・どのタブで・何をコピーしたか)。
 * 記録の失敗でコピー操作自体は邪魔しない。
 */
export function logCopy(source: string, text: string, opts: { cells?: number; target?: string } = {}) {
  const t = text ?? '';
  if (!t.trim()) return;
  api
    .post('/audit-logs/copy', {
      page: window.location.pathname,
      source,
      text: t.length > MAX_TEXT ? t.slice(0, MAX_TEXT) : t,
      ...(opts.cells ? { cells: opts.cells } : {}),
      ...(opts.target ? { target: opts.target.slice(0, 200) } : {}),
    })
    .catch(() => undefined);
}

/** ブラウザ標準のコピー/切り取り(文字を選んで Ctrl+C・右クリック等)を記録する。アプリ全体で1回だけ登録 */
let installed = false;
export function installNativeCopyLogger() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  const handler = (kind: 'copy' | 'cut') => () => {
    const el = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
    let text = '';
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && typeof el.selectionStart === 'number') {
      text = el.value.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0);
    } else {
      text = window.getSelection()?.toString() ?? '';
    }
    logCopy(kind === 'cut' ? '選択した文字(切り取り)' : '選択した文字', text);
  };
  document.addEventListener('copy', handler('copy'));
  document.addEventListener('cut', handler('cut'));
}
