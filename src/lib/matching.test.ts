import { describe, expect, it } from "vitest";
import { matchJobsForYouth } from "./matching";
import type { JobPosting, YouthProfile } from "./types";

const youth: YouthProfile = {
  id: "test",
  name: "Local student",
  age: 17,
  isStudent: true,
  languages: ["Cantonese", "English"],
  skills: ["typescript", "teamwork"],
  preferredLanes: ["internship"],
  preferredSectors: ["tech"],
  availability: "Summer",
  district: "Taipa",
  bio: "Student developer",
  parentalConsent: true,
  createdAt: "2026-07-01T00:00:00Z",
};

function job(overrides: Partial<JobPosting>): JobPosting {
  return {
    id: "job",
    title: "Software Intern",
    titleZh: "軟件實習生",
    company: "Macau Tech",
    companyZh: "澳門科技",
    sector: "tech",
    lane: "internship",
    district: "Taipa",
    districtZh: "氹仔",
    payMin: 12000,
    payMax: 15000,
    payUnit: "monthly",
    hoursPerWeek: "40",
    languages: ["English"],
    description: "Build TypeScript applications",
    descriptionZh: "開發應用程式",
    requirements: ["TypeScript"],
    requirementsZh: ["TypeScript"],
    skills: ["typescript"],
    youthFriendly: true,
    minorAllowed: true,
    postedAt: "2026-07-01",
    openings: 1,
    trainingProvided: true,
    source: "dsal",
    ...overrides,
  };
}

describe("explainable matching", () => {
  it("ranks an eligible aligned internship above an age-blocked role", () => {
    const results = matchJobsForYouth(youth, [
      job({ id: "aligned" }),
      job({ id: "blocked", minorAllowed: false, sector: "other", skills: ["accounting"] }),
    ]);
    expect(results[0].job.id).toBe("aligned");
    expect(results[0].evidence?.algorithmVersion).toBe("rules-2026.07");
    expect(results.find((row) => row.job.id === "blocked")?.evidence?.constraints.length).toBeGreaterThan(0);
  });
});
