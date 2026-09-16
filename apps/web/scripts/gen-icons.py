"""PWAアイコンを生成する(外部ライブラリ不要、zlib/structのみ使用)。
CH partners公式サイト(https://ch-partners.co.jp)のロゴマーク(favicon.svg、
2026-09-16時点)をそのままベクター座標で再現し、192/512/マスカブル512サイズに
ラスタライズする。apple-touch-icon.png・favicon-96.pngは同サイトの実ファイルを
一度だけダウンロードしてpublic/icons/にそのままコミットしている(このスクリプトの
対象外。ロゴが変わったら https://ch-partners.co.jp/apple-touch-icon.png と
https://ch-partners.co.jp/favicon-96x96.png を取得し直して差し替える)。
"""
import struct
import zlib
import os

BASE = os.path.dirname(__file__)
OUT_DIR = os.path.join(BASE, '..', 'public', 'icons')
os.makedirs(OUT_DIR, exist_ok=True)

NAVY = (0x07, 0x31, 0x6F)
WHITE = (255, 255, 255)
VIEWBOX = 48

def cubic_points(p0, p1, p2, p3, n=14):
    pts = []
    for i in range(1, n + 1):
        t = i / n
        mt = 1 - t
        x = mt**3 * p0[0] + 3 * mt**2 * t * p1[0] + 3 * mt * t**2 * p2[0] + t**3 * p3[0]
        y = mt**3 * p0[1] + 3 * mt**2 * t * p1[1] + 3 * mt * t**2 * p2[1] + t**3 * p3[1]
        pts.append((x, y))
    return pts

def build_path1():
    pts = [(10.5, 13)]
    pts.append((29.3, 13))
    pts.append((25.4, 19.1))
    pts.append((15.2, 19.1))
    pts.append((9, 29.3))
    pts.append((19.1, 29.3))
    pts.append((15.3, 35))
    pts.append((5.6, 35))
    pts += cubic_points((5.6, 35), (2.3, 35), (0.5, 31.6), (2.4, 28.8))
    pts.append((11.8, 14.9))
    pts += cubic_points((11.8, 14.9), (12.6, 13.7), (14.0, 13.0), (15.6, 13.0))
    pts.append((10.5, 13.0))
    return pts

PATH1 = build_path1()
PATH2 = [(32.7, 13), (39.5, 13), (25.2, 35), (18.4, 35)]
PATH3 = [(43.1, 13), (48, 13), (33.7, 35), (26.9, 35)]
MARK_POLYS = [PATH1, PATH2, PATH3]

def point_in_poly(x, y, poly):
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y):
            x_int = (xj - xi) * (y - yi) / (yj - yi) + xi
            if x < x_int:
                inside = not inside
        j = i
    return inside

def in_mark(x, y):
    return any(point_in_poly(x, y, p) for p in MARK_POLYS)

def in_rounded_rect(x, y, w, h, r):
    if x < 0 or x > w or y < 0 or y > h:
        return False
    if x < r and y < r:
        return (x - r) ** 2 + (y - r) ** 2 <= r * r
    if x > w - r and y < r:
        return (x - (w - r)) ** 2 + (y - r) ** 2 <= r * r
    if x < r and y > h - r:
        return (x - r) ** 2 + (y - (h - r)) ** 2 <= r * r
    if x > w - r and y > h - r:
        return (x - (w - r)) ** 2 + (y - (h - r)) ** 2 <= r * r
    return True

def render(size, rounded, mark_scale=1.0):
    SS = 4
    total = SS * SS
    pixels = bytearray(size * size * 4)
    for py in range(size):
        for px in range(size):
            n_mark = 0
            n_bg = 0
            for sy in range(SS):
                for sx in range(SS):
                    vx = (px + (sx + 0.5) / SS) / size * VIEWBOX
                    vy = (py + (sy + 0.5) / SS) / size * VIEWBOX
                    mx = (vx - 24) / mark_scale + 24
                    my = (vy - 24) / mark_scale + 24
                    if in_mark(mx, my):
                        n_mark += 1
                    elif (not rounded) or in_rounded_rect(vx, vy, VIEWBOX, VIEWBOX, 8):
                        n_bg += 1
            covered = n_mark + n_bg
            idx = (py * size + px) * 4
            if covered == 0:
                pixels[idx:idx + 4] = bytes((0, 0, 0, 0))
                continue
            r = round((WHITE[0] * n_mark + NAVY[0] * n_bg) / covered)
            g = round((WHITE[1] * n_mark + NAVY[1] * n_bg) / covered)
            b = round((WHITE[2] * n_mark + NAVY[2] * n_bg) / covered)
            a = round(covered / total * 255)
            pixels[idx:idx + 4] = bytes((r, g, b, a))
    return pixels

def write_png_rgba(path, size, pixels):
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        raw.extend(pixels[y * size * 4:(y + 1) * size * 4])
    compressed = zlib.compress(bytes(raw), 9)

    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)

    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    png = sig + chunk(b'IHDR', ihdr) + chunk(b'IDAT', compressed) + chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)
    print(f'wrote {path} ({len(png)} bytes)')

if __name__ == '__main__':
    write_png_rgba(os.path.join(OUT_DIR, 'icon-192.png'), 192, render(192, rounded=True))
    write_png_rgba(os.path.join(OUT_DIR, 'icon-512.png'), 512, render(512, rounded=True))
    write_png_rgba(os.path.join(OUT_DIR, 'icon-512-maskable.png'), 512, render(512, rounded=False, mark_scale=0.72))
