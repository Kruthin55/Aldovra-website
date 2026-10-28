#!/usr/bin/env python3
"""Conservative dead-CSS remover for the Aldovra static site.

A selector is dropped only when it needs a class or id that appears NOWHERE in the site's
HTML (outside <style>), JS or edge-function code - not even inside a string. Tokens built
dynamically from a string prefix ("ald-tier-" + x, `arena-${x}`) are kept. Tokens inside
:not()/:is()/:where()/:has() are ignored when deciding. A rule goes only when all of its
selectors are dead; empty @media/@supports blocks go with them. @keyframes whose name is
never used in any animation are dropped too.

Usage: python3 tools/css_prune.py [--write]   (dry run by default)
"""
import re, sys, glob, os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
os.chdir(ROOT)

# ---------- corpus ----------
def strip_styles(html):
    return re.sub(r'<style\b[^>]*>.*?</style>', ' ', html, flags=re.S | re.I)

EDGE = '\n'.join(Path(f).read_text(encoding='utf-8') for f in glob.glob('supabase/functions/**/*.ts', recursive=True))
SHARED_JS = '\n'.join(Path(f).read_text(encoding='utf-8') for f in glob.glob('assets/aldovra-mascot.js'))

def page_text(page):
    html = Path(page).read_text(encoding='utf-8')
    parts = [strip_styles(html)]
    for src in re.findall(r'<script[^>]+src="/?([^"?#:]+\.js)', html):
        if Path(src).exists():
            parts.append(Path(src).read_text(encoding='utf-8'))
    return '\n'.join(parts)

class Corpus:
    def __init__(self, text):
        text = text + '\n' + EDGE + '\n' + SHARED_JS
        self.text = text
        self.words = set(re.findall(r'[A-Za-z_][\w-]*', text))
        pre = set(re.findall(r'["\'`]([\w-]*?[\w]-)["\']\s*\+', text))
        pre |= set(re.findall(r'([A-Za-z][\w-]*-)\$\{', text))
        pre |= set(re.findall(r'[\s"\'`]([A-Za-z][\w-]*[-_])["\'`]\s*\+', text))
        self.prefixes = {x for x in pre if len(x) >= 3}
    def used(self, tok):
        return tok in self.words or any(tok.startswith(x) for x in self.prefixes)

CUR = None  # active Corpus

def token_used(tok):
    return CUR.used(tok)

# ---------- CSS parsing ----------
def skip_comment(s, i):
    j = s.find('*/', i + 2)
    return len(s) if j < 0 else j + 2

def find_block_end(s, i):
    """s[i] == '{' -> index after matching '}' (respecting strings/comments)."""
    depth = 0; n = len(s)
    while i < n:
        c = s[i]
        if c == '/' and s.startswith('/*', i):
            i = skip_comment(s, i); continue
        if c in '"\'':
            q = c; i += 1
            while i < n and s[i] != q:
                i += 2 if s[i] == '\\' else 1
            i += 1; continue
        if c == '{': depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0: return i + 1
        i += 1
    raise ValueError('unbalanced braces')

def split_selectors(sel):
    out, depth, cur, q = [], 0, '', None
    for c in sel:
        if q:
            cur += c
            if c == q: q = None
            continue
        if c in '"\'': q = c
        elif c in '([': depth += 1
        elif c in ')]': depth -= 1
        if c == ',' and depth == 0:
            out.append(cur); cur = ''
        else:
            cur += c
    out.append(cur)
    return out

def required_tokens(sel):
    # remove pseudo-function args and attribute selectors, then collect .class / #id
    s = re.sub(r'"[^"]*"|\'[^\']*\'', '', sel)
    prev = None
    while prev != s:
        prev = s
        s = re.sub(r'\[[^\[\]]*\]', '', s)
        s = re.sub(r':[\w-]+\([^()]*\)', '', s)
    return re.findall(r'[.#](-?[A-Za-z_][\w-]*)', s)

def selector_alive(sel):
    return all(token_used(t) for t in required_tokens(sel))

STATS = {'rules_removed': 0, 'selectors_removed': 0, 'keyframes_removed': 0}

def used_animation_names(all_css):
    names = set()
    for m in re.finditer(r'animation(?:-name)?\s*:\s*([^;}]+)', all_css):
        names |= set(re.findall(r'[A-Za-z_][\w-]*', m.group(1)))
    ALLJS = '\n'.join(page_text(f) for f in glob.glob('*.html'))
    for m in re.finditer(r'animation(?:Name)?\s*[=:]\s*["\'`]([^"\'`]+)', ALLJS):
        names |= set(re.findall(r'[A-Za-z_][\w-]*', m.group(1)))
    return names

def prune(css, anim_names):
    out = []; i = 0; n = len(css)
    while i < n:
        # whitespace & comments are kept as-is
        m = re.match(r'\s+', css[i:])
        if m:
            out.append(m.group(0)); i += len(m.group(0)); continue
        if css.startswith('/*', i):
            j = skip_comment(css, i); out.append(css[i:j]); i = j; continue
        # find next '{' or ';' at top level
        j = i; q = None
        while j < n:
            c = css[j]
            if q:
                if c == '\\': j += 2; continue
                if c == q: q = None
            elif c in '"\'': q = c
            elif css.startswith('/*', j): j = skip_comment(css, j); continue
            elif c in '{;}': break
            j += 1
        if j >= n:
            out.append(css[i:]); break
        if css[j] == ';' or css[j] == '}':
            out.append(css[i:j + 1]); i = j + 1; continue
        prelude = css[i:j]; end = find_block_end(css, j); body = css[j + 1:end - 1]
        p = prelude.strip()
        if p.startswith('@'):
            kw = re.match(r'@([\w-]+)', p).group(1).lower()
            if kw in ('media', 'supports', 'container', 'layer', 'document'):
                inner = prune(body, anim_names)
                if re.sub(r'/\*.*?\*/|\s', '', inner, flags=re.S) == '':
                    STATS['rules_removed'] += 1
                else:
                    out.append(prelude + '{' + inner + '}')
            elif kw.endswith('keyframes'):
                name = p.split(None, 1)[1].strip() if len(p.split(None, 1)) > 1 else ''
                if name and name not in anim_names:
                    STATS['keyframes_removed'] += 1
                else:
                    out.append(css[i:end])
            else:
                out.append(css[i:end])
        else:
            sels = split_selectors(prelude)
            alive = [s for s in sels if selector_alive(s)]
            if not alive:
                STATS['rules_removed'] += 1
            else:
                STATS['selectors_removed'] += len(sels) - len(alive)
                if len(alive) != len(sels):
                    lead = re.match(r'\s*', prelude).group(0)
                    prelude = lead + ','.join(s.strip() if k else s.lstrip() for k, s in enumerate(alive)).rstrip() + ' '
                out.append(prelude + '{' + body + '}')
        i = end
    return ''.join(out)

def main():
    global CUR
    write = '--write' in sys.argv
    do_dedupe = '--dedupe' in sys.argv
    html_files = sorted(glob.glob('*.html'))
    sheets = sorted(glob.glob('assets/**/*.css', recursive=True))
    all_css = '\n'.join(Path(f).read_text(encoding='utf-8') for f in sheets)
    for f in html_files:
        all_css += '\n'.join(re.findall(r'<style\b[^>]*>(.*?)</style>', Path(f).read_text(encoding='utf-8'), flags=re.S | re.I))
    anim = used_animation_names(all_css)
    tb = ta = 0
    def process(css):
        new = prune(css, anim)
        return dedupe(new) if do_dedupe else new
    for f in sheets:
        users = [h for h in html_files if os.path.basename(f) in Path(h).read_text(encoding='utf-8')]
        if not users:
            print('UNUSED stylesheet', f); continue
        CUR = Corpus('\n'.join(page_text(h) for h in users))
        src = Path(f).read_text(encoding='utf-8'); new = process(src)
        tb += len(src); ta += len(new)
        if new != src:
            print(f'{f}: {len(src)} -> {len(new)}')
            if write: Path(f).write_text(new, encoding='utf-8')
    for f in html_files:
        CUR = Corpus(page_text(f))
        src = Path(f).read_text(encoding='utf-8')
        new = re.sub(r'(<style\b[^>]*>)(.*?)(</style>)', lambda m: m.group(1) + process(m.group(2)) + m.group(3), src, flags=re.S | re.I)
        tb += len(src); ta += len(new)
        if new != src:
            print(f'{f}: {len(src)} -> {len(new)}')
            if write: Path(f).write_text(new, encoding='utf-8')
    print(STATS, f'total {tb} -> {ta} (-{tb - ta} bytes)')



# ---------- phase 2: drop declarations that a later rule with the SAME selector list and SAME
# @media/@supports context always overrides (same property, same or higher !important).
# Only within one stylesheet (one file or one <style> block), so cascade order is certain.
RISKY_VALUE = re.compile(r'dvh|svh|lvh|dvw|svw|color-mix|oklch|oklab|\blab\(|\blch\(|-webkit-|-moz-|-ms-|@|var\(\s*--[\w-]+\s*,|anchor|round\(|light-dark|:has', re.I)

def split_decls(body):
    """-> list of (start, end, prop, value, important) segments covering declarations."""
    segs = []; i = 0; n = len(body); start = 0; depth = 0; q = None
    while i <= n:
        c = body[i] if i < n else ';'
        if q:
            if c == '\\': i += 2; continue
            if c == q: q = None
        elif c in '"\'': q = c
        elif i < n and body.startswith('/*', i):
            i = skip_comment(body, i); continue
        elif c in '({[': depth += 1
        elif c in ')}]': depth -= 1
        elif c == ';' and depth == 0:
            seg = body[start:i]
            txt = re.sub(r'/\*.*?\*/', '', seg, flags=re.S).strip()
            if ':' in txt and '{' not in txt:
                prop, val = txt.split(':', 1)
                imp = bool(re.search(r'!\s*important\s*$', val, re.I))
                segs.append((start, min(i + 1, n), prop.strip().lower(), val.strip(), imp))
            start = i + 1
        i += 1
    return segs

def collect_rules(css, ctx, base, out):
    i = 0; n = len(css)
    while i < n:
        m = re.match(r'\s+', css[i:])
        if m: i += len(m.group(0)); continue
        if css.startswith('/*', i): i = skip_comment(css, i); continue
        j = i; q = None
        while j < n:
            c = css[j]
            if q:
                if c == '\\': j += 2; continue
                if c == q: q = None
            elif c in '"\'': q = c
            elif css.startswith('/*', j): j = skip_comment(css, j); continue
            elif c in '{;}': break
            j += 1
        if j >= n: break
        if css[j] in ';}': i = j + 1; continue
        prelude = css[i:j]; end = find_block_end(css, j); p = ' '.join(prelude.split())
        if p.startswith('@'):
            kw = re.match(r'@([\w-]+)', p).group(1).lower()
            if kw in ('media', 'supports', 'container', 'layer'):
                collect_rules(css[j + 1:end - 1], ctx + (p,), base + j + 1, out)
        else:
            sel = ','.join(s.strip() for s in split_selectors(p))
            out.append({'ctx': ctx, 'sel': sel, 'body_start': base + j + 1, 'body_end': base + end - 1})
        i = end

def dedupe(css):
    rules = []; collect_rules(css, (), 0, rules)
    removals = []  # absolute (start,end)
    later = {}  # (ctx, sel) -> {prop: max_important_seen_later}
    for r in reversed(rules):
        key = (r['ctx'], r['sel'])
        seen = later.setdefault(key, {})
        body = css[r['body_start']:r['body_end']]
        segs = split_decls(body)
        # within this rule, a later duplicate of the same property also overrides (but keep fallbacks)
        local = {}
        for (s, e, prop, val, imp) in reversed(segs):
            winner = local.get(prop) or seen.get(prop)
            if winner and not RISKY_VALUE.search(winner['val']) and not RISKY_VALUE.search(val) \
                    and (winner['imp'] or not imp) and not prop.startswith('-'):
                removals.append((r['body_start'] + s, r['body_start'] + e))
                continue
            if prop not in local or (imp and not local[prop]['imp']):
                local[prop] = {'val': val, 'imp': imp}
        for prop, w in local.items():
            if prop not in seen or (w['imp'] and not seen[prop]['imp']):
                seen[prop] = w
    removals.sort()
    out = []; pos = 0
    for s, e in removals:
        out.append(css[pos:s]); pos = e
    out.append(css[pos:])
    STATS['decls_deduped'] = STATS.get('decls_deduped', 0) + len(removals)
    res = ''.join(out)
    # drop rules left empty
    return re.sub(r'(?m)^[ \t]*(?!/\*)[^\s{}@;*/](?:(?!\*/|/\*)[^{};])*\{\s*\}[ \t]*\n?', '', res) if removals else res


if __name__ == '__main__':
    main()
