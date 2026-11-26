# Audio → ABC

[English](#english) · [Français](#français)

**Live version: https://la-bede.github.io/audio-to-abc/**
— in English: https://la-bede.github.io/audio-to-abc/?lang=en
— en français : https://la-bede.github.io/audio-to-abc/?lang=fr
(self-tests: https://la-bede.github.io/audio-to-abc/tests/selftest.html)

---

## English

A web page (desktop and Android) that records a tune played to a metronome through the microphone
and transcribes it to ABC in real time, following the conventions of
[thesession.org](https://thesession.org).

Transcription uses **Basic Pitch** (Spotify), the model behind
[NeuralNote](https://github.com/DamRsn/NeuralNote). NeuralNote is a C++ plugin that cannot run in a
browser, so the page runs the same model with TensorFlow.js and exposes its detection settings
(note sensitivity, split sensitivity, minimum note length, pitch range).

> **Intended use:** one instrument played solo, in a quiet room. So far the tool has only been
> tested with individual instruments. It is not designed for noisy environments (a session in a
> pub, several instruments at once, background conversation).

The interface is in **English by default**. The **EN | FR** switch at the top right changes the
language, and the browser remembers the choice. A link ending in `?lang=fr` (or `?lang=en`) always
opens the page in that language; the address follows the switch, so it can be shared as is.

### Usage

1. Choose the **tune type**. It sets M:, L:, the beat and a default tempo. Types: reel, jig,
   slip jig, hornpipe, polka, slide, waltz, barndance, strathspey, three-two, mazurka and march.
   With **Custom…**, you enter M: and L: yourself.
2. Set the **tempo**, the **count-in** (2 bars by default) and the **pickup**. In *Auto* mode, notes
   played during the last count-in bar become the pickup. Choose the **tempo mode** (see below).
3. **Key**: *Auto* detects it (major, minor, dorian, mixolydian). You can also set it
   (thesession format: Dmajor, Ador…).
4. Click **Record**, then play after the count-in. Headphones are advised; otherwise choose the
   “Count-in only” or “Visual only” click. The ABC updates about every 1.6 s, 2 to 3 s behind.
5. Recording **stops by itself** after 2 bars without notes (configurable: 1, 2, 4 bars or off).
   You can also click **Stop**. The ABC then becomes editable, and you can:
   - play back the recording, or listen to the synthesised ABC;
   - copy the ABC or download it as `.abc`;
   - change the key, pickup, grid or detection thresholds: the ABC is recomputed without
     recording again;
   - click **Simplify (repeats)** (see below);
   - click **New transcription** to record again without reloading the page.

If notes are consistently early or late, adjust *Advanced settings → Extra latency*. *Automatic
alignment* already corrects small offsets.

#### Tempo mode

Keeping to a metronome through a whole tune is hard, and small drifts shift the bar lines. By
default the metronome therefore only gives the start, and the transcription then **follows the
player's tempo**:

- **Follow my tempo — click stops after bar 2** (default): the click stops exactly at the end of
  the 2nd bar (pickup excluded). The start of playing is detected from the microphone level; if you
  start late, bars are counted from where you start.
- **Follow my tempo — click stops after 2 transcribed bars**: the click goes on until the ABC
  contains 2 complete bars, then stops at the next bar line (about 1 to 2 extra bars of click,
  because of the analysis lag).
- **Continuous metronome, fixed tempo**: the click goes on until the end and the grid stays fixed.

Tempo following uses a phase-locked loop on the note onsets found by Basic Pitch (slurred notes
included), starting from the metronome's tempo and phase. The tempo followed is shown under the ABC
(for example “half note = 92 (88–97)”). After recording, switching the mode recomputes the ABC of
the same recording, so both can be compared.

#### Simplification (repeats and voltas)

The **Simplify (repeats)** button rewrites the ABC following thesession.org conventions:

- Two consecutive identical blocks of bars become a repeat `|: … :|`.
- If only the endings differ, voltas `|1 … :|2 … ||` are used:
  - on the last bar;
  - on the last 2 bars;
  - on the last 4 bars, including when the difference covers only 3 bars.
- The part length (8, 16 or 4 bars) is chosen automatically: the one that shortens the ABC most.
- If the whole tune was played several times (AABB AABB), only one round is kept.
- The **Tolerance** box accepts one differing bar (outside part endings); the first occurrence is
  then written.

The **Linear version** button returns to the original layout.

#### Desktop and smartphone

- On a computer (window 1024 px wide or more), the page has two columns: recording and settings on
  the left, ABC and score on the right.
- On a smartphone:
  - the record button and beat lights stay fixed at the bottom of the screen;
  - settings fold away automatically when recording starts; tap “Settings” to open them again.

### Running locally (PC)

The microphone is only available over HTTPS or on `localhost`. ES modules do not work from
`file://`, so a small server is needed:

```
cd Audio_to_ABC
python -m http.server 8000
```

Then open http://localhost:8000.

### Tests

- `tests/selftest.html`:
  - unit tests of the simplification (repeats; voltas on 1, 2, 3→4 and 4 bars; one round;
    tolerance; summaries in English and French) and of the automatic stop;
  - synthesised tunes transcribed and compared with the expected ABC: a reel with a pickup, a jig
    with accidentals, and an AABB reel that is then simplified, each in both tempo modes; plus a
    reel that speeds up (half note 90 → 108) and one that slows down with swing, which only tempo
    following transcribes correctly. No microphone needed.
- `tests/recordtest.html` drives the full page: default language, EN/FR switch remembered after a
  reload, two successive recordings, then the Simplify button. Meant for Chrome started with
  `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`.
- `tests/mobile-preview.html` shows the page at smartphone size (390 × 844).

### Hosting

The page is published with **GitHub Pages** from the `main` branch (root folder); every push
updates https://la-bede.github.io/audio-to-abc/. It is not indexed by search engines (`noindex`,
`robots.txt`), but anyone with the link can open it.

For private hosting instead: a private repository linked to **Netlify** or **Cloudflare Pages**
(no build step, publish folder = root; the `_headers` file is read by both). GitHub Pages cannot
publish a private repository on a free account.

### Structure

```
index.html              interface
css/style.css           responsive layout, light/dark theme
js/main.js              orchestration
js/i18n.js              English / French texts, remembered language
js/tunetypes.js         tune types, beats, instruments
js/metronome.js         Web Audio metronome (count-in, accent)
js/recorder.js          microphone → AudioWorklet → 22,050 Hz, + MediaRecorder
js/worklet-capture.js   AudioWorkletProcessor
js/transcriber.js       Basic Pitch on sliding windows + incremental notes
js/quantize.js          melody, alignment, grid, pickup, durations, automatic stop
js/tempo.js             tempo following (phase-locked loop) and start-of-playing detection
js/key.js               thesession keys, spelling, detection
js/abc.js               ABC writing (thesession style): bars + linear layout
js/structure.js         simplification: repeats, voltas, one round
vendor/                 TensorFlow.js, Basic Pitch model, abcjs (see vendor/README.md)
tests/                  self-tests
```

### Current limitations

Planned for a later version:

- tempo following without any count-in (the starting tempo still comes from the metronome);
- audio file import.

Also:

- ornaments (cuts, rolls) are filtered out by the minimum note length; triplets are not written
  yet;
- on a phone without WebGL, the engine falls back to the CPU, which is much slower.

---

## Français

Page web (PC et Android) qui enregistre un air au micro, joué sur un métronome, et en produit la
transcription ABC en direct, selon les conventions de [thesession.org](https://thesession.org).

La transcription utilise **Basic Pitch** (Spotify), le modèle sur lequel repose
[NeuralNote](https://github.com/DamRsn/NeuralNote). NeuralNote est un plugin C++ qui ne tourne pas
dans un navigateur : la page exécute donc le même modèle avec TensorFlow.js et reprend ses réglages
de détection (sensibilité des notes, sensibilité de séparation, durée minimale, plage de hauteurs).

> **Usage prévu :** un seul instrument joué en solo, dans une pièce calme. L'outil n'a été testé
> pour l'instant qu'avec des instruments individuels. Il n'est pas conçu pour un environnement
> bruyant (session dans un pub, plusieurs instruments à la fois, conversations autour).

L'interface est **en anglais par défaut**. Le sélecteur **EN | FR** en haut à droite change la
langue, et le navigateur retient le choix. Un lien qui se termine par `?lang=fr` (ou `?lang=en`)
ouvre toujours la page dans cette langue ; l'adresse suit le sélecteur, on peut donc la partager
telle quelle.

### Utilisation

1. Choisir le **type d'air**. Cela règle M:, L:, la pulsation et un tempo par défaut. Les types sont
   reel, jig, slip jig, hornpipe, polka, slide, waltz, barndance, strathspey, three-two, mazurka et
   march. Avec **Perso…**, on saisit M: et L: soi-même.
2. Régler le **tempo**, le **décompte** (2 mesures par défaut) et la **levée**. En mode *Auto*, les
   notes jouées dans la dernière mesure du décompte deviennent la levée. Choisir le **mode tempo**
   (voir ci-dessous).
3. **Tonalité** : *Auto* la détecte (majeur, mineur, dorien, mixolydien). On peut aussi en imposer
   une (format thesession : Dmajor, Ador…).
4. **Enregistrer**, puis jouer après le décompte. Un casque est conseillé, sinon choisir le clic
   « Décompte seulement » ou « Visuel seulement ». L'ABC se met à jour environ toutes les 1,6 s, avec
   2 à 3 s de retard.
5. L'enregistrement **s'arrête tout seul** après 2 mesures sans note (réglable : 1, 2, 4 mesures
   ou désactivé). On peut aussi cliquer sur **Arrêter**. L'ABC devient alors modifiable, et on peut :
   - réécouter l'enregistrement, ou écouter l'ABC synthétisé ;
   - copier l'ABC ou le télécharger en `.abc` ;
   - changer la tonalité, la levée, la grille ou les seuils de détection, et l'ABC est recalculé
     sans réenregistrer ;
   - cliquer sur **Simplifier (reprises)** (voir ci-dessous) ;
   - cliquer sur **Nouvelle transcription** pour enchaîner un autre enregistrement, sans recharger
     la page.

Si les notes tombent systématiquement en avance ou en retard, ajuster *Réglages avancés → Latence
supplémentaire*. Le *recalage automatique* corrige déjà les petits décalages.

#### Mode tempo

Suivre un métronome sur tout un air est difficile, et les petites dérives décalent les barres de
mesure. Par défaut, le métronome ne donne donc que le départ, puis la transcription **suit le tempo
de l'interprète** :

- **Suivre mon tempo — clic arrêté après la mesure 2** (défaut) : le clic s'arrête pile à la fin de
  la 2e mesure (hors levée). Le début de jeu est détecté d'après le niveau du micro ; si on commence
  en retard, les mesures sont comptées à partir du début de jeu.
- **Suivre mon tempo — clic arrêté après 2 mesures transcrites** : le clic continue jusqu'à ce que
  l'ABC contienne 2 mesures complètes, puis s'arrête à la barre suivante (environ 1 à 2 mesures de
  clic en plus, à cause du retard d'analyse).
- **Métronome continu, tempo fixe** : le clic continue jusqu'à la fin et la grille reste fixe.

Le suivi du tempo est une boucle à verrouillage de phase sur les débuts de note trouvés par Basic
Pitch (notes liées comprises), qui part du tempo et de la phase du métronome. Le tempo suivi
s'affiche sous l'ABC (par exemple « blanche = 92 (88–97) »). Après l'enregistrement, changer de
mode recalcule l'ABC du même enregistrement, ce qui permet de comparer.

#### Simplification (reprises et voltas)

Le bouton **Simplifier (reprises)** réécrit l'ABC selon les conventions de thesession.org :

- Deux blocs consécutifs de mesures identiques donnent une reprise `|: … :|`.
- Si seules les fins diffèrent, on utilise des voltas `|1 … :|2 … ||` :
  - sur la dernière mesure ;
  - sur les 2 dernières ;
  - sur les 4 dernières, y compris quand la différence ne porte que sur 3 mesures.
- La longueur des parties (8, 16 ou 4 mesures) est choisie automatiquement : c'est celle qui
  raccourcit le plus l'ABC.
- Si l'air entier a été joué plusieurs fois (AABB AABB), un seul tour est conservé.
- La case **Tolérance** accepte une mesure différente (hors fins de partie) ; c'est alors la
  version de la première occurrence qui est écrite.

Le bouton **Version linéaire** revient à l'écriture d'origine.

#### Bureau et smartphone

- Sur ordinateur (fenêtre de 1024 px ou plus), la page a deux colonnes : enregistrement et
  réglages à gauche, ABC et partition à droite.
- Sur smartphone :
  - le bouton d'enregistrement et les voyants restent fixés en bas de l'écran ;
  - les réglages se replient automatiquement au démarrage d'un enregistrement ; il suffit de
    toucher « Réglages » pour les rouvrir.

### Lancer en local (PC)

Le micro n'est accessible qu'en HTTPS ou sur `localhost`. Les modules ES ne marchent pas en
`file://`, il faut donc un petit serveur :

```
cd Audio_to_ABC
python -m http.server 8000
```

Puis ouvrir http://localhost:8000.

### Tests

- `tests/selftest.html` :
  - tests unitaires de la simplification (reprises ; voltas sur 1, 2, 3→4 et 4 mesures ; un seul
    tour ; tolérance ; résumés en anglais et en français) et de l'arrêt automatique ;
  - airs synthétisés, transcrits puis comparés à l'ABC attendu : un reel avec levée, une jig avec
    accidents, et un reel AABB qui est ensuite simplifié, chacun dans les deux modes tempo ; plus un
    reel qui accélère (blanche 90 → 108) et un qui ralentit avec du swing, que seul le suivi du tempo
    transcrit correctement. Aucun micro n'est nécessaire.
- `tests/recordtest.html` pilote la page complète : langue par défaut, bascule EN/FR retenue après
  rechargement, deux enregistrements successifs, puis le bouton Simplifier. Il est prévu pour Chrome
  lancé avec `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`.
- `tests/mobile-preview.html` affiche la page à la taille d'un smartphone (390 × 844).

### Hébergement

La page est publiée avec **GitHub Pages** depuis la branche `main` (dossier racine) ; chaque envoi
met à jour https://la-bede.github.io/audio-to-abc/. Elle n'est pas indexée par les moteurs de
recherche (`noindex`, `robots.txt`), mais toute personne qui a le lien peut l'ouvrir.

Pour un hébergement privé à la place : un dépôt privé relié à **Netlify** ou **Cloudflare Pages**
(pas de build, dossier de publication = racine ; le fichier `_headers` est lu par les deux). GitHub
Pages ne publie pas un dépôt privé depuis un compte gratuit.

### Structure

```
index.html              interface
css/style.css           mise en page responsive, thème clair/sombre
js/main.js              orchestration
js/i18n.js              textes anglais / français, langue mémorisée
js/tunetypes.js         types d'airs, pulsations, instruments
js/metronome.js         métronome Web Audio (décompte, accent)
js/recorder.js          micro → AudioWorklet → 22 050 Hz, + MediaRecorder
js/worklet-capture.js   AudioWorkletProcessor
js/transcriber.js       Basic Pitch en fenêtres glissantes + notes incrémentales
js/quantize.js          mélodie, recalage, grille, levée, durées, arrêt automatique
js/tempo.js             suivi du tempo (boucle à verrouillage de phase), détection du début de jeu
js/key.js               tonalités thesession, orthographe, détection
js/abc.js               écriture ABC (style thesession) : mesures + mise en page linéaire
js/structure.js         simplification : reprises, voltas, un seul tour
vendor/                 TensorFlow.js, modèle Basic Pitch, abcjs (voir vendor/README.md)
tests/                  autotests
```

### Limites actuelles

Les points suivants sont prévus pour une version ultérieure :

- le suivi du tempo sans aucun décompte (le tempo de départ vient toujours du métronome) ;
- l'import de fichiers audio.

Par ailleurs :

- les ornements (cuts, rolls) sont filtrés par la durée minimale ; les triolets ne sont pas encore
  écrits ;
- sur un téléphone sans WebGL, le moteur passe sur CPU, ce qui est nettement plus lent.
