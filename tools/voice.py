"""All spoken lines in City Lady. Writes Gemini TTS manifests, renders them, converts to .m4a,
and writes src/data/voice.json (id -> subtitle text, speaker) for the game.

usage: python tools/voice.py [--dry-run]
"""
import json, os, pathlib, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
# path to a Gemini TTS manifest renderer (gemini_tts.py); set GEMINI_TTS_SCRIPT
TTS = os.environ.get("GEMINI_TTS_SCRIPT", "gemini_tts.py")
WORK = ROOT / "art" / "voice"
OUT = ROOT / "public" / "audio" / "vo"

SPEAKERS = {
    "vela": ("Despina", "Vela, a young woman debt collector. Low, smooth, confident, a little amused, film noir heroine. Never shouts."),
    "banker": ("Gacrux", "Madame Hale, an elegant older woman banker. Slow, velvet, cold, amused, every word measured."),
    "oldman": ("Algenib", "A gruff old shopkeeper man, tired, stubborn."),
    "youngman": ("Puck", "A nervous young shopkeeper man, fast, anxious."),
    "woman": ("Pulcherrima", "A tough middle-aged shopkeeper woman, sharp and loud."),
    "oldwoman": ("Vindemiatrix", "A gentle old shopkeeper woman, wise, slightly theatrical."),
}

LINES = {
    # --- intro cinematic (banker narrates) ---
    "intro_1": ("banker", "In Lanternport, every light is borrowed.", "slow, intimate, like the opening line of a film"),
    "intro_2": ("banker", "Your mother collected for me for twenty years. She died owing me one hundred thousand marks.", "matter of fact, cold"),
    "intro_3": ("banker", "Debts do not die, Miss Vale. They are inherited.", "quiet, a small smile"),
    "intro_4": ("banker", "Ten districts. Ten nights. Collect what the city owes me, and climb to my tower before the last dawn.", "deliberate, a challenge"),
    "intro_5": ("vela", "And when I reach the top?", "calm, steady"),
    "intro_6": ("banker", "Then we will settle your ledger. Face to face.", "amused, final"),
    # --- district intros (vela) ---
    "d1": ("vela", "Lantern Wharf. Mother started here. So do I.", "quiet resolve"),
    "d2": ("vela", "Rainmarket. Everyone here sells something. Tonight, they pay.", "cool, wry"),
    "d3": ("vela", "The Old Quarter. Old families. Old grudges. Older debts.", "measured"),
    "d4": ("vela", "Velvet Row. Pretty lights hide the ugliest ledgers.", "sly"),
    "d5": ("vela", "The Ironworks. Nobody here bends easily. Neither do I.", "hard"),
    "d6": ("vela", "Jade Terrace. A festival night. People are generous when they are happy.", "soft, knowing"),
    "d7": ("vela", "Snowline. Cold hands, colder hearts.", "breath in the cold"),
    "d8": ("vela", "The Glass Exchange. Here, the debts have lawyers.", "dry"),
    "d9": ("vela", "Skybridge Heights. I can see her tower from here.", "wind, determined"),
    "d10": ("vela", "The Spire. One more night, Madame Hale.", "low, dangerous"),
    # --- vela tactics ---
    "greet_1": ("vela", "Good evening. You know why I am here.", "polite, cool"),
    "greet_2": ("vela", "Evening. The Lantern Bank sends its regards.", "smooth"),
    "greet_3": ("vela", "Close the till. We need to talk.", "calm, firm"),
    "charm_1": ("vela", "You have such a lovely shop. It would be a shame to lose it.", "warm, charming"),
    "charm_2": ("vela", "I like you. Let us make this easy for both of us.", "smiling"),
    "charm_3": ("vela", "Come now. You are better than a late payment.", "playful"),
    "press_1": ("vela", "The bank is out of patience. So am I.", "cold, quiet threat"),
    "press_2": ("vela", "Tomorrow, someone less polite comes through that door.", "low, menacing"),
    "press_3": ("vela", "Pay tonight, or your name goes up on the Lantern board.", "hard"),
    "reason_1": ("vela", "Look at the numbers. The interest grows every night you wait.", "patient, logical"),
    "reason_2": ("vela", "You signed the contract. I only read it back to you.", "even"),
    "reason_3": ("vela", "A little now costs less than everything later.", "reasonable"),
    "leverage_1": ("vela", "I heard something interesting about you today.", "sly, slow"),
    "leverage_2": ("vela", "Your neighbors talk. Should I?", "soft, dangerous"),
    "leverage_3": ("vela", "I know your secret. Let us keep it between us.", "whisper"),
    "offer_1": ("vela", "I can shave a little off the top. Tonight only.", "businesslike"),
    "offer_2": ("vela", "Pay part of it now, and I will forget the late fee.", "generous"),
    "read_1": ("vela", "Hm. Your hands are shaking.", "observant, quiet"),
    "read_2": ("vela", "Tell me what you are really afraid of.", "soft"),
    "paid_1": ("vela", "Pleasure doing business.", "satisfied"),
    "paid_2": ("vela", "The Lantern Bank thanks you.", "cool"),
    "paid_3": ("vela", "See? That did not hurt.", "light, amused"),
    "out_1": ("vela", "Fine. I know where to find you.", "annoyed, controlled"),
    "out_2": ("vela", "This is not over.", "cold"),
    "leave_1": ("vela", "Think about it. I will be back.", "calm"),
    # --- debtor barks (4 archetypes) ---
    **{f"{a}_{k}_{i}": (a, t, d) for a, sets in {
        "oldman": {"refuse": [("I have nothing for you. Get out of my shop.", "gruff"), ("Your mother at least had manners.", "bitter"), ("Come back next month. Maybe.", "dismissive")],
                   "plead": [("Please. The winter was hard on all of us.", "tired, pleading"), ("I have worked this counter for forty years.", "weary")],
                   "angry": [("You threaten me? In my own shop?", "angry"), ("Enough! I have heard enough!", "shouting")],
                   "bargain": [("Half. I can give you half. No more.", "reluctant")],
                   "pay": [("Take it. Take it and go.", "defeated"), ("Fine. Every last coin.", "grumbling")]},
        "youngman": {"refuse": [("I, uh, I do not have it right now.", "nervous"), ("Can we do this next week?", "anxious, fast"), ("There must be a mistake in the ledger.", "flustered")],
                     "plead": [("Please, I have a family. Just a little more time.", "desperate"), ("I am trying, I swear I am trying.", "shaky")],
                     "angry": [("You cannot talk to me like that!", "voice cracking"), ("Get out before I call someone!", "panicked anger")],
                     "bargain": [("What if I pay some now, and the rest later?", "hopeful")],
                     "pay": [("Okay. Okay. Here. All of it.", "relieved, shaky"), ("Just, please, do not come back.", "quiet")]},
        "woman": {"refuse": [("Ha! You will get nothing from me, sweetheart.", "mocking"), ("I already paid the last collector.", "defiant"), ("Do I look like a bank to you?", "sarcastic")],
                  "plead": [("Business is slow. You can see that yourself.", "frustrated"), ("Give me one good week. One.", "tense")],
                  "angry": [("Watch your tone, girl.", "icy anger"), ("Out! Out of my shop!", "yelling")],
                  "bargain": [("I will give you a third tonight. Take it or leave it.", "shrewd")],
                  "pay": [("You have nerve. I will give you that.", "grudging respect"), ("There. Now we are square.", "curt")]},
        "oldwoman": {"refuse": [("Oh, my dear. I am just an old woman.", "sweet, evasive"), ("My late husband handled the money.", "vague"), ("Tea? No? Then no money either.", "wry")],
                     "plead": [("These flowers are all I have left.", "sad"), ("Have a heart, child.", "gentle")],
                     "angry": [("Your mother would be ashamed of you.", "cold, disappointed"), ("I will not be spoken to that way.", "firm")],
                     "bargain": [("I could spare a little. For you, dear.", "sly, sweet")],
                     "pay": [("You remind me of her, you know.", "wistful"), ("Take it. And be careful out there.", "kind")]},
    }.items() for k, lst in sets.items() for i, (t, d) in enumerate(lst, 1)},
    # --- banker between districts ---
    "hale_win_1": ("banker", "Adequate. The next district will not be so kind.", "cool"),
    "hale_win_2": ("banker", "You are climbing, Miss Vale. Mind the height.", "amused"),
    "hale_win_3": ("banker", "Your mother would have been faster. But not by much.", "dry"),
    "hale_fear": ("banker", "They whisper your name now. Fear is a fine currency.", "pleased"),
    "hale_grace": ("banker", "Mercy. How expensive of you.", "disdainful"),
    "hale_fail": ("banker", "Dawn, and your ledger is short. Again, Miss Vale.", "disappointed, cold"),
    # --- finale ---
    "fin_1": ("banker", "So. The daughter reaches the top.", "slow, impressed despite herself"),
    "fin_2": ("vela", "I brought your money. And your ledger.", "controlled"),
    "fin_3": ("banker", "Then let us settle. Everything has a price.", "cold"),
    "fin_4": ("vela", "Everything except me.", "quiet, final"),
    "hale_duel_1": ("banker", "You think you can bargain with me?", "amused"),
    "hale_duel_2": ("banker", "I taught your mother everything she knew.", "cold"),
    "hale_duel_3": ("banker", "Careful. I own every door in this city.", "threatening"),
    "hale_crack": ("banker", "Where did you hear that?", "shaken, sharp"),
    "hale_yield": ("banker", "Enough. The ledger is closed.", "defeated, dignified"),
    # --- endings ---
    "end_grace_1": ("vela", "I burned the ledger at dawn. Every name in it. Every debt.", "peaceful, reflective"),
    "end_grace_2": ("vela", "The city woke up owing nothing. For one morning, neither did I.", "gentle, a smile"),
    "end_fear_1": ("vela", "Madame Hale left the tower before sunrise.", "cold, reflective"),
    "end_fear_2": ("vela", "Now every light in Lanternport is borrowed from me.", "quiet, powerful"),
    "end_fail_1": ("vela", "The sun came up, and my ledger was still short.", "tired, sad"),
}


def main():
    dry = "--dry-run" in sys.argv
    WORK.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    subs = {}
    for spk, (voice, style) in SPEAKERS.items():
        lines = []
        for lid, (s, text, direction) in LINES.items():
            if s != spk:
                continue
            subs[lid] = {"s": spk, "t": text}
            if (OUT / f"{lid}.m4a").exists():
                continue
            lines.append({"speaker": spk, "text": text, "direction": direction, "file": f"{lid}.wav"})
        if not lines:
            continue
        man = {"id": spk, "language": "English (en-US)", "style": "Film noir video game voice acting. Speak only the transcript.",
               "mode": "per_line", "speakers": [{"name": spk, "voice": voice, "style": style}], "lines": lines}
        mp = WORK / f"{spk}.json"
        mp.write_text(json.dumps(man, indent=1), encoding="utf-8")
        cmd = [sys.executable, TTS, "manifest", str(mp), "--out-dir", str(WORK), "--overwrite", "--sleep", "0.5"]
        if dry:
            cmd.append("--dry-run")
        subprocess.run(cmd, check=False)
        if dry:
            continue
        for ln in lines:
            wav = WORK / ln["file"]
            if wav.exists():
                subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(wav), "-af",
                                "silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse",
                                "-ar", "44100", "-c:a", "aac", "-b:a", "64k", str(OUT / (wav.stem + ".m4a"))], check=False)
    data = ROOT / "src" / "data"
    data.mkdir(parents=True, exist_ok=True)
    (data / "voice.json").write_text(json.dumps(subs, indent=1, ensure_ascii=False), encoding="utf-8")
    print("lines:", len(subs), "ogg files:", len(list(OUT.glob("*.m4a"))))


if __name__ == "__main__":
    main()
