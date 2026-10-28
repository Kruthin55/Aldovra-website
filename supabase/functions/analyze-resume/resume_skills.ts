// Which catalog skills does an analyzed resume show? Mirror of /assets/aldovra-resume-skills.js (keep in sync).
const ALIASES: Record<string, string[]> = {
    "AWS": ["aws", "amazon web services", "aws lambda", "amazon api gateway", "ec2", "amazon s3", "aws services"],
    "Google Cloud": ["google cloud", "gcp", "google cloud platform"],
    "Azure": ["azure", "microsoft azure"],
    "Data Analytics": ["data analytics", "data analysis", "data analyst"],
    "Data Science": ["data science", "data scientist"],
    "Machine Learning": ["machine learning", "ml"],
    "Deep Learning": ["deep learning", "neural networks", "tensorflow", "pytorch", "keras"],
    "Generative AI": ["generative ai", "genai", "gen ai", "llm", "llms", "prompt engineering", "langchain"],
    "NLP": ["nlp", "natural language processing"],
    "JavaScript": ["javascript", "js", "es6"],
    "TypeScript": ["typescript", "ts"],
    "Node.js": ["node.js", "nodejs", "node js"],
    "Express.js": ["express.js", "expressjs", "express js"],
    "React": ["react", "react.js", "reactjs", "react js"],
    "Next.js": ["next.js", "nextjs", "next js"],
    "Vue.js": ["vue.js", "vuejs", "vue"],
    "Angular": ["angular", "angularjs"],
    "Go": ["go", "golang"],
    "C#": ["c#", "csharp", ".net", "asp.net"],
    "C++": ["c++", "cpp"],
    "SQL": ["sql", "mysql", "postgresql", "sql server", "t-sql", "pl/sql", "sqlite"],
    "MySQL": ["mysql"],
    "PostgreSQL": ["postgresql", "postgres"],
    "MongoDB": ["mongodb", "mongo"],
    "Power BI": ["power bi", "powerbi"],
    "Tableau": ["tableau"],
    "Kubernetes": ["kubernetes", "k8s"],
    "Spring Boot": ["spring boot", "springboot"],
    "API Testing": ["api testing", "postman", "rest assured"],
    "Manual Testing": ["manual testing", "software testing", "test cases"],
    "Selenium": ["selenium"],
    "Cybersecurity": ["cybersecurity", "cyber security", "network security", "ethical hacking", "information security"],
    "System Design": ["system design"],
    "Statistics": ["statistics", "statistical analysis"],
    "Git": ["git"],
    "GitHub": ["github"],
    "Linux": ["linux", "unix", "shell scripting", "bash"],
    "Docker": ["docker", "containers"],
    "Microservices": ["microservices", "microservice architecture"]
  };
const FIELDS = ["skills", "tools", "technologies", "programming_languages", "technical_areas"];

function norm(v: unknown) {
  return String(v ?? "").toLowerCase().replace(/[^a-z0-9+#./ -]+/g, " ").replace(/\s+/g, " ").trim();
}

export function resumeTerms(parsed: any): string[] {
  const out: string[] = [];
  if (!parsed || typeof parsed !== "object") return out;
  for (const f of FIELDS) {
    const v = parsed[f];
    const list = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,;\n]/) : [];
    for (let x of list) {
      if (x && typeof x === "object") x = x.name || x.skill || "";
      const n = norm(x);
      if (n) out.push(n);
    }
  }
  return out;
}

function hit(term: string, alias: string) {
  if (!alias) return false;
  if (term === alias) return true;
  if (alias.length < 3) return false;
  return (" " + term + " ").includes(" " + alias + " ");
}

export function resumeHasSkill(parsed: any, skillName: string) {
  const aliases = (ALIASES[skillName] || []).concat([norm(skillName)]);
  return resumeTerms(parsed).some((t) => aliases.some((a) => hit(t, a)));
}
