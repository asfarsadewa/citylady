// Analogue VHS post-process: YIQ chroma bleed, ghosting, halation, washed blacks,
// tape wobble, a drifting tracking band, scanlines and grain. Falls back to plain 2D.

const VERT = `
attribute vec2 p;
varying vec2 uv;
void main() { uv = p * 0.5 + 0.5; uv.y = 1.0 - uv.y; gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `
precision mediump float;
varying vec2 uv;
uniform sampler2D tex;
uniform vec2 src;      // source size in pixels (640x360)
uniform vec2 dst;      // output size in pixels
uniform float time;
uniform float amount;  // 0 = clean, 1 = full analogue

vec3 toYIQ(vec3 c) {
  return vec3(dot(c, vec3(0.299, 0.587, 0.114)), dot(c, vec3(0.596, -0.274, -0.322)), dot(c, vec3(0.211, -0.523, 0.312)));
}
vec3 toRGB(vec3 y) {
  return vec3(y.x + 0.956 * y.y + 0.621 * y.z, y.x - 0.272 * y.y - 0.647 * y.z, y.x - 1.106 * y.y + 1.703 * y.z);
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 q = uv;
  // gentle tube curvature
  vec2 cc = q - 0.5;
  q = 0.5 + cc * (1.0 + dot(cc, cc) * 0.035 * amount);
  // tape wobble: slow line-wise jitter, plus a tracking band that drifts up the frame
  float line = floor(q.y * src.y);
  float wob = (sin(line * 0.21 + time * 2.3) * 0.25 + (hash(vec2(line, floor(time * 24.0))) - 0.5) * 0.35) / src.x;
  // the tracking glitch rolls through for ~3 s about every 23 s
  float cyc = mod(time, 23.0);
  float band = 1.15 - cyc / 2.6;
  float inBand = cyc < 3.2 ? smoothstep(0.035, 0.0, abs(q.y - band)) : 0.0;
  wob += inBand * (hash(vec2(line, time)) - 0.5) * 6.0 / src.x;
  q.x += wob * amount;
  vec2 px = vec2(1.0 / src.x, 0.0);

  // luma: slight horizontal softness; chroma: wide horizontal bleed, shifted right
  vec3 c0 = texture2D(tex, q).rgb;
  vec3 yiq = toYIQ(c0);
  float yl = yiq.x * 0.5 + (toYIQ(texture2D(tex, q - px).rgb).x + toYIQ(texture2D(tex, q + px).rgb).x) * 0.25;
  vec2 chroma = vec2(0.0);
  float wsum = 0.0;
  for (int i = -3; i <= 5; i++) {
    float w = 1.0 - abs(float(i) - 1.0) / 5.5;
    chroma += toYIQ(texture2D(tex, q + px * float(i) * 1.3).rgb).yz * w;
    wsum += w;
  }
  chroma /= wsum;
  vec3 col = toRGB(vec3(mix(yiq.x, yl, amount), mix(yiq.yz, chroma, amount)));

  // ghost / ringing: a faint shifted copy of the luma edges
  float ghost = toYIQ(texture2D(tex, q - px * 3.0).rgb).x;
  col += (yiq.x - ghost) * 0.10 * amount;

  // halation: bright areas glow and bleed a warm shadow
  vec3 glow = vec3(0.0);
  for (int i = 0; i < 6; i++) {
    float a = float(i) * 1.0472;
    glow += texture2D(tex, q + vec2(cos(a), sin(a)) * vec2(3.0 / src.x, 3.0 / src.y)).rgb;
  }
  glow /= 6.0;
  col += max(glow - 0.55, 0.0) * vec3(1.0, 0.75, 0.6) * 0.55 * amount;

  // wash: lifted blacks, softened whites, slight desaturation with a teal-magenta cast
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(l), 0.12 * amount);
  col = col * (1.0 - 0.07 * amount) + vec3(0.035, 0.025, 0.05) * amount;
  col = mix(col, col * vec3(1.02, 0.98, 1.04), amount);

  // scanlines at output resolution, grain, tracking noise, vignette
  float scan = 0.5 + 0.5 * sin(uv.y * dst.y * 3.14159);
  col *= 1.0 - 0.09 * amount * (1.0 - scan);
  float g = hash(uv * dst + time * 60.0) - 0.5;
  col += g * 0.045 * amount;
  col += inBand * hash(vec2(uv.x * 400.0, time)) * 0.12 * amount;
  float vig = smoothstep(0.95, 0.35, length(cc * vec2(1.0, 1.15)));
  col *= mix(1.0, 0.72 + 0.28 * vig, amount);
  if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) col = vec3(0.0);
  gl_FragColor = vec4(col, 1.0);
}`;

export class Post {
  private gl: WebGLRenderingContext | null = null;
  private tex: WebGLTexture | null = null;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private ctx2d: CanvasRenderingContext2D | null = null;
  amount = 1;

  constructor(private out: HTMLCanvasElement) {
    const gl = out.getContext("webgl", { antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
    if (!gl) {
      this.ctx2d = out.getContext("2d");
      return;
    }
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    // linear sampling lets the analogue blur read between source pixels
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    for (const n of ["tex", "src", "dst", "time", "amount"]) this.u[n] = gl.getUniformLocation(prog, n);
    this.gl = gl;
  }

  /** Resize the output buffer to the CSS size times the pixel ratio. */
  resize(cssW: number, cssH: number) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.out.width = Math.round(cssW * dpr);
    this.out.height = Math.round(cssH * dpr);
    if (this.ctx2d) this.ctx2d.imageSmoothingEnabled = false;
  }

  render(src: HTMLCanvasElement, time: number) {
    const gl = this.gl;
    if (!gl) {
      this.ctx2d?.drawImage(src, 0, 0, this.out.width, this.out.height);
      return;
    }
    gl.viewport(0, 0, this.out.width, this.out.height);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.uniform1i(this.u.tex, 0);
    gl.uniform2f(this.u.src, src.width, src.height);
    gl.uniform2f(this.u.dst, this.out.width, this.out.height);
    gl.uniform1f(this.u.time, time);
    gl.uniform1f(this.u.amount, this.amount);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
