// Static game data: districts, shop types, debtor portraits, perks, intel templates.

export type Weather = "clear" | "rain" | "snow" | "lanterns" | "steam" | "wind" | "embers";
export type Trait = "pride" | "fear" | "greed" | "heart" | "logic";
export const TRAITS: Trait[] = ["pride", "fear", "greed", "heart", "logic"];
export const TRAIT_LABEL: Record<Trait, string> = { pride: "Proud", fear: "Fearful", greed: "Greedy", heart: "Soft-hearted", logic: "Rational" };
export const TRAIT_HINT: Record<Trait, string> = {
  pride: "Charm works. Pressure makes this debtor angry.",
  fear: "Pressure works well.",
  greed: "Offers work well.",
  heart: "Charm and hardship stories work well.",
  logic: "Reason works well.",
};

export interface District {
  id: string;
  name: string;
  sky: string;
  weather: Weather;
  amb: string;
  /** colour multiplied over the street, and the glow colour of lamps */
  tint: string;
  glow: string;
  fog: string;
  wind: number;
  shops: number;
  debtScale: number;
  quotaRatio: number;
  reflect: boolean;
}

export const DISTRICTS: District[] = [
  { id: "wharf", name: "Lantern Wharf", sky: "sky_wharf", weather: "clear", amb: "amb_harbor", tint: "#e9b7a4", glow: "#ffb35c", fog: "#5b3a58", wind: 0.6, shops: 6, debtScale: 1, quotaRatio: 0.5, reflect: false },
  { id: "rainmarket", name: "Rainmarket", sky: "sky_rainmarket", weather: "rain", amb: "amb_rain", tint: "#a9a6d8", glow: "#ff5fd2", fog: "#26204a", wind: 0.4, shops: 7, debtScale: 1.35, quotaRatio: 0.52, reflect: true },
  { id: "oldquarter", name: "The Old Quarter", sky: "sky_oldquarter", weather: "clear", amb: "amb_city", tint: "#9fb2dd", glow: "#ffd48a", fog: "#1d2748", wind: 0.5, shops: 7, debtScale: 1.7, quotaRatio: 0.55, reflect: false },
  { id: "velvet", name: "Velvet Row", sky: "sky_velvet", weather: "clear", amb: "amb_city", tint: "#caa0d8", glow: "#ff6ad5", fog: "#3a1742", wind: 0.4, shops: 8, debtScale: 2.1, quotaRatio: 0.57, reflect: true },
  { id: "ironworks", name: "The Ironworks", sky: "sky_ironworks", weather: "steam", amb: "amb_industry", tint: "#b8b392", glow: "#ffa040", fog: "#2b2c1e", wind: 0.7, shops: 8, debtScale: 2.6, quotaRatio: 0.58, reflect: false },
  { id: "jade", name: "Jade Terrace", sky: "sky_jade", weather: "lanterns", amb: "amb_city", tint: "#9fd0c4", glow: "#ffc36b", fog: "#123a3a", wind: 0.5, shops: 8, debtScale: 3.1, quotaRatio: 0.6, reflect: false },
  { id: "snowline", name: "Snowline Boulevard", sky: "sky_snowline", weather: "snow", amb: "amb_snow", tint: "#bcc9e6", glow: "#ffd9a0", fog: "#394a6a", wind: 0.9, shops: 9, debtScale: 3.7, quotaRatio: 0.62, reflect: false },
  { id: "glass", name: "The Glass Exchange", sky: "sky_glass", weather: "clear", amb: "amb_city", tint: "#9cc0e0", glow: "#9ee7ff", fog: "#0f2238", wind: 0.6, shops: 9, debtScale: 4.4, quotaRatio: 0.64, reflect: true },
  { id: "skybridge", name: "Skybridge Heights", sky: "sky_skybridge", weather: "wind", amb: "amb_wind", tint: "#a7a9d6", glow: "#ffd07a", fog: "#161a3a", wind: 1.6, shops: 9, debtScale: 5.2, quotaRatio: 0.66, reflect: false },
  { id: "spire", name: "The Spire", sky: "sky_spire", weather: "embers", amb: "amb_wind", tint: "#d8a49a", glow: "#ffcf66", fog: "#3a0f16", wind: 1.2, shops: 8, debtScale: 6, quotaRatio: 0.66, reflect: true },
];

export interface ShopType {
  id: string;
  label: string;
  sprite: string;
  portraits: string[];
  names: string[];
  bias: Partial<Record<Trait, number>>;
  late?: boolean;
  hardship: string[];
}

export const SHOP_TYPES: ShopType[] = [
  { id: "bakery", label: "Bakery", sprite: "shop_bakery", portraits: ["d_baker", "d_father"], names: ["Crumb & Crust", "Morning Loaf", "Golden Oven"], bias: { heart: 1 }, hardship: ["the bakery oven cracked last month", "flour prices doubled this winter"] },
  { id: "tailor", label: "Tailor", sprite: "shop_tailor", portraits: ["d_tailor", "d_father"], names: ["Fine Thread", "Needle House", "Silk & Seam"], bias: { pride: 1 }, hardship: ["a wedding order was cancelled and never paid", "the shop lost its best client to a department store"] },
  { id: "noodle", label: "Noodle bar", sprite: "shop_noodle", portraits: ["d_chef", "d_fish"], names: ["Nine Bowls", "Red Steam", "Midnight Noodle"], bias: { pride: 1 }, hardship: ["a health inspector closed the kitchen for a week", "the landlord raised the rent"] },
  { id: "pawn", label: "Pawn shop", sprite: "shop_pawn", portraits: ["d_pawn", "d_jeweler"], names: ["Second Chance", "Gold Balls Loans", "Last Resort"], bias: { greed: 2 }, hardship: ["a batch of pawned watches turned out to be fakes"] },
  { id: "florist", label: "Florist", sprite: "shop_florist", portraits: ["d_florist", "d_tailor"], names: ["Petal & Stem", "Moon Orchid", "Rosa's Garden"], bias: { heart: 2 }, hardship: ["a frost killed the greenhouse stock", "the funeral parlour stopped ordering"] },
  { id: "books", label: "Bookshop", sprite: "shop_books", portraits: ["d_books", "d_clock"], names: ["Dog-Ear Books", "Quiet Pages", "The Last Chapter"], bias: { logic: 1, fear: 1 }, hardship: ["a leak ruined half the stock"] },
  { id: "apothecary", label: "Apothecary", sprite: "shop_apothecary", portraits: ["d_apothecary", "d_florist"], names: ["Jade Root", "Hundred Drawers", "Willow Remedies"], bias: { logic: 2 }, hardship: ["a shipment of ginseng was seized at the docks"] },
  { id: "jeweler", label: "Jeweler", sprite: "shop_jeweler", portraits: ["d_jeweler", "d_pawn"], names: ["Aurum", "Gilded Hour", "Sable & Pearl"], bias: { greed: 2, pride: 1 }, hardship: ["a necklace was stolen from the display"] },
  { id: "teahouse", label: "Tea house", sprite: "shop_teahouse", portraits: ["d_teahouse", "d_apothecary"], names: ["Crane Pavilion", "Jade Kettle", "Autumn Leaf"], bias: { pride: 2 }, hardship: ["the upper floor has had no guests since the flood"] },
  { id: "records", label: "Record store", sprite: "shop_records", portraits: ["d_records", "d_books"], names: ["Spin City", "Groove Vault", "B-Side"], bias: { fear: 1, heart: 1 }, hardship: ["the band this shop managed broke up"] },
  { id: "barber", label: "Barber", sprite: "shop_barber", portraits: ["d_barber", "d_father"], names: ["Sharp & Co.", "The Brass Chair", "Clean Cut"], bias: { pride: 1, logic: 1 }, hardship: ["arthritis now slows the barber down"] },
  { id: "fish", label: "Fishmonger", sprite: "shop_fish", portraits: ["d_fish", "d_chef"], names: ["Silver Catch", "Tide Market", "Salt & Scale"], bias: { pride: 1, greed: 1 }, hardship: ["the trawler sank in the autumn storm"] },
  { id: "clock", label: "Clockmaker", sprite: "shop_clock", portraits: ["d_clock", "d_barber"], names: ["Tick & Tock", "Hour Hand", "Brass Escapement"], bias: { fear: 2, logic: 1 }, hardship: ["nobody repairs clocks any more"] },
  { id: "cabaret", label: "Cabaret", sprite: "shop_cabaret", portraits: ["d_cabaret", "d_teahouse"], names: ["The Velvet Lamp", "Chez Minuit", "Red Curtain"], bias: { pride: 2, greed: 1 }, late: true, hardship: ["the star singer left for a rival club"] },
  { id: "garage", label: "Garage", sprite: "shop_garage", portraits: ["d_mechanic", "d_records"], names: ["Grease Monkey", "Iron Horse", "Spark & Bolt"], bias: { pride: 1, fear: 1 }, hardship: ["a customer drove off without paying for a new engine"] },
];

export type Voice = "oldman" | "youngman" | "woman" | "oldwoman" | "banker";

export const PORTRAITS: Record<string, { voice: Voice; names: string[]; bias: Partial<Record<Trait, number>> }> = {
  d_baker: { voice: "oldman", names: ["Otto Brandt", "Gus Mehlman", "Bram Olen"], bias: { heart: 1 } },
  d_tailor: { voice: "woman", names: ["Iris Cheng", "Mina Sato", "Clara Voss"], bias: { logic: 1, pride: 1 } },
  d_chef: { voice: "oldman", names: ["Big Tomas", "Wu Gang", "Harlan Rook"], bias: { pride: 1 } },
  d_pawn: { voice: "youngman", names: ["Silas Crane", "Nico Vell", "Jasper Moult"], bias: { greed: 1 } },
  d_florist: { voice: "oldwoman", names: ["Rosa Lind", "Nana Mei", "Old Hettie"], bias: { heart: 1 } },
  d_books: { voice: "youngman", names: ["Elliot Page", "Tobin Marsh", "Kai Aldous"], bias: { fear: 1 } },
  d_apothecary: { voice: "oldwoman", names: ["Madam Lu", "Grandmother Yao", "Agnes Thorn"], bias: { logic: 1 } },
  d_jeweler: { voice: "oldman", names: ["Viktor Auren", "Lucien Gold", "Baron Pell"], bias: { pride: 1, greed: 1 } },
  d_teahouse: { voice: "woman", names: ["Madam Hua", "Lady Sen", "Marguerite Ko"], bias: { pride: 1 } },
  d_records: { voice: "youngman", names: ["Rex Voltage", "Danny Spin", "Milo Crash"], bias: { heart: 1 } },
  d_barber: { voice: "oldman", names: ["Signor Bassi", "Old Mortimer", "Enzo Ricci"], bias: { pride: 1 } },
  d_fish: { voice: "woman", names: ["Big Martha", "Salty Joan", "Wen Li"], bias: { pride: 1 } },
  d_clock: { voice: "oldman", names: ["Master Horace", "Felix Zeit", "Old Abel"], bias: { fear: 1, logic: 1 } },
  d_cabaret: { voice: "woman", names: ["Madame Noir", "Vivienne Lark", "Scarlet Dubois"], bias: { pride: 1, greed: 1 } },
  d_mechanic: { voice: "woman", names: ["Jo Ratchet", "Sam Kessler", "Dee Moreno"], bias: { pride: 1 } },
  d_father: { voice: "youngman", names: ["Arthur Penn", "Leo Hask", "Daniel Wray"], bias: { fear: 1, heart: 1 } },
};

export const SECRETS = [
  "gambles away the takings at the Velvet Row card tables",
  "sells stolen goods out of the back room",
  "waters down the stock and cheats the customers",
  "owes money to the Iron Syndicate as well",
  "forged the signature on the loan papers",
  "hides a second set of account books",
  "is secretly courting a married neighbour",
  "bribed the district inspector last spring",
];

export const STASH_SPOTS = ["flour tin", "hollow book", "false drawer", "clock case", "ice box", "boot heel", "velvet cushion", "tea caddy"];

export const BANKER_SECRETS = [
  "Madame Hale forged the final contract your mother signed",
  "the Lantern Bank vault is half empty, and Hale hides it",
  "Hale erased her own brother's debts and then his name",
];

export interface Perk {
  id: string;
  name: string;
  desc: string;
  cost: number;
}

export const PERKS: Perk[] = [
  { id: "silk", name: "Silk gloves", desc: "Charm is 30% stronger.", cost: 400 },
  { id: "stare", name: "Cold stare", desc: "Pressure causes 40% less anger.", cost: 450 },
  { id: "lipstick", name: "Red lipstick", desc: "You get 30 more composure each night.", cost: 400 },
  { id: "eye", name: "Accountant's eye", desc: "You see the cash in each shop.", cost: 350 },
  { id: "watch", name: "Pocket watch", desc: "Each night is 45 minutes longer.", cost: 500 },
  { id: "informant", name: "Informant", desc: "You start each night with 2 intel cards.", cost: 600 },
  { id: "card", name: "Lawyer's card", desc: "Reason is 30% stronger. Heat falls faster.", cost: 450 },
  { id: "velvet", name: "Velvet voice", desc: "Your own lines are 25% stronger.", cost: 500 },
];
