// UI strings for both app modes:
// fr = French speaker learning Swedish | sv = Swedish speaker learning French

export type Lang = 'fr' | 'sv'

export const DEFAULT_LANG: Lang = 'fr'

const fr = {
  // Nav
  navHome: 'Accueil',
  navStudy: 'Étudier',
  navWords: 'Liste',
  navStats: 'Stats',
  navLeaderboard: 'Classement',
  navProfile: 'Profil',
  // Dashboard
  hello: 'Bonjour,',
  streakDays: 'jours de suite',
  goalReached: 'Objectif atteint ✅',
  dailyGoal: 'Objectif du jour',
  level: 'Niveau',
  xpBeforeLevel: (xp: number, title: string) => `Plus que ${xp} XP avant « ${title} »`,
  toReview: 'À revoir',
  masteredWords: 'Mots maîtrisés',
  totalXp: 'XP total',
  bestStreak: 'Meilleure série',
  studyDue: (n: number) => `Étudier (${n} mots dus)`,
  studyNew: 'Apprendre de nouveaux mots',
  recentActivity: 'Activité récente',
  // Study
  preparingSession: 'Préparation de ta session...',
  noWordsDue: 'Aucun mot à réviser',
  comeBackTomorrow: 'Reviens demain pour ta prochaine session !',
  loading: 'Chargement...',
  // FlashCard
  tapToReveal: 'Appuie pour voir la traduction',
  flip: 'Retourner 🔊',
  answerNo: '❌ Non',
  answerNoSub: 'Je ne savais pas',
  answerAlmost: '〰️ Presque',
  answerAlmostSub: 'Pas tout à fait',
  answerYes: '✅ Oui',
  answerYesSub: 'Je savais',
  // QCM
  whichTranslation: 'Quelle est la traduction ?',
  // Typing
  translateTo: 'Traduis en français',
  yourAnswer: 'Ta traduction...',
  submit: 'Valider',
  resultCorrect: '✅ Correct !',
  resultAlmost: "〰️ Presque — faute d'orthographe",
  resultIncorrect: '❌ Incorrect',
  expectedAnswer: 'Réponse attendue :',
  // Conjugation
  infinitive: 'Infinitif',
  present: 'Présent',
  preterit: 'Prétérit',
  supine: 'Supin',
  // Results
  sessionDone: 'Session terminée 🎉',
  correct: 'Correct',
  almost: 'Presque',
  incorrect: 'Incorrect',
  levelUnlocked: (level: number) => `🆙 Niveau ${level} débloqué !`,
  streakLine: (n: number) => `Série : ${n} jour${n > 1 ? 's' : ''} 🔥`,
  freezeSaved: '🧊 Série sauvée par un streak freeze !',
  goalReachedLine: (current: number, goal: number) => `🎯 Objectif du jour atteint — ${current} / ${goal} XP`,
  goalProgressLine: (current: number, goal: number) => `🎯 Objectif du jour : ${current} / ${goal} XP`,
  newBadges: 'Nouveaux badges !',
  newSession: 'Nouvelle session',
  backHome: "Retour à l'accueil",
  // Stats
  statsTitle: 'Statistiques',
  wordsSeen: 'Mots vus',
  toReviewSub: (n: number) => `${n} à revoir`,
  mastered: 'Maîtrisés',
  wordsSub: (n: number) => `${n} mots`,
  accuracy30d: 'Précision 30j',
  answersSub: (n: number) => `${n} réponses`,
  currentStreak: 'Série actuelle',
  recordSub: (n: number) => `record : ${n}`,
  nextMilestone: 'Prochain palier de maîtrise',
  milestoneWords: (current: number, next: number) => `${current} / ${next} mots`,
  masteredDef: "Un mot est maîtrisé quand son intervalle SM-2 dépasse 21 jours",
  activity7d: 'Activité — 7 derniers jours',
  wordsPerDay: 'mots/jour',
  max: 'max',
  streak30d: 'Série — 30 jours',
  studied: 'Étudié',
  notStudied: 'Non étudié',
  hardestWords: 'Mots les plus difficiles',
  badgesEarned: (n: number) => `Badges obtenus (${n})`,
  // Leaderboard
  leaderboardTitle: 'Classement',
  thisWeek: 'Cette semaine',
  allTime: 'Général',
  weeklyReset: 'XP gagnés depuis lundi — remise à zéro chaque semaine',
  you: '(toi)',
  words: 'mots',
  beFirst: 'Sois le premier à étudier !',
  // Profile
  progression: 'Progression',
  streak: 'Série',
  record: 'Record',
  dailyGoalSetting: 'Objectif quotidien',
  freezeInfo: (count: number, max: number, every: number) =>
    `🧊 Streak freezes : ${count} / ${max} — un freeze protège ta série si tu rates un jour ; tu en regagnes un tous les ${every} jours de suite.`,
  badges: 'Badges',
  signOut: 'Se déconnecter',
  switchMode: 'Apprendre le français (interface en suédois)',
  // Words list
  vocabularyTitle: 'Vocabulaire',
  wordsAndCategories: (words: number, cats: number) => `${words} mots · ${cats} catégories`,
  personalList: 'Ma liste personnelle',
  misc: 'Divers',
}

const sv: typeof fr = {
  // Nav
  navHome: 'Hem',
  navStudy: 'Studera',
  navWords: 'Ordlista',
  navStats: 'Statistik',
  navLeaderboard: 'Topplista',
  navProfile: 'Profil',
  // Dashboard
  hello: 'Hej,',
  streakDays: 'dagar i rad',
  goalReached: 'Målet uppnått ✅',
  dailyGoal: 'Dagens mål',
  level: 'Nivå',
  xpBeforeLevel: (xp, title) => `${xp} XP kvar till « ${title} »`,
  toReview: 'Att repetera',
  masteredWords: 'Bemästrade ord',
  totalXp: 'Total XP',
  bestStreak: 'Bästa sviten',
  studyDue: n => `Studera (${n} ord att repetera)`,
  studyNew: 'Lär dig nya ord',
  recentActivity: 'Senaste aktivitet',
  // Study
  preparingSession: 'Förbereder din session...',
  noWordsDue: 'Inga ord att repetera',
  comeBackTomorrow: 'Kom tillbaka imorgon för nästa session!',
  loading: 'Laddar...',
  // FlashCard
  tapToReveal: 'Tryck för att se översättningen',
  flip: 'Vänd 🔊',
  answerNo: '❌ Nej',
  answerNoSub: 'Jag visste inte',
  answerAlmost: '〰️ Nästan',
  answerAlmostSub: 'Inte riktigt',
  answerYes: '✅ Ja',
  answerYesSub: 'Jag visste',
  // QCM
  whichTranslation: 'Vad är översättningen?',
  // Typing
  translateTo: 'Översätt till svenska',
  yourAnswer: 'Din översättning...',
  submit: 'Svara',
  resultCorrect: '✅ Rätt!',
  resultAlmost: '〰️ Nästan — stavfel',
  resultIncorrect: '❌ Fel',
  expectedAnswer: 'Rätt svar:',
  // Conjugation (not used in sv mode, kept for type parity)
  infinitive: 'Infinitiv',
  present: 'Presens',
  preterit: 'Preteritum',
  supine: 'Supinum',
  // Results
  sessionDone: 'Sessionen är klar 🎉',
  correct: 'Rätt',
  almost: 'Nästan',
  incorrect: 'Fel',
  levelUnlocked: level => `🆙 Nivå ${level} upplåst!`,
  streakLine: n => `Svit: ${n} dag${n > 1 ? 'ar' : ''} 🔥`,
  freezeSaved: '🧊 Sviten räddades av en streak freeze!',
  goalReachedLine: (current, goal) => `🎯 Dagens mål uppnått — ${current} / ${goal} XP`,
  goalProgressLine: (current, goal) => `🎯 Dagens mål: ${current} / ${goal} XP`,
  newBadges: 'Nya utmärkelser!',
  newSession: 'Ny session',
  backHome: 'Tillbaka till startsidan',
  // Stats
  statsTitle: 'Statistik',
  wordsSeen: 'Sedda ord',
  toReviewSub: n => `${n} att repetera`,
  mastered: 'Bemästrade',
  wordsSub: n => `${n} ord`,
  accuracy30d: 'Träffsäkerhet 30d',
  answersSub: n => `${n} svar`,
  currentStreak: 'Nuvarande svit',
  recordSub: n => `rekord: ${n}`,
  nextMilestone: 'Nästa milstolpe',
  milestoneWords: (current, next) => `${current} / ${next} ord`,
  masteredDef: 'Ett ord är bemästrat när dess SM-2-intervall överstiger 21 dagar',
  activity7d: 'Aktivitet — senaste 7 dagarna',
  wordsPerDay: 'ord/dag',
  max: 'max',
  streak30d: 'Svit — 30 dagar',
  studied: 'Studerat',
  notStudied: 'Inte studerat',
  hardestWords: 'Svåraste orden',
  badgesEarned: n => `Utmärkelser (${n})`,
  // Leaderboard
  leaderboardTitle: 'Topplista',
  thisWeek: 'Denna vecka',
  allTime: 'Totalt',
  weeklyReset: 'XP sedan måndag — nollställs varje vecka',
  you: '(du)',
  words: 'ord',
  beFirst: 'Bli först med att studera!',
  // Profile
  progression: 'Utveckling',
  streak: 'Svit',
  record: 'Rekord',
  dailyGoalSetting: 'Dagligt mål',
  freezeInfo: (count, max, every) =>
    `🧊 Streak freezes: ${count} / ${max} — en freeze skyddar din svit om du missar en dag; du får tillbaka en var ${every}:e dag i rad.`,
  badges: 'Utmärkelser',
  signOut: 'Logga ut',
  switchMode: 'Apprendre le suédois (interface en français)',
  // Words list
  vocabularyTitle: 'Ordförråd',
  wordsAndCategories: (words, cats) => `${words} ord · ${cats} kategorier`,
  personalList: 'Personlig lista',
  misc: 'Övrigt',
}

const STRINGS: Record<Lang, typeof fr> = { fr, sv }

export function getStrings(lang: string | null | undefined): typeof fr {
  return STRINGS[(lang === 'sv' ? 'sv' : 'fr') as Lang]
}

export function asLang(value: string | null | undefined): Lang {
  return value === 'sv' ? 'sv' : 'fr'
}
