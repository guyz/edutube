// One persistent player for the whole app: a YouTube iframe for talks and a native
// <audio> element for podcasts. Neither element is ever moved in the DOM (moving an
// iframe reloads it), so playback survives navigation; CSS switches between the
// full watch layout and the floating mini player.

let ytApi = null;
function loadYouTubeApi() {
  if (ytApi) return ytApi;
  ytApi = new Promise((resolve, reject) => {
    if (window.YT && window.YT.Player) return resolve(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev && prev(); resolve(window.YT); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { ytApi = null; reject(new Error('Could not load the YouTube player')); };
    document.head.appendChild(s);
  });
  return ytApi;
}

export class Player {
  constructor({ dock, audio, onTime, onEnded, onState, onError, describe }) {
    this.dock = dock;
    this.audio = audio;
    this.onTime = onTime || (() => {});
    this.onEnded = onEnded || (() => {});
    this.onState = onState || (() => {});
    this.onError = onError || (() => {});
    this.describe = describe; // item -> {title, artist, artwork}
    this.item = null;
    this.kind = null;
    this.yt = null;
    this.ytReady = null;
    this.playing = false;
    this.rate = 1;
    this._timer = null;
    this._lastPos = 0;
    this._bindAudio();
    this._bindMediaSession();
  }

  // ---- public API ----------------------------------------------------------

  async load(item, { start = 0, autoplay = true } = {}) {
    if (this.item && this.item.id === item.id) {
      if (autoplay && !this.playing) this.play();
      return;
    }
    this.item = item;
    this.dock.hidden = false;
    this._setPlaying(false);
    if (item.type === 'podcast') {
      this._stopYouTube();
      this.kind = 'audio';
      this._loadAudio(item, start, autoplay);
    } else {
      this._stopAudio();
      this.kind = 'yt';
      await this._loadYouTube(item, start, autoplay);
    }
    this._updateMediaSession();
  }

  toggle() { this.playing ? this.pause() : this.play(); }

  play() {
    if (this.kind === 'audio') {
      const p = this.audio.play();
      if (p && p.catch) p.catch(() => {});
    } else if (this.yt && this.yt.playVideo) {
      this.yt.playVideo();
    }
  }

  pause() {
    if (this.kind === 'audio') this.audio.pause();
    else if (this.yt && this.yt.pauseVideo) this.yt.pauseVideo();
  }

  stop() {
    this._stopAudio();
    this._stopYouTube();
    this.item = null;
    this.kind = null;
    this._setPlaying(false);
    this.dock.hidden = true;
    if ('mediaSession' in navigator) navigator.mediaSession.metadata = null;
  }

  time() {
    if (this.kind === 'audio') return this.audio.currentTime || 0;
    if (this.yt && this.yt.getCurrentTime) return this.yt.getCurrentTime() || 0;
    return 0;
  }

  duration() {
    if (this.kind === 'audio') return isFinite(this.audio.duration) ? this.audio.duration : (this.item?.dur || 0);
    if (this.yt && this.yt.getDuration) return this.yt.getDuration() || this.item?.dur || 0;
    return 0;
  }

  seek(t) {
    t = Math.max(0, t);
    if (this.kind === 'audio') this.audio.currentTime = t;
    else if (this.yt && this.yt.seekTo) this.yt.seekTo(t, true);
    this._tick();
  }

  skip(dt) { this.seek(this.time() + dt); }

  setRate(r) {
    this.rate = r;
    if (this.kind === 'audio') this.audio.playbackRate = r;
    else if (this.yt && this.yt.setPlaybackRate) this.yt.setPlaybackRate(r);
  }

  // ---- audio -----------------------------------------------------------------

  _loadAudio(item, start, autoplay) {
    const a = this.audio;
    a.src = item.audio;
    a.playbackRate = this.rate;
    const seekStart = () => {
      a.removeEventListener('loadedmetadata', seekStart);
      if (start > 0) a.currentTime = start;
      a.playbackRate = this.rate;
    };
    a.addEventListener('loadedmetadata', seekStart);
    if (autoplay) {
      const p = a.play();
      if (p && p.catch) p.catch(() => this._setPlaying(false));
    } else {
      a.load();
    }
  }

  _stopAudio() {
    const a = this.audio;
    if (!a.getAttribute('src')) return;
    a.pause();
    a.removeAttribute('src');
    a.load();
  }

  _bindAudio() {
    const a = this.audio;
    const mine = (fn) => (e) => { if (this.kind === 'audio') fn(e); };
    a.addEventListener('play', mine(() => { a.playbackRate = this.rate; this._setPlaying(true); }));
    a.addEventListener('playing', mine(() => this._setPlaying(true)));
    a.addEventListener('pause', mine(() => { this._setPlaying(false); this._tick(); }));
    a.addEventListener('ended', mine(() => { this._setPlaying(false); this._tick(true); this.onEnded(this.item); }));
    a.addEventListener('timeupdate', mine(() => this._tick()));
    a.addEventListener('error', () => {
      if (this.kind === 'audio' && a.getAttribute('src')) this.onError('This episode could not be loaded.');
    });
  }

  // ---- YouTube ---------------------------------------------------------------

  async _loadYouTube(item, start, autoplay) {
    let YT;
    try {
      YT = await loadYouTubeApi();
    } catch (e) {
      this.onError(e.message);
      return;
    }
    if (this.item !== item) return; // user moved on while the API loaded
    if (!this.yt) {
      this.ytReady = new Promise((resolve) => {
        this.yt = new YT.Player('yt-player', {
          host: 'https://www.youtube-nocookie.com',
          videoId: item.id,
          playerVars: {
            playsinline: 1, rel: 0, modestbranding: 1, autoplay: autoplay ? 1 : 0,
            start: Math.floor(start), enablejsapi: 1, origin: location.origin,
          },
          events: {
            onReady: () => {
              if (this.rate !== 1) this.yt.setPlaybackRate(this.rate);
              resolve();
            },
            onStateChange: (e) => this._ytState(e.data),
            onPlaybackRateChange: (e) => { this.rate = e.data; this.onState({ rate: e.data }); },
            onError: (e) => {
              const msg = { 2: 'Invalid video id.', 5: 'This video cannot play in this browser.',
                100: 'This video was removed or made private.', 101: 'The owner does not allow embedding - open it on YouTube.',
                150: 'The owner does not allow embedding - open it on YouTube.' }[e.data] || 'Playback error.';
              this.onError(msg, item);
            },
          },
        });
      });
      await this.ytReady;
    } else {
      await this.ytReady;
      const opts = { videoId: item.id, startSeconds: Math.floor(start) };
      if (autoplay) this.yt.loadVideoById(opts);
      else this.yt.cueVideoById(opts);
    }
    document.getElementById('yt-wrap').hidden = false;
  }

  _ytState(s) {
    // -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued
    if (this.kind !== 'yt') return;
    if (s === 1) {
      this._setPlaying(true);
      if (this.yt.getPlaybackRate && this.yt.getPlaybackRate() !== this.rate) this.yt.setPlaybackRate(this.rate);
      clearInterval(this._timer);
      this._timer = setInterval(() => this._tick(), 1000);
    } else if (s === 2 || s === 0 || s === 5 || s === -1) {
      this._setPlaying(false);
      clearInterval(this._timer);
      this._tick(s === 0);
      if (s === 0) this.onEnded(this.item);
    }
  }

  _stopYouTube() {
    clearInterval(this._timer);
    if (this.yt && this.yt.stopVideo) {
      try { this.yt.stopVideo(); } catch { /* player not ready */ }
    }
    const w = document.getElementById('yt-wrap');
    if (w) w.hidden = true;
  }

  // ---- shared ------------------------------------------------------------------

  _setPlaying(p) {
    if (this.playing === p) return;
    this.playing = p;
    this.dock.classList.toggle('is-playing', p);
    if ('mediaSession' in navigator && this.kind === 'audio') {
      navigator.mediaSession.playbackState = p ? 'playing' : 'paused';
    }
    this.onState({ playing: p });
  }

  _tick(ended = false) {
    if (!this.item) return;
    const t = this.time();
    const d = this.duration();
    this.onTime(this.item, t, d, ended);
    if (this.kind === 'audio' && 'mediaSession' in navigator && navigator.mediaSession.setPositionState && d > 0) {
      const now = Date.now();
      if (now - this._lastPos > 5000 || ended) {
        this._lastPos = now;
        try {
          navigator.mediaSession.setPositionState({ duration: d, position: Math.min(t, d), playbackRate: this.rate });
        } catch { /* ignore invalid states */ }
      }
    }
  }

  _bindMediaSession() {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const set = (action, fn) => { try { ms.setActionHandler(action, fn); } catch { /* unsupported */ } };
    set('play', () => this.play());
    set('pause', () => this.pause());
    set('seekbackward', (d) => this.skip(-(d.seekOffset || 15)));
    set('seekforward', (d) => this.skip(d.seekOffset || 30));
    set('seekto', (d) => this.seek(d.seekTime));
  }

  _updateMediaSession() {
    if (!('mediaSession' in navigator)) return;
    if (this.kind !== 'audio' || !this.describe) {
      navigator.mediaSession.metadata = null;
      return;
    }
    const d = this.describe(this.item);
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: d.title, artist: d.artist, album: 'EduTube',
        artwork: d.artwork ? [{ src: d.artwork, sizes: '512x512' }] : [],
      });
    } catch { /* ignore */ }
  }
}
