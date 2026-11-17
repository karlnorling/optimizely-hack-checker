export const REPO_URL = 'https://github.com/karlnorling/optimizely-hack-checker';

export interface Link {
  title: string;
  publisher: string;
  url: string;
  note?: string;
}

/** Statements from Optimizely itself. */
export const OFFICIAL_STATEMENT = {
  title: 'Web Experimentation Security Incident',
  publisher: 'Optimizely status page',
  url: 'https://status.optimizely.com/incidents/ftw0fh9wx43z',
  posted: '2026-11-17T01:02Z',
  status: 'Monitoring',
  component: 'Web Experimentation (Snippet Delivery)',
  quote:
    'Earlier today, Optimizely identified a security incident in which an unauthorized party exploited a vulnerability in Experimentation and used it to add malicious JavaScript to some customer projects. We’ve fixed the vulnerability and removed the injected code from affected projects. We’ve also taken steps to secure affected user accounts and put additional protections in place to prevent unauthorized code from being delivered.',
  social: { publisher: 'Optimizely on X', url: 'https://x.com/Optimizely/status/2122500375727194333' },
} as const;

/** Primary research the host list and timeline come from. */
export const RESEARCH: readonly Link[] = [
  {
    title: "World's largest brands infected with malware via Optimizely",
    publisher: 'Report URI (Scott Helme)',
    url: 'https://blog.report-uri.com/worlds-largest-brands-infected-with-malware-via-optimizely/',
    note: 'Original research: the list of 188 infected snippets, timeline and payload analysis.',
  },
  {
    title: 'Optimizely supply-chain attack (OptimJack): IoCs and timeline',
    publisher: 'TheCyberSecGuru',
    url: 'https://thecybersecguru.com/news/optimizely-supply-chain-attack-optimjack/',
    note: 'Attacker domains and per-site clean-up times.',
  },
];

/** News coverage. */
export const COVERAGE: readonly Link[] = [
  {
    title: 'Optimizely supply chain attack delivers malware to CNN, Fox News, BBC, Salesforce sites',
    publisher: 'BleepingComputer',
    url: 'https://www.bleepingcomputer.com/news/security/optimizely-supply-chain-attack-delivers-malware-to-cnn-fox-news-bbc-salesforce-sites/',
    note: 'Includes statements from Optimizely and Salesforce.',
  },
  {
    title: 'Hijacked Optimizely scripts served card skimmers',
    publisher: 'The Hacker News',
    url: 'https://thehackernews.com/2026/11/hijacked-optimizely-scripts-served-card.html',
  },
  {
    title: 'Optimizely says it has fixed flaw used to inject malicious scripts',
    publisher: 'iTWire',
    url: 'https://itwire.com/business-it-news/security/optimizely-says-it-has-fixed-flaw-used-to-inject-malicious-scripts',
  },
  {
    title: 'Optimizely hack spreads malware to several websites, including HSBC, BBC and CNN',
    publisher: 'BNO News',
    url: 'https://bnonews.com/index.php/2026/11/optimizely-hack-spreads-malware-to-several-websites-including-hsbc-bbc-and-cnn/',
  },
  {
    title: 'Hackers infect 178 major websites via Optimizely to steal credit cards and target iPhones',
    publisher: 'Cyber Security News',
    url: 'https://cybersecuritynews.com/optimizely-websites-hijacked/',
  },
];
