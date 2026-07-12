/**
 * Diverse synthetic CV samples for regression testing multi-template extraction.
 * These are not real people — patterns mirror common résumé templates worldwide + Macau/HK.
 */

export interface CvSampleExpectation {
  id: string;
  description: string;
  text: string;
  expect: {
    nameIncludes?: string;
    educationLevel?: string;
    mustSkills?: string[];
    mustLanguages?: string[];
    mustSectors?: string[];
    lanesInclude?: string[];
    lanesExclude?: string[];
    minAge?: number;
    maxAge?: number;
    isStudent?: boolean;
  };
}

export const CV_SAMPLES: CvSampleExpectation[] = [
  {
    id: "academic-phd",
    description: "Academic PhD CV with research interests (EN)",
    text: `Alex Chen — PhD in Computer Science
(+852) 9123 4567 • alex.chen@cuhk.edu.hk
Research Interests
Deep learning for medical imaging; causal inference.
Education
The Chinese University of Hong Kong
PhD in Computer Science Aug 2021 – Jul 2025
MSc in Computer Science 2019 – 2021
BSc in Mathematics 2015 – 2019
Teaching Experience
Teaching Assistant — Machine Learning
Professional Experience
Research Intern, SenseTime 2020
Technical Skills
Programming: Python (PyTorch), R, C++
Languages: English (fluent), Mandarin (native), Cantonese (fluent)
`,
    expect: {
      nameIncludes: "Alex Chen",
      educationLevel: "phd",
      mustSkills: ["python", "machine-learning"],
      mustLanguages: ["English", "Mandarin", "Cantonese"],
      mustSectors: ["tech"],
      lanesInclude: ["full-time"],
      lanesExclude: ["summer"],
      minAge: 24,
    },
  },
  {
    id: "industry-chronological",
    description: "Standard chronological industry résumé",
    text: `JAMIE WONG
Software Engineer
jamie.wong@email.com | +853 6666 7788 | Macau

SUMMARY
Full-stack engineer with 4 years of experience building web products.

EXPERIENCE
Senior Software Engineer, Company A, Macau
Jan 2022 – Present
- Led React/Node services; mentored juniors

Software Engineer, Company B, Hong Kong
Jun 2020 – Dec 2021
- Built REST APIs with TypeScript and PostgreSQL

EDUCATION
BSc Computer Science, University of Macau, 2016 – 2020

SKILLS
JavaScript, TypeScript, React, Node.js, SQL, AWS, Agile
Languages: Cantonese, English, Mandarin
`,
    expect: {
      nameIncludes: "Jamie",
      educationLevel: "bachelor",
      mustSkills: ["javascript", "sql"],
      mustLanguages: ["Cantonese", "English"],
      mustSectors: ["tech"],
      lanesInclude: ["full-time"],
      minAge: 22,
      isStudent: false,
    },
  },
  {
    id: "functional-skills-first",
    description: "Functional CV: skills before experience",
    text: `Maria Santos
Digital Marketing Specialist
maria.s@example.com

CORE COMPETENCIES
SEO, SEM, social media marketing, Google Analytics, content strategy, Canva

PROFESSIONAL EXPERIENCE
Marketing Executive, Agency Z (2021-2024)
Marketing Intern, Brand Y (2020)

EDUCATION
BA in Communication, 2020

LANGUAGES
Portuguese (native), English (fluent), Cantonese (conversational)
`,
    expect: {
      nameIncludes: "Maria Santos",
      educationLevel: "bachelor",
      mustSkills: ["digital-marketing"],
      mustLanguages: ["Portuguese", "English", "Cantonese"],
      lanesInclude: ["full-time"],
    },
  },
  {
    id: "chinese-mainland-style",
    description: "Chinese-style résumé with labeled fields",
    text: `个人简历
姓名：李明
性别：男
电话：13800138000
邮箱：liming@example.com
求职意向：数据分析师

教育背景
2018.09-2022.06  某某大学  统计学  本科

工作经历
2022.07-至今  某科技公司  数据分析专员
负责 Python 数据分析、SQL 取数、业务报表

专业技能
Python、SQL、Excel、机器学习基础
语言：普通话（母语）、英语（CET-6）
`,
    expect: {
      nameIncludes: "李明",
      educationLevel: "bachelor",
      mustSkills: ["python", "sql"],
      mustLanguages: ["Mandarin", "English"],
      mustSectors: ["tech"],
    },
  },
  {
    id: "hk-secondary-student",
    description: "Secondary student seeking summer work",
    text: `Chan Tai Man
Form 5 Student, Macau
taiman.chan@school.edu.mo

Objective
Seeking summer part-time work in retail or F&B.

Education
Secondary School, Form 5 (expected 2027)

Skills
Teamwork, customer service, Microsoft Office, basic English
Languages: Cantonese (native), English (school level), Mandarin (basic)

Activities
Class committee; volunteer at charity bazaar
`,
    expect: {
      nameIncludes: "Chan Tai Man",
      educationLevel: "secondary",
      mustSkills: ["customer-service", "teamwork"],
      mustLanguages: ["Cantonese"],
      lanesInclude: ["summer", "part-time"],
      lanesExclude: [],
      maxAge: 19,
      isStudent: true,
    },
  },
  {
    id: "fresh-grad-internship",
    description: "Fresh graduate targeting internships",
    text: `Emily Ho
emilyho@gmail.com | Taipa, Macau

Education
University of Macau
BBA in Finance 2021 – 2025
GPA 3.4/4.0

Internships
Finance Intern, Bank of China Macau, Summer 2024
Audit Intern, PwC, 2023

Skills
Excel, financial analysis, PowerPoint, Bloomberg (basic)
Languages: Cantonese, Mandarin, English
`,
    expect: {
      nameIncludes: "Emily Ho",
      educationLevel: "bachelor",
      mustSkills: ["excel", "finance"],
      mustSectors: ["finance"],
      mustLanguages: ["Cantonese", "English"],
    },
  },
  {
    id: "hospitality-ops",
    description: "Hospitality operations CV",
    text: `David Lam
Guest Relations Officer
david.lam@hotel.mo | +853 6288 9900

Work Experience
Guest Relations Officer, Grand Hotel Cotai (2022–Present)
Front Desk Agent, City Hotel (2019–2022)

Education
Diploma in Hospitality Management, 2019

Skills
Opera PMS, customer service, complaint handling, Microsoft Office
Languages: Cantonese, English, Mandarin, basic Japanese
`,
    expect: {
      nameIncludes: "David Lam",
      educationLevel: "vocational",
      mustSkills: ["customer-service", "hospitality"],
      mustSectors: ["hospitality"],
      lanesInclude: ["full-time"],
    },
  },
  {
    id: "europass-like",
    description: "Europass-like labeled sections",
    text: `Curriculum Vitae

PERSONAL INFORMATION
Name: Sofia Rodrigues
Email: sofia.r@example.pt
Telephone: +853 6555 1212
Nationality: Portuguese

WORK EXPERIENCE
2020 – Present Administrative Assistant, Law Firm XYZ

EDUCATION AND TRAINING
2017 – 2020 Bachelor in Business Administration

PERSONAL SKILLS
Mother tongue(s) Portuguese
Other language(s) English (B2), Cantonese (A2)
Digital skills: Word, Excel, PowerPoint
`,
    expect: {
      nameIncludes: "Sofia Rodrigues",
      educationLevel: "bachelor",
      mustLanguages: ["Portuguese", "English", "Cantonese"],
      mustSkills: ["excel", "admin"],
    },
  },
  {
    id: "linkedin-export-style",
    description: "LinkedIn export-ish plain text",
    text: `Contact
Kevin Zhang
Software Engineer at FinTech Co
Macau SAR
kevin.zhang@fintech.com

About
Backend engineer specializing in Java and cloud infrastructure.

Experience
FinTech Co
Software Engineer
Jan 2021 - Present (3 years 6 months)
Macau, Macao SAR

Education
Hong Kong University of Science and Technology
Master of Science - MS, Computer Science
2018 - 2020

Skills
Java • Spring Boot • AWS • Kubernetes • Microservices • SQL
`,
    expect: {
      nameIncludes: "Kevin Zhang",
      educationLevel: "master",
      mustSkills: ["java", "cloud", "sql"],
      mustSectors: ["tech"],
      lanesInclude: ["full-time"],
      minAge: 24,
    },
  },
  {
    id: "two-column-text-dump",
    description: "Messy two-column paste (common PDF extract artifact)",
    text: `Olivia Ng                          Skills
olivia.ng@mail.com                 Python, Tableau, SQL
+852 9000 1111                     English, Cantonese

Experience                         Education
Data Analyst, RetailCo             BSc Statistics
2022-2024                          UM 2018-2022
Intern, BankX 2021
`,
    expect: {
      nameIncludes: "Olivia Ng",
      educationLevel: "bachelor",
      mustSkills: ["python", "sql"],
      mustLanguages: ["English", "Cantonese"],
      mustSectors: ["tech"],
    },
  },
];
