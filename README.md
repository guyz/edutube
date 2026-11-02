# EduTube

A YouTube-style app for **academic** talks on AI, AI safety and security: conference
talks, symposium and workshop talks, invited talks and keynotes, seminars, lectures and
research-level tutorials. It also has a smaller podcast section with academic interviews
plus some business/casual shows. No account is needed. It works in any browser and on
iPhone, and you can add it to the Home Screen.

## How it works

```
pipeline/sources.yaml   curated channels & podcast feeds (edit this to add/remove sources)
pipeline/classify.py    rules: relevance filter, junk/engineering filter, topics, formats
pipeline/ingest.py      fetches everything, stores pipeline/data/raw.json, writes site/data/catalog.json
site/                   the static web app (no build step)
.github/workflows/update.yml   weekly crawl + deploy to GitHub Pages
```

* **Weekly update.** Every Monday at 06:17 UTC a GitHub Action runs `pipeline/ingest.py`.
  It lists each YouTube channel with `yt-dlp` and falls back to the channel's RSS feed,
  reads the podcast feeds, re-classifies everything, commits the new catalog and redeploys
  the site. To run it right away, go to the Actions tab, pick **Weekly update & deploy**
  and click **Run workflow**.
* **Curation.** Academic venues (USENIX Security, IEEE S&P, NDSS, PETS, IACR, Simons,
  FAR.AI alignment workshops, …) are kept in full. Broad channels (Microsoft Research,
  Stanford Online, DEF CON, Black Hat, IAS, …) are filtered so that only AI, security
  and crypto talks get in. Generic engineering and product content (framework tutorials,
  cloud and "build an app" videos, webinars) is dropped, and so are trailers, promos and
  shorts.
* **Playback.** Talks play through the official YouTube embed. Podcasts play through a
  native audio element, so they keep going in the background and show lock-screen
  controls. One player stays alive across pages, so you can browse while a talk keeps
  playing in the mini player.
* **Your data.** Resume positions, Watch later and history are kept in this browser's
  localStorage. Playback speed carries across videos until the app is fully closed, like
  YouTube.

## Listening in the background on iPhone

* **Podcasts** play through a native audio element, so they keep playing with the screen
  off or in other apps, with lock-screen controls.
* **Talks** use YouTube's embedded player. On iPhone, that player turns off
  picture-in-picture and background play for non-Premium viewers
  (`disablePictureInPicture` in YouTube's own player code), and a website cannot override
  that. Use **YouTube app** under a talk to continue at the same moment in the YouTube
  app, where picture-in-picture works. For audio only, press ▶ on the Lock Screen after
  switching apps.

## Ranking

The home feed ("For you (shuffled)") scores each talk by freshness, a random shuffle,
your interests (topics and channels you have watched) and popularity. Talks you have
finished are pushed down, and no channel can take more than 2 of any 8 slots in a row.
The shuffle changes on every new visit, on reload, when you pull down at the top of
Home, and when you tap **Shuffle**. It stays stable while you browse. Pulling down also
picks up the newest weekly catalog. You can also sort by Newest, Most viewed, Longest or Oldest.

## Local development

```bash
python3 -m venv .venv && .venv/bin/pip install -r pipeline/requirements.txt
.venv/bin/python pipeline/ingest.py                 # weekly-style update
.venv/bin/python pipeline/ingest.py --depth 400     # deeper backfill
.venv/bin/python pipeline/ingest.py --offline       # re-apply rules without fetching
python3 -m http.server 8765 --directory site        # open http://localhost:8765
```

Adding a source: put a line in `pipeline/sources.yaml` (the comments at the top explain
the fields), then run `ingest.py --only <id> --depth 300`.
