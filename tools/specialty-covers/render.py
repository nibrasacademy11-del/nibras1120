"""Renders the specialty covers into assets/img/covers/<lang>/<key>.webp.

Usage:  python render.py              # every specialty, both languages
        python render.py ai finance   # only these specialties

Drop a photo at photos/<key>.jpg before rendering to use it on that cover.
"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
OUT = ROOT / 'assets' / 'img' / 'covers'
CHROME_PATHS = [
    Path(r'C:\Program Files\Google\Chrome\Application\chrome.exe'),
    Path(r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'),
]
WIDTH, HEIGHT = 1200, 750


def specialty_keys():
    script = "console.log(JSON.stringify(require('./assets/js/specialties.js').map((s) => s.key)))"
    return json.loads(subprocess.check_output(['node', '-e', script], cwd=ROOT, text=True))


def render(chrome, key, lang, tmp):
    png = Path(tmp) / f'{lang}-{key}.png'
    url = (HERE / 'cover.html').as_uri() + f'?key={key}&lang={lang}'
    subprocess.run([
        str(chrome), '--headless=new', '--disable-gpu', '--hide-scrollbars',
        '--allow-file-access-from-files', '--force-device-scale-factor=1',
        f'--window-size={WIDTH},{HEIGHT}', '--virtual-time-budget=8000',
        f'--screenshot={png}', url,
    ], check=True, capture_output=True)
    target = OUT / lang / f'{key}.webp'
    target.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(png) as img:
        img.convert('RGB').save(target, 'WEBP', quality=82, method=6)
    return target


def main():
    chrome = next((p for p in CHROME_PATHS if p.exists()), None)
    if not chrome:
        sys.exit('Chrome or Edge was not found.')
    keys = sys.argv[1:] or specialty_keys()
    with tempfile.TemporaryDirectory() as tmp:
        for key in keys:
            for lang in ('ar', 'en'):
                target = render(chrome, key, lang, tmp)
                print(f'{target.relative_to(ROOT)}  {target.stat().st_size // 1024} KB')


if __name__ == '__main__':
    main()
