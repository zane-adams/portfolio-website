// ─────────────────────────────────────────────────────────────
//  everything on the site is edited from this one file.
//
//  photos → drop image files into  public/media/<folder>/
//  decks  → drop slide images into public/media/<folder>/deck/
//           (export a powerpoint as png/jpg: file → export → png,
//            "all slides", then drop the images in, in order)
// ─────────────────────────────────────────────────────────────

export const profile = {
  name: 'zane adams',
  // shown under the 3d name
  tagline: 'computer science + math @ university of houston',
  blurb:
    'i build software that turns data and math into something people can use: machine learning models, analytics dashboards, internal tools, and interactive simulations. most of my work sits between data science and full-stack development.',
  location: 'houston, tx',
  email: '',
  links: [
    { label: 'github', href: 'https://github.com/zane-adams' },
    { label: 'linkedin', href: 'https://linkedin.com/in/zaneadams' }
  ],
}

export const education = {
  school: 'university of houston',
  degree: 'b.s. computer science, minor in mathematics',
  dates: 'aug 2023 — dec 2026',
  place: 'houston, tx',
  coursework: [
    'data science',
    'database systems',
    'artificial intelligence',
    'algorithms',
    'computer networks',
  ],
}

export const experience = [
  {
    id: 'ninja-analytics',
    role: 'data scientist / ai solutions architect intern',
    org: 'ninja analytics',
    place: 'leesburg, va',
    dates: 'may 2026 - aug 2026',
    stack: ['python', 'postgresql', 'neo4j', 'fastapi', 'react', 'docker'],
    bullets: [
      'built an end-to-end analytics platform that gives researchers and investigators one dashboard to organize, query, and visualize relational and graph data.',
      'trained and compared scikit-learn classifiers on tabular vs. graph features, and the accuracy write-up made the case for going graph-first (>10% improvement).',
      'generated and validated synthetic network datasets with a stochastic block model, so model work never touched sensitive case records.',
      'shipped a chat interface over the database so non-technical users could ask questions in plain language instead of writing sql.',
    ],
    // file names inside public/media/ninja-analytics/
    photos: [
      { src: 'IMG_1745.png', caption: 'my visit to washington d.c!' },
      { src: 'dashboard.png', caption: 'react frontend for drug analytics app' },
      { src: 'techstack.png', caption: 'tech stack for our project' },
    ],
    // file names inside public/media/ninja-analytics/deck/
    deck: {
      title: 'platform walkthrough',
      slides: [
        { src: 'Slide1.PNG',  caption: 'neo4j drug analytics' },
        { src: 'Slide3.PNG',  caption: 'what it is and why it matters' },
        { src: 'Slide4.PNG',  caption: 'what the research says' },
        { src: 'Slide5.PNG',  caption: 'current seizure analysis challenges' },
        { src: 'Slide6.PNG',  caption: 'how the project solves them' },
        { src: 'Slide7.PNG',  caption: 'neo4j graph data science' },
        { src: 'Slide8.PNG',  caption: 'applications to the cbp mission' },
        { src: 'Slide9.PNG',  caption: 'cbp mission applications' },
        { src: 'Slide11.PNG', caption: 'model details and tech stack' },
        { src: 'Slide12.PNG', caption: 'models and training setup' },
        { src: 'Slide13.PNG', caption: 'model results' },
        { src: 'Slide14.PNG', caption: 'how the dataset was generated' },
        { src: 'Slide15.PNG', caption: 'tech stack' },
      ],
    },
  },
  {
    id: 'great-lakes',
    role: 'data management intern',
    org: 'great lakes dredge & dock',
    place: 'houston, tx',
    dates: 'sep 2024 - jan 2026',
    stack: ['c#', 'asp.net mvc', 'javascript', 'python', 'azure', 'power bi'],
    bullets: [
      'built an internal search site for the engineering team with active directory auth and azure-hosted file shares, deployed on iis.',
      'added searchable tables, document previews, and bulk metadata upload that cut a lot of manual data entry.',
      'wrote python automation to bulk-reformat documents and migrate content between systems through their apis.',
      'automated quarterly budget reporting by pulling invoice and financial data from several sources into generated excel reports and charts.',
    ],
    photos: [
      { src: 'IMG_0339.png', caption: '' },
      { src: 'IMG_0368.png', caption: '' },
    ],
    deck: { title: 'internal tools overview', slides: [] },
  },
]

export const projects = [
  {
    id: 'asylum-zero',
    role: 'asylum zero: ps1-inspired survival horror game',
    org: 'school project',
    place: '',
    dates: 'aug 2026 - present',
    stack: ['unity', 'c#', 'blender'],
    bullets: [
      'leading a team of 5 as producer and lead developer, managing scope, sprint planning, and task delegation across design, art, writing, and engineering.',
      'developing core gameplay systems in c#, including a limited inventory, key-item progression, save rooms, and enemy ai such as a persistent stalker that hunts the player across the facility.',
    ],
    // youtube video ids (the part after watch?v=)
    videos: [
      { id: '1JKYjzji7lk', caption: '' },
      { id: 'QGVOPCM_wfk', caption: '' },
      { id: 'eYZFuedr_9M', caption: '' },
    ],
    photos: [],
    deck: { title: '', slides: [] },
  },
  {
    id: 'trajectory-lab',
    role: 'trajectory lab: spaceflight & solar system simulator',
    org: 'personal project',
    place: '',
    dates: 'june 2026',
    stack: ['javascript', 'three.js', 'webgl'],
    bullets: [
      'simulated planetary orbits and spacecraft transfers in the browser by numerically integrating gravitational forces.',
      'built a route planner that searches direct and gravity-assist trajectories with a lambert solver and differential evolution, ranked by delta-v or arrival date.',
      'animated the spacecraft along the chosen route with time controls, a mission timeline, and a launch-window porkchop plot.',
      'checked each route in full n-body gravity and computed the correction burns needed to hit every flyby, plus a sandbox for adjusting burns.',
    ],
    links: [
      { label: 'github', href: 'https://github.com/zane-adams/trajectory-lab' },
    ],
    // app files live in public/trajectory-lab/
    // screenshot in public/media/trajectory-lab/, links to the live demo
    preview: { src: 'preview.jpg', href: '/trajectory-lab/', label: 'open live demo' },
    photos: [],
    deck: { title: '', slides: [] },
  },
  {
    id: 'covid-icu',
    role: 'covid-19 health data analysis',
    org: 'school project',
    place: '',
    dates: 'sep 2025 - dec 2025',
    stack: ['python', 'pandas', 'scikit-learn', 'xgboost', 'jupyter'],
    bullets: [
      'modeled icu patient demand from public health surveillance data with poisson, decision tree, random forest, and xgboost regressors.',
      'built a random forest classifier that sorted each day into low / medium / high hospitalization risk.',
      'used iqr and z-score outlier detection to pull out surge events and likely periods of hospital strain.',
      'presented the findings and figures to peers and faculty.',
    ],
    photos: [],
    // file names inside public/media/covid-icu/deck/
    deck: {
      title: 'predicting icu demand and hospital strain',
      // downloadable copy, in public/media/covid-icu/
      file: 'covid_icu_project.pptx',
      slides: [
        { src: 'Slide1.PNG', caption: 'covid-19 health data analysis' },
        { src: 'Slide2.PNG', caption: 'the question' },
        { src: 'Slide3.PNG', caption: 'the data' },
        { src: 'Slide4.PNG', caption: 'icu patients over time' },
        { src: 'Slide5.PNG', caption: 'four prediction models' },
        { src: 'Slide6.PNG', caption: 'what the models learn from' },
        { src: 'Slide7.PNG', caption: 'under the hood' },
        { src: 'Slide8.PNG', caption: 'how accurate were the models?' },
        { src: 'Slide9.PNG', caption: 'predictions vs. reality' },
        { src: 'Slide10.PNG', caption: 'what drives the forecast?' },
        { src: 'Slide11.PNG', caption: 'sorting days by risk' },
        { src: 'Slide12.PNG', caption: 'how well did risk sorting work?' },
        { src: 'Slide13.PNG', caption: 'finding surges and strain' },
        { src: 'Slide14.PNG', caption: 'biggest surge events' },
        { src: 'Slide15.PNG', caption: 'key takeaways' },
        { src: 'Slide16.PNG', caption: 'limitations and next steps' },
        { src: 'Slide17.PNG', caption: 'thank you' },
      ],
    },
  },
  {
    id: 'zoo-db',
    role: 'zoo database management system',
    org: 'school project',
    place: '',
    dates: 'sep 2023 - dec 2023',
    stack: ['c#', 'asp.net', 'sql', 'azure'],
    bullets: [
      'translated client requirements into a documented schema - entities, relationships, constraints, and user roles.',
      'implemented data entry forms, reports, secure login, and a real-time notification system.',
      'ran the weekly team meetings and delivered the final presentation.',
    ],
    // optional — renders as a small link row under the tags
    links: [{ label: 'github', href: 'https://github.com/zane-adams/ZooWeb' }],
    photos: [{ src: 'schema.png', caption: 'schema for our database, with mapped out relationships, cardinalities, entities, and attributes.' }],
    deck: { title: 'class presentation', slides: [] },
  },
]

export const skills = [
  { group: 'languages', items: ['python', 'sql', 'javascript', 'c#', 'html/css'] },
  { group: 'frameworks', items: ['react', 'fastapi', 'asp.net'] },
  {
    group: 'data',
    items: ['pandas', 'scikit-learn', 'pytorch', 'postgresql', 'neo4j', 'sql server', 'power bi'],
  },
  {
    group: 'tools',
    items: ['docker', 'azure', 'git', 'jira', 'jupyter', 'selenium', 'openpyxl'],
  },
]

// put your pdf at public/resume.pdf to swap it out
export const resumeFile = '/resume.pdf'
