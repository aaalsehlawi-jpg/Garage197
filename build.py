#!/usr/bin/env python3
"""Builds index.html from the parts in src/. Run after editing any of them: python3 build.py"""
import pathlib
src = pathlib.Path(__file__).parent / 'src'
r = lambda n: (src / n).read_text(encoding='utf-8')
MARK = '/* ----- start ----- */'
def ui():
    s = r('ui.js')
    assert s.count(MARK) == 1
    return s.replace(MARK, r('qr.js') + r('social.js') + MARK)
out = r('head.html') + '<script>\n' + r('store.js') + '</script>\n<script>\n' + r('pure.js') + r('i18n.js') + ui() + '</script>\n</body>\n</html>\n'
(src.parent / 'index.html').write_text(out, encoding='utf-8')
print('index.html', len(out), 'bytes')
