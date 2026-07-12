/**
 * Top 4 local universities in Macau SAR (by scale / research profile / common ranking lists).
 * Career portals used for faculty recruitment aggregation.
 */

export type UniId = "um" | "must" | "mpu" | "cityu";

export interface MacauUniversity {
  id: UniId;
  nameEn: string;
  nameZh: string;
  shortEn: string;
  shortZh: string;
  color: string;
  website: string;
  careersUrl: string;
  careersNoteEn: string;
  careersNoteZh: string;
}

export const MACAU_TOP4: MacauUniversity[] = [
  {
    id: "um",
    nameEn: "University of Macau",
    nameZh: "澳門大學",
    shortEn: "UM",
    shortZh: "澳大",
    color: "#8B0000",
    website: "https://www.um.edu.mo/",
    careersUrl: "https://career.admo.um.edu.mo/",
    careersNoteEn: "Career@UM — live academic staff listings",
    careersNoteZh: "澳大招聘網 — 可抓取教學／研究職位",
  },
  {
    id: "must",
    nameEn: "Macau University of Science and Technology",
    nameZh: "澳門科技大學",
    shortEn: "MUST",
    shortZh: "科大",
    color: "#0B3D91",
    website: "https://www.must.edu.mo/",
    careersUrl: "https://careers.must.edu.mo/?workClassification=TP&locale=en_US",
    careersNoteEn: "MUST e-recruitment API — live academic (TP) posts + JDs",
    careersNoteZh: "科大電子招聘 API — 教學／研究職位及職位說明",
  },
  {
    id: "mpu",
    nameEn: "Macao Polytechnic University",
    nameZh: "澳門理工大學",
    shortEn: "MPU",
    shortZh: "理工",
    color: "#006B3F",
    website: "https://www.mpu.edu.mo/",
    careersUrl: "https://www.mpu.edu.mo/en/career.php",
    careersNoteEn: "MPU official career page",
    careersNoteZh: "理工大學官方招聘專頁",
  },
  {
    id: "cityu",
    nameEn: "City University of Macau",
    nameZh: "澳門城市大學",
    shortEn: "CityU",
    shortZh: "城大",
    color: "#C4A35A",
    website: "https://www.cityu.edu.mo/",
    careersUrl: "https://hro.cityu.edu.mo/en/category/job-application/teaching-en/",
    careersNoteEn: "CityU HRO — teaching posts (RSS)",
    careersNoteZh: "城大人事處 — 教學職位（RSS）",
  },
];

export function uniById(id: string): MacauUniversity | undefined {
  return MACAU_TOP4.find((u) => u.id === id);
}
