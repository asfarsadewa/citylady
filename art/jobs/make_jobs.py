"""Writes art/jobs/02_world.json with every image prompt for the game."""
import json, pathlib

PX = "highly detailed 32-bit pixel art, crisp pixel clusters, limited palette, subtle dithering"
REF = ["art/raw/vela_face.png", "art/raw/vela_sheet.png"]
VELA = ("The woman in <image1> and <image2> is Vela. Keep her exact face, very long flowing jet-black hair with blue sheen, "
        "red lipstick, gold hoop earrings, long crimson trench coat, black turtleneck dress, black gloves and black boots unchanged. ")

DISTRICTS = {
    "wharf": "a harbor wharf at dusk, fishing boats, cranes, warehouses, paper lanterns strung over the water, orange and violet sunset sky, gulls",
    "rainmarket": "a dense night market city block in heavy rain, stacked apartment towers, tangled wires, pink and cyan neon signs glowing through rain, wet reflections",
    "oldquarter": "an old quarter of tiled rooftops, wooden tea houses, pagoda silhouettes, a huge full moon, deep blue night, drifting clouds",
    "velvet": "a theatre district at night, art deco theatre towers, marquee bulbs, purple and magenta sky, searchlights sweeping the clouds",
    "ironworks": "an industrial canal district at night, smokestacks, steel bridges, gas holders, sodium orange lights, steam plumes, smoggy green sky",
    "jade": "a hillside garden district during a lantern festival, terraced houses, hundreds of floating sky lanterns rising into a teal night sky",
    "snowline": "a grand winter boulevard at night in snowfall, tram wires, old stone apartment blocks with warm windows, pale blue snowy sky",
    "glass": "a financial district of glass skyscrapers at night, cold blue and white office lights, helicopter lights, reflections, clear dark sky",
    "skybridge": "elevated sky bridges between tall towers high above the city, water tanks, antennas, a vast starry night sky with a thin crescent moon",
    "spire": "the summit of the city, a colossal black and gold spire tower crowned with lanterns, storm clouds lit by lightning, pre-dawn crimson horizon",
}

SHOPS = {
    "bakery": "a small old bakery with a striped awning, bread loaves in the window",
    "tailor": "a tailor shop with mannequins in suits in the display window, brass door handle",
    "noodle": "a noodle bar with a steaming open kitchen counter, stools, hanging red lanterns and fabric curtains over the door",
    "pawn": "a cluttered pawn shop with barred windows, gold coins and watches in the window, three golden balls sign",
    "florist": "a florist shop overflowing with flower buckets on the sidewalk, green wooden frame",
    "books": "a narrow second-hand bookshop with stacked books in the window, green lamp inside",
    "apothecary": "a traditional apothecary with rows of wooden drawers and glass jars visible, herbs hanging",
    "jeweler": "an elegant jewelry boutique with marble facade, glowing display cases, gold trim",
    "teahouse": "a two storey wooden tea house with paper lanterns, carved balcony, sliding doors",
    "records": "a retro record store with vinyl records and posters in the window, neon guitar sign",
    "barber": "an old barber shop with a spinning red white striped barber pole, leather chair visible through window",
    "fish": "a fishmonger stall shopfront with ice trays of fish, blue tarp awning, hanging scale",
    "clock": "a clockmaker shop with many antique clocks in the window, a big round clock above the door",
    "cabaret": "a glamorous small cabaret club entrance with marquee light bulbs, red velvet curtain door, poster frames",
    "garage": "a small mechanic garage with a half open roller shutter, tools, oil drums, a motorbike",
    "bank": "the grand entrance of an imposing black marble bank with golden lanterns, columns and bronze doors",
}
FILLERS = {
    "flat": "a narrow apartment building entrance with a closed door, mailboxes, a potted plant, lit window above",
    "shutter": "a closed shop with a graffiti covered roller shutter, broken lamp, posters",
    "alley": "a dark narrow alley entrance between two buildings with a fire escape, trash bins, a cat",
}

DEBTORS = {
    "d_baker": "a round-faced old baker man with flour on his cheeks, white cap, tired kind eyes",
    "d_tailor": "a precise young woman tailor with measuring tape around her neck, sharp bob haircut, round glasses",
    "d_chef": "a burly bald noodle chef with a towel on his shoulder, forearm tattoos, sweaty, scowling",
    "d_pawn": "a sly thin middle-aged pawnbroker man with slicked back hair, gold tooth, loupe on his forehead",
    "d_florist": "an elderly florist woman with silver hair in a bun, cardigan, holding a red rose, gentle smile",
    "d_books": "a nervous bookish young man with messy hair, oversized sweater, clutching a book",
    "d_apothecary": "a stern old apothecary woman with a jade hairpin, deep wrinkles, knowing eyes",
    "d_jeweler": "a wealthy smug jeweler man with a monocle, velvet jacket, rings on every finger",
    "d_teahouse": "a proud middle-aged tea house matron in an embroidered silk dress, fan in hand",
    "d_records": "a punk young man with a green mohawk, leather jacket with pins, headphones on neck",
    "d_barber": "an old barber with a grand handlebar mustache, white coat, scissors in his hand",
    "d_fish": "a tough fishmonger woman with rolled sleeves, rubber apron, headscarf, loud expression",
    "d_clock": "a frail old clockmaker with magnifying spectacles, white beard, precise and anxious",
    "d_cabaret": "a glamorous cabaret owner woman in her forties, feather boa, sequined gown, cigarette holder, dangerous smile",
    "d_mechanic": "a young mechanic woman with oil smudges on her face, tank top, bandana, defiant look",
    "d_father": "a worried young father in a cheap suit, loosened tie, sweat on his brow",
    "d_banker": "an imposing elegant silver-haired older woman banker in a black and gold suit, gold lantern brooch, cold amused eyes",
}

jobs = []
seed = 3000
for k, d in DISTRICTS.items():
    seed += 17
    jobs.append({"kind": "image", "name": f"sky_{k}", "w": 2048, "h": 864, "seed": seed,
                 "prompt": f"Wide panoramic 2D side-scrolling game background layer, {PX}, distant city skyline, {d}. "
                           "Flat side view, no foreground street, no people, no text, atmospheric depth, cinematic lighting, beautiful color harmony."})
for k, d in {**SHOPS, **FILLERS}.items():
    seed += 17
    sign = "a large blank empty sign board above the door with no text" if k in SHOPS else "no signs, no text"
    jobs.append({"kind": "image", "name": f"shop_{k}", "w": 1024, "h": 1024, "seed": seed,
                 "prompt": f"Single building facade game sprite, {PX}. Front elevation of {d}, straight-on orthographic view, "
                           f"no perspective, ground level shopfront with the upper floor, {sign}. Night time, warm light glowing from windows and door. "
                           "The whole facade is centred and fully visible, isolated on a flat solid pure magenta #FF00FF background, no ground shadow, no people."})
for k, d in DEBTORS.items():
    seed += 17
    jobs.append({"kind": "image", "name": k, "w": 1024, "h": 1024, "seed": seed,
                 "prompt": f"Bust portrait of a game character, {PX}, dramatic cinematic chiaroscuro lighting with a warm key light and a cool rim light. "
                           f"{d}. Looking toward the viewer, expressive face, dark smoky interior background with soft bokeh."})

VELA_EXPR = {
    "vela_smirk": "Close-up bust portrait, she gives a sly confident half smile, one eyebrow slightly raised",
    "vela_cold": "Close-up bust portrait, she stares with cold narrowed eyes and a hard serious expression, harsh red side light",
    "vela_soft": "Close-up bust portrait, she looks down with a soft compassionate sad expression, warm gentle light",
    "vela_tired": "Close-up bust portrait, she looks exhausted and hurt, strands of wet hair on her face, rain, blue light",
}
for k, d in VELA_EXPR.items():
    seed += 17
    jobs.append({"kind": "image", "name": k, "w": 1024, "h": 1024, "seed": seed, "refs": REF,
                 "prompt": VELA + f"{d}. {PX}, dramatic cinematic lighting, dark night city bokeh background."})

CINE = {
    "cine_ledger": (False, "An old leather ledger book tied with a red ribbon lies on a wooden desk beside a burning candle and a gold coin, rain streaks on a dark window behind, neon light from the street, moody still life"),
    "cine_banker": (False, "A vast dark office at the top of a tower, an elegant silver-haired older woman in a black and gold suit stands as a silhouette before a huge window overlooking a glittering night city, golden lanterns hang from the ceiling"),
    "cine_rooftop": (True, "Vela stands on the edge of a rooftop at night seen from behind at a low dramatic angle, overlooking a vast neon city, her very long hair and crimson coat blowing strongly in the wind, full moon"),
    "cine_street": (True, "Low-angle dramatic shot of Vela walking toward the camera down a rainy neon-lit street at night, puddle reflections, her long hair flowing, determined expression"),
    "cine_hall": (False, "The immense interior hall of a black marble bank, golden lanterns in rows, a long red carpet leading to a raised desk, cathedral-like columns, gloomy and grand"),
    "cine_dawn": (True, "Vela stands at the end of a wooden pier at sunrise, seen from the side, golden sunlight, calm sea, her long black hair flowing softly in the breeze, peaceful expression, the city skyline behind"),
    "cine_throne": (True, "Vela sits in a large black leather chair behind a desk in a dark tower office, the night city glittering behind her, golden lanterns, cold powerful expression"),
    "cine_fail": (True, "Vela stands alone in an empty street at grey dawn after rain, holding her ledger, shoulders slumped, wet hair, a fallen paper lantern at her feet, melancholic"),
}
for k, (with_vela, d) in CINE.items():
    seed += 17
    job = {"kind": "image", "name": k, "w": 1664, "h": 928, "seed": seed,
           "prompt": (VELA if with_vela else "") + f"Cinematic 16:9 widescreen game cutscene frame, {PX}. {d}. Masterful composition, rich color, volumetric light."}
    if with_vela:
        job["refs"] = REF
    jobs.append(job)

jobs.append({"kind": "image", "name": "vela_shoulder", "w": 1024, "h": 1024, "seed": 9901, "refs": REF,
             "prompt": VELA + f"Over-the-shoulder view from behind Vela: only her head from behind, her long flowing hair and the shoulder of her crimson coat, "
                              f"occupying the left side of the image, {PX}, rim lit, isolated on a flat solid pure magenta #FF00FF background."})

out = pathlib.Path(__file__).with_name("02_world.json")
out.write_text(json.dumps(jobs, indent=1), encoding="utf-8")
print(len(jobs), "jobs ->", out)
