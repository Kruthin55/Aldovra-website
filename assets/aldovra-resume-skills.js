/* Aldovra: which catalog skills does a student's analyzed resume actually show?
   Same rules as supabase/functions/create-assessment-request (keep both in sync). */
(function (global) {
  "use strict";
  var ALIASES = {
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
  var FIELDS = ["skills", "tools", "technologies", "programming_languages", "technical_areas"];
  function norm(v) { return String(v == null ? "" : v).toLowerCase().replace(/[^a-z0-9+#./ -]+/g, " ").replace(/\s+/g, " ").trim(); }
  function resumeTerms(parsed) {
    var out = [];
    if (!parsed || typeof parsed !== "object") return out;
    FIELDS.forEach(function (f) {
      var v = parsed[f];
      (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,;\n]/) : []).forEach(function (x) {
        if (x && typeof x === "object") x = x.name || x.skill || "";
        var n = norm(x); if (n) out.push(n);
      });
    });
    return out;
  }
  function aliasesFor(name) { return (ALIASES[name] || []).concat([norm(name)]); }
  function hit(term, alias) {
    if (!alias) return false;
    if (term === alias) return true;
    if (alias.length < 3) return false; // "go", "c", "js": exact only
    return (" " + term + " ").indexOf(" " + alias + " ") !== -1;
  }
  function matchSkills(parsed, skills) {
    var terms = resumeTerms(parsed), ids = new Set();
    (skills || []).forEach(function (s) {
      var al = aliasesFor(s.name);
      if (terms.some(function (t) { return al.some(function (a) { return hit(t, a); }); })) ids.add(String(s.id));
    });
    return ids;
  }
  global.AldovraResumeSkills = { match: matchSkills, terms: resumeTerms, aliases: ALIASES };
})(window);
