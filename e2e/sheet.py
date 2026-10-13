# Contact sheet of a shots folder: python e2e/sheet.py <dir> <out.png>
import sys, glob
from PIL import Image
fs = sorted(glob.glob(sys.argv[1] + '/*.png'))
ims = [Image.open(f).convert('RGB').resize((800, 450)) for f in fs]
W = Image.new('RGB', (1600, 450 * ((len(ims) + 1) // 2)))
for i, im in enumerate(ims):
    W.paste(im, ((i % 2) * 800, (i // 2) * 450))
W.save(sys.argv[2])
