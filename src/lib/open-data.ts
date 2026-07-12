/**
 * Labour market intelligence derived from public Macau sources
 * (DSEC Employment Survey concepts, data.gov.mo categories).
 * Figures are illustrative benchmarks for the pilot UI — always show provenance.
 */

export const dataProvenance = {
  sources: [
    {
      name: "DSEC Employment Survey",
      nameZh: "統計暨普查局就業調查",
      url: "https://www.dsec.gov.mo/",
      note: "Unemployment, underemployment, labour force (ILO-aligned)",
    },
    {
      name: "data.gov.mo Open Data Platform",
      nameZh: "澳門特別行政區政府數據開放平台",
      url: "https://data.gov.mo/",
      note: "~1,375 datasets · Employment category · Training · Tourism & gaming",
    },
    {
      name: "DSAL Labour Affairs Bureau",
      nameZh: "勞工事務局",
      url: "https://www.dsal.gov.mo/",
      note: "Job matching stats, minor employment rules, training",
    },
  ],
  lastRefreshed: "2026-07",
};

/** Approximate series for dashboard (pilot demo) */
export const unemploymentTrend = [
  { period: "2024 Q1", general: 2.1, local: 2.7, youth: 6.9 },
  { period: "2024 Q2", general: 1.9, local: 2.5, youth: 6.8 },
  { period: "2024 Q3", general: 1.8, local: 2.4, youth: 6.7 },
  { period: "2024 Q4", general: 1.7, local: 2.3, youth: 6.7 },
  { period: "2025 Q1", general: 1.8, local: 2.4, youth: 6.8 },
  { period: "2025 Q2", general: 1.7, local: 2.3, youth: 6.7 },
  { period: "2025 Q3", general: 1.7, local: 2.3, youth: 6.9 },
  { period: "2025 Q4", general: 1.7, local: 2.3, youth: 6.8 },
  { period: "2026 Q1", general: 1.7, local: 2.2, youth: 6.8 },
];

export const employmentByIndustry = [
  { sector: "Gaming", sectorZh: "博彩", share: 22, jobs: 82000 },
  { sector: "Hotels & restaurants", sectorZh: "酒店及餐飲", share: 18, jobs: 67000 },
  { sector: "Retail", sectorZh: "零售", share: 12, jobs: 45000 },
  { sector: "Construction", sectorZh: "建築", share: 8, jobs: 30000 },
  { sector: "Transport & storage", sectorZh: "運輸及倉儲", share: 7, jobs: 26000 },
  { sector: "Finance", sectorZh: "金融", share: 6, jobs: 22000 },
  { sector: "Public admin & education", sectorZh: "公共行政及教育", share: 10, jobs: 37000 },
  { sector: "Health & social", sectorZh: "衛生及社會服務", share: 5, jobs: 18500 },
  { sector: "Other services", sectorZh: "其他服務", share: 12, jobs: 45000 },
];

export const medianEarnings = [
  { sector: "Gaming", sectorZh: "博彩", median: 22000 },
  { sector: "Hotels", sectorZh: "酒店", median: 15500 },
  { sector: "F&B", sectorZh: "餐飲", median: 12800 },
  { sector: "Retail", sectorZh: "零售", median: 12000 },
  { sector: "Finance", sectorZh: "金融", median: 25000 },
  { sector: "Tech / ICT", sectorZh: "科技／資訊", median: 21000 },
  { sector: "Big Health", sectorZh: "大健康", median: 18000 },
  { sector: "MICE / Events", sectorZh: "會展", median: 16000 },
];

/** Seasonal proxy: visitor-driven hiring pressure (index 100 = baseline) */
export const tourismSeasonIndex = [
  { month: "Jan", monthZh: "1月", index: 95, visitors: 2.8 },
  { month: "Feb", monthZh: "2月", index: 110, visitors: 3.4 },
  { month: "Mar", monthZh: "3月", index: 100, visitors: 3.0 },
  { month: "Apr", monthZh: "4月", index: 105, visitors: 3.2 },
  { month: "May", monthZh: "5月", index: 98, visitors: 2.9 },
  { month: "Jun", monthZh: "6月", index: 92, visitors: 2.6 },
  { month: "Jul", monthZh: "7月", index: 125, visitors: 3.9 },
  { month: "Aug", monthZh: "8月", index: 130, visitors: 4.1 },
  { month: "Sep", monthZh: "9月", index: 90, visitors: 2.5 },
  { month: "Oct", monthZh: "10月", index: 108, visitors: 3.3 },
  { month: "Nov", monthZh: "11月", index: 102, visitors: 3.1 },
  { month: "Dec", monthZh: "12月", index: 120, visitors: 3.7 },
];

export const trainingByDomain = [
  { domain: "Hospitality & tourism", domainZh: "酒店旅遊", courses: 42, trainees: 3200 },
  { domain: "Language", domainZh: "語言", courses: 38, trainees: 4100 },
  { domain: "Professional / technical", domainZh: "專業技術", courses: 55, trainees: 2800 },
  { domain: "IT & digital", domainZh: "資訊科技", courses: 28, trainees: 1900 },
  { domain: "Finance & business", domainZh: "金融商務", courses: 22, trainees: 1500 },
  { domain: "Health & wellness", domainZh: "健康養生", courses: 18, trainees: 980 },
];

export const onePlusFour = [
  {
    id: "tourism",
    name: "Integrated tourism & leisure",
    nameZh: "綜合旅遊休閒（「1」）",
    color: "#C8102E",
    youthPaths: ["Hotel operations", "F&B service", "Guest relations", "Tour guide"],
    youthPathsZh: ["酒店營運", "餐飲服務", "賓客關係", "導遊"],
  },
  {
    id: "health",
    name: "Big Health / TCM",
    nameZh: "大健康／中醫藥",
    color: "#006B3F",
    youthPaths: ["Clinic admin", "Wellness retail", "Health tourism support"],
    youthPathsZh: ["診所行政", "養生零售", "健康旅遊支援"],
  },
  {
    id: "finance",
    name: "Modern financial services",
    nameZh: "現代金融服務",
    color: "#0B1F3A",
    youthPaths: ["Banking ops", "Insurance support", "Fintech intern"],
    youthPathsZh: ["銀行營運", "保險支援", "金融科技實習"],
  },
  {
    id: "tech",
    name: "High technology",
    nameZh: "高新技術",
    color: "#0D9488",
    youthPaths: ["IT support", "Data entry", "Digital marketing"],
    youthPathsZh: ["資訊科技支援", "數據處理", "數碼營銷"],
  },
  {
    id: "mice",
    name: "MICE, culture & sports",
    nameZh: "會展、文化及體育",
    color: "#C4A35A",
    youthPaths: ["Event assistant", "Venue ops", "Cultural programme support"],
    youthPathsZh: ["活動助理", "場地營運", "文化項目支援"],
  },
];

export const keyFacts = {
  generalUnemployment: 1.7,
  localUnemployment: 2.2,
  youthUnemployment: 6.8,
  underemploymentLocal: 2.2,
  newEntrantsShare: 9.2,
  dsalMatchesH1: 5224,
  dsalYouthShare: 50,
  daysToJobUnder25: 50,
  openDatasets: 1375,
  employmentCategorySets: 45,
};

/** Sector key → median monthly for wage cards */
export const sectorWageMap: Record<string, { median: number; hourlyHint: number }> = {
  hospitality: { median: 15500, hourlyHint: 55 },
  retail: { median: 12000, hourlyHint: 48 },
  fnb: { median: 12800, hourlyHint: 50 },
  "big-health": { median: 18000, hourlyHint: 60 },
  finance: { median: 25000, hourlyHint: 80 },
  tech: { median: 21000, hourlyHint: 70 },
  mice: { median: 16000, hourlyHint: 58 },
  education: { median: 17000, hourlyHint: 65 },
  other: { median: 14000, hourlyHint: 52 },
};
