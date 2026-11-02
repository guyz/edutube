"""Fetch new talks/episodes from every source and rebuild site/data/catalog.json.

Usage:
    python pipeline/ingest.py                 # weekly update (latest ~60 per channel tab)
    python pipeline/ingest.py --depth 400     # deep backfill
    python pipeline/ingest.py --only simons,usenix
    python pipeline/ingest.py --offline       # just re-classify stored items

All fetched items (kept or not) are stored in pipeline/data/raw.json so that rule
changes in classify.py / sources.yaml apply retroactively without re-fetching.
"""
import argparse
import concurrent.futures as cf
import email.utils
import hashlib
import html
import json
import re
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).parent))
import classify  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SOURCES = ROOT / "pipeline" / "sources.yaml"
RAW = ROOT / "pipeline" / "data" / "raw.json"
REPORT = ROOT / "pipeline" / "data" / "last_run.json"
CATALOG = ROOT / "site" / "data" / "catalog.json"
IMG = ROOT / "site" / "img"

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/130.0 Safari/537.36")
PODCAST_KEEP = 40  # newest episodes kept per podcast
NOW = int(time.time())

NS = {
    "atom": "http://www.w3.org/2005/Atom",
    "yt": "http://www.youtube.com/xml/schemas/2015",
    "media": "http://search.yahoo.com/mrss/",
    "itunes": "http://www.itunes.com/dtds/podcast-1.0.dtd",
    "content": "http://purl.org/rss/1.0/modules/content/",
}


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def http_get(url, tries=3, timeout=30):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(1.5 * (i + 1))
    raise last


def clean_text(s, limit=700):
    if not s:
        return ""
    s = re.sub(r"<br\s*/?>|</p>", "\n", s, flags=re.I)
    s = re.sub(r"<[^>]+>", "", s)
    s = html.unescape(s)
    s = re.sub(r"[ \t\r\f\v]+", " ", s)
    s = re.sub(r"\n\s*\n+", "\n\n", s).strip()
    if len(s) > limit:
        s = s[:limit].rsplit(" ", 1)[0] + "…"
    return s


def parse_iso(s):
    try:
        return int(datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp())
    except Exception:  # noqa: BLE001
        return None


def parse_duration(s):
    if not s:
        return None
    s = s.strip()
    if s.isdigit():
        return int(s)
    parts = s.split(":")
    try:
        nums = [int(float(p)) for p in parts]
    except ValueError:
        return None
    total = 0
    for n in nums:
        total = total * 60 + n
    return total or None


# --- YouTube ---------------------------------------------------------------------

class _Quiet:
    """yt-dlp logger that stays silent; failures still surface as exceptions."""

    def debug(self, msg):
        pass

    warning = error = debug


def yt_tab(channel_id, tab, depth):
    """Flat-list a channel tab with yt-dlp. Returns (entries, avatar)."""
    import yt_dlp

    opts = {
        "extract_flat": "in_playlist",
        "playlistend": depth,
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "socket_timeout": 30,
        "extractor_args": {"youtubetab": {"approximate_date": [""]}},
        "logger": _Quiet(),
    }
    url = f"https://www.youtube.com/channel/{channel_id}/{tab}"
    with yt_dlp.YoutubeDL(opts) as y:
        info = y.extract_info(url, download=False)
    avatar = None
    for t in info.get("thumbnails") or []:
        if t.get("id") == "avatar_uncropped" and t.get("url"):
            avatar = re.sub(r"=s0$", "=s88-c-k-c0x00ffffff-no-rj", t["url"])
    out = []
    for e in info.get("entries") or []:
        if not e or not e.get("id") or len(e["id"]) != 11:
            continue
        if e.get("live_status") in ("is_upcoming", "is_live"):
            continue
        out.append({
            "id": e["id"],
            "title": e.get("title") or "",
            "dur": int(e["duration"]) if e.get("duration") else None,
            "views": e.get("view_count"),
            "pub": e.get("timestamp") or e.get("release_timestamp"),
            "approx": True,
        })
    return out, avatar


def yt_rss(channel_id):
    xml = http_get(f"https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}")
    root = ET.fromstring(xml)
    out = []
    for e in root.findall("atom:entry", NS):
        vid = e.findtext("yt:videoId", namespaces=NS)
        if not vid:
            continue
        link = e.find("atom:link", NS)
        href = link.get("href", "") if link is not None else ""
        group = e.find("media:group", NS)
        desc = group.findtext("media:description", default="", namespaces=NS) if group is not None else ""
        stats = group.find("media:community/media:statistics", NS) if group is not None else None
        views = int(stats.get("views")) if stats is not None and stats.get("views", "").isdigit() else None
        out.append({
            "id": vid,
            "title": e.findtext("atom:title", default="", namespaces=NS),
            "pub": parse_iso(e.findtext("atom:published", default="", namespaces=NS)),
            "approx": False,
            "desc": clean_text(desc),
            "views": views,
            "short": "/shorts/" in href,
        })
    return out


def fetch_youtube(src, depth, use_ytdlp):
    cid = src["channel"]
    items, errors, avatar = {}, [], None

    def merge(e):
        cur = items.setdefault(e["id"], {"id": e["id"]})
        for k, v in e.items():
            if v is None or v == "":
                continue
            if k in ("pub", "approx") and cur.get("approx") is False and e.get("approx"):
                continue  # keep the precise RSS date
            cur[k] = v

    if use_ytdlp:
        for tab in ("videos", "streams"):
            try:
                entries, av = yt_tab(cid, tab, depth)
                avatar = avatar or av
                for e in entries:
                    merge(e)
            except Exception as ex:  # noqa: BLE001
                msg = str(ex)
                if "does not have a" not in msg:  # missing tab is normal
                    errors.append(f"{tab}: {msg[:160]}")
    try:
        for e in yt_rss(cid):
            merge(e)
    except Exception as ex:  # noqa: BLE001
        errors.append(f"rss: {str(ex)[:160]}")
    return list(items.values()), avatar, errors


# --- Podcasts --------------------------------------------------------------------

def fetch_podcast(src):
    root = ET.fromstring(http_get(src["feed"]))
    ch = root.find("channel")
    img = None
    it_img = ch.find("itunes:image", NS)
    if it_img is not None:
        img = it_img.get("href")
    if not img:
        img = ch.findtext("image/url")
    out = []
    for it in ch.findall("item"):
        enc = it.find("enclosure")
        if enc is None or not enc.get("url"):
            continue
        audio = enc.get("url")
        guid = it.findtext("guid") or audio
        pub = None
        if it.findtext("pubDate"):
            try:
                pub = int(email.utils.parsedate_to_datetime(it.findtext("pubDate")).timestamp())
            except Exception:  # noqa: BLE001
                pub = None
        ep_img = it.find("itunes:image", NS)
        desc = it.findtext("itunes:summary", namespaces=NS) or it.findtext("description") or \
            it.findtext("content:encoded", namespaces=NS) or ""
        out.append({
            "id": "p" + hashlib.sha1(f"{src['id']}|{guid}".encode()).hexdigest()[:11],
            "title": (it.findtext("title") or "").strip(),
            "pub": pub,
            "approx": False,
            "dur": parse_duration(it.findtext("itunes:duration", namespaces=NS)),
            "desc": clean_text(desc, 900),
            "audio": audio,
            "img": ep_img.get("href") if ep_img is not None and ep_img.get("href") else None,
            "link": it.findtext("link"),
        })
    out.sort(key=lambda x: x["pub"] or 0, reverse=True)
    return out[:PODCAST_KEEP], img


def art_path(src):
    return IMG / f"{src['id']}.jpg"


def cache_artwork(src, url, meta):
    """Self-host a small copy of a channel avatar / podcast cover.

    Podcast feeds often ship 3000px covers, and hot-linking YouTube avatars gets
    rate-limited, so the site serves its own resized copies."""
    from io import BytesIO

    from PIL import Image

    out = art_path(src)
    if out.exists() and meta.get("art_src") == url:
        return
    size = 400 if src["type"] == "podcast" else 96
    img = Image.open(BytesIO(http_get(url))).convert("RGB")
    img.thumbnail((size, size), Image.LANCZOS)
    IMG.mkdir(parents=True, exist_ok=True)
    img.save(out, "JPEG", quality=85, optimize=True, progressive=True)
    meta["art_src"] = url


# --- Main ------------------------------------------------------------------------

def load_json(path, default):
    return json.loads(path.read_text()) if path.exists() else default


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--depth", type=int, default=60, help="videos per channel tab to list")
    ap.add_argument("--only", default="", help="comma-separated source ids")
    ap.add_argument("--offline", action="store_true", help="no network; re-classify only")
    ap.add_argument("--no-ytdlp", action="store_true", help="RSS only for YouTube")
    ap.add_argument("--workers", type=int, default=6)
    args = ap.parse_args()

    cfg = yaml.safe_load(SOURCES.read_text())
    yt_sources = [dict(s, type="youtube") for s in cfg.get("youtube", [])]
    pod_sources = [dict(s, type="podcast") for s in cfg.get("podcasts", [])]
    all_sources = {s["id"]: s for s in yt_sources + pod_sources}
    assert len(all_sources) == len(yt_sources) + len(pod_sources), "duplicate source id"

    raw = load_json(RAW, {"items": {}, "meta": {}})
    only = set(filter(None, args.only.split(",")))
    report = {"started": NOW, "sources": {}}

    def run(src):
        if src["type"] == "youtube":
            items, avatar, errors = fetch_youtube(src, args.depth, not args.no_ytdlp)
            return src, items, avatar, errors
        try:
            items, img = fetch_podcast(src)
            return src, items, img, []
        except Exception as ex:  # noqa: BLE001
            return src, [], None, [str(ex)[:200]]

    if not args.offline:
        todo = [s for s in all_sources.values() if not only or s["id"] in only]
        with cf.ThreadPoolExecutor(args.workers) as ex:
            for src, items, avatar, errors in ex.map(run, todo):
                meta = raw["meta"].setdefault(src["id"], {})
                if avatar:
                    meta["avatar"] = avatar
                    try:
                        cache_artwork(src, avatar, meta)
                    except Exception as ex:  # noqa: BLE001
                        errors = errors + [f"artwork: {str(ex)[:120]}"]
                new = 0
                for it in items:
                    key = it["id"]
                    cur = raw["items"].get(key)
                    if cur is None:
                        cur = raw["items"][key] = {"first_seen": NOW}
                        new += 1
                    precise = cur.get("approx") is False
                    for k, v in it.items():
                        if v is None or v == "":
                            continue
                        if k in ("pub", "approx") and precise and it.get("approx"):
                            continue
                        if k == "pub" and cur.get("pub") and it.get("approx") and cur.get("approx"):
                            continue  # first approximate sighting is the closest one
                        cur[k] = v
                    cur["src"] = src["id"]
                    cur["type"] = "video" if src["type"] == "youtube" else "podcast"
                report["sources"][src["id"]] = {"fetched": len(items), "new": new, "errors": errors}
                flag = f"  ERR {errors}" if errors else ""
                log(f"{src['id']:20} fetched={len(items):4} new={new:4}{flag}")

    # Build catalog.
    catalog_items, per_source = [], {}
    for key, it in raw["items"].items():
        src = all_sources.get(it.get("src"))
        if not src:
            continue
        if it["type"] == "video" and len(key) != 11:
            continue
        if not classify.keep(it, src):
            continue
        out = {
            "id": key,
            "type": it["type"],
            "title": it.get("title", ""),
            "src": src["id"],
            "pub": it.get("pub") or it.get("first_seen"),
            "dur": it.get("dur"),
            "topics": classify.topics(it, src),
            "fmt": classify.fmt(it, src),
        }
        if it.get("approx"):
            out["approx"] = 1
        if it.get("views"):
            out["views"] = it["views"]
        if it.get("desc"):
            out["desc"] = it["desc"]
        for k in ("audio", "link"):
            if it.get(k):
                out[k] = it[k]
        catalog_items.append(out)
        per_source[src["id"]] = per_source.get(src["id"], 0) + 1

    # Podcasts: keep only the newest N per show in the catalog.
    pods = {}
    for it in catalog_items:
        if it["type"] == "podcast":
            pods.setdefault(it["src"], []).append(it)
    drop = set()
    for lst in pods.values():
        lst.sort(key=lambda x: x["pub"] or 0, reverse=True)
        drop.update(x["id"] for x in lst[PODCAST_KEEP:])
    catalog_items = [x for x in catalog_items if x["id"] not in drop]
    catalog_items.sort(key=lambda x: x["pub"] or 0, reverse=True)

    sources_out = []
    for s in all_sources.values():
        meta = raw["meta"].get(s["id"], {})
        entry = {
            "id": s["id"],
            "name": s["name"],
            "type": s["type"],
            "count": sum(1 for x in catalog_items if x["src"] == s["id"]),
        }
        if s["type"] == "youtube":
            entry["url"] = f"https://www.youtube.com/channel/{s['channel']}"
        else:
            entry["style"] = s.get("style", "academic")
            entry["url"] = s["feed"]
        if art_path(s).exists():
            entry["avatar"] = f"img/{s['id']}.jpg"
        sources_out.append(entry)

    catalog = {
        "version": 1,
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "topics": classify.TOPIC_LABELS,
        "formats": classify.FORMAT_LABELS,
        "sources": sources_out,
        "items": catalog_items,
    }

    RAW.parent.mkdir(parents=True, exist_ok=True)
    CATALOG.parent.mkdir(parents=True, exist_ok=True)
    RAW.write_text(json.dumps(raw, separators=(",", ":"), sort_keys=True))
    CATALOG.write_text(json.dumps(catalog, separators=(",", ":"), ensure_ascii=False))
    report["finished"] = int(time.time())
    report["catalog"] = {"items": len(catalog_items), "per_source": per_source}
    if not args.offline:
        REPORT.write_text(json.dumps(report, indent=1, sort_keys=True))

    n_video = sum(1 for x in catalog_items if x["type"] == "video")
    log(f"\ncatalog: {len(catalog_items)} items ({n_video} talks, {len(catalog_items) - n_video} episodes) "
        f"from {len(raw['items'])} stored")

    # Fail loudly if YouTube is clearly broken so the weekly job shows red.
    if not args.offline and not only:
        yt_ok = sum(1 for s in yt_sources if report["sources"].get(s["id"], {}).get("fetched"))
        if yt_ok < len(yt_sources) * 0.5:
            log(f"ERROR: only {yt_ok}/{len(yt_sources)} YouTube sources returned anything")
            sys.exit(2)


if __name__ == "__main__":
    main()
