# Benchmark : apps de vocabulaire — features à voler

> Rapport de recherche (juillet 2026). Contexte : l'app a déjà SRS SM-2, 4 types
> d'exercices, XP/niveaux/streak/badges, leaderboard, stats, TTS suédois, PWA,
> multi-utilisateurs Google. Les recommandations excluent l'existant.

## 1. Points forts par app

**Duolingo**
- Streak + **streak freeze** : mécanique de perte évitable. Utilisateurs avec freeze : 17,2 jours de streak en moyenne contre 11,6 sans (+48 %) ; -21 % de churn chez les utilisateurs à risque.
- Notifications personnalisées via bandit algorithm (le message qui marche par utilisateur, pas un rappel générique).
- Leagues hebdomadaires : cohortes ~30 joueurs à XP similaire, promotion/relégation, reset hebdo → +25 % de complétion de leçons.
- 600+ expérimentations A/B rien que sur le streak.

**Anki** — SM-2/FSRS transparent et contrôlable ; cloze deletion comme format dominant pour la grammaire/collocations.

**Memrise** — vidéos de locuteurs natifs réels ; mnémotechniques visuelles communautaires (« Mems ») ; aucune pénalité d'erreur (pas de vies).

**Drops** — sessions limitées à 5 min/10h (rareté + micro-sessions espacées) ; apprentissage par icônes sans traduction textuelle.

**Babbel** — dialogues + reconnaissance vocale sur progression CEFR conçue par des linguistes.

**Quizlet** — plusieurs modes sur le même dataset (Learn adaptatif, Match chrono, Test) ; réseau de decks partagés.

**Clozemaster** — phrases à trous sur les mots les plus fréquents + SRS ; le cloze en contexte bat le flashcard isolé en rétention et transfert.

**Lingvist** — difficulté adaptative au niveau du choix du prochain mot.

**LingQ** — comprehensible input + compteur de « mots connus » par palier, très motivant long terme.

**Busuu** — corrections par locuteurs natifs (premier retour 3-10 min) avec boucle de réciprocité.

## 2. Points faibles / pièges à éviter

- **Duolingo** : « jouer pour le streak » au lieu d'apprendre ; reconnaissance >> production ; notifications culpabilisantes (backlash « Duo is sad ») ; monétisation agressive.
- **Anki** : courbe d'apprentissage rude, zéro contenu par défaut, anxiété de la pile de reviews en retard.
- **Drops** : mur artificiel frustrant ; zéro grammaire.
- **Quizlet** : suppression du mode Gravity → frustration (ne jamais retirer une mécanique aimée sans remplacement).
- **Clozemaster** : trop dur trop tôt pour un débutant ; pas d'explications grammaticales.
- **Busuu** : qualité de correction variable selon qui est en ligne.
- **Transversal (RevenueCat 2026)** : 90 %+ de churn dans les 30 premiers jours ; 55 % des annulations se décident au jour 0 → la première session compte plus que toute feature long terme.

## 3. Top 10 features à voler (impact/effort)

1. **Streak freeze / jeton de pardon** — S. `freeze_count` + règle dans le calcul de streak. La peur de perdre est le moteur ; assouplir augmente la rétention (+48 % / -21 % churn).
2. **Objectif quotidien personnalisable** (10/20/30/50 XP) — S. Autonomie (self-determination theory) = rétention long terme.
3. **Compteur « mots maîtrisés »** en stats (palier type LingQ) — S. Données SM-2 déjà présentes.
4. **Ligue hebdomadaire à cohortes** avec reset — S/M. +25 % complétion chez Duolingo. NB : pour un petit cercle d'utilisateurs connus, un simple leaderboard hebdo suffit — pas de sur-ingénierie.
5. **Notifications intelligentes liées aux reviews dues** (« 12 mots à réviser avant de les oublier ») — M. Web Push API dans la PWA ; pas besoin de ML.
6. **Exercice phrase à trou en contexte** (5e type, réutilise le moteur de saisie fuzzy) — M. Effort surtout côté contenu (phrases d'exemple par mot).
7. **Tri par fréquence d'usage réel** (tag top 1000/2000, priorité d'apparition) — S/M.
8. **Widget « presque au niveau suivant »** (« 12 XP avant le niveau 8 ») — S. Biais du near-miss.
9. **Couche sociale légère** (amis + streak visible + relance en un clic) — M/L. Seulement si l'app doit grandir au-delà d'un cercle fermé.
10. **Mini-pratique conversationnelle IA** (dialogue tapé/parlé + correction LLM) — L. Comble le vrai manque (production), mais à ne lancer qu'après les items S/M.

## 4. Trois enseignements contre-intuitifs

1. **Rendre le streak plus facile à garder augmente l'engagement** — un streak cassé par accident tue la motivation bien plus qu'un freeze ne la dilue.
2. **Supprimer la pénalité d'erreur ne réduit pas la rétention** — les mécaniques punitives déclenchent l'« undermining effect » chez des adultes déjà motivés.
3. **Plusieurs micro-sessions courtes battent une session longue** — l'espacement intra-journée sert la mémorisation ; à transposer en design de rappels (2-3 micro-sessions/jour), pas en mur artificiel.

## Sources principales

- trophy.so/blog/duolingo-gamification-case-study (2026)
- uxmag.com — The Psychology of Hot Streak Game Design
- likeminds.community — Bandit Algorithm of Duolingo's Notifications
- duolingo.deconstructoroffun.com — Leagues / Notifications
- clozemaster.com/blog/cloze-deletion-vs-flashcards
- frontiersin.org (2024) — gamification, motivation & learning outcomes
- revenuecat.com/state-of-subscription-apps (2026)
- talkpal.ai — Memrise vs Duolingo 2025 ; ling-app.com — LingQ vs Lingvist
