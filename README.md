# Audio → ABC

Page web (PC et Android) qui enregistre un air au micro, joué sur un métronome, et en produit la
transcription ABC en direct, selon les conventions de [thesession.org](https://thesession.org).

**Version en ligne : https://la-bede.github.io/audio-to-abc/**
(autotests : https://la-bede.github.io/audio-to-abc/tests/selftest.html)

La transcription utilise **Basic Pitch** (Spotify), le modèle sur lequel repose
[NeuralNote](https://github.com/DamRsn/NeuralNote). NeuralNote est un plugin C++ qui ne tourne pas
dans un navigateur : la page exécute donc le même modèle avec TensorFlow.js et reprend ses réglages
de détection (sensibilité des notes, sensibilité de séparation, durée minimale, plage de hauteurs).

## Utilisation

1. Choisir le **type d'air**. Cela règle M:, L:, la pulsation et un tempo par défaut. Les types sont
   reel, jig, slip jig, hornpipe, polka, slide, waltz, barndance, strathspey, three-two, mazurka et
   march. Avec **Perso…**, on saisit M: et L: soi-même.
2. Régler le **tempo**, le **décompte** (2 mesures par défaut) et la **levée**. En mode *Auto*, les
   notes jouées dans la dernière mesure du décompte deviennent la levée.
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

### Simplification (reprises et voltas)

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

### Bureau et smartphone

- Sur ordinateur (fenêtre de 1024 px ou plus), la page a deux colonnes : enregistrement et
  réglages à gauche, ABC et partition à droite.
- Sur smartphone :
  - le bouton d'enregistrement et les voyants restent fixés en bas de l'écran ;
  - les réglages se replient automatiquement au démarrage d'un enregistrement ; il suffit de
    toucher « Réglages » pour les rouvrir.

Si les notes tombent systématiquement en avance ou en retard, ajuster *Réglages avancés → Latence
supplémentaire*. Le *recalage automatique* corrige déjà les petits décalages.

## Lancer en local (PC)

Le micro n'est accessible qu'en HTTPS ou sur `localhost`. Les modules ES ne marchent pas en
`file://`, il faut donc un petit serveur :

```
cd Audio_to_ABC
python -m http.server 8000
```

Puis ouvrir http://localhost:8000.

## Tests

- `tests/selftest.html` synthétise un reel (avec levée) et une jig (avec accidents), les fait
  transcrire, puis compare l'ABC obtenu à l'ABC attendu. Aucun micro n'est nécessaire.
- `tests/selftest.html` contient aussi des tests unitaires de la simplification (reprises, voltas
  sur 1, 2, 3→4 et 4 mesures, un seul tour, tolérance) et de l'arrêt automatique, ainsi qu'un reel
  AABB synthétisé qui est transcrit puis simplifié.
- `tests/recordtest.html` pilote la page complète : deux enregistrements successifs, puis le bouton
  Simplifier. Il est prévu pour Chrome lancé avec
  `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`.
- `tests/mobile-preview.html` affiche la page à la taille d'un smartphone (390 × 844).

## Hébergement interne (Android)

Sur Android, il faut une URL HTTPS. Pour garder la page interne, on peut procéder ainsi :

1. Créer un dépôt **privé**, par exemple `la-bede/audio-to-abc`, et y pousser ce dossier. Les
   fichiers `.odt`, `.pdf` et les verrous LibreOffice sont exclus par `.gitignore`.
2. Relier ce dépôt à **Netlify** ou à **Cloudflare Pages**. Il n'y a pas de build : le dossier de
   publication est la racine.
3. Les fichiers `_headers` et `robots.txt` empêchent l'indexation. Pour restreindre l'accès, on peut
   ajouter Cloudflare Access (gratuit, connexion par e-mail) ou la protection par mot de passe de
   Netlify.

GitHub Pages ne permet pas de publier un site privé depuis un compte gratuit.

## Structure

```
index.html              interface
css/style.css           mise en page responsive, thème clair/sombre
js/main.js              orchestration
js/tunetypes.js         types d'airs, pulsations, instruments
js/metronome.js         métronome Web Audio (décompte, accent)
js/recorder.js          micro → AudioWorklet → 22 050 Hz, + MediaRecorder
js/worklet-capture.js   AudioWorkletProcessor
js/transcriber.js       Basic Pitch en fenêtres glissantes + notes incrémentales
js/quantize.js          mélodie, recalage, grille, levée, durées
js/key.js               tonalités thesession, orthographe, détection
js/abc.js               écriture ABC (style thesession) : mesures + mise en page linéaire
js/structure.js         simplification : reprises, voltas, un seul tour
vendor/                 TensorFlow.js, modèle Basic Pitch, abcjs (voir vendor/README.md)
tests/                  autotests
```

## Limites actuelles

Les points suivants sont prévus pour une version ultérieure :

- le suivi du tempo sans métronome ;
- l'import de fichiers audio.

Par ailleurs :

- les ornements (cuts, rolls) sont filtrés par la durée minimale ; les triolets ne sont pas encore
  écrits ;
- sur un téléphone sans WebGL, le moteur passe sur CPU, ce qui est nettement plus lent.
