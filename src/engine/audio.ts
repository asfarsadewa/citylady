// WebAudio mixer: music (crossfade), ambience loop, one-shot sfx and voice with music ducking.

// measured tempo and first-beat offset of each track (tools: onset autocorrelation)
const BEATS: Record<string, { bpm: number; phase: number }> = {
  mus_walk: { bpm: 89.1, phase: 0.279 },
  mus_duel: { bpm: 78.3, phase: 0.557 },
  mus_theme: { bpm: 95.7, phase: 0.58 },
  mus_dawn: { bpm: 70, phase: 0 },
};

class Audio {
  private musicStart = 0;
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private ambBus!: GainNode;
  private sfxBus!: GainNode;
  private voiceBus!: GainNode;
  private duck!: GainNode;
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private music: { name: string; src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private amb: { name: string; src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private voiceSrc: AudioBufferSourceNode | null = null;
  volumes = { master: 0.9, music: 0.55, sfx: 0.8, voice: 1.0 };

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.duck = ctx.createGain();
    this.duck.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.connect(this.duck);
    this.ambBus = ctx.createGain();
    this.ambBus.connect(this.master);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.voiceBus = ctx.createGain();
    this.voiceBus.connect(this.master);
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.volumes.master;
    this.musicBus.gain.value = this.volumes.music;
    this.ambBus.gain.value = this.volumes.sfx * 0.6;
    this.sfxBus.gain.value = this.volumes.sfx;
    this.voiceBus.gain.value = this.volumes.voice;
  }

  load(path: string): Promise<AudioBuffer | null> {
    let p = this.buffers.get(path);
    if (!p) {
      p = fetch(path)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
        .then((b) => this.ctx!.decodeAudioData(b))
        .catch(() => null);
      this.buffers.set(path, p);
    }
    return p;
  }

  preload(paths: string[]) {
    if (!this.ctx) return;
    paths.forEach((p) => this.load(p));
  }

  async sfx(name: string, o: { vol?: number; rate?: number; pan?: number } = {}) {
    if (!this.ctx) return;
    const buf = await this.load(`audio/sfx/${name}.mp3`);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = o.rate ?? 1;
    const g = this.ctx.createGain();
    g.gain.value = o.vol ?? 1;
    const p = this.ctx.createStereoPanner();
    p.pan.value = o.pan ?? 0;
    src.connect(g).connect(p).connect(this.sfxBus);
    src.start();
  }

  private want: Record<"music" | "amb", string | null> = { music: null, amb: null };

  private fadeOut(entry: { src: AudioBufferSourceNode; gain: GainNode } | null, fade: number) {
    if (!entry || !this.ctx) return;
    const t = this.ctx.currentTime;
    entry.gain.gain.cancelScheduledValues(t);
    entry.gain.gain.setValueAtTime(entry.gain.gain.value, t);
    entry.gain.gain.linearRampToValueAtTime(0, t + fade);
    entry.src.stop(t + fade + 0.05);
  }

  private async loop(kind: "music" | "amb", name: string | null, fade: number) {
    if (!this.ctx) return;
    this.want[kind] = name;
    const cur = kind === "music" ? this.music : this.amb;
    if (cur?.name === name) return;
    this.fadeOut(cur, fade);
    if (kind === "music") this.music = null;
    else this.amb = null;
    if (!name) return;
    const path = kind === "music" ? `audio/music/${name}.m4a` : `audio/sfx/${name}.mp3`;
    const buf = await this.load(path);
    // the latest request wins; stale loads are dropped
    if (!buf || !this.ctx || this.want[kind] !== name) return;
    this.fadeOut(kind === "music" ? this.music : this.amb, fade);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(1, this.ctx.currentTime + fade);
    src.connect(g).connect(kind === "music" ? this.musicBus : this.ambBus);
    src.start();
    const entry = { name, src, gain: g };
    if (kind === "music") {
      this.music = entry;
      this.musicStart = this.ctx.currentTime;
    }
    else this.amb = entry;
  }

  playMusic(name: string | null, fade = 1.5) {
    return this.loop("music", name, fade);
  }

  playAmb(name: string | null, fade = 2) {
    return this.loop("amb", name, fade);
  }

  /** Plays a voice line, ducks music, resolves with its duration in seconds (0 if missing). */
  async voice(id: string): Promise<number> {
    if (!this.ctx) return 0;
    const buf = await this.load(`audio/vo/${id}.m4a`);
    if (!buf) return 0;
    this.voiceSrc?.stop();
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.voiceBus);
    const t = this.ctx.currentTime;
    this.duck.gain.cancelScheduledValues(t);
    this.duck.gain.setValueAtTime(this.duck.gain.value, t);
    this.duck.gain.linearRampToValueAtTime(0.4, t + 0.15);
    this.duck.gain.setValueAtTime(0.4, t + buf.duration);
    this.duck.gain.linearRampToValueAtTime(1, t + buf.duration + 0.6);
    src.start();
    this.voiceSrc = src;
    return buf.duration;
  }

  /** Beat pulse of the current music: 1 on the beat, decaying to 0 before the next one. */
  beat(): number {
    if (!this.ctx || !this.music) return 0;
    const b = BEATS[this.music.name];
    if (!b) return 0;
    const dur = this.music.src.buffer!.duration;
    const t = (this.ctx.currentTime - this.musicStart) % dur - b.phase;
    const ph = ((t * b.bpm) / 60) % 1;
    const p = ph < 0 ? ph + 1 : ph;
    return Math.pow(1 - p, 3);
  }

  /** Dev capture: a MediaStream of everything the player hears. */
  tapStream(): MediaStream | null {
    if (!this.ctx) return null;
    const dest = this.ctx.createMediaStreamDestination();
    this.master.connect(dest);
    return dest.stream;
  }

  nowPlaying(): string | null {
    return this.music?.name ?? null;
  }

  stopVoice() {
    this.voiceSrc?.stop();
    this.voiceSrc = null;
    if (this.ctx) this.duck.gain.linearRampToValueAtTime(1, this.ctx.currentTime + 0.3);
  }
}

export const audio = new Audio();
