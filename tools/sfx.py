"""Generate game sound effects with ElevenLabs into public/audio/sfx/*.mp3 (skips existing files)."""
import json, os, pathlib, urllib.request, concurrent.futures as cf

OUT = pathlib.Path(__file__).resolve().parents[1] / "public" / "audio" / "sfx"
KEY = os.environ["ELEVENLABS_API_KEY"]

SFX = {
    # name: (prompt, seconds or None, loop, prompt_influence)
    "step_stone": ("Single soft footstep of a woman's heeled boot on wet stone pavement, close, dry", 0.5, False, 0.7),
    "step_stone2": ("Single light footstep of a heeled boot on stone street, slightly different tone, close", 0.5, False, 0.7),
    "door_bell": ("Shop door opening with a small brass bell jingling above it", 1.6, False, 0.6),
    "door_close": ("Wooden shop door closing gently with a latch click", 1.0, False, 0.6),
    "coins": ("Handful of gold coins poured onto a wooden counter, rich clinking", 1.5, False, 0.6),
    "register": ("Vintage mechanical cash register ding and drawer opening", 1.4, False, 0.7),
    "ledger": ("Leather ledger book opened and pages flipped quickly", 1.2, False, 0.6),
    "stamp": ("Heavy rubber stamp pressed hard onto paper on a desk, thud", 0.7, False, 0.7),
    "ui_move": ("Soft short muted wooden UI tick, subtle click", 0.5, False, 0.8),
    "ui_ok": ("Elegant short UI confirm chime, soft bell with warm tone", 0.6, False, 0.8),
    "ui_back": ("Short soft low UI cancel blip, muted", 0.5, False, 0.8),
    "whoosh": ("Fast cinematic whoosh transition, airy", 0.8, False, 0.6),
    "braam": ("Deep cinematic braam impact hit with long tail, dark and dramatic", 3.0, False, 0.6),
    "impact": ("Punchy cinematic low impact thump with slight reverb", 1.2, False, 0.6),
    "heartbeat": ("Slow tense heartbeat, two deep thumps", 1.5, False, 0.7),
    "tension_riser": ("Short rising tension string swell riser ending abruptly", 2.5, False, 0.6),
    "slam": ("Fist slamming on a wooden table, glasses rattle", 1.0, False, 0.7),
    "glass_break": ("Small drinking glass shattering on a floor", 1.2, False, 0.7),
    "paper": ("A folded paper note being unfolded, crisp rustle", 0.8, False, 0.7),
    "clock_tick": ("Old clock ticking twice, then a soft chime", 1.6, False, 0.7),
    "bell_toll": ("Distant city church bell tolling once at night, reverberant", 3.5, False, 0.6),
    "success": ("Short triumphant jazzy stinger, muted trumpet and piano chord, stylish", 2.5, False, 0.5),
    "fail": ("Short sad noir stinger, low piano chord and muted trumpet falling", 2.5, False, 0.5),
    "whistle": ("Police whistle blown twice in a distant street", 1.8, False, 0.7),
    "cloth": ("Long coat fabric swishing as someone turns quickly", 0.7, False, 0.7),
    "gasp": ("Man sharply inhaling in surprise, short gasp", 0.8, False, 0.7),
    "amb_city": ("Night city street ambience, distant traffic, faint chatter, soft wind, occasional far car horn", 20, True, 0.4),
    "amb_rain": ("Steady rain on a city street with gutters dripping and distant thunder", 20, True, 0.4),
    "amb_harbor": ("Night harbor ambience, gentle water lapping on wooden pier, creaking boats, distant gulls", 20, True, 0.4),
    "amb_wind": ("High altitude wind blowing across rooftops at night, gusts, distant city below", 20, True, 0.4),
    "amb_snow": ("Quiet snowy night street, soft muffled wind, distant tram bell", 20, True, 0.4),
    "amb_shop": ("Quiet small shop interior ambience, clock ticking, fluorescent hum, muffled street outside", 15, True, 0.4),
    "amb_industry": ("Industrial canal at night, distant machinery hum, steam hiss, metal clanks, water", 20, True, 0.4),
}


def gen(name, spec):
    dest = OUT / f"{name}.mp3"
    if dest.exists():
        return f"skip {name}"
    text, secs, loop, infl = spec
    body = {"text": text, "model_id": "eleven_text_to_sound_v2", "prompt_influence": infl, "loop": loop}
    if secs:
        body["duration_seconds"] = secs
    req = urllib.request.Request("https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128",
                                 data=json.dumps(body).encode(), headers={"xi-api-key": KEY, "Content-Type": "application/json"})
    dest.write_bytes(urllib.request.urlopen(req, timeout=120).read())
    return f"ok {name}"


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    with cf.ThreadPoolExecutor(4) as ex:
        futs = {ex.submit(gen, n, s): n for n, s in SFX.items()}
        for f in cf.as_completed(futs):
            try:
                print(f.result(), flush=True)
            except Exception as e:
                print("FAIL", futs[f], e, flush=True)
