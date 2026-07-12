import type { Sector } from "./types";

/**
 * Employer workforce transparency for Macau youth job seekers.
 *
 * Priority:
 *  1) Official DSAL Table A3 firm-level rows (residents + non-resident workers)
 *     — injected via setOfficialWorkforceLookup() from /api/dsal/nrw
 *  2) Named registry estimates for common Jobscall brands
 *  3) Sector benchmarks when the firm is unknown
 *
 * Always surface confidence + provenance in the UI.
 */

export type WorkforceConfidence =
  | "reported"
  | "estimated"
  | "sector_benchmark";

export interface WorkforceMemberEntity {
  nameZh: string;
  namePt: string;
  residents: number;
  foreignTotal: number;
  totalEmployees: number;
}

export interface EmployerWorkforce {
  id: string;
  name: string;
  nameZh: string;
  aliases: string[];
  sector: Sector;
  /** Total employees at employer (Macau ops when known) */
  totalEmployees: number | null;
  /** Local / Macao resident employees 本地僱員 */
  localEmployees: number | null;
  /** Non-resident workers 外地僱員 (blue-card / imported labour) */
  foreignEmployees: number | null;
  localSharePct: number | null;
  foreignSharePct: number | null;
  asOf: string;
  confidence: WorkforceConfidence;
  source: string;
  sourceZh: string;
  note?: string;
  noteZh?: string;
  /** Hide pure industry aggregates from employer table if true */
  isAggregate?: boolean;
  /** Number of DSAL A3 legal entities rolled into this row */
  entityCount?: number;
  /** Human group label e.g. Sands China group */
  groupLabel?: string;
  groupLabelZh?: string;
  /** Top member entities by NRW (for expandable UI) */
  members?: WorkforceMemberEntity[];
}

/** Optional official DSAL A3 lookup (set from AppContext after batch match). */
let officialLookup:
  | ((companyName: string) => EmployerWorkforce | null)
  | null = null;

export function setOfficialWorkforceLookup(
  fn: ((companyName: string) => EmployerWorkforce | null) | null
) {
  officialLookup = fn;
}

export function getOfficialWorkforceLookup() {
  return officialLookup;
}

function shares(total: number, foreignPct: number) {
  const foreignEmployees = Math.round((total * foreignPct) / 100);
  const localEmployees = Math.max(0, total - foreignEmployees);
  const localSharePct = Math.round((localEmployees / total) * 1000) / 10;
  const foreignSharePct = Math.round((foreignEmployees / total) * 1000) / 10;
  return {
    totalEmployees: total,
    localEmployees,
    foreignEmployees,
    localSharePct,
    foreignSharePct,
  };
}

function est(
  partial: {
    id: string;
    name: string;
    nameZh: string;
    aliases: string[];
    sector: Sector;
    total: number;
    foreignPct: number;
    asOf?: string;
    note?: string;
    noteZh?: string;
  }
): EmployerWorkforce {
  const s = shares(partial.total, partial.foreignPct);
  return {
    id: partial.id,
    name: partial.name,
    nameZh: partial.nameZh,
    aliases: partial.aliases,
    sector: partial.sector,
    ...s,
    asOf: partial.asOf ?? "2025–2026 (est.)",
    confidence: "estimated",
    source:
      "Public headcount order of magnitude + industry NRW pattern (Jobscall-matched pilot)",
    sourceZh: "公開僱員量級 + 行業外地僱員結構（對齊 Jobscall 僱主之試點估算）",
    note: partial.note,
    noteZh: partial.noteZh,
  };
}

/** Territory-level labour composition (pilot benchmarks, DSEC/DSAL concepts). */
export const macauLabourComposition = {
  asOf: "2025–2026",
  employedResidents: 281_900,
  totalEmploymentInSurvey: 372_700,
  nonResidentWorkers: 183_000,
  gamingOperatorsForeignSharePct: 26.3,
  gamingOperatorsForeign: 27_140,
  gamingOperatorsLocal: 76_225,
  gamingOperatorsTotal: 103_365,
  /** Hotels & restaurants — largest NRW employer industry (DSAL order of magnitude) */
  hotelRestaurantNrw: 50_249,
  /** Construction — second-largest NRW industry historically */
  constructionNrw: 39_000,
  noteEn:
    "Macau’s labour market mixes resident workers and a large non-resident (imported labour) workforce. Firm-level splits are rarely public; gaming-operator totals use DSAL replies, industry NRW totals use DSAL monthly series, other firms use estimates aligned to Jobscall employers.",
  noteZh:
    "澳門勞動市場由本地居民僱員與大量外地僱員組成。企業級拆分甚少公開；六大博企合計來自勞工局回覆，行業外地僱員來自勞工局月報量級，其他企業為對齊 Jobscall 僱主的估算。",
};

/** Sector defaults when employer is not in the named registry. */
const SECTOR_BENCHMARKS: Record<
  Sector,
  {
    foreignSharePct: number;
    typicalTotal: number;
    note: string;
    noteZh: string;
  }
> = {
  hospitality: {
    foreignSharePct: 34,
    typicalTotal: 800,
    note: "Hotels & restaurants are Macau’s largest NRW employer industry (~50k blue cards).",
    noteZh: "酒店及餐飲是全澳外地僱員最多的行業（約五萬藍卡量級）。",
  },
  fnb: {
    foreignSharePct: 40,
    typicalTotal: 150,
    note: "F&B and QSR chains commonly hire non-resident workers for kitchen and floor roles.",
    noteZh: "餐飲及快餐連鎖在廚房與樓面崗位較常聘用外地僱員。",
  },
  retail: {
    foreignSharePct: 28,
    typicalTotal: 100,
    note: "Retail foreign-worker share varies widely by store format and brand.",
    noteZh: "零售外地僱員比例視門店形態與品牌而異。",
  },
  "big-health": {
    foreignSharePct: 18,
    typicalTotal: 150,
    note: "Health services mix licensed local professionals with some non-resident support staff.",
    noteZh: "醫療健康以本地持牌人員為主，輔以部分外地支援崗位。",
  },
  finance: {
    foreignSharePct: 12,
    typicalTotal: 400,
    note: "Banks and finance tend to have a higher resident share than hospitality.",
    noteZh: "銀行及金融的本地僱員佔比通常高於酒店餐飲。",
  },
  tech: {
    foreignSharePct: 22,
    typicalTotal: 80,
    note: "ICT mixes local graduates with regional specialist hires.",
    noteZh: "資訊科技結合本地畢業生與區域專才。",
  },
  mice: {
    foreignSharePct: 30,
    typicalTotal: 200,
    note: "Events and entertainment venues often mirror hospitality staffing patterns.",
    noteZh: "會展娛樂場館的人手結構常接近酒店業。",
  },
  education: {
    foreignSharePct: 25,
    typicalTotal: 500,
    note: "Higher education and private schools hire a mix of local and non-local faculty/staff.",
    noteZh: "高校及私立學校教職員含本地與非本地人員。",
  },
  other: {
    foreignSharePct: 35,
    typicalTotal: 120,
    note: "Construction, security and facilities often run high non-resident shares.",
    noteZh: "建築、保安及設施管理等行業外地僱員比例通常較高。",
  },
};

const GAMING_NRW = 26.3;
const SRC_GAMING =
  "DSAL six gaming operators NRW share (26.3%, Jun 2024) + public headcount estimate";
const SRC_GAMING_ZH = "勞工局六大博企外地僱員佔比（2024-06，26.3%）+ 公開僱員估算";

/**
 * Named employers: Jobscall urlIds + common DSAL / brand names.
 * `aliases` should include Jobscall `urlId` tokens where possible.
 */
export const employerWorkforceRegistry: EmployerWorkforce[] = [
  // ── Official / aggregate (reported) ─────────────────────────────
  {
    id: "six-gaming",
    name: "Six gaming operators (aggregate)",
    nameZh: "六大博企（合計）",
    aliases: ["gaming operator", "博企", "casino operator", "六大博企"],
    sector: "hospitality",
    totalEmployees: 103_365,
    localEmployees: 76_225,
    foreignEmployees: 27_140,
    localSharePct: 73.7,
    foreignSharePct: 26.3,
    asOf: "2024-06 (DSAL)",
    confidence: "reported",
    source:
      "DSAL — non-resident employees 26.3% of six concessionaires’ workforce",
    sourceZh: "勞工局：六大博彩承批公司外地僱員佔勞動力 26.3%",
    note: "Hard public figure for the concessionaires as a group.",
    noteZh: "六大博彩承批公司合計的公開硬數據。",
    isAggregate: true,
  },
  {
    id: "industry-hotel-fnb-nrw",
    name: "Hotels & restaurants (industry NRW)",
    nameZh: "酒店及餐飲業（行業外地僱員）",
    aliases: ["hotel restaurant nrw", "酒店餐飲外地"],
    sector: "hospitality",
    totalEmployees: null,
    localEmployees: null,
    foreignEmployees: 50_249,
    localSharePct: null,
    foreignSharePct: null,
    asOf: "2024-01 (DSAL industry series)",
    confidence: "reported",
    source: "DSAL non-resident workers by industry — hotels & restaurants",
    sourceZh: "勞工局按行業外地僱員統計 — 酒店及餐飲",
    note: "Largest blue-card employing industry; firm-level split not published here.",
    noteZh: "全澳藍卡最多的行業；此處為行業合計而非單一企業。",
    isAggregate: true,
  },
  {
    id: "industry-construction-nrw",
    name: "Construction (industry NRW)",
    nameZh: "建築業（行業外地僱員）",
    aliases: ["construction nrw", "建築外地"],
    sector: "other",
    totalEmployees: null,
    localEmployees: null,
    foreignEmployees: 39_000,
    localSharePct: null,
    foreignSharePct: null,
    asOf: "historical DSAL peak order (~2016–2024 series)",
    confidence: "reported",
    source: "DSAL non-resident workers by industry — construction (order of magnitude)",
    sourceZh: "勞工局按行業外地僱員 — 建築業（量級）",
    note: "Second-largest NRW industry historically; local preference policies ongoing.",
    noteZh: "歷來外地僱員第二大行業；政府正推動公共工程優先聘用本地。",
    isAggregate: true,
  },

  // ── Six gaming operators (Jobscall: sandschina, galaxy, sjmjob, wynn*, melco, mgm) ──
  {
    id: "sands-china",
    name: "Sands China / Venetian Macao",
    nameZh: "金沙中國／威尼斯人",
    aliases: [
      "sands",
      "sandschina",
      "sands-day",
      "金沙",
      "威尼斯人",
      "venetian",
      "parisian",
      "londoner",
      "金光飛航",
      "sands china",
    ],
    sector: "hospitality",
    ...shares(28_500, GAMING_NRW),
    asOf: "2024–2025 (est. · DSAL gaming NRW share)",
    confidence: "estimated",
    source: SRC_GAMING,
    sourceZh: SRC_GAMING_ZH,
  },
  {
    id: "galaxy",
    name: "Galaxy Entertainment Group",
    nameZh: "銀河娛樂集團",
    aliases: [
      "galaxy",
      "galaxy-mo",
      "galaxygroup",
      "銀娛",
      "銀河",
      "geg",
      "broadway macau",
      "galaxy entertainment",
    ],
    sector: "hospitality",
    ...shares(21_000, GAMING_NRW),
    asOf: "2024–2025 (est. · DSAL gaming NRW share)",
    confidence: "estimated",
    source: SRC_GAMING,
    sourceZh: SRC_GAMING_ZH,
  },
  {
    id: "sjm",
    name: "SJM Resorts",
    nameZh: "澳娛綜合",
    aliases: [
      "sjm",
      "sjmjob",
      "澳娛",
      "grande lisboa",
      "葡京",
      "lisboeta",
      "上葡京",
      "sjm resorts",
    ],
    sector: "hospitality",
    ...shares(16_500, GAMING_NRW),
    asOf: "2024–2025 (est. · DSAL gaming NRW share)",
    confidence: "estimated",
    source: SRC_GAMING,
    sourceZh: SRC_GAMING_ZH,
  },
  {
    id: "wynn",
    name: "Wynn Macau / Wynn Palace",
    nameZh: "永利澳門／永利皇宮",
    aliases: [
      "wynn",
      "wynnpalace",
      "wynnmacau",
      "wynn-day",
      "永利",
      "wynn palace",
      "wynn macau",
    ],
    sector: "hospitality",
    ...shares(12_500, GAMING_NRW),
    asOf: "2024–2025 (est. · DSAL gaming NRW share)",
    confidence: "estimated",
    source: SRC_GAMING,
    sourceZh: SRC_GAMING_ZH,
  },
  {
    id: "melco",
    name: "Melco Resorts",
    nameZh: "新濠博亞",
    aliases: [
      "melco",
      "melcoday",
      "新濠",
      "city of dreams",
      "新濠天地",
      "studio city",
      "新濠影匯",
      "altira",
      "melco resorts",
    ],
    sector: "hospitality",
    ...shares(14_000, GAMING_NRW),
    asOf: "2024–2025 (est. · DSAL gaming NRW share)",
    confidence: "estimated",
    source: SRC_GAMING,
    sourceZh: SRC_GAMING_ZH,
  },
  {
    id: "mgm",
    name: "MGM China",
    nameZh: "美高梅中國",
    aliases: ["mgm", "美高梅", "mgm cotai", "mgm macau", "mgm china"],
    sector: "hospitality",
    ...shares(10_800, GAMING_NRW),
    asOf: "2024–2025 (est. · DSAL gaming NRW share)",
    confidence: "estimated",
    source: SRC_GAMING,
    sourceZh: SRC_GAMING_ZH,
  },

  // ── Hotels on Jobscall ──────────────────────────────────────────
  est({
    id: "hotel-fortuna",
    name: "Hotel Fortuna",
    nameZh: "財神酒店",
    aliases: ["fortuna", "財神酒店", "hotel fortuna", "hotel-fortuna"],
    sector: "hospitality",
    total: 600,
    foreignPct: 35,
  }),
  est({
    id: "crowne-plaza",
    name: "Crowne Plaza Macau",
    nameZh: "澳門皇冠假日酒店",
    aliases: ["crowne plaza", "crowne-plaza", "皇冠假日"],
    sector: "hospitality",
    total: 700,
    foreignPct: 35,
  }),
  est({
    id: "st-regis",
    name: "The St. Regis Macao",
    nameZh: "澳門瑞吉酒店",
    aliases: ["st regis", "st-regis", "st-regis-macao", "瑞吉"],
    sector: "hospitality",
    total: 900,
    foreignPct: 36,
  }),
  est({
    id: "four-seasons",
    name: "Four Seasons Hotel Macao",
    nameZh: "澳門四季酒店",
    aliases: ["four seasons", "four-seasons", "四季酒店"],
    sector: "hospitality",
    total: 1_200,
    foreignPct: 36,
  }),
  est({
    id: "pousada-marina-infante",
    name: "Pousada Marina Infante",
    nameZh: "皇庭海景酒店",
    aliases: [
      "pousada marina infante",
      "pousada-marina-infante",
      "皇庭海景",
      "marina infante",
    ],
    sector: "hospitality",
    total: 450,
    foreignPct: 34,
  }),
  est({
    id: "city-viva",
    name: "CityViva Hotel",
    nameZh: "城悅酒店",
    aliases: ["cityviva", "city-viva", "城悅"],
    sector: "hospitality",
    total: 280,
    foreignPct: 33,
  }),
  est({
    id: "hotel-royal",
    name: "Hotel Royal Macau",
    nameZh: "澳門皇都酒店",
    aliases: ["hotel royal", "hotelroyalmacau", "皇都酒店"],
    sector: "hospitality",
    total: 400,
    foreignPct: 32,
  }),
  est({
    id: "roosevelt",
    name: "The Roosevelt Macau",
    nameZh: "澳門羅斯福酒店",
    aliases: ["roosevelt", "羅斯福"],
    sector: "hospitality",
    total: 350,
    foreignPct: 34,
  }),
  est({
    id: "global-hotels",
    name: "Global Hotels / Hotel Grand Dragon",
    nameZh: "環宇集團／金龍酒店",
    aliases: ["globalhotels", "global hotels", "金龍酒店", "環宇"],
    sector: "hospitality",
    total: 500,
    foreignPct: 34,
  }),
  est({
    id: "treasure-hotel",
    name: "Treasure Hotel",
    nameZh: "金寶來酒店",
    aliases: ["treasure", "金寶來"],
    sector: "hospitality",
    total: 220,
    foreignPct: 33,
  }),
  est({
    id: "cchotel",
    name: "Catholic Centre Hotel",
    nameZh: "公教中心酒店",
    aliases: ["cchotel", "公教中心酒店", "catholic centre"],
    sector: "hospitality",
    total: 180,
    foreignPct: 30,
  }),
  est({
    id: "regency-art",
    name: "Regency Art Hotel",
    nameZh: "麗景灣藝術酒店",
    aliases: ["regency-art-hotel", "regency art", "麗景灣"],
    sector: "hospitality",
    total: 320,
    foreignPct: 33,
  }),
  est({
    id: "the13",
    name: "THE 13 Palace",
    nameZh: "澳門十三皇宮",
    aliases: ["the13-hotel", "the 13", "十三皇宮"],
    sector: "hospitality",
    total: 400,
    foreignPct: 35,
  }),
  est({
    id: "phantom",
    name: "Grand Emperor Apartment Hotel",
    nameZh: "君樂皇府公寓式酒店",
    aliases: ["phantom", "君樂皇府"],
    sector: "hospitality",
    total: 200,
    foreignPct: 32,
  }),
  est({
    id: "lekhang",
    name: "Lek Hang Group",
    nameZh: "力行集團",
    aliases: ["lekhang-mo", "lek hang", "力行"],
    sector: "hospitality",
    total: 350,
    foreignPct: 34,
  }),
  est({
    id: "mfw",
    name: "Macau Fisherman's Wharf",
    nameZh: "澳門漁人碼頭",
    aliases: ["mfw", "fisherman", "漁人碼頭"],
    sector: "mice",
    total: 800,
    foreignPct: 32,
  }),
  est({
    id: "shun-tak",
    name: "Shun Tak Group",
    nameZh: "信德集團",
    aliases: ["shun-tak-holdings", "shun tak", "信德"],
    sector: "hospitality",
    total: 2_500,
    foreignPct: 28,
    note: "Ferry, tourism and property group — mixed resident / NRW ops staffing.",
    noteZh: "客運、旅遊及地產綜合集團，人手含本地與外地。",
  }),

  // ── F&B / QSR (Jobscall) ────────────────────────────────────────
  est({
    id: "mcdonalds-macau",
    name: "McDonald's Macau",
    nameZh: "澳門麥當勞",
    aliases: [
      "mcdonald",
      "mcdonalds",
      "麥當勞",
      "golden burger",
      "mccafe",
      "mccafé",
    ],
    sector: "fnb",
    total: 1_200,
    foreignPct: 40,
  }),
  est({
    id: "starbucks-macau",
    name: "Starbucks Macau",
    nameZh: "星巴克澳門",
    aliases: ["starbucks", "starbucks-macau", "星巴克"],
    sector: "fnb",
    total: 450,
    foreignPct: 38,
  }),
  est({
    id: "haidilao",
    name: "Haidilao Hot Pot Macau",
    nameZh: "海底撈火鍋澳門",
    aliases: ["haidilao", "海底撈"],
    sector: "fnb",
    total: 600,
    foreignPct: 45,
    note: "Cross-border F&B chains often staff heavily with non-resident kitchen/floor labour.",
    noteZh: "跨境餐飲連鎖廚房與樓面外地僱員比例通常較高。",
  }),
  est({
    id: "lord-stow",
    name: "Lord Stow's Bakery",
    nameZh: "安德魯餅店",
    aliases: ["lord-stow", "lord stow", "安德魯"],
    sector: "fnb",
    total: 180,
    foreignPct: 35,
  }),
  est({
    id: "goldenmix",
    name: "Golden Mix F&B",
    nameZh: "金撈餐飲",
    aliases: ["goldenmix", "金撈"],
    sector: "fnb",
    total: 120,
    foreignPct: 38,
  }),
  est({
    id: "wanchai",
    name: "Wanchai F&B Group",
    nameZh: "千笹飲食集團",
    aliases: ["wanchai", "千笹"],
    sector: "fnb",
    total: 200,
    foreignPct: 38,
  }),
  est({
    id: "tiangengge",
    name: "Tin Kang Kok Bakery",
    nameZh: "田耕閣餅家",
    aliases: ["tiangengge", "田耕閣"],
    sector: "fnb",
    total: 80,
    foreignPct: 30,
  }),
  est({
    id: "sushiyoshi",
    name: "Sushiyoshi",
    nameZh: "壽司芳",
    aliases: ["sushiyoshi", "壽司芳"],
    sector: "fnb",
    total: 60,
    foreignPct: 35,
  }),
  est({
    id: "aomi",
    name: "AOMI (delivery platform)",
    nameZh: "澳覓",
    aliases: ["aomi-app", "aomi", "澳覓"],
    sector: "fnb",
    total: 400,
    foreignPct: 42,
    note: "Platform + courier ecosystem often mixes local ops with non-resident delivery labour.",
    noteZh: "外賣平台生態常混合本地營運與外地配送人手。",
  }),
  est({
    id: "mfood",
    name: "mFood",
    nameZh: "mFood",
    aliases: ["mfood"],
    sector: "fnb",
    total: 150,
    foreignPct: 40,
  }),

  // ── Retail / luxury / duty-free ─────────────────────────────────
  est({
    id: "new-yaohan",
    name: "New Yaohan",
    nameZh: "新八佰伴",
    aliases: ["new-yaohan", "ptnewyaohan", "new yaohan", "新八佰伴", "八佰伴"],
    sector: "retail",
    total: 1_800,
    foreignPct: 30,
  }),
  est({
    id: "ikea-mo",
    name: "IKEA Macau",
    nameZh: "宜家家居澳門",
    aliases: ["ikea-mo", "ikea", "宜家"],
    sector: "retail",
    total: 350,
    foreignPct: 28,
  }),
  est({
    id: "uniqlo-mo",
    name: "UNIQLO Macau",
    nameZh: "優衣庫澳門",
    aliases: ["uniqlo-mo", "uniqlo", "優衣庫"],
    sector: "retail",
    total: 200,
    foreignPct: 25,
  }),
  est({
    id: "zara",
    name: "ZARA Macau",
    nameZh: "ZARA 澳門",
    aliases: ["zara"],
    sector: "retail",
    total: 180,
    foreignPct: 28,
  }),
  est({
    id: "dfs",
    name: "DFS Macau",
    nameZh: "DFS 澳門",
    aliases: ["dfs"],
    sector: "retail",
    total: 900,
    foreignPct: 32,
  }),
  est({
    id: "cdf",
    name: "China Duty Free (CDF)",
    nameZh: "中免集團澳門",
    aliases: ["cdf", "中免"],
    sector: "retail",
    total: 700,
    foreignPct: 30,
  }),
  est({
    id: "dairy-farm",
    name: "Dairy Farm / Wellcome Macau",
    nameZh: "牛奶公司／惠康澳門",
    aliases: ["dairy-farm", "dairy farm", "牛奶公司", "惠康"],
    sector: "retail",
    total: 600,
    foreignPct: 32,
  }),
  est({
    id: "lv",
    name: "Louis Vuitton Macau",
    nameZh: "路易威登澳門",
    aliases: ["lv", "louis vuitton", "路易威登"],
    sector: "retail",
    total: 120,
    foreignPct: 22,
  }),
  est({
    id: "gucci-mo",
    name: "GUCCI Macau",
    nameZh: "古馳澳門",
    aliases: ["gucci-mo", "gucci", "古馳"],
    sector: "retail",
    total: 100,
    foreignPct: 22,
  }),
  est({
    id: "dior",
    name: "Parfums Christian Dior Macau",
    nameZh: "迪奧香水澳門",
    aliases: ["dior", "christian dior"],
    sector: "retail",
    total: 80,
    foreignPct: 24,
  }),
  est({
    id: "balenciaga",
    name: "Balenciaga Macau",
    nameZh: "巴黎世家澳門",
    aliases: ["balenciaga"],
    sector: "retail",
    total: 50,
    foreignPct: 22,
  }),
  est({
    id: "armani",
    name: "Giorgio Armani Macau",
    nameZh: "阿瑪尼澳門",
    aliases: ["ga", "giorgio armani", "armani", "阿瑪尼"],
    sector: "retail",
    total: 60,
    foreignPct: 22,
  }),
  est({
    id: "otb",
    name: "OTB Group (Diesel, Margiela…)",
    nameZh: "OTB 集團澳門",
    aliases: ["otb", "diesel", "maison margiela", "marni", "jil sander"],
    sector: "retail",
    total: 90,
    foreignPct: 25,
  }),
  est({
    id: "lukfook",
    name: "Lukfook Jewellery",
    nameZh: "六福珠寶",
    aliases: ["lukfook-mo", "lukfook", "六福"],
    sector: "retail",
    total: 150,
    foreignPct: 20,
  }),
  est({
    id: "emperor-watch",
    name: "Emperor Watch & Jewellery",
    nameZh: "英皇鐘錶珠寶",
    aliases: ["emperor-watch", "英皇鐘錶"],
    sector: "retail",
    total: 120,
    foreignPct: 22,
  }),
  est({
    id: "cortina",
    name: "Cortina Watch Macau",
    nameZh: "高登鐘錶澳門",
    aliases: ["cortina", "高登鐘錶"],
    sector: "retail",
    total: 70,
    foreignPct: 20,
  }),
  est({
    id: "swatch",
    name: "Swatch Group Macau",
    nameZh: "斯沃琪集團澳門",
    aliases: ["swatch-group", "swatch"],
    sector: "retail",
    total: 100,
    foreignPct: 22,
  }),
  est({
    id: "dksh",
    name: "DKSH Macau",
    nameZh: "大昌華嘉澳門",
    aliases: ["dksh-mo", "dksh", "大昌華嘉"],
    sector: "retail",
    total: 200,
    foreignPct: 25,
  }),
  est({
    id: "four-star",
    name: "Four Star Company",
    nameZh: "科達有限公司",
    aliases: ["four-star", "four star", "科達"],
    sector: "retail",
    total: 250,
    foreignPct: 28,
  }),
  est({
    id: "forward-fashion",
    name: "Forward Fashion",
    nameZh: "尚晉國際",
    aliases: ["forward-fashion", "forward fashion", "尚晉"],
    sector: "retail",
    total: 300,
    foreignPct: 26,
  }),
  est({
    id: "valiram",
    name: "Valiram Group",
    nameZh: "Valiram 集團",
    aliases: ["valiram"],
    sector: "retail",
    total: 150,
    foreignPct: 28,
  }),
  est({
    id: "luxasia",
    name: "LUXASIA",
    nameZh: "LUXASIA",
    aliases: ["luxasia"],
    sector: "retail",
    total: 120,
    foreignPct: 26,
  }),
  est({
    id: "mcm",
    name: "MCM Macau",
    nameZh: "MCM 澳門",
    aliases: ["mcm-mo", "mcm"],
    sector: "retail",
    total: 40,
    foreignPct: 22,
  }),
  est({
    id: "descente",
    name: "DESCENTE Macau",
    nameZh: "迪桑特澳門",
    aliases: ["descente-mo", "descente"],
    sector: "retail",
    total: 35,
    foreignPct: 22,
  }),
  est({
    id: "aape",
    name: "AAPE Macau",
    nameZh: "AAPE 澳門",
    aliases: ["aape"],
    sector: "retail",
    total: 30,
    foreignPct: 24,
  }),
  est({
    id: "moschino",
    name: "Moschino Macau",
    nameZh: "Moschino 澳門",
    aliases: ["moschino"],
    sector: "retail",
    total: 25,
    foreignPct: 22,
  }),
  est({
    id: "byd",
    name: "BYD Macau",
    nameZh: "比亞迪澳門",
    aliases: ["byd", "比亞迪"],
    sector: "retail",
    total: 80,
    foreignPct: 18,
  }),
  est({
    id: "kam-lung",
    name: "Kam Lung Motor Group",
    nameZh: "錦龍汽車集團",
    aliases: ["klm-mo", "kam lung", "錦龍"],
    sector: "retail",
    total: 200,
    foreignPct: 20,
  }),

  // ── Banks / finance ─────────────────────────────────────────────
  est({
    id: "ocbc-macau",
    name: "OCBC Bank (Macau)",
    nameZh: "澳門華僑銀行",
    aliases: ["ocbc", "華僑銀行"],
    sector: "finance",
    total: 500,
    foreignPct: 12,
  }),
  est({
    id: "boc",
    name: "Bank of China Macau",
    nameZh: "中國銀行澳門",
    aliases: ["boc", "中銀", "bank of china", "中國銀行", "澳門中銀", "中銀澳門"],
    sector: "finance",
    total: 2_800,
    foreignPct: 10,
  }),
  est({
    id: "bcm",
    name: "BCM Bank",
    nameZh: "澳門商業銀行",
    aliases: ["bcm", "商業銀行", "bcm bank"],
    sector: "finance",
    total: 1_200,
    foreignPct: 11,
  }),
  est({
    id: "bnu",
    name: "Banco Nacional Ultramarino (BNU)",
    nameZh: "大西洋銀行",
    aliases: ["bnu", "大西洋銀行"],
    sector: "finance",
    total: 800,
    foreignPct: 12,
  }),
  est({
    id: "luso",
    name: "Luso International Banking",
    nameZh: "澳門國際銀行",
    aliases: ["luso", "國際銀行", "luso international"],
    sector: "finance",
    total: 600,
    foreignPct: 12,
  }),
  est({
    id: "bda",
    name: "Banco Delta Asia",
    nameZh: "滙業銀行",
    aliases: ["bda", "delta asia", "滙業"],
    sector: "finance",
    total: 450,
    foreignPct: 12,
  }),
  est({
    id: "hsbc-mo",
    name: "HSBC Macau",
    nameZh: "滙豐銀行澳門",
    aliases: ["hsbc-mo", "hsbc", "滙豐"],
    sector: "finance",
    total: 700,
    foreignPct: 14,
  }),
  est({
    id: "ccb",
    name: "China Construction Bank Macau",
    nameZh: "中國建設銀行澳門",
    aliases: ["ccb", "建設銀行", "china construction bank"],
    sector: "finance",
    total: 400,
    foreignPct: 11,
  }),
  est({
    id: "cgb",
    name: "China Guangfa Bank Macau",
    nameZh: "廣發銀行澳門",
    aliases: ["cgb", "廣發銀行"],
    sector: "finance",
    total: 250,
    foreignPct: 12,
  }),
  est({
    id: "well-link",
    name: "Well Link Bank",
    nameZh: "立橋銀行",
    aliases: ["wlbank-mo", "well link", "立橋"],
    sector: "finance",
    total: 300,
    foreignPct: 13,
  }),
  est({
    id: "ant-bank",
    name: "Ant Bank Macau",
    nameZh: "螞蟻銀行澳門",
    aliases: ["ant-bank", "ant bank", "螞蟻銀行"],
    sector: "finance",
    total: 200,
    foreignPct: 18,
  }),
  est({
    id: "sino-pac",
    name: "Bank SinoPac Macau",
    nameZh: "永豐銀行澳門",
    aliases: ["sino-pac", "sinopac", "永豐銀行"],
    sector: "finance",
    total: 180,
    foreignPct: 14,
  }),
  est({
    id: "mcb",
    name: "Macau Chinese Bank",
    nameZh: "澳門華人銀行",
    aliases: ["mcb", "華人銀行"],
    sector: "finance",
    total: 220,
    foreignPct: 12,
  }),
  est({
    id: "fidelidade",
    name: "Fidelidade Macau",
    nameZh: "忠誠保險澳門",
    aliases: ["fidelidade", "忠誠保險"],
    sector: "finance",
    total: 150,
    foreignPct: 15,
  }),
  est({
    id: "mic",
    name: "Macau Insurance / MPFM",
    nameZh: "澳門保險／澳門退休基金",
    aliases: ["mic-mo", "macau insurance", "澳門保險"],
    sector: "finance",
    total: 200,
    foreignPct: 14,
  }),

  // ── Telecom / transport / security ──────────────────────────────
  est({
    id: "ctm",
    name: "CTM (Companhia de Telecomunicações de Macau)",
    nameZh: "澳門電訊",
    aliases: ["ctm", "澳門電訊"],
    sector: "tech",
    total: 1_500,
    foreignPct: 15,
  }),
  est({
    id: "china-telecom",
    name: "China Telecom Macau",
    nameZh: "中國電信澳門",
    aliases: ["ct", "china telecom", "中國電信"],
    sector: "tech",
    total: 400,
    foreignPct: 16,
  }),
  est({
    id: "hutchison",
    name: "Hutchison Telephone Macau",
    nameZh: "和記電話澳門",
    aliases: ["hutchison", "和記電話", "3 macau"],
    sector: "tech",
    total: 350,
    foreignPct: 16,
  }),
  est({
    id: "menzies",
    name: "Menzies Macau Airport Services",
    nameZh: "Menzies 澳門機場服務",
    aliases: ["menzies"],
    sector: "other",
    total: 800,
    foreignPct: 45,
    note: "Airport ground handling often relies heavily on non-resident labour.",
    noteZh: "機場地勤外地僱員比例通常較高。",
  }),
  est({
    id: "starlux",
    name: "STARLUX Airlines Macau",
    nameZh: "星宇航空澳門",
    aliases: ["starlux-airlines", "starlux", "星宇航空"],
    sector: "other",
    total: 80,
    foreignPct: 30,
  }),
  est({
    id: "guardforce",
    name: "Guardforce Macau",
    nameZh: "衛安澳門",
    aliases: ["guardforce-mo", "guardforce-day", "guardforce", "衛安", "衛晉"],
    sector: "other",
    total: 1_200,
    foreignPct: 48,
    note: "Security services are among the highest NRW-share private sectors.",
    noteZh: "保安服務屬私營界別中外地僱員比例最高的行業之一。",
  }),
  est({
    id: "g4s",
    name: "G4S Secure Solutions Macau",
    nameZh: "G4S 澳門",
    aliases: ["g4s-mo", "g4s"],
    sector: "other",
    total: 900,
    foreignPct: 48,
  }),
  est({
    id: "securitas",
    name: "Securitas Macau",
    nameZh: "Securitas 保安服務澳門",
    aliases: ["securitas", "securitas-admin"],
    sector: "other",
    total: 700,
    foreignPct: 47,
  }),
  est({
    id: "omnirisc",
    name: "Omnirisc Security",
    nameZh: "安利保安",
    aliases: ["omnirisc", "安利保安"],
    sector: "other",
    total: 400,
    foreignPct: 46,
  }),

  // ── Construction / facilities ───────────────────────────────────
  est({
    id: "ccecc",
    name: "China Civil Engineering (Macau)",
    nameZh: "中國土木工程（澳門）",
    aliases: ["ccecc", "中國土木工程", "中土"],
    sector: "other",
    total: 2_000,
    foreignPct: 55,
    note: "Construction is Macau’s second-largest blue-card industry after hotels & restaurants.",
    noteZh: "建築業是酒店餐飲之後全澳藍卡第二大行業。",
  }),
  est({
    id: "genyield",
    name: "Genyield Construction",
    nameZh: "振耀建築",
    aliases: ["genyield", "振耀"],
    sector: "other",
    total: 400,
    foreignPct: 52,
  }),
  est({
    id: "cesl",
    name: "CESL Asia",
    nameZh: "盛世集團",
    aliases: ["cesl", "盛世"],
    sector: "other",
    total: 800,
    foreignPct: 50,
  }),
  est({
    id: "jangho",
    name: "Jangho Curtain Wall Macau",
    nameZh: "江河幕墻澳門",
    aliases: ["jangho", "江河幕墻"],
    sector: "other",
    total: 300,
    foreignPct: 52,
  }),
  est({
    id: "ies",
    name: "IES Engineering Macau",
    nameZh: "恒豐工程澳門",
    aliases: ["ies", "恒豐工程"],
    sector: "other",
    total: 250,
    foreignPct: 48,
  }),
  est({
    id: "jsl",
    name: "Jardine Schindler Elevator Macau",
    nameZh: "怡和迅達升降機澳門",
    aliases: ["jsl", "schindler", "迅達"],
    sector: "other",
    total: 200,
    foreignPct: 40,
  }),
  est({
    id: "sunrise",
    name: "Sunrise Facility Management",
    nameZh: "旭日物業設施管理",
    aliases: ["sunrise", "sunrise-admin", "旭日"],
    sector: "other",
    total: 500,
    foreignPct: 42,
  }),
  est({
    id: "big-four-fm",
    name: "Big Four Facility Management",
    nameZh: "四大設施管理",
    aliases: ["big-four", "四大設施"],
    sector: "other",
    total: 350,
    foreignPct: 42,
  }),

  // ── IT / education / NGO / gaming-adjacent ──────────────────────
  est({
    id: "mega",
    name: "MEGA Computer Technology",
    nameZh: "萬訊電腦科技",
    aliases: ["mega", "萬訊"],
    sector: "tech",
    total: 120,
    foreignPct: 20,
  }),
  est({
    id: "gallant",
    name: "Gallant Computer",
    nameZh: "Gallant 電腦",
    aliases: ["gallant-mo", "gallant"],
    sector: "tech",
    total: 80,
    foreignPct: 20,
  }),
  est({
    id: "vastcom",
    name: "Vastcom Technology",
    nameZh: "Vastcom 科技",
    aliases: ["vastcom"],
    sector: "tech",
    total: 60,
    foreignPct: 22,
  }),
  est({
    id: "etask",
    name: "E-task Information Technology",
    nameZh: "意達資訊科技",
    aliases: ["etask", "意達"],
    sector: "tech",
    total: 70,
    foreignPct: 22,
  }),
  est({
    id: "neoson",
    name: "Neoson Information Technology",
    nameZh: "上澳創新資訊科技",
    aliases: ["neoson", "上澳創新"],
    sector: "tech",
    total: 50,
    foreignPct: 22,
  }),
  est({
    id: "must",
    name: "Macau University of Science and Technology",
    nameZh: "澳門科技大學",
    aliases: ["must", "澳門科技大學", "科技大学"],
    sector: "education",
    total: 2_000,
    foreignPct: 30,
  }),
  est({
    id: "tis",
    name: "The International School of Macao",
    nameZh: "澳門國際學校",
    aliases: ["tis", "international school of macao", "澳門國際學校"],
    sector: "education",
    total: 250,
    foreignPct: 40,
    note: "International schools typically have a higher non-local teaching staff share.",
    noteZh: "國際學校外籍／非本地教學人員比例通常較高。",
  }),
  est({
    id: "mathconcept",
    name: "MathConcept Learning Center",
    nameZh: "數學思維教育中心",
    aliases: ["mathconcept", "數學思維"],
    sector: "education",
    total: 80,
    foreignPct: 18,
  }),
  est({
    id: "emperor-cinemas",
    name: "Emperor Cinemas",
    nameZh: "英皇戲院",
    aliases: ["emperor-cinemas", "emperor cinemas", "英皇戲院"],
    sector: "mice",
    total: 180,
    foreignPct: 33,
  }),
  est({
    id: "macau-slot",
    name: "Macau Slot / Macau Lottery",
    nameZh: "澳門彩票",
    aliases: ["mlpt", "macau slot", "澳門彩票"],
    sector: "mice",
    total: 300,
    foreignPct: 25,
  }),
  est({
    id: "eccl",
    name: "ECCL District",
    nameZh: "ECCL DISTRICT",
    aliases: ["eccl"],
    sector: "mice",
    total: 150,
    foreignPct: 30,
  }),
  est({
    id: "richmond-fellowship",
    name: "Richmond Fellowship of Macau",
    nameZh: "澳門利民會",
    aliases: ["arfm", "richmond fellowship", "利民會"],
    sector: "big-health",
    total: 200,
    foreignPct: 12,
  }),
  est({
    id: "skh",
    name: "Sheng Kung Hui Macau Social Services",
    nameZh: "聖公會澳門社會服務處",
    aliases: ["skh", "sheng kung hui", "聖公會"],
    sector: "big-health",
    total: 350,
    foreignPct: 12,
  }),
  est({
    id: "special-olympics",
    name: "Special Olympics Macau",
    nameZh: "澳門特奧",
    aliases: ["special-olympics-macau", "special olympics", "特奧"],
    sector: "big-health",
    total: 80,
    foreignPct: 10,
  }),
  est({
    id: "bokss",
    name: "Baptist Oi Kwan Social Service Macau",
    nameZh: "浸信會澳門愛羣社會服務處",
    aliases: ["bokss", "浸信會", "愛羣"],
    sector: "big-health",
    total: 250,
    foreignPct: 12,
  }),
  est({
    id: "gehome",
    name: "Gaming Employees Home Service Centre",
    nameZh: "博彩業職工之家",
    aliases: ["gehome", "職工之家", "博彩業職工"],
    sector: "other",
    total: 100,
    foreignPct: 8,
  }),
  est({
    id: "crosstech",
    name: "Crosstech Medical Group",
    nameZh: "澳嘉醫療集團",
    aliases: ["crosstech", "澳嘉醫療"],
    sector: "big-health",
    total: 150,
    foreignPct: 18,
  }),
  est({
    id: "luxmed",
    name: "Luxmed Medical Group",
    nameZh: "逸苗醫療集團",
    aliases: ["luxmed", "逸苗"],
    sector: "big-health",
    total: 120,
    foreignPct: 20,
  }),
  est({
    id: "future-bright",
    name: "Future Bright Group",
    nameZh: "佳景集團",
    aliases: ["fb", "future bright", "佳景"],
    sector: "fnb",
    total: 2_000,
    foreignPct: 36,
    note: "Large F&B group operating many brands across Macau.",
    noteZh: "大型餐飲集團，品牌門店遍佈澳門。",
  }),
];

const MATCH_STOPWORDS = new Set([
  "and",
  "the",
  "of",
  "for",
  "ltd",
  "limited",
  "limitada",
  "co",
  "company",
  "group",
  "macau",
  "macao",
  "hotel",
  "hotels",
  "bank",
  "services",
  "service",
  "international",
  "holdings",
  "holding",
  "澳門",
  "酒店",
  "集團",
  "有限公司",
  "公司",
  "銀行",
  // Industry phrases — never firm identity alone
  "人力資源",
  "人力資源管理",
  "resources",
  "human",
  "management",
  "consulting",
  "services",
  "service",
]);

/** Generic industry phrases that must not drive registry matches alone */
const GENERIC_REGISTRY_RE =
  /人力資源管理|人力資源顧問|人力資源|物業管理|資訊科技|顧問|管理|服務|resources?|human|management|consulting|services?/gi;

function stripGenericBiz(s: string): string {
  return s.replace(GENERIC_REGISTRY_RE, " ").replace(/\s+/g, " ").trim();
}

function isMostlyGenericAlias(alias: string): boolean {
  const left = stripGenericBiz(alias);
  return left.length < 2;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/&amp;/g, " ")
    .replace(/[（）()]/g, " ")
    .replace(/澳門招聘|招聘日|招聘會|誠聘|社會招聘/g, " ")
    .replace(/[^\p{L}\p{N}\s\-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasCjk(s: string): boolean {
  return /[\u4e00-\u9fff]/.test(s);
}

function meaningfulTokens(alias: string): string[] {
  return alias
    .split(/[\s\-/]+/)
    .map((t) => t.trim())
    .filter((t) => {
      if (MATCH_STOPWORDS.has(t)) return false;
      if (isMostlyGenericAlias(t)) return false;
      // CJK brand tokens are informative at 2 chars (中銀、衛安)
      if (hasCjk(t)) return t.length >= 2;
      return t.length >= 4;
    });
}

/** Match a job’s company string to a named workforce profile. */
export function lookupEmployerWorkforce(
  companyName: string,
  sector?: Sector
): EmployerWorkforce | null {
  // 1) Official DSAL A3 firm-level list (when hydrated)
  if (officialLookup) {
    const official = officialLookup(companyName);
    if (official) return official;
  }

  const n = normalize(companyName || "");
  if (!n) return null;

  let best: EmployerWorkforce | null = null;
  let bestScore = 0;

  // Brand residue after stripping industry fluff (EHR, 金沙, …)
  const nBrand = stripGenericBiz(n);

  for (const emp of employerWorkforceRegistry) {
    if (emp.isAggregate) continue; // don't match industry aggregates to firm names
    const names = [emp.name, emp.nameZh, emp.id, ...emp.aliases].map(normalize);
    for (const alias of names) {
      if (!alias || alias.length < 2) continue;
      // Skip ultra-generic aliases that would match almost anything
      if (MATCH_STOPWORDS.has(alias)) continue;
      if (isMostlyGenericAlias(alias)) continue;

      const minAliasLen = hasCjk(alias) ? 2 : 3;
      let score = 0;
      if (n === alias) score = 1000 + alias.length;
      else if (alias.length >= minAliasLen && n.includes(alias))
        score = 500 + alias.length;
      else if (n.length >= 5 && alias.includes(n)) score = 200 + n.length;
      else {
        // Distinctive token overlap (Jobscall: "BRAND 中文…")
        const tokens = meaningfulTokens(alias);
        const hay = nBrand || n;
        const hits = tokens.filter((t) => hay.includes(t)).length;
        if (hits > 0) score = 80 + hits * 40 + Math.min(alias.length, 30);
      }
      if (score > bestScore) {
        bestScore = score;
        best = emp;
      }
    }
  }

  // Require a solid match — token-only noise should fall through to sector benchmark
  if (best && bestScore >= 120) return best;

  if (sector) {
    const b = SECTOR_BENCHMARKS[sector] || SECTOR_BENCHMARKS.other;
    const s = shares(b.typicalTotal, b.foreignSharePct);
    return {
      id: `sector-${sector}`,
      name: `${companyName} (sector benchmark)`,
      nameZh: `${companyName}（行業基準）`,
      aliases: [],
      sector,
      ...s,
      asOf: "sector benchmark",
      confidence: "sector_benchmark",
      source: "Sector staffing pattern for Macau youth transparency pilot",
      sourceZh: "澳門青年資訊透明試點之行業人手結構基準",
      note: b.note,
      noteZh: b.noteZh,
    };
  }

  return null;
}

/** Local-hire signal for UI badges. */
export function localHireSignal(w: EmployerWorkforce): {
  level: "strong" | "moderate" | "weak" | "unknown";
  labelEn: string;
  labelZh: string;
} {
  const f = w.foreignSharePct;
  if (f == null) {
    return {
      level: "unknown",
      labelEn: "Workforce mix unknown",
      labelZh: "人手結構未知",
    };
  }
  if (f <= 15) {
    return {
      level: "strong",
      labelEn: "Higher local (resident) share",
      labelZh: "本地僱員佔比較高",
    };
  }
  if (f <= 30) {
    return {
      level: "moderate",
      labelEn: "Mixed local / non-resident workforce",
      labelZh: "本地與外地僱員混合",
    };
  }
  return {
    level: "weak",
    labelEn: "Higher non-resident (foreign labour) share",
    labelZh: "外地僱員佔比較高",
  };
}

export function formatHeadcount(n: number | null, lang: "en" | "zh"): string {
  if (n == null) return "—";
  return n.toLocaleString(lang === "zh" ? "zh-MO" : "en-US");
}

export function confidenceLabel(
  c: WorkforceConfidence,
  lang: "en" | "zh"
): string {
  if (lang === "zh") {
    if (c === "reported") return "公開報告";
    if (c === "estimated") return "估算";
    return "行業基準";
  }
  if (c === "reported") return "Reported";
  if (c === "estimated") return "Estimated";
  return "Sector benchmark";
}

/** Named employers for dashboard (exclude pure industry aggregates). */
export function dashboardEmployerRows(): EmployerWorkforce[] {
  return employerWorkforceRegistry.filter((e) => !e.isAggregate);
}

/** Official reported aggregates for dashboard callouts. */
export function reportedAggregates(): EmployerWorkforce[] {
  return employerWorkforceRegistry.filter(
    (e) => e.isAggregate && e.confidence === "reported"
  );
}
