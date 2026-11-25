"""Generate images/icon.png (256x256): a terminal window with a prompt and colored output lines."""
from pathlib import Path
from PIL import Image, ImageDraw

S = 4  # supersampling factor
W = 256 * S
img = Image.new("RGBA", (W, W), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
r = lambda v: int(v * S)

d.rounded_rectangle([r(8), r(8), r(248), r(248)], radius=r(40), fill=(30, 33, 41))
d.rounded_rectangle([r(8), r(8), r(248), r(56)], radius=r(40), fill=(44, 48, 60))
d.rectangle([r(8), r(36), r(248), r(56)], fill=(44, 48, 60))
for i, c in enumerate([(255, 95, 86), (255, 189, 46), (39, 201, 63)]):
    x = 40 + i * 26
    d.ellipse([r(x - 8), r(24), r(x + 8), r(40)], fill=c)

# prompt ">_"
d.line([(r(36), r(84)), (r(60), r(104)), (r(36), r(124))], fill=(39, 201, 63), width=r(10), joint="curve")
d.rectangle([r(70), r(116), r(100), r(126)], fill=(220, 223, 228))

# colored output lines
lines = [
    (36, 152, 150, (97, 175, 239)),
    (36, 176, 210, (229, 192, 123)),
    (36, 200, 120, (224, 108, 117)),
    (132, 200, 190, (198, 120, 221)),
]
for x0, y, x1, c in lines:
    d.rounded_rectangle([r(x0), r(y - 6), r(x1), r(y + 6)], radius=r(6), fill=c)

out = Path(__file__).resolve().parent.parent / "images" / "icon.png"
img.resize((256, 256), Image.LANCZOS).save(out, optimize=True)
print(out.name, out.stat().st_size, "bytes")
