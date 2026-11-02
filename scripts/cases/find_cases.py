"""Find, read and check case passages in GhostsCorpus for case cards.

  python3 scripts/cases/find_cases.py search "writer's cramp" [--years 1885-1900] [--limit 20]
  python3 scripts/cases/find_cases.py packet 1234567 [--around 2]
  python3 scripts/cases/find_cases.py check [card.json ...]

The corpus is read-only. Set GHOSTS_CORPUS if it is not at ~/Code/GhostsCorpus.
"""
import argparse
import glob
import json
import os
import re
import sqlite3
import sys

DB = os.environ.get('GHOSTS_CORPUS', os.path.expanduser('~/Code/GhostsCorpus/corpus.sqlite'))
CARDS = os.path.join(os.path.dirname(__file__), '../../shared/patients/cases/cards/*.json')
# New York nervous-disease journals. The Medical Record is general medicine,
# so searches there need a clinical term, not just "Case I."
TITLES = ("s.title like 'Journal of Nervous and Mental Disease%'", "s.title like 'Medical Record%'")


def connect():
    return sqlite3.connect(f'file:{DB}?mode=ro', uri=True)


def search(args):
    first, last = (int(y) for y in args.years.split('-'))
    # passages_fts is contentless, so its rowid is the passage id.
    rows = connect().execute(f"""
        select p.id, s.title, p.page, p.text from passages_fts f
        join passages p on p.id = f.rowid join sources s on s.id = p.source_id
        where passages_fts match ? and s.year between ? and ? and ({' or '.join(TITLES)})
        and (p.text like '%aged%' or p.text like '%years of age%' or p.text like '%Case %')
        order by f.rank limit ?""", (args.query, first, last, args.limit)).fetchall()
    for pid, title, page, text in rows:
        snippet = ' '.join(text.split())[:240]
        print(f'{pid}\t{title} p.{page}\n    {snippet}\n')


def packet(args):
    db = connect()
    source_id, seq = db.execute('select source_id, seq from passages where id = ?', (args.id,)).fetchone()
    title = db.execute('select title from sources where id = ?', (source_id,)).fetchone()[0]
    print(f'# {title} ({source_id})\n')
    for pid, page, text in db.execute(
            'select id, page, text from passages where source_id = ? and seq between ? and ? order by seq',
            (source_id, seq - args.around, seq + args.around)):
        print(f'## passage {pid}, p.{page}\n{text}\n')


def flat(text):
    # OCR splits words across lines with a hyphen; quotes are compared without it.
    text = re.sub(r'-\s+', '', text)
    return re.sub(r'\s+', ' ', text).strip().lower()


def check(args):
    db = connect()
    failures = 0
    for path in args.cards or sorted(glob.glob(CARDS)):
        card = json.load(open(path))
        ids = card['source']['passageIds']
        marks = ','.join('?' * len(ids))
        text = flat(' '.join(r[0] for r in db.execute(f'select text from passages where id in ({marks})', ids)))
        for quote in card.get('quotes', []):
            if flat(quote) not in text:
                failures += 1
                print(f'{os.path.basename(path)}: quote not found: {quote[:70]}')
    print('all quotes found' if not failures else f'{failures} quote(s) not found')
    sys.exit(1 if failures else 0)


parser = argparse.ArgumentParser()
commands = parser.add_subparsers(required=True)
p = commands.add_parser('search')
p.add_argument('query')
p.add_argument('--years', default='1885-1900')
p.add_argument('--limit', type=int, default=20)
p.set_defaults(run=search)
p = commands.add_parser('packet')
p.add_argument('id', type=int)
p.add_argument('--around', type=int, default=2)
p.set_defaults(run=packet)
p = commands.add_parser('check')
p.add_argument('cards', nargs='*')
p.set_defaults(run=check)
args = parser.parse_args()
args.run(args)
