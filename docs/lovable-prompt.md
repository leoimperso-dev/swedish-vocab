# Prompt Lovable — redesign front-end Svenska (3 passes)

> Mode d'emploi : colle la **Passe 1** dans Lovable, attends le résultat et ajuste si besoin.
> Puis colle la **Passe 2**, puis la **Passe 3**. Ne colle jamais tout d'un coup.
> Objectif : une **maquette visuelle** (React + Tailwind, données statiques). Le portage vers
> notre stack Next.js se fera manuellement ensuite — ne pas demander de backend à Lovable.

---

## Passe 1 — Fondations & design system

```
Tu vas designer une app mobile-first d'apprentissage du vocabulaire suédois pour
francophones ("Svenska"). Cette première passe pose UNIQUEMENT le design system et
le shell de l'app — pas encore les écrans.

CONTEXTE PRODUIT
- App de répétition espacée (type Anki × Duolingo) : sessions d'exercices, flashcards
  à swipe, stats, streak, XP/niveaux, liste de vocabulaire, lecture d'histoires.
- Utilisée à 90 % sur téléphone (PWA installée), en sessions courtes quotidiennes.
- Bilingue : interface français par défaut, bascule complète en suédois via un drapeau.

DIRECTION ARTISTIQUE
- Dark mode uniquement. Base actuelle : slate-950/900 (#0f172a), on peut affiner.
- Esprit : minimalisme scandinave chic + le fun maîtrisé d'une app de gamification.
  Références : polish de Linear/Vercel, chaleur de Duolingo SANS le côté enfantin.
- Identité suédoise subtile : accents bleu et jaune (drapeau suédois) utilisés avec
  goût — PAS de kitsch, pas de drapeaux partout.
- Les émojis actuels (🔥 streak, 🧊 freeze, 🎯 objectif...) peuvent rester ou être
  remplacés par des icônes cohérentes, à toi de proposer mieux.

DESIGN SYSTEM À PRODUIRE
1. Palette complète (tokens) : fond, surfaces, bordures, texte primaire/secondaire,
   accent principal, et les couleurs sémantiques déjà installées dans l'app :
   succès/vert (réponse correcte, mots maîtrisés), jaune (presque correct, XP,
   objectif du jour), rouge (incorrect), orange (streak), cyan (streak freeze),
   bleu (progression, actions).
2. Typographie : une famille pour l'UI + hiérarchie (les mots suédois doivent être
   les héros visuels des écrans d'exercice — gros, lisibles, å ä ö impeccables).
3. Composants de base : carte (rounded-2xl actuel), bouton primaire/secondaire/
   destructif, barre de progression, pastilles de niveau (5 points), tabs segmentés,
   input texte, badge/chip.
4. Shell : bottom nav fixe 6 entrées (Accueil, Étudier, Liste, Stats, Classement,
   Profil) avec safe-area iOS, état actif clair.
5. Micro-interactions : press states (scale), transitions de page, feedback
   correct/incorrect. Sobre et rapide (<200 ms).

CONTRAINTES TECHNIQUES
- React + Tailwind uniquement, données statiques factices, pas de backend.
- Viewport de référence : 390 px de large. Tout doit être utilisable au pouce.
- Contraste AA minimum. Pas d'images externes ni d'illustrations lourdes.

Livre : une page "design system" montrant tokens + composants, et le shell avec
la bottom nav.
```

---

## Passe 2 — Écrans cœur (dashboard + exercices)

```
Deuxième passe : les écrans principaux, en réutilisant strictement le design system
de la passe 1. Les flux et le contenu sont FIGÉS (app existante) — tu redesignes
l'apparence, pas la logique.

1. DASHBOARD (accueil)
- Header : "Bonjour, Arnaud" + drapeau 🇸🇪 (bascule de langue) + streak "🔥 12"
  avec "🧊×2" (freezes) en dessous.
- Carte objectif du jour : "Objectif du jour — 20/30 XP" avec barre ; état atteint
  (vert, "Objectif atteint ✅").
- Carte niveau : titre suédois ("Talare"), "Niveau 4", barre XP,
  "Plus que 120 XP avant « Avancerad »".
- 4 stat cards : À revoir (12), Mots maîtrisés (87), XP total (1840), Meilleure
  série (15).
- Gros CTA "Étudier (12 mots dus)".
- Activité récente (30 pastilles de jours).

2. CHOIX D'EXERCICE (écran Étudier)
- Toggle direction : [🇸🇪 → 🇫🇷] [🇫🇷 → 🇸🇪].
- 6 cartes de mode : Mix (recommandé, mis en avant), Flashcards, Choix multiple,
  Écriture, Phrase à trous, Conjugaison + une carte Lecture (📕 histoires).

3. EXERCICES (un écran par type, avec barre de progression session en haut :
   pastilles vert/jaune/rouge des réponses + compteur 7/15 + combo "🔥 ×4" +
   bouton quitter ✕)
- FLASHCARD recto : gros mot suédois "en kvinna", "Appuie pour voir la traduction".
- FLASHCARD verso : mot + formes "(kvinnor)", traduction "une femme", note d'usage
  "gifta sig med ngn — se marier avec qqn" ; 3 boutons (Non / Presque / Oui) +
  indication swipe (← je ne savais pas · je savais →) avec overlays ✅/❌ pendant
  le drag.
- CHOIX MULTIPLE : mot suédois en haut, 4 options en grille 2×2, états
  correct/incorrect/neutre après sélection.
- ÉCRITURE : mot "tala", consigne "Traduis en français", input, feedback
  correct (vert) / presque — faute d'orthographe (jaune, "Réponse attendue :
  parler") / incorrect (rouge).
- PHRASE À TROUS : vraie phrase "_____ är löjligt!" + traduction de la phrase en
  italique + indice (traduction du mot), input, révélation après réponse.
- CONJUGAISON : infinitif "tala" + traduction, 3 champs (Présent / Prétérit /
  Supin) avec validation par champ.

4. RÉSULTATS DE SESSION
- Score "87 %", "Session terminée 🎉", 3 compteurs (Correct 11 / Presque 2 /
  Incorrect 2), carte "+145 XP" avec "🆙 Niveau 5 débloqué !", "Série : 12 jours 🔥",
  "🧊 Série sauvée par un streak freeze", objectif du jour atteint, nouveaux badges,
  boutons "Nouvelle session" / "Retour à l'accueil".

Mobile 390 px, données factices réalistes en suédois/français (å ä ö).
```

---

## Passe 3 — Écrans secondaires + polish

```
Troisième et dernière passe : les écrans restants + le polish global, toujours avec
le même design system.

1. LISTE DE VOCABULAIRE
- Header "Vocabulaire — 7253 mots · 78 catégories" + 3 tabs : Catégories /
  Top 3000 / ★ Favoris.
- Catégories : accordéons (nom + compteur). Rangée de mot : ☆/★ favori,
  "tala (talar, talade, talat)" à gauche, "parler, s'exprimer" à droite,
  5 pastilles de niveau de connaissance, bouton 💬 qui déplie 1-3 phrases
  d'exemple (suédois + français en italique), note de contexte en italique
  ("tala est plus formel que prata").
- Top 3000 : mêmes rangées avec rang "#42", bouton "Afficher plus (300/2161)".

2. LECTURE
- Choix de niveau : 3 cartes (🌱 Débutant / 🌿 Intermédiaire / 🌳 Expert) avec
  compteur d'histoires.
- Liste d'histoires : titre suédois + traduction + nombre de mots.
- LECTEUR (écran clé) : titre, texte en paragraphes très lisibles (interligne
  généreux) ; CHAQUE mot est tappable → popup/bulle ancrée juste AU-DESSUS du mot
  tapé : mot de base en gras, traduction, formes, bouton 🔊. Le mot actif est
  surligné. Soigne particulièrement cette bulle (ombre, flèche, apparition).

3. STATS
- 4 stat cards (Mots vus, Maîtrisés %, Précision 30j, Série actuelle).
- Barre "Progression globale — 87/7253 mots connus".
- Carte "Prochain palier de maîtrise — 87/100 mots".
- Graphe barres "Activité 7 derniers jours", calendrier streak 30 jours
  (grille type GitHub), liste "Mots les plus difficiles" (mot, ✗/✓), badges.

4. CLASSEMENT
- Tabs "Cette semaine / Général", podium top 3 (avatars), liste avec rang,
  avatar, nom, "(toi)" pour soi, XP, streak.

5. PROFIL
- Carte utilisateur (avatar Google, nom, email, niveau).
- Progression avec roadmap des 7 niveaux suédois (Nybörjare → Mästare).
- Sélecteur objectif quotidien (10/20/30/50 XP) + info streak freezes.
- Grille de badges (débloqués/verrouillés), bouton Se déconnecter.

6. LOGIN
- Écran d'accueil épuré : identité de l'app, un bouton "Continuer avec Google".

POLISH FINAL
- Transitions entre écrans cohérentes, skeletons de chargement pour la liste et
  le classement, empty states (aucun favori, aucun mot à réviser 🎉).
- Vérifie l'ensemble en 390 px ET en desktop (max-w-lg centré, comme actuellement).
```
