import type { JobPosting, MatchResult, YouthProfile } from "./types";
import type { CvFeatures } from "./cv-extract";
import {
  getAvailabilityFromFeatures,
  jaccard,
  tokenizeForMatch,
} from "./cv-extract";
import { matchJobsForYouth } from "./matching";
import { assessProfessionFit } from "./profession-fit";

/**
 * CV-aware smart matching: base scorer + profession domain fit +
 * text similarity + education/experience.
 * Hard profession mismatches (e.g. Statistics PhD vs Tea Master) stay low-ranked.
 */
export function matchJobsWithCv(
  youth: YouthProfile,
  jobs: JobPosting[],
  cv?: CvFeatures | null
): MatchResult[] {
  const base = matchJobsForYouth(youth, jobs);
  if (!cv || cv.textLength < 40) {
    return base.map((r) => {
      const prof = assessProfessionFit(youth, r.job, null);
      let score = r.score + Math.round(prof.scoreDelta * 0.35);
      if (prof.hardMismatch) score = Math.min(score, 30);
      score = Math.max(0, Math.min(100, score));
      return {
        ...r,
        score,
        reasons: [
          ...r.reasons,
          ...(prof.hardMismatch ? [prof.reasonsEn[0]] : []),
          "Profile-based match (no CV text boost)",
        ]
          .filter(Boolean)
          .slice(0, 5),
        reasonsZh: [
          ...r.reasonsZh,
          ...(prof.hardMismatch ? [prof.reasonsZh[0]] : []),
          "基於檔案配對（未使用履歷文本加權）",
        ]
          .filter(Boolean)
          .slice(0, 5),
      };
    });
  }

  const cvTokens = tokenizeForMatch(
    [
      cv.summary || "",
      cv.researchInterests || "",
      (cv.skills || []).join(" "),
      (cv.keywords || []).join(" "),
      (cv.educationHints || []).join(" "),
      youth.bio || "",
    ].join(" ")
  );
  for (const s of cv.skills || []) cvTokens.add(String(s).toLowerCase());
  for (const s of youth.skills || []) cvTokens.add(String(s).toLowerCase());

  const scored = base.map((r) => {
    const job = r.job;
    const jobBlob = [
      job.title,
      job.titleZh,
      job.description,
      job.descriptionZh,
      (job.requirements || []).join(" "),
      (job.requirementsZh || []).join(" "),
      (job.skills || []).join(" "),
      job.companyType || "",
    ].join(" ");
    const jobTokens = tokenizeForMatch(jobBlob);
    for (const s of job.skills || []) jobTokens.add(String(s).toLowerCase());

    const overlap = jaccard(cvTokens, jobTokens);
    let score = r.score;
    const reasons = [...r.reasons];
    const reasonsZh = [...r.reasonsZh];

    // Profession fit with full CV (stronger than profile-only pass)
    const prof = assessProfessionFit(youth, job, cv);
    score += prof.scoreDelta;
    for (let i = 0; i < Math.min(2, prof.reasonsEn.length); i++) {
      if (!reasons.includes(prof.reasonsEn[i])) {
        reasons.push(prof.reasonsEn[i]);
        reasonsZh.push(prof.reasonsZh[i] || prof.reasonsEn[i]);
      }
    }
    if (prof.hardMismatch || prof.credentialBlock) {
      // Missing regulated licence or profession clash — keep score floor low
      score = Math.min(score, prof.credentialBlock ? 16 : 26);
    }

    // Text similarity must NOT rescue licensed roles without credentials,
    // or craft roles for mismatched professions
    const blocked = prof.hardMismatch || prof.credentialBlock;
    const textBoost = blocked ? 0 : Math.round(overlap * 22);
    if (textBoost >= 3) {
      score += textBoost;
      reasons.push(
        `CV↔job text similarity ${(overlap * 100).toFixed(0)}% (+${textBoost})`
      );
      reasonsZh.push(
        `履歷與職位文本相似度 ${(overlap * 100).toFixed(0)}%（+${textBoost}）`
      );
    } else if (blocked && overlap < 0.12) {
      score -= 8;
      reasons.push(
        prof.credentialBlock
          ? "Keyword similarity cannot replace required professional licence"
          : "CV content barely relates to this job’s profession"
      );
      reasonsZh.push(
        prof.credentialBlock
          ? "文本相似度不能替代所需專業執業資格"
          : "履歷內容與此職專業相關度極低"
      );
    }

    const shared: string[] = [];
    for (const k of cv.keywords.slice(0, 25)) {
      if (
        jobTokens.has(k.toLowerCase()) ||
        jobBlob.toLowerCase().includes(k.toLowerCase())
      ) {
        shared.push(k);
      }
    }
    // Keyword hits on "therapy"/"clinic" without licence still don't boost
    if (shared.length >= 2 && !blocked) {
      score += Math.min(12, shared.length * 2);
      reasons.push(`CV keywords in job: ${shared.slice(0, 5).join(", ")}`);
      reasonsZh.push(`履歷關鍵詞命中：${shared.slice(0, 5).join("、")}`);
    }

    // Education
    if (cv.educationLevel) {
      const req = `${job.requirements.join(" ")} ${job.requirementsZh.join(" ")} ${job.description}`;
      const needsHigherEd =
        /高等教育|大學|bachelor|degree|university|學士|碩士|博士|ph\.?\s*d|master/i.test(
          req
        );
      const needsSecondary = /高中|中學|secondary|小學|primary/i.test(req);
      const high =
        cv.educationLevel === "phd" ||
        cv.educationLevel === "master" ||
        cv.educationLevel === "bachelor";
      if (needsHigherEd && high && !prof.hardMismatch) {
        score += cv.educationLevel === "phd" ? 14 : 10;
        reasons.push(
          `Education (${cv.educationLevel}) matches role education bar`
        );
        reasonsZh.push(`學歷（${cv.educationLevel}）符合職位要求`);
      } else if (needsSecondary && cv.educationLevel) {
        score += 4;
      } else if (needsHigherEd && cv.educationLevel === "secondary") {
        score -= 8;
        reasons.push("Role may prefer higher education than CV indicates");
        reasonsZh.push("職位或要求較高學歷");
      }
      // Academic / research / quant roles boost for PhD/stats
      if (
        (cv.educationLevel === "phd" || cv.educationLevel === "master") &&
        /professor|lecturer|research|faculty|數據科學|統計|statistic|assistant\s*professor|data\s*science|quant|分析師|analyst/i.test(
          jobBlob
        )
      ) {
        score += 16;
        reasons.push(
          "Advanced degree aligns with academic / research / analytical role"
        );
        reasonsZh.push("高學歷與學術／研究／分析取向崗位高度相關");
      }
    }

    // Experience
    if (cv.experienceYears != null) {
      const req = `${job.requirements.join(" ")} ${job.description}`;
      const needExp = req.match(/(\d+)\s*年/);
      const needExpEn = req.match(/(\d+)\s*\+?\s*years?/i);
      const required = Number(needExp?.[1] || needExpEn?.[1] || 0);
      if (required > 0) {
        if (cv.experienceYears >= required) {
          score += 10;
          reasons.push(
            `Experience ~${cv.experienceYears}y meets ~${required}y requirement`
          );
          reasonsZh.push(
            `工作年資約 ${cv.experienceYears} 年符合約 ${required} 年要求`
          );
        } else if (cv.experienceYears + 1 >= required) {
          score += 2;
        } else {
          score -= 12;
          reasons.push(
            `Experience ~${cv.experienceYears}y below ~${required}y requirement`
          );
          reasonsZh.push(
            `年資約 ${cv.experienceYears} 年低於約 ${required} 年要求`
          );
        }
      }
    }

    // Career stage vs youth summer jobs
    if (
      (cv.careerStage === "professional" || cv.careerStage === "postgrad") &&
      (job.lane === "summer" || job.lane === "part-time") &&
      job.minorAllowed
    ) {
      score -= 18;
      reasons.push(
        "Senior/academic CV less aligned with teen summer/part-time role"
      );
      reasonsZh.push("高學歷／專業履歷與暑期／青少年兼職相關性較低");
    }

    if (
      cv.isStudent &&
      (job.lane === "part-time" ||
        job.lane === "internship" ||
        job.lane === "summer") &&
      cv.careerStage === "undergrad" &&
      !prof.hardMismatch
    ) {
      score += 4;
    }

    score = Math.max(0, Math.min(100, score));
    return {
      job,
      score,
      reasons: reasons.slice(0, 5),
      reasonsZh: reasonsZh.slice(0, 5),
    };
  });

  return scored.sort((a, b) => b.score - a.score);
}

/** Merge CV features into a YouthProfile (preserves id/consent when present). */
export function profileFromCv(
  features: CvFeatures,
  existing?: YouthProfile | null
): YouthProfile {
  // Age: prefer CV estimate over stale wrong defaults (e.g. leftover 17)
  const staleYouthDefault =
    existing?.age === 17 &&
    (features.educationLevel === "phd" ||
      features.educationLevel === "master" ||
      features.careerStage === "professional" ||
      features.careerStage === "postgrad");

  let age =
    features.estimatedAge ??
    (existing?.age && existing.age >= 14 && !staleYouthDefault
      ? existing.age
      : null);
  if (age == null) {
    if (features.educationLevel === "phd") age = 28;
    else if (features.educationLevel === "master") age = 25;
    else if (features.educationLevel === "bachelor") age = 22;
    else if (features.careerStage === "secondary_student") age = 17;
    else age = 24;
  }

  const name =
    features.name &&
    !/research interest|education|experience|skills/i.test(features.name)
      ? features.name
      : existing?.name &&
          !/research interest|education|experience|skills/i.test(existing.name)
        ? existing.name
        : features.name || "CV Applicant";

  return {
    id: existing?.id || `youth-${Date.now()}`,
    name,
    age,
    isStudent: features.isStudent,
    languages:
      features.languages.length > 0
        ? features.languages
        : existing?.languages?.length
          ? existing.languages
          : ["English"],
    skills:
      features.skills.length > 0
        ? features.skills
        : existing?.skills || ["research"],
    preferredLanes:
      features.preferredLanes.length > 0
        ? features.preferredLanes
        : ["full-time"],
    preferredSectors:
      features.preferredSectors.length > 0
        ? features.preferredSectors
        : existing?.preferredSectors || ["tech"],
    availability: getAvailabilityFromFeatures(features),
    district:
      features.districts[0] || existing?.district || "Macau Peninsula",
    bio: features.summary || existing?.bio || "",
    parentalConsent:
      age < 18 ? (existing?.parentalConsent ?? false) : false,
    createdAt: existing?.createdAt || new Date().toISOString(),
    cv: {
      fileName: existing?.cv?.fileName || "uploaded-cv",
      uploadedAt: new Date().toISOString(),
      textLength: features.textLength,
      features: {
        name: features.name,
        emails: features.emails,
        phones: features.phones,
        languages: features.languages,
        skills: features.skills,
        keywords: features.keywords,
        preferredSectors: features.preferredSectors,
        preferredLanes: features.preferredLanes,
        educationLevel: features.educationLevel,
        educationHints: features.educationHints,
        isStudent: features.isStudent,
        experienceYears: features.experienceYears,
        districts: features.districts,
        summary: features.summary,
        textLength: features.textLength,
      },
    },
  };
}
