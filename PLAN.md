# Plan — Audio → ABC en temps réel (moteur NeuralNote / Basic Pitch)


## Contexte
Page web (PC + Android) qui enregistre au micro un air trad joué au métronome et produit en direct une transcription ABC conforme aux usages de thesession.org. Périmètre de cette requête : enregistrement micro, métronome + mesures de décompte/levée, type d'air → M:/L:, tonalité auto avec forçage, ABC « simple » (sans reprises ni voltas, sans suivi de tempo sans métronome, sans import de fichier : prévus plus tard).

**Point technique clé** : NeuralNote est un plugin C++ (JUCE) qui embarque le modèle **Basic Pitch** de Spotify (via RTNeural/ONNX) ; on ne peut pas l'exécuter tel quel dans un navigateur. Le même modèle existe en JavaScript : **`@spotify/basic-pitch`** (TensorFlow.js, Apache‑2.0). On l'utilise, et on reproduit les réglages de post‑traitement de NeuralNote (sensibilité des notes, sensibilité de séparation, durée minimale, plage de hauteurs).

## Décisions
- Tonalité : **détection automatique + liste déroulante pour forcer** (format thesession : `Dmajor`, `Ador`, `Gmixolydian`, `Edorian`, `Bminor`…).
- Hébergement interne : **repo GitHub privé `la-bede/audio-to-abc`** + déploiement HTTPS sur Netlify ou Cloudflare Pages (URL non référencée, `noindex`). HTTPS obligatoire pour le micro sur Android.
- Pas d'étape de build : HTML + modules ES vanilla, dépendances **vendorisées** dans `vendor/` (fonctionne hors CDN, version figée).

## Structure des fichiers
```
index.html            UI (réglages, boutons, ABC éditable, partition)
css/style.css         responsive mobile-first
js/main.js            orchestration / état de l'app
js/tunetypes.js       types thesession → M:, L:, tempo par défaut
js/metronome.js       clics Web Audio planifiés (look-ahead), décompte, accent temps 1
js/recorder.js        getUserMedia + AudioWorklet → PCM mono, rééchantillonnage 22 050 Hz
js/worklet-capture.js AudioWorkletProcessor (copie des buffers vers le thread principal)
js/transcriber.js     Basic Pitch par fenêtres glissantes (Web Worker si possible) + raccord des notes
js/quantize.js        notes (s) → grille rythmique (temps/mesures) relative au métronome
js/key.js             détection de tonalité (Krumhansl‑Schmuckler + modes trad)
js/abc.js             génération ABC style thesession
vendor/basic-pitch/   lib + model.json + poids
vendor/abcjs/         rendu partition + lecture MIDI
netlify.toml          en‑têtes (noindex, cache modèle)
README.md
```

## Fonctionnement
1. **Réglages** (avant départ)
   - Type d'air (thesession) : reel 4/4, jig 6/8, slip jig 9/8, hornpipe 4/4, polka 2/4, slide 12/8, waltz 3/4, barndance 4/4, strathspey 4/4, three‑two 3/2, mazurka 3/4, march (2/4 par défaut, modifiable) ; L:1/8 sauf exceptions (three‑two/waltz/mazurka → L:1/8 aussi par convention thesession). Tempo par défaut proposé par type (ex. reel 100, jig 110, polka 120, slip jig 100…).
   - **Perso** : M: et L: libres.
   - Tempo (BPM, temps = noire ou noire pointée selon métrique composée).
   - **Décompte : 2 mesures par défaut** (réglable 0–4). Référence : Logic, GarageBand, MuseScore proposent 1 mesure par défaut, Cubase 2 ; 2 mesures convient mieux ici (mesures courtes en 2/4 pour les polkas, temps pour se caler et placer une levée).
   - **Levée : détection automatique.** Le micro est transcrit dès le début du décompte ; la grille métronome étant connue, toute note dont l'onset quantifié tombe avant le temps 1 de la 1re mesure (dans la dernière mesure de décompte) est une levée, écrite avant la 1re barre. Les notes plus anciennes (bruit, accordage) sont ignorées. Champ « levée » optionnel pour forcer (Auto / 0 / n croches).
   - Tonalité : `Auto` ou forcée. Instrument/plage de notes (ex. flûte/violon/accordéon) pour filtrer les hauteurs.
   - Avancé (comme NeuralNote) : seuil onset, seuil frame, durée mini, raccord des notes.
2. **Enregistrement** : déverrouillage AudioContext au clic (contrainte Android), `getUserMedia` avec `echoCancellation/noiseSuppression/autoGainControl: false`. Le métronome joue (casque conseillé ; option « clic visuel seul » pour éviter que le clic soit transcrit). L'instant t0 de la 1re mesure est connu exactement par l'horloge `AudioContext.currentTime` → alignement de la grille.
3. **Transcription incrémentale** : toutes les ~1 s, on passe à Basic Pitch une fenêtre de ~3 s (chevauchement 1 s) ; on conserve uniquement les notes de la zone centrale « stabilisée », on fusionne les notes coupées aux bords. Latence affichée ≈ 2–3 s. Backend TF.js WebGL, repli WASM/CPU sur Android faible.
4. **Quantification** : chaque onset est ramené à la subdivision la plus proche (croche, double‑croche) de la grille métronome ; durée = jusqu'à l'onset suivant (jeu legato trad), arrondie aux valeurs autorisées (1, 2, 3, 4, 6, /2 en unité L) ; trous → silences `z`. Polyphonie réduite à la note la plus saillante (mélodie).
5. **Tonalité** : histogramme pondéré des classes de hauteur → corrélation avec profils majeur/mineur + modes dorien/mixolydien ; affichage du choix et du score ; recalcul en continu, figé si forcé.
6. **ABC thesession** :
   ```
   X: 1
   T: Transcription
   R: reel
   M: 4/4
   L: 1/8
   K: Dmaj
   |:FA dA BA FA|...
   ```
   Règles : en‑tête `X/T/R/M/L/K` ; `K:` sous la forme `Dmaj`, `Ador`, `Emin`, `Gmix` ; altérations implicites selon l'armure, accidents explicites uniquement hors armure (`^`, `=`, `_`) avec persistance dans la mesure ; octaves `C,` `C` `c` `c'` ; notes groupées par temps (espace entre groupes : 4 croches en reel → 2 groupes, 3+3 en jig) ; 4 mesures par ligne (2 pour slide/12/8 si long) ; levée avant la 1re barre ; barre finale `|]` à l'arrêt. Pas de reprises/voltas dans cette version.
7. **Sortie** : zone ABC éditable, rendu partition abcjs mis à jour en direct, lecture de l'enregistrement audio (`<audio>` du WebM/WAV capté) et lecture synthétisée de l'ABC (abcjs synth), boutons Copier ABC / Télécharger `.abc` / Télécharger audio.

## Déploiement interne
- `git init`, repo privé `la-bede/audio-to-abc` (via `gh repo create --private`, avec ton accord).
- Netlify/Cloudflare Pages relié au repo privé ; `X-Robots-Tag: noindex` ; optionnellement protection par mot de passe (Cloudflare Access gratuit).
- Test local PC : `npx serve` ou `python -m http.server` sur `localhost` (contexte sécurisé, micro OK).

## Vérification
1. PC Chrome/Firefox en localhost : jouer un reel connu (ex. *The Silver Spear*, D) au métronome 90 → comparer l'ABC avec celui de thesession (notes, barres, groupements, K: détecté).
2. Jig et polka pour valider métrique composée et groupements 3+3 / 2/4.
3. Test levée auto : sans levée, puis avec 1 et 2 croches jouées pendant la fin du décompte → la 1re barre tombe bien après la levée détectée.
4. Android Chrome sur l'URL HTTPS : autorisation micro, clic audible, latence et charge CPU acceptables (repli WASM si besoin).
5. Contrôle du rendu abcjs et collage de l'ABC dans l'éditeur thesession pour vérifier qu'il est accepté.

## Hors périmètre (prompts ultérieurs)
Suivi du BPM sans métronome (inspiré de Batpapa/Cadence), reprises `|: :|` et voltas (1/2/4 dernières mesures, 3 → 4), import de fichiers mp3/m4a/wav/webm avec détection des temps forts.

---

# Plan v2 (itération 2) — Arrêt auto, nouvelle transcription, responsive, simplification (reprises/voltas)

## Contexte
La v1 (`c:\Users\jerem\Desktop\Audio_to_ABC`) fonctionne. Demandes : (1) arrêt automatique après ≥ 2 mesures sans jouer, (2) enchaîner une nouvelle transcription sans recharger la page, (3) interface adaptée bureau **et** smartphone, (4) bouton « Simplifier » qui réécrit l'ABC avec reprises `|: :|` et voltas selon thesession. Décisions utilisateur : égalité **exacte** par défaut + option **tolérance** ; si l'air est joué plusieurs fois, **garder un seul tour**.

## 1. Arrêt automatique — `js/main.js`, `index.html`
- Nouveau réglage « Arrêt auto » : Désactivé / 1 / **2 (défaut)** / 4 mesures de silence.
- Détection basée sur la **transcription** (pas sur le niveau micro, pour ignorer les clics du métronome et le bruit, déjà filtrés par la plage de hauteurs) : à chaque fenêtre analysée, `silence = analysé (frames × FRAME_SEC) − fin de la dernière note`. Si au moins une note a été jouée après le début du décompte et que `silence ≥ N × durée de mesure` → `stopRecording()` automatique. Délai réel ≈ N mesures + latence d'analyse (~2 s).
- Message « Arrêt automatique : N mesures sans note » dans la zone info. Pas de déclenchement tant qu'aucune note n'a été jouée.
- Ajout dans `Transcriber` (`js/transcriber.js`) d'un accesseur `analyzedSec()`.

## 2. Nouvelle transcription — `js/main.js`, `index.html`
- Vérifier et fiabiliser le second enregistrement (réinitialiser : `session`, `notes`, mode simplifié, synthé abcjs, audio précédent avec `URL.revokeObjectURL`, zone ABC, voyants).
- Après un arrêt, le bouton principal devient **« Nouvelle transcription »** (démarre directement un nouvel enregistrement). Le titre est conservé, l'ABC précédent est remplacé (il reste copiable/téléchargeable jusqu'au clic).
- `tests/recordtest.html` enchaîne **deux** enregistrements pour vérifier l'absence d'erreur.

## 3. Responsive bureau / smartphone — `css/style.css`, `index.html`
- **Bureau (≥ 1024 px)** : mise en page 2 colonnes, largeur max ~1280 px. Gauche (≈ 380 px, sticky) : réglages + transport. Droite : ABC, partition, lecteurs.
- **Smartphone (< 1024 px)** : une colonne ; réglages dans un `<details>` repliable dont le résumé affiche le choix courant (« Reel · 4/4 · ♩=90 · Auto ») ; replié automatiquement pendant/après un enregistrement. **Barre de transport fixée en bas** (bouton Enregistrer/Arrêter, voyants, position, niveau) avec `env(safe-area-inset-bottom)`. Cibles tactiles ≥ 44 px, partition avec défilement horizontal, textarea en police 14 px sans zoom iOS (16 px pour les inputs).
- Aucune nouvelle dépendance.

## 4. Simplification (reprises / voltas) — nouveau `js/structure.js`, refactor `js/abc.js`
**Refactor `abc.js`** : séparer le rendu des mesures de la mise en page.
- `renderBars(o)` → `{ header, pickup: string|null, bars: string[], lastComplete }` (chaque mesure rendue indépendamment ; les accidents se réinitialisant à chaque barre, deux chaînes égales = deux mesures musicalement identiques).
- `layoutLinear(r, barsPerLine, final)` = sortie actuelle (inchangée, autotests v1 conservés).

**Algorithme `simplify(bars, { tolerance, partLengths: [8, 16, 4] })`** :
1. Pour chaque longueur de partie P candidate (8, 16, 4), découper les mesures en blocs de P à partir de la mesure 1 (la levée reste en tête). Garder le P qui supprime le plus de mesures ; à égalité, 8.
2. Parcours des blocs consécutifs X, Y :
   - X = Y → section `|: X :|`.
   - Sinon, longueur `s` du suffixe différent (le préfixe X[0..P−s] = Y[0..P−s]) : s = 1 → voltas sur la dernière mesure ; s = 2 → sur les 2 dernières ; **s = 3 ou 4 → sur les 4 dernières** ; s > 4 → pas de reprise (X écrit tel quel, on continue avec Y).
   - Volta : `|: corps :|` devient `|: corps |1 fin X :|2 fin Y ||`.
   - Tolérance (option) : dans le corps commun, 1 mesure différente admise ; la version de la 1re occurrence est écrite.
3. **Un seul tour** : si la suite de sections se répète (ex. A-rep, B-rep, A-rep, B-rep), ne garder que le premier cycle ; message « 2 tours détectés, 1 conservé ».
4. Dernier bloc incomplet (fin d'enregistrement) : comparé sur ses mesures existantes ; une mesure finale plus courte est traitée comme une fin alternative.

**Mise en page simplifiée** (style thesession) : levée puis `|:` (ex. `A|:d2fd A2FA|...`), 4 mesures par ligne pour le corps, les fins `|1 … :|2 … ||` en fin de ligne, `|]` à la fin de l'air. Les liaisons `-` en fin de mesure sont conservées.

**Interface** : après l'arrêt, bouton bascule **« Simplifier (reprises) » / « Version linéaire »** + case « Tolérance (1 mesure) ». Le mode reste actif si on change tonalité/levée/seuils (recalcul automatique). Résumé affiché : « Partie de 8 mesures · A : reprise avec voltas (2 mesures) · B : reprise exacte ». Si rien de répété : « Aucune répétition trouvée ».

## Fichiers
- Modifiés : `js/main.js`, `js/abc.js`, `js/transcriber.js`, `index.html`, `css/style.css`, `tests/selftest.html`, `tests/recordtest.html`, `README.md`, `PLAN.md` (ajout de cette v2).
- Nouveau : `js/structure.js`.

## Vérification
1. **Autotests** (`tests/selftest.html`, Chrome headless + serveur de log comme en v1) : cas v1 inchangés + nouveaux cas de `simplify` sur des chaînes de mesures :
   - AABB exact → `|:A:||:B:|` ; fins différentes sur 1, 2, 3 (→ voltas sur 4) et 4 mesures ; s > 4 → pas de reprise ;
   - AABB AABB → un seul tour ; levée conservée devant `|:` ; tolérance d'1 mesure ;
   - un cas audio synthétisé AABB court (parties de 4 mesures) transcrit puis simplifié.
2. **Arrêt auto** : `recordtest.html` avec le faux micro (bip périodique) — vérifier qu'aucun arrêt prématuré n'a lieu pendant le jeu, puis cas synthétique (fin de notes) via le self-test de `Transcriber` + logique d'arrêt extraite en fonction pure `shouldAutoStop()`.
3. **Deux enregistrements successifs** dans `recordtest.html` sans erreur ni rechargement.
4. **Responsive** : captures Chrome headless `--window-size=1440,900` et `390,844` (`--screenshot`) relues pour contrôler les deux mises en page.
5. Test manuel par l'utilisateur sur PC, puis sur Android après déploiement.

---

# Plan v3 (itération 3) — Page bilingue (anglais par défaut / français) + README anglais puis français

## Contexte
La page https://la-bede.github.io/audio-to-abc/ est entièrement en français. Demande : anglais par défaut, choix du français, choix mémorisé par le navigateur ; README rédigé d'abord en anglais puis en français.

## Approche (sans dépendance, pas de build)
**Nouveau `js/i18n.js`**
- Dictionnaires `en` et `fr` (clé → texte), fonction `t(key, vars)` avec interpolation (`{n}`, `{key}`…), `getLang()`, `setLang(lang)`, `applyStatic(root)`.
- Langue : `localStorage['audio2abc.lang']` (lu/écrit dans try/catch) ; **défaut `en`** quel que soit le navigateur. `<html lang>` mis à jour.

**`index.html`**
- Textes statiques balisés `data-i18n="clé"` (contenu) / `data-i18n-attr="aria-label:clé"` ; le texte anglais est écrit en dur (affichage correct même avant le JS).
- Sélecteur de langue dans l'en-tête : deux boutons compacts **EN | FR** (état actif visible, cibles ≥ 44 px sur mobile).

**Textes dynamiques passés par `t()`**
- `js/main.js` : statut du modèle, libellés du bouton (Record / Stop / Analysing… / New transcription), Simplify / Linear version, infos (notes, latence, recalage, levée, analyse, arrêt auto), tonalité détectée/imposée, position (Ready… / Count-in n / Bar n), erreurs micro, résumé des réglages, optgroups des modes, bouton Copy/Copied.
- `js/tunetypes.js` : libellés instruments, pulsations (half note / dotted quarter…), « Custom… » → clés i18n (les noms de types thesession reel, jig… restent tels quels).
- `js/structure.js` : `summary` construit via `t()` (Parts of 8 bars · A: exact repeat · …).
- Les noms de tonalités (`Dmajor`, `Ador`…) et l'ABC restent au format thesession, indépendants de la langue.
- Changement de langue : `applyStatic`, reconstruction des listes déroulantes (valeurs conservées), `updateSummary()`, `regenerate()` si une transcription existe.

**Tests**
- `tests/recordtest.html` ne dépendra plus des libellés : `main.js` expose l'état dans `document.body.dataset.state` (`idle|recording|stopping|done`) ; le test l'utilise et vérifie aussi la bascule EN → FR → EN et la persistance (rechargement de l'iframe).
- `tests/selftest.html` : vérifie le résumé de simplification dans les deux langues.

**README.md** : section **English** complète (description, usage, simplification, desktop/mobile, local run, tests, hosting, structure, limits), puis séparateur et section **Français** (contenu actuel), avec liens d'ancre en tête (`English | Français`).

## Fichiers
Nouveau : `js/i18n.js`. Modifiés : `index.html`, `css/style.css` (sélecteur), `js/main.js`, `js/tunetypes.js`, `js/structure.js`, `tests/selftest.html`, `tests/recordtest.html`, `README.md`.

## Vérification
1. Self-test (Chrome headless + serveur de log) : 24 tests existants + résumés EN/FR.
2. recordtest : 2 enregistrements, Simplify, bascule de langue, persistance après rechargement, aucune erreur JS.
3. Captures bureau (1440 px) et mobile (`tests/mobile-preview.html`, 390 px) en EN et en FR : aucun texte français résiduel en mode EN, pas de débordement.
4. Commit + push sur `main` (avec ton accord, comme les fois précédentes), contrôle que la version en ligne s'affiche en anglais par défaut.

---

# Plan v4 (itération 4) — Suivi du tempo de l'interprète (métronome arrêté après 2 mesures) + liens `?lang=`

## Contexte
Suivre le métronome sur tout un air est difficile : les petites dérives de l'interprète décalent les barres de mesure. Demandes :
1. **Par défaut**, le métronome s'arrête après 2 mesures complètes (hors levée) et la transcription **suit les fluctuations de tempo** de l'interprète.
2. Le **mode actuel** (métronome continu, tempo fixe) reste disponible.
3. L'utilisateur veut **tester plusieurs options d'arrêt du clic** sur un exemple → elles sont toutes proposées dans un réglage.
4. Liens par langue : **`?lang=fr` / `?lang=en` uniquement** (ex. https://la-bede.github.io/audio-to-abc/?lang=fr ouvre à coup sûr la page française).

Inspiration Cadence (Batpapa) : tempo estimé par auto-corrélation d'une courbe de nouveauté issue des énergies de hauteur (pour capter les changements de note liés sans attaque), fenêtre 12 s, vote médian sur 5 estimations. **Licence AGPL-3.0** → on reprend des idées, aucun code copié. Notre cas est plus simple : tempo et phase de départ sont **connus** (décompte), et Basic Pitch fournit déjà les débuts de note, y compris liés (« melodia trick ») ; pas besoin d'estimer le tempo à l'aveugle ni de craindre les erreurs ×2/×1.5.

## 1. Réglage « Mode tempo » (`index.html`, `js/i18n.js`)
Liste déroulante dans la carte Métronome, choix mémorisé :
- **Suivi — clic arrêté à la fin de la mesure 2** *(défaut)* : arrêt pile à la barre de fin de mesure 2, décidé d'après le **niveau du micro** (début de jeu détecté) ; si l'interprète commence en retard, le compte part de la mesure où il commence.
- **Suivi — clic arrêté après 2 mesures transcrites** : le clic continue jusqu'à ce que l'ABC contienne 2 mesures complètes, puis s'arrête à la barre suivante (≈ 1-2 mesures de clic en plus à cause du retard d'analyse).
- **Métronome continu, tempo fixe** : comportement actuel (inchangé, y compris recalage automatique global).
Le réglage « Clic » (toujours / décompte seulement / visuel) continue de s'appliquer pendant la phase où le métronome tourne.
Après l'arrêt, changer le mode recalcule l'ABC du même enregistrement (suivi ↔ tempo fixe) pour comparer.

## 2. Suivi du tempo — nouveau `js/tempo.js`
**`trackTempo(onsets, { unitSec, … })`** (fonction pure, déterministe, appelée à chaque mise à jour sur toutes les notes) :
- Grille en unités L (croches pour L:1/8). Ancre initiale : temps 1 de la mesure 1 (`t0`, latence compensée), période initiale `T0 = unitSec` du métronome.
- Boucle à verrouillage de phase sur les débuts de note (après réduction monophonique) : pour chaque onset, position prévue `k = round(idx + (t − tAncre)/T)`, erreur `e`. Si `|e| ≤ 0.3·T` : nouvelle ancre `(k, prévu + α·e)` et période `T += β·e/(k − idxPrécédent)` ; sinon l'onset est ignoré pour le suivi (ornements, triolets, notes très décalées).
- Garde-fous : période bornée à [0.7·T0, 1.4·T0], variation ≤ 4 % par mise à jour ; gains de départ α = 0.3, β = 0.08 (réglés par les autotests, notamment avec du swing long-court, qui ne doit pas faire osciller la période).
- Sortie : `toUnits(t)` (temps → position continue en unités L, interpolation linéaire entre ancres, extrapolation avec la période courante avant/après), `unitSecAt(t)`, tempo courant/min/max.

**`PlayDetector`** (même fichier) : niveau RMS par bloc du micro → bruit de fond estimé (médiane) avant le jeu → instant du premier jeu soutenu (seuil relatif + durée minimale ≈ 150 ms, insensible aux clics brefs du métronome). Utilisé par l'option « fin de la mesure 2 ».

## 3. Intégration
- **`js/quantize.js`** : `quantize(notes, t)` accepte `t.timeMap` (`toUnits`). Sans `timeMap` → comportement actuel (tempo fixe + recalage global). Avec → positions `round(toUnits(t)·gridDiv)`, durées propres `round((toUnits(t+dur) − toUnits(t))·gridDiv)`, pas de recalage global (la phase est suivie). La réduction monophonique, la levée, la fusion des fragments restent identiques ; le tracker est appelé après la réduction monophonique. Retourne en plus les infos de tempo.
- **`shouldAutoStop`** : la durée de mesure utilisée est celle du tempo suivi courant.
- **`js/metronome.js`** : `stopAt(time)` (plus aucun clic à partir de cet instant, aligné sur une barre) et `nextDownbeatAfter(time)`.
- **`js/recorder.js`** : rappel `onLevel(ctxTime, rms)` par bloc (déjà calculé pour le vumètre).
- **`js/main.js`** :
  - option 1 : `PlayDetector` alimenté pendant l'enregistrement ; dès le début de jeu détecté → `metronome.stopAt(t0 + (barreDébut + 2)·mesure)` (barreDébut = 0 si le jeu commence pendant le décompte ou la 1re moitié de la mesure 1, règle identique à la levée automatique) ;
  - option 2 : dès que l'ABC quantifié contient un événement en mesure 3 → `stopAt(prochaine barre)` ;
  - voyants de pulsation et « Mesure n » : après l'arrêt du clic, ils suivent le tempo suivi (extrapolation du tracker) ;
  - infos : « tempo suivi : ♩ = 92 (88–97) » ; état du clic exposé dans `body.dataset.click` (`on`/`off`) pour les tests.
- **Synthèse abcjs** : tempo de lecture = tempo moyen suivi.

## 4. Langue par URL (`js/i18n.js`, `js/main.js`)
- `?lang=fr|en` dans l'URL : prioritaire sur le choix mémorisé, puis mémorisé.
- Les boutons EN | FR mettent à jour l'adresse (`history.replaceState`, `?lang=xx`) : l'URL affichée est toujours partageable.
- Sans paramètre : choix mémorisé, sinon anglais.
- README (EN + FR) : liens `?lang=en` / `?lang=fr`, et description du nouveau mode tempo.

## Fichiers
Nouveau : `js/tempo.js`. Modifiés : `js/quantize.js`, `js/metronome.js`, `js/recorder.js`, `js/main.js`, `js/i18n.js`, `index.html`, `tests/selftest.html`, `tests/recordtest.html`, `README.md`, `PLAN.md` (ajout v4).

## Vérification
1. **Autotests** (`tests/selftest.html`, Chrome headless) — 28 existants + :
   - reel synthétisé en **accélération** (blanche 90 → 108 sur 8 mesures) : ABC exact avec le suivi, et constat que le mode tempo fixe décale les barres ;
   - **ralentissement** + léger **swing** (55/45) : ABC exact avec le suivi ;
   - cas existants (reel, jig, AABB) rejoués en mode suivi : toujours exacts ;
   - `trackTempo` : tempo final estimé à ±2 % ; `PlayDetector` : bruit + clics brefs → pas de déclenchement, jeu soutenu → déclenchement au bon instant.
2. **recordtest** (faux micro Chrome) : mode par défaut → `data-click` passe à `off` après ~2 mesures de jeu ; option 2 → arrêt plus tardif ; mode continu → clic jusqu'à la fin ; `?lang=fr` force le français et l'URL suit la bascule de langue ; aucune erreur JS.
3. Commit + push sur `main`, contrôle de la version en ligne (`?lang=fr`).
4. Test réel par l'utilisateur : même air joué avec les 3 modes, comparaison des ABC.

---

# Plan v5 (itération 5) — Lecteur toujours visible, curseur de lecture, mode tempo par défaut, ABC en direct, copie vers Writer

## Contexte
Retours après test réel :
1. Le lecteur de l'ABC synthétisé disparaît quand l'ABC est long → il doit rester **visible en haut de l'écran** (PC et smartphone). Choix utilisateur : **lecteur de l'ABC seulement** (le lecteur de l'enregistrement reste à sa place).
2. Pendant une lecture, une **barre verticale** doit montrer la position sur la partition — choix utilisateur : **pour les deux lectures** (ABC synthétisé et enregistrement).
3. Mode tempo par défaut : **« clic arrêté après 2 mesures transcrites »**.
4. Avant l'enregistrement, changer un réglage (type, tonalité, titre…) ne met pas à jour la section ABC.
5. Un ABC copié depuis le site et collé dans LibreOffice Writer arrive **sur une seule ligne**.

## 1. Lecteur ABC collé en haut — `index.html`, `css/style.css`, `js/main.js`
- Nouveau conteneur `#playerBar` (enfant direct de `<body>`, avant l'en-tête), `position: sticky; top: 0; z-index` au-dessus du contenu, fond opaque + ombre légère ; il accueille `#synth` (contrôles abcjs : lecture, retour, boucle, progression, vitesse).
- Masqué tant qu'aucune transcription terminée n'existe ; affiché quand le lecteur abcjs est créé, masqué par `resetOutput()`.
- Sa hauteur est publiée dans la variable CSS `--player-h` (ResizeObserver) : la colonne gauche collante du bureau (`top`) et les ancres en tiennent compte. Sur smartphone : lecteur en haut, barre d'enregistrement toujours fixée en bas.

## 2. Curseur de lecture (barre verticale sur la partition) — `js/cursor.js` (nouveau), `js/main.js`
- Fonction commune `drawCursor(ev)` / `hideCursor()` : une ligne SVG `.abcjs-cursor` ajoutée à la partition (`x = ev.left − 2`, `y = ev.top` → `ev.top + ev.height`), couleur d'accent, visible en clair et sombre. Défilement automatique doux pour garder la ligne courante visible (en tenant compte du lecteur collé en haut).
- **Lecture de l'ABC** : objet `CursorControl` d'abcjs passé à `synthControl.load()` (`onStart`, `onEvent`, `onFinished` → `drawCursor` / `hideCursor`).
- **Lecture de l'enregistrement** : pendant que l'`<audio>` joue, boucle `requestAnimationFrame` : temps du média → temps du contexte (`recorder.firstTime + t`) → latence → position en unités L (via `lastQ.tempo.toUnits` en mode suivi, ou grille fixe + recalage), → position depuis le début de l'air (levée comprise) → millisecondes de la partition au tempo de lecture → dernier événement des `noteTimings` d'abcjs (`ABCJS.TimingCallbacks`) → `drawCursor`. `quantize` expose pour cela l'origine et le décalage déjà calculés.
- Version simplifiée (reprises) : le curseur de l'enregistrement est désactivé (l'ordre joué ne correspond plus à l'écrit) ; celui de la lecture ABC fonctionne (abcjs gère les reprises).

## 3. Mode tempo par défaut — `index.html`, `js/main.js`
- `track-abc` devient l'option sélectionnée par défaut (premier de la liste, libellé inchangé).
- Migration unique : un ancien réglage mémorisé `track-level` (enregistré automatiquement comme défaut précédent) passe à `track-abc` une seule fois (marqueur `audio2abc.settingsVersion = 2`) ; un choix fait ensuite par l'utilisateur est respecté.

## 4. ABC mis à jour en direct avant l'enregistrement — `js/main.js`
- `renderPreview()` : quand aucune transcription n'existe, la zone ABC affiche l'en-tête construit avec `abcHeader()` (`js/abc.js`) à partir des réglages courants (titre ou « Untitled », R: du type, M:, L:, K: imposée ou Dmaj par défaut) et la partition vide est redessinée.
- Appelée à l'initialisation, à chaque changement de réglage sans transcription (`onSettingsChanged`, titre, type, métrique, L:, tonalité) et au changement de langue (titre par défaut traduit).

## 5. Copie compatible Writer — `js/main.js` (fonction pure dans `js/abc.js` pour test)
- `clipboardPayload(abc)` → `{ plain, html }` : texte avec fins de ligne `\r\n`, et HTML avec un paragraphe par ligne (`<p style="margin:0;font-family:monospace">`, caractères échappés).
- Bouton Copier : `navigator.clipboard.write([new ClipboardItem({ 'text/html', 'text/plain' })])` ; repli `writeText(plain)` puis `execCommand('copy')`. Writer utilise la version HTML → une ligne ABC par paragraphe ; les éditeurs de texte reçoivent la version texte.
- Le fichier `.abc` téléchargé reste en `\n` (format standard).

## Fichiers
Nouveau : `js/cursor.js`. Modifiés : `index.html`, `css/style.css`, `js/main.js`, `js/abc.js`, `js/quantize.js` (exposition origine/décalage), `tests/selftest.html`, `tests/recordtest.html`, `README.md` (EN + FR), `PLAN.md` (ajout v5).

## Vérification
1. **Autotests** : 42 existants + `clipboardPayload` (CRLF, un `<p>` par ligne, échappement `<`, `&`) + correspondance temps d'enregistrement → position dans l'air (tempo fixe et suivi).
2. **recordtest** (Chrome headless, faux joueur WAV) : mode par défaut = `track-abc` ; changement de type/tonalité avant enregistrement → en-tête ABC mis à jour ; après transcription : `#playerBar` visible et collé en haut après défilement en bas de page ; lecture de l'enregistrement → ligne `.abcjs-cursor` présente et qui avance ; lecture ABC → ligne présente ; aucune erreur JS.
3. Captures bureau (1440 px) et smartphone (390 px, `tests/mobile-preview.html`) avec un ABC long : lecteur en haut, barre d'enregistrement en bas, pas de chevauchement.
4. Commit + push sur `main`, contrôle de la version en ligne.
5. Test utilisateur : collage dans LibreOffice Writer (lignes séparées), lecture avec curseur sur PC et smartphone.

---

# Plan v6 (itération 6) — Lecteur fixé en bas (proposition A), note en cours en rouge, version des fichiers

- Maquettes comparées localement (`proposals/`, hors git) : A (barre en bas au droit de la partition), B (partition défilante avec lecteur intégré), C (lecteur compact). Choix de l'utilisateur : **A sur PC et sur smartphone**.
- Lecteur de l'ABC synthétisé fixé en bas : aligné sur la colonne de la partition (PC), empilé au-dessus de la barre d'enregistrement (smartphone) ; marges de page et défilement du curseur tiennent compte des barres du bas.
- Pendant la lecture (ABC synthétisé et enregistrement) : barre verticale + **note en cours en rouge**.
- Lecteur absent sur smartphone : cause probable = cache (nouvelle page + ancien script). Correctif : version `?v=…` sur la feuille de style, les modules (import map) et le worklet, à incrémenter à chaque mise en ligne.
