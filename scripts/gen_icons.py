# Generate PWA icons: 192/512 + maskable + favicon + apple-touch, brand gradient + play triangle.
import struct, zlib, os

W = H = 512
OUT = os.path.join(os.path.dirname(__file__), '..', 'icons')
os.makedirs(OUT, exist_ok=True)

def png(width, height, rgba_rows):
    def chunk(tag, data):
        c = tag + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    raw = b''.join(b'\x00' + row for row in rgba_rows)
    return (b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9))
            + chunk(b'IEND', b''))

def grad(x, y, full_bleed):
    t = y / (H - 1)
    r = int(0x1e + (0x0c - 0x1e) * t)
    g = int(0xd7 + (0x6b - 0xd7) * t)
    b = int(0x60 + (0x32 - 0x60) * t)
    if not full_bleed:
        m = 64
        if x < m or x >= W - m or y < m or y >= H - m:
            return (0, 0, 0, 0)
    # play triangle
    x1, y1 = 190, 160
    x2, y2 = 330, 256
    x3, y3 = 190, 352
    def sign(ax, ay, bx, by, qx, qy):
        return (qx - bx) * (ay - by) - (by - qy) * (bx - ax)
    d1 = sign(x1, y1, x2, y2, x, y)
    d2 = sign(x2, y2, x3, y3, x, y)
    d3 = sign(x3, y3, x1, y1, x, y)
    if not (((d1 < 0) or (d2 < 0) or (d3 < 0)) and ((d1 > 0) or (d2 > 0) or (d3 > 0))):
        return (255, 255, 255, 255)
    return (r, g, b, 255)

def build(full_bleed):
    rows = []
    for y in range(H):
        row = bytearray()
        for x in range(W):
            row += bytes(grad(x, y, full_bleed))
        rows.append(bytes(row))
    return rows

def resize(rows, dw, dh):
    out = []
    for y in range(dh):
        row = bytearray()
        for x in range(dw):
            # nearest-neighbor sample from the 512 grid
            sy = min(H - 1, y * H // dh)
            sx = min(W - 1, x * W // dh)
            off = sx * 4
            row += bytes((rows[sy][off], rows[sy][off+1], rows[sy][off+2], rows[sy][off+3]))
        out.append(bytes(row))
    return png(dw, dh, out)

rows_any = build(full_bleed=False)   # regular icons (transparent padding)
rows_mask = build(full_bleed=True)  # maskable (fills entire canvas)

targets = [
    ('icon-512.png', 512, rows_any),
    ('icon-192.png', 192, rows_any),
    ('apple-touch-icon.png', 180, rows_any),
    ('favicon-64.png', 64, rows_any),
    ('icon-maskable-512.png', 512, rows_mask),
]
for name, s, rows in targets:
    data = png(W, H, rows) if s == 512 else resize(rows, s, s)
    with open(os.path.join(OUT, name), 'wb') as f:
        f.write(data)
    print(f'{name}: {len(data)} bytes')
print('icons done')
