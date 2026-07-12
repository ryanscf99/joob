import type { JobPosting, MatchResult, YouthProfile } from "./types";
import { assessProfessionFit } from "./profession-fit";
import { isLanguageOrSoftSkill } from "./professional-credentials";

function normalize(s: string) {
  return s.toLowerCase().trim();
}

/**
 * Explainable score-based matching to reduce asymmetric information.
 * Returns jobs ranked with human-readable reasons (EN + ZH).
 * Profession / skill domain fit is applied so e.g. a Statistics PhD
 * does not rank highly for unrelated craft roles (Tea Master, etc.).
 */
export function matchJobsForYouth(
  youth: YouthProfile,
  jobs: JobPosting[]
): MatchResult[] {
  const skills = Array.isArray(youth.skills) ? youth.skills : [];
  const preferredSectors = Array.isArray(youth.preferredSectors)
    ? youth.preferredSectors
    : [];
  const preferredLanes = Array.isArray(youth.preferredLanes)
    ? youth.preferredLanes
    : [];
  const youthLanguages = Array.isArray(youth.languages) ? youth.languages : [];
  const skillSet = new Set(skills.map(normalize));
  const sectorSet = new Set(preferredSectors);
  const laneSet = new Set(preferredLanes);

  const results: MatchResult[] = (jobs || []).map((job) => {
    let score = 12; // lower base — require real fit signals
    const reasons: string[] = [];
    const reasonsZh: string[] = [];
    const jobSkillsList = Array.isArray(job.skills) ? job.skills : [];
    const jobLangs = Array.isArray(job.languages) ? job.languages : [];
    const jobReqs = Array.isArray(job.requirements) ? job.requirements : [];
    void jobReqs; // reserved for future requirement text scoring

    // Age / minor legality
    if (youth.age < 16 && job.lane !== "summer") {
      score -= 50;
      reasons.push("Below general working age (16) for this role type");
      reasonsZh.push("未滿一般就業年齡（16歲），此崗位類型受限");
    } else if (youth.age < 16 && job.lane === "summer") {
      if (job.minorAllowed) {
        score += 15;
        reasons.push("Summer job lane fits ages 14–15 with parental consent");
        reasonsZh.push("暑期工通道適合14–15歲（需家長同意）");
      }
    } else if (youth.age < 18 && job.minorAllowed) {
      score += 10;
      reasons.push("Employer allows minor workers with compliance checklist");
      reasonsZh.push("僱主接受未成年僱員（需合規清單）");
    }

    if (youth.age < 18 && !job.minorAllowed) {
      score -= 40;
      reasons.push("Role requires age 18+");
      reasonsZh.push("此職位要求年滿18歲");
    }

    // Parental consent for under-18
    if (youth.age < 18 && !youth.parentalConsent) {
      score -= 15;
      reasons.push("Complete parental consent in your profile to apply as a minor");
      reasonsZh.push("未成年求職請先在檔案完成家長同意");
    }

    // Lane preference
    if (laneSet.size === 0 || laneSet.has(job.lane)) {
      if (laneSet.has(job.lane)) {
        score += 20;
        reasons.push(`Matches your preferred lane: ${job.lane}`);
        reasonsZh.push(`符合你偏好的工作類型：${laneLabelZh(job.lane)}`);
      }
    } else {
      score -= 5;
    }

    // Profession / occupation + credentials first (before sector/language fluff)
    const prof = assessProfessionFit(youth, job, null);

    // Sector preference — weak, and disabled when licensed role is blocked
    if (sectorSet.has(job.sector) && !prof.credentialBlock) {
      const sectorBoost = prof.hardMismatch ? 4 : 12;
      score += sectorBoost;
      reasons.push(`Aligned with your sector interest (${job.sector})`);
      reasonsZh.push(`符合你感興趣的行業（${sectorLabelZh(job.sector)}）`);
    }

    // Skills overlap — exclude languages/soft skills (they are not professional skills)
    const jobSkills = jobSkillsList
      .map(normalize)
      .filter((s) => !isLanguageOrSoftSkill(s));
    const professionalSkillSet = new Set(
      [...skillSet].filter((s) => !isLanguageOrSoftSkill(s))
    );
    const overlap = jobSkills.filter((s) => professionalSkillSet.has(s));
    if (overlap.length > 0 && !prof.credentialBlock) {
      score += Math.min(28, overlap.length * 9);
      reasons.push(`Skills overlap: ${overlap.join(", ")}`);
      reasonsZh.push(`技能重疊：${overlap.join("、")}`);
    } else if (jobSkills.length >= 2 && !prof.credentialBlock) {
      score -= 8;
      reasons.push("No listed professional skill tags match your profile");
      reasonsZh.push("職位專業技能標籤與你的檔案無重疊");
    }

    score += prof.scoreDelta;
    if (prof.reasonsEn[0]) {
      reasons.push(prof.reasonsEn[0]);
      reasonsZh.push(prof.reasonsZh[0] || prof.reasonsEn[0]);
    }
    if (prof.hardMismatch || prof.credentialBlock) {
      // Cap hard mismatches / missing licences so they never outrank real fits
      score = Math.min(score, prof.credentialBlock ? 12 : 28);
    }

    // Languages — modest only; never compensate for missing medical licence
    const youthLangs = youthLanguages.map(normalize);
    const langHits = jobLangs.filter((l) =>
      youthLangs.some((yl) => normalize(l).includes(yl) || yl.includes(normalize(l)))
    );
    if (langHits.length > 0 && !prof.credentialBlock) {
      score += Math.min(8, langHits.length * 2);
      reasons.push(`Language fit: ${langHits.join(", ")}`);
      reasonsZh.push(`語言匹配：${langHits.join("、")}`);
    }

    // District soft match
    if (
      youth.district &&
      (normalize(job.district).includes(normalize(youth.district)) ||
        normalize(youth.district).includes(normalize(job.district)))
    ) {
      score += 8;
      reasons.push(`Nearby district: ${job.district}`);
      reasonsZh.push(`地區接近：${job.districtZh}`);
    }

    // Youth-friendly / training — smaller boosts (must not dominate profession fit)
    if (job.youthFriendly) {
      score += 5;
      reasons.push("Marked youth-friendly by employer");
      reasonsZh.push("僱主標示為青年友善職位");
    }

    if (job.trainingProvided) {
      score += 4;
      reasons.push("On-the-job training provided");
      reasonsZh.push("提供在職培訓");
    }

    // Student + part-time/summer (only if not hard profession mismatch)
    if (
      !prof.hardMismatch &&
      youth.isStudent &&
      (job.lane === "part-time" || job.lane === "summer")
    ) {
      score += 8;
      reasons.push("Schedule type suits student availability");
      reasonsZh.push("工時類型適合在學人士");
    }

    // Source signal — modest, never overrides profession
    if (job.source === "dsal") {
      score += 6;
      if (!prof.hardMismatch) {
        reasons.push("Official DSAL local vacancy register");
        reasonsZh.push("勞工事務局官方本地職位空缺");
      }
    }
    if (job.source === "jobscall") {
      score += 3;
    }

    score = Math.max(0, Math.min(100, score));

    if (reasons.length === 0) {
      reasons.push("General listing in the Macau youth market");
      reasonsZh.push("澳門青年就業市場一般職位");
    }

    return {
      job,
      score,
      reasons: reasons.slice(0, 5),
      reasonsZh: reasonsZh.slice(0, 5),
    };
  });

  return results.sort((a, b) => b.score - a.score);
}

function laneLabelZh(lane: string) {
  const m: Record<string, string> = {
    summer: "暑期工",
    "part-time": "兼職",
    internship: "實習",
    "full-time": "全職",
  };
  return m[lane] || lane;
}

function sectorLabelZh(sector: string) {
  const m: Record<string, string> = {
    hospitality: "酒店旅遊",
    retail: "零售",
    fnb: "餐飲",
    "big-health": "大健康",
    finance: "金融",
    tech: "科技",
    mice: "會展文化",
    education: "教育",
    other: "其他",
  };
  return m[sector] || sector;
}

export function formatPay(job: JobPosting, lang: "en" | "zh") {
  const unit =
    job.payUnit === "hourly"
      ? lang === "zh"
        ? "/時"
        : "/hr"
      : lang === "zh"
        ? "/月"
        : "/mo";
  return `MOP ${job.payMin}–${job.payMax}${unit}`;
}
