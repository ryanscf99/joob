export type Lang = "en" | "zh";

export type JobLane = "summer" | "part-time" | "internship" | "full-time";

export type Sector =
  | "hospitality"
  | "retail"
  | "fnb"
  | "big-health"
  | "finance"
  | "tech"
  | "mice"
  | "education"
  | "other";

export type JobSource = "seed" | "platform" | "dsal" | "jobscall" | "hellojobs";

export interface JobPosting {
  id: string;
  title: string;
  titleZh: string;
  company: string;
  companyZh: string;
  sector: Sector;
  lane: JobLane;
  district: string;
  districtZh: string;
  payMin: number;
  payMax: number;
  payUnit: "hourly" | "monthly";
  hoursPerWeek: string;
  languages: string[];
  description: string;
  descriptionZh: string;
  requirements: string[];
  requirementsZh: string[];
  skills: string[];
  youthFriendly: boolean;
  minorAllowed: boolean;
  postedAt: string;
  openings: number;
  trainingProvided: boolean;
  /** Where the listing came from */
  source?: JobSource;
  /** DSAL vacancy number e.g. 2026051385(16) */
  officialNo?: string;
  companyType?: string;
  contact?: string;
  externalUrl?: string;
  salaryRaw?: string;
}

/** Stored CV extraction snapshot on the youth profile */
export interface YouthCvMeta {
  fileName: string;
  uploadedAt: string;
  textLength: number;
  features: {
    name?: string;
    emails: string[];
    phones: string[];
    languages: string[];
    skills: string[];
    keywords: string[];
    preferredSectors: Sector[];
    preferredLanes: JobLane[];
    educationLevel: string | null;
    educationHints: string[];
    isStudent: boolean;
    experienceYears: number | null;
    districts: string[];
    summary: string;
    textLength: number;
    careerStage?: string;
    estimatedAge?: number | null;
    researchInterests?: string;
  };
}

export interface YouthProfile {
  id: string;
  name: string;
  age: number;
  isStudent: boolean;
  languages: string[];
  skills: string[];
  preferredLanes: JobLane[];
  preferredSectors: Sector[];
  availability: string;
  district: string;
  bio: string;
  parentalConsent: boolean;
  createdAt: string;
  /** Present after CV upload + parse */
  cv?: YouthCvMeta;
}

export interface EmployerProfile {
  id: string;
  companyName: string;
  sector: Sector;
  contactName: string;
  email: string;
  size: string;
  verified: boolean;
  complianceReady: boolean;
  createdAt: string;
}

export interface Application {
  id: string;
  jobId: string;
  youthId: string;
  status:
    | "saved"
    | "preparing"
    | "applied"
    | "reviewing"
    | "interview"
    | "offered"
    | "rejected"
    | "withdrawn";
  appliedAt: string;
  note?: string;
  source?: JobSource;
  sourceUrl?: string;
  titleSnapshot?: string;
  companySnapshot?: string;
  followUpAt?: string;
}

export interface MatchEvidence {
  strengths: string[];
  gaps: string[];
  constraints: string[];
  nextSteps: string[];
  confidence: "high" | "medium" | "low";
  algorithmVersion: string;
}

export interface MatchResult {
  job: JobPosting;
  score: number;
  reasons: string[];
  reasonsZh: string[];
  evidence?: MatchEvidence;
}
