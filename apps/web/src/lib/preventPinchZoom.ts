/**
 * スマホでのピンチ拡大・ダブルタップ拡大を確実に防ぐ(要望: 拡大縮小を含めて画角を固定)。
 * viewportのmaximum-scale/user-scalable=noはiOS Safariでは無視されることがあるため、
 * ジェスチャー自体をキャンセルする(Safari固有のgesture*イベント + 複数指のtouchmove)。
 */
export function preventPinchZoom() {
  const doc = document as unknown as {
    addEventListener(type: 'gesturestart' | 'gesturechange' | 'gestureend', listener: (e: Event) => void): void;
  };
  const noop = (e: Event) => e.preventDefault();
  doc.addEventListener('gesturestart', noop);
  doc.addEventListener('gesturechange', noop);
  doc.addEventListener('gestureend', noop);

  // 2本指以上でのtouchmove(ピンチ操作)のみ止める。ダブルタップ拡大はCSSのtouch-action:
  // manipulation側で防いでいるため、ここでtouchendまで止めるとDataTableの列幅ダブルクリック
  // リセット等の正当なダブルタップ操作まで巻き込むので触らない。
  document.addEventListener(
    'touchmove',
    (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault();
    },
    { passive: false },
  );
}
