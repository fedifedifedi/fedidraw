import { capitalize, className } from '../i18n';
import { assetUrl, type ClassInfo, type Labels } from '../labels';
import type { Recognizer } from '../recognizer';
import { onStateChange, state, type Lang } from '../state';
import { attachTooltip, classDots, confusionMatrix, dotPlot, legendHtml, lineChart, responsive } from '../ui/charts';

/** public/model/metrics.json, written by training/evaluate.py. */
interface Metrics {
  model: { parameters: number; epochs: number; best_epoch: number; train_minutes: number };
  test: { samples: number; top1: number; top5: number };
  per_class: Array<{ id: string; accuracy: number }>;
  confusion_matrix: number[][];
  top_confusions: Array<{ true: string; predicted: string; percent: number }>;
  augmentation_comparison: Record<'aug' | 'noaug', { test_clean: { top1: number }; test_perturbed: { top1: number } }>;
  history: Array<{ epoch: number; train_acc: number; val_top1: number }>;
}

const CHART_1 = 'var(--chart-1)';
const CHART_2 = 'var(--chart-2)';

function copy(lang: Lang) {
  const fr = lang === 'fr';
  return {
    title: fr ? 'Comment ça marche' : 'How it works',
    lead: fr
      ? 'Un petit réseau de neurones, entraîné sur 300 000 dessins, qui tourne entièrement dans ton navigateur. Rien de ce que tu dessines ne quitte ton appareil.'
      : 'A small neural network, trained on 300,000 doodles, running entirely in your browser. Nothing you draw ever leaves your device.',
    journey: fr ? 'Le voyage d’un dessin' : 'The journey of a doodle',
    steps: fr
      ? [
          ['Tes traits', 'La feuille enregistre chaque trait comme une suite de points, pas comme une image.'],
          ['Le format Quick Draw', 'Comme dans le jeu de données de Google : le dessin est recadré, mis à l’échelle, simplifié, puis redessiné au centre d’une image de 28 × 28 avec un trait de 6 % de sa taille.'],
          ['Le réseau regarde', 'Trois couches de convolution repèrent d’abord des bouts de traits, puis des coins et des courbes, puis des formes entières.'],
          ['30 probabilités', 'Un score par classe. Les plus hauts deviennent ma réponse, mes hésitations… ou mes doutes.'],
        ]
      : [
          ['Your strokes', 'The sheet records each stroke as a list of points, not as an image.'],
          ['The Quick Draw format', 'Just like Google’s dataset: the drawing is cropped, scaled, simplified, then redrawn in the middle of a 28 × 28 image with a pen 6% of its size.'],
          ['The network looks', 'Three convolution layers first spot bits of strokes, then corners and curves, then whole shapes.'],
          ['30 probabilities', 'One score per class. The highest ones become my answer, my hesitations… or my doubts.'],
        ],
    archTitle: fr ? 'Dans le réseau' : 'Inside the network',
    archLead: fr
      ? 'Un réseau de neurones convolutif (CNN). Chaque bloc applique 3 × 3 filtres appris, garde ce qui s’allume (ReLU), puis divise l’image par deux (max-pooling) : elle rapetisse, mais gagne en « profondeur ».'
      : 'A convolutional neural network (CNN). Each block applies learned 3 × 3 filters, keeps what lights up (ReLU), then halves the image (max-pooling): it gets smaller but “deeper”.',
    layers: fr
      ? ['Ton dessin', 'Bloc 1', 'Bloc 2', 'Bloc 3', 'Couche dense', 'Sortie']
      : ['Your drawing', 'Block 1', 'Block 2', 'Block 3', 'Dense layer', 'Output'],
    layerNotes: fr
      ? ['pixels de 0 à 1', '32 filtres', '64 filtres', '128 filtres', 'dropout 30 % puis 50 %', 'softmax · 30 classes']
      : ['pixels from 0 to 1', '32 filters', '64 filters', '128 filters', 'dropout 30% then 50%', 'softmax · 30 classes'],
    facts: fr ? ['paramètres', 'taille du modèle', 'par dessin sur cet appareil', 'd’entraînement sur un processeur'] : ['parameters', 'model size', 'per drawing on this device', 'of training on a CPU'],
    numbers: fr ? 'Les chiffres' : 'The numbers',
    tiles: fr
      ? [['bonne réponse du premier coup'], ['bonne réponse dans mes 5 idées'], ['classes'], ['dessins : 80 % pour apprendre, 10 % pour régler, 10 % pour le test']]
      : [['right on the first guess'], ['right answer in my top 5'], ['classes'], ['drawings: 80% to learn, 10% to tune, 10% to test']],
    testNote: (n: string) => (fr ? `Mesuré sur ${n} dessins de test que le modèle n’a jamais vus.` : `Measured on ${n} test drawings the model never saw.`),
    curvesTitle: fr ? 'Courbes d’apprentissage' : 'Learning curves',
    curvesNote: fr
      ? 'Précision à chaque époque (un passage complet sur les données). La précision d’entraînement est mesurée sur des dessins déformés, plus difficiles : elle reste donc sous celle de validation.'
      : 'Accuracy after each epoch (one full pass over the data). Training accuracy is measured on distorted drawings, which are harder, so it stays below validation.',
    train: fr ? 'entraînement' : 'training',
    validation: 'validation',
    epoch: fr ? 'époque' : 'epoch',
    augTitle: fr ? 'Pourquoi déformer les dessins ?' : 'Why distort the drawings?',
    augText: (cost: string, gain: string) =>
      fr
        ? `Pendant l’entraînement, les dessins ont été légèrement tournés (±10°), agrandis ou étirés (±10 %) et décalés (±1 px), parce que les vrais dessins faits à la souris ou au doigt sont moins réguliers que ceux de Quick Draw. Sur le test normal, ça coûte ${cost} ; sur une copie volontairement déformée du test, ça évite d’en perdre ${gain}.`
        : `During training, drawings were slightly rotated (±10°), scaled or stretched (±10%) and shifted (±1 px), because real drawings made with a mouse or a finger are less tidy than Quick Draw’s. On the normal test set this costs ${cost}; on a deliberately distorted copy of it, it avoids losing ${gain}.`,
    augCaveat: fr
      ? 'Nuance honnête : le test déformé utilise le même genre de déformations que l’entraînement, ce qui avantage le modèle augmenté. Le vrai test, ce sont tes dessins.'
      : 'Fair warning: the distorted test uses the same kind of distortions as training, which favours the augmented model. The real test is your drawings.',
    points: (text: string, value: number) => `${text} ${fr ? (value < 2 ? 'point' : 'points') : value === 1 ? 'point' : 'points'}`,
    withAug: fr ? 'avec augmentation (ce modèle)' : 'with augmentation (this model)',
    withoutAug: fr ? 'sans augmentation' : 'without augmentation',
    cleanTest: fr ? 'Test normal' : 'Normal test',
    distortedTest: fr ? 'Test déformé' : 'Distorted test',
    accuracy: fr ? 'précision top-1' : 'top-1 accuracy',
    perClassTitle: fr ? 'Précision par classe' : 'Accuracy per class',
    confusionTitle: fr ? 'Ce qui me trompe' : 'What confuses me',
    confusionLead: fr
      ? 'Chaque ligne est la vraie classe, chaque colonne ce que j’ai répondu. La diagonale, ce sont mes bonnes réponses ; ailleurs, plus une case est foncée, plus je fais souvent cette erreur. Survole une case pour le détail.'
      : 'Each row is the true class, each column what I answered. The diagonal holds my right answers; elsewhere, the darker a square, the more often I make that mistake. Hover over a square for details.',
    legendRight: fr ? 'bonne réponse' : 'right answer',
    legendWrong: (cap: number) => (fr ? `erreur, de 0 à ${cap} % de la ligne et plus` : `mistake, from 0 to ${cap}% of the row and above`),
    cellTip: (t: string, p: string, pct: string, count: string, total: string) =>
      fr
        ? `<strong>${t} → ${p}</strong><span>${pct} des ${total} dessins de ${t.toLowerCase()} (${count})</span>`
        : `<strong>${t} → ${p}</strong><span>${pct} of the ${total} ${t.toLowerCase()} drawings (${count})</span>`,
    topConfusions: fr ? 'Mes confusions les plus fréquentes' : 'My most frequent mix-ups',
    tableSummary: fr ? 'Voir les chiffres en tableau' : 'See the numbers as a table',
    tableHead: fr ? ['Classe', 'Précision', 'Confondue le plus souvent avec'] : ['Class', 'Accuracy', 'Most often mistaken for'],
    limitsTitle: fr ? 'Mes limites' : 'My limits',
    limits: fr
      ? [
          'Je ne connais que 30 choses. Dessine un dragon, et je choisirai quand même une de mes 30 classes.',
          'Certaines formes se ressemblent : une lune en croissant et une banane, une clé et une guitare, un champignon et un parapluie.',
          'Je vois ton dessin en 28 × 28 pixels : les petits détails disparaissent.',
          'J’ai appris avec les dessins de Quick Draw, faits en moins de 20 secondes par des gens du monde entier. Un style très différent peut me surprendre.',
          'La couleur, le remplissage et l’ordre des traits ne comptent pas : je ne vois que la forme.',
          'Je n’apprends pas de tes dessins : rien n’est enregistré ni envoyé.',
        ]
      : [
          'I only know 30 things. Draw a dragon and I will still pick one of my 30 classes.',
          'Some shapes look alike: a crescent moon and a banana, a key and a guitar, a mushroom and an umbrella.',
          'I see your drawing at 28 × 28 pixels: small details disappear.',
          'I learned from Quick Draw doodles, drawn in under 20 seconds by people all over the world. A very different style can surprise me.',
          'Colour, fill and stroke order don’t matter: I only see the shape.',
          'I don’t learn from your drawings: nothing is stored or sent.',
        ],
    creditsTitle: fr ? 'Crédits' : 'Credits',
    credits: fr
      ? 'Données : jeu de données <a href="https://github.com/googlecreativelab/quickdraw-dataset">Quick, Draw!</a> de Google (CC BY 4.0). Inférence : <a href="https://onnxruntime.ai/">ONNX Runtime Web</a>. Polices : Gochi Hand et Bricolage Grotesque (SIL Open Font License).'
      : 'Data: Google’s <a href="https://github.com/googlecreativelab/quickdraw-dataset">Quick, Draw!</a> dataset (CC BY 4.0). Inference: <a href="https://onnxruntime.ai/">ONNX Runtime Web</a>. Fonts: Gochi Hand and Bricolage Grotesque (SIL Open Font License).',
    measuring: fr ? 'mesure…' : 'measuring…',
    minutes: (m: string) => `${m} min`,
  };
}

/** Feature-map stack: `layers` offset squares of side `side` px. */
function stackSvg(side: number, layers: number, highlight: boolean): string {
  const step = 5, pad = 2;
  const size = side + step * (layers - 1) + pad * 2;
  const squares = Array.from({ length: layers }, (_, i) => {
    const o = step * (layers - 1 - i);
    const front = i === layers - 1;
    return `<rect x="${pad + o}" y="${pad + step * i}" width="${side}" height="${side}" rx="2" class="${front && highlight ? 'front hi' : front ? 'front' : 'back'}" />`;
  }).join('');
  return `<svg class="arch-stack" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">${squares}</svg>`;
}

function denseSvg(units: number, height: number): string {
  const dots = Math.min(9, Math.round(height / 9));
  const circles = Array.from({ length: dots }, (_, i) => `<circle cx="10" cy="${8 + (i * (height - 16)) / Math.max(1, dots - 1)}" r="3.2" />`).join('');
  return `<svg class="arch-stack dense" width="20" height="${height}" viewBox="0 0 20 ${height}" aria-hidden="true" data-units="${units}"><rect x="1" y="1" width="18" height="${height - 2}" rx="9" />${circles}</svg>`;
}

const ARCH = [
  { shape: '28 × 28 × 1', svg: stackSvg(72, 1, false) },
  { shape: '14 × 14 × 32', svg: stackSvg(46, 4, true) },
  { shape: '7 × 7 × 64', svg: stackSvg(28, 6, true) },
  { shape: '3 × 3 × 128', svg: stackSvg(16, 8, true) },
  { shape: '256', svg: denseSvg(256, 84) },
  { shape: '30', svg: denseSvg(30, 46) },
];

const TEMPLATE = `
  <header class="how-hero">
    <h1 class="how-title" data-c="title"></h1>
    <p class="how-lead" data-c="lead"></p>
  </header>

  <section class="how-section">
    <h2 class="section-title" data-c="journey"></h2>
    <ol class="journey"></ol>
  </section>

  <section class="how-section">
    <h2 class="section-title" data-c="archTitle"></h2>
    <p class="how-text" data-c="archLead"></p>
    <ol class="arch"></ol>
    <dl class="facts"></dl>
  </section>

  <section class="how-section">
    <h2 class="section-title" data-c="numbers"></h2>
    <div class="tiles"></div>
    <p class="how-note test-note"></p>
    <div class="how-grid">
      <figure class="how-card">
        <figcaption><h3 data-c="curvesTitle"></h3><p data-c="curvesNote"></p></figcaption>
        <div class="legend-slot curves-legend"></div>
        <div class="chart curves"></div>
      </figure>
      <figure class="how-card">
        <figcaption><h3 data-c="augTitle"></h3><p class="aug-text"></p></figcaption>
        <div class="legend-slot aug-legend"></div>
        <div class="chart aug"></div>
        <p class="how-note caveat" data-c="augCaveat"></p>
      </figure>
    </div>
  </section>

  <section class="how-section">
    <div class="how-grid confusion-grid">
      <figure class="how-card">
        <figcaption><h3 data-c="perClassTitle"></h3></figcaption>
        <div class="chart per-class"></div>
      </figure>
      <figure class="how-card matrix-card">
        <figcaption><h3 data-c="confusionTitle"></h3><p data-c="confusionLead"></p></figcaption>
        <div class="matrix-legend"></div>
        <div class="matrix-scroll"><div class="chart matrix"></div></div>
        <h4 data-c="topConfusions"></h4>
        <ol class="top-confusions"></ol>
        <details class="data-table">
          <summary data-c="tableSummary"></summary>
          <table><thead><tr></tr></thead><tbody></tbody></table>
        </details>
      </figure>
    </div>
  </section>

  <section class="how-section how-columns">
    <div>
      <h2 class="section-title" data-c="limitsTitle"></h2>
      <ul class="limits"></ul>
    </div>
    <div>
      <h2 class="section-title" data-c="creditsTitle"></h2>
      <p class="how-text credits"></p>
    </div>
  </section>`;

const MATRIX_CAP = 10;

export function createHowPage(labels: Labels, recognizer: Recognizer) {
  const element = document.createElement('div');
  element.className = 'how';
  element.innerHTML = TEMPLATE;
  const $ = <T extends Element = HTMLElement>(s: string) => element.querySelector<T>(s)! as T;

  let metrics: Metrics | null = null;
  let modelKb: number | null = null;
  let inferenceMs: number | null = null;
  let measured = false;
  const redraws: Array<() => void> = [];

  const fmt = (v: number, digits = 1) => new Intl.NumberFormat(state.lang, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v);
  const pct = (v: number, digits = 1) => (state.lang === 'fr' ? `${fmt(v, digits)} %` : `${fmt(v, digits)}%`);
  // French groups digits with a narrow no-break space, missing from the handwritten font: use a regular one.
  const int = (v: number) => new Intl.NumberFormat(state.lang).format(v).replace(/ /g, ' ');
  const name = (info: ClassInfo) => capitalize(className(info));
  const byId = (id: string) => labels.classes.find((c) => c.id === id)!;

  function renderStatic(): void {
    const c = copy(state.lang);
    element.querySelectorAll<HTMLElement>('[data-c]').forEach((el) => {
      el.textContent = c[el.dataset.c as keyof typeof c] as string;
    });
    $('.journey').innerHTML = c.steps
      .map(([title, text], i) => `<li class="journey-step"><span class="journey-num">${i + 1}</span><h3>${title}</h3><p>${text}</p></li>`)
      .join('');
    $('.arch').innerHTML = ARCH.map(
      (a, i) => `<li class="arch-step">${a.svg}<strong>${c.layers[i]}</strong><span class="shape">${a.shape}</span><span class="note">${c.layerNotes[i]}</span></li>`,
    ).join('');
    $('.limits').innerHTML = c.limits.map((l) => `<li>${l}</li>`).join('');
    $('.credits').innerHTML = c.credits;
  }

  function renderNumbers(): void {
    if (!metrics) return;
    const c = copy(state.lang);
    const m = metrics;

    $('.facts').innerHTML = [
      [int(m.model.parameters), c.facts[0]],
      [modelKb ? `${fmt(modelKb / 1024, 1)} ${state.lang === 'fr' ? 'Mo' : 'MB'}` : '—', c.facts[1]],
      [inferenceMs !== null ? `≈ ${fmt(inferenceMs, inferenceMs < 10 ? 1 : 0)} ms` : c.measuring, c.facts[2]],
      [c.minutes(fmt(m.model.train_minutes, 0)), c.facts[3]],
    ]
      .map(([v, l]) => `<div><dt>${v}</dt><dd>${l}</dd></div>`)
      .join('');

    $('.tiles').innerHTML = [
      [pct(m.test.top1 * 100), 'Top-1', c.tiles[0][0]],
      [pct(m.test.top5 * 100), 'Top-5', c.tiles[1][0]],
      [String(labels.classes.length), '', c.tiles[2][0]],
      [int(300000), '', c.tiles[3][0]],
    ]
      .map(([v, k, l]) => `<div class="tile"><span class="tile-value">${v}</span>${k ? `<span class="tile-key">${k}</span>` : ''}<span class="tile-label">${l}</span></div>`)
      .join('');
    $('.test-note').textContent = c.testNote(int(m.test.samples));

    const aug = m.augmentation_comparison;
    const cost = (aug.noaug.test_clean.top1 - aug.aug.test_clean.top1) * 100;
    const gain = (aug.aug.test_perturbed.top1 - aug.noaug.test_perturbed.top1) * 100;
    $('.aug-text').textContent = c.augText(c.points(fmt(cost), cost), c.points(fmt(gain), gain));

    $('.curves-legend').innerHTML = legendHtml([{ name: c.validation, color: CHART_1 }, { name: c.train, color: CHART_2 }]);
    $('.aug-legend').innerHTML = legendHtml([{ name: c.withAug, color: CHART_1 }, { name: c.withoutAug, color: CHART_2 }]);
    $('.matrix-legend').innerHTML = `<span><i class="sw right"></i>${c.legendRight}</span><span><i class="sw ramp"></i>${c.legendWrong(MATRIX_CAP)}</span>`;

    $('.top-confusions').innerHTML = m.top_confusions
      .slice(0, 6)
      .map((tc) => `<li><span>${name(byId(tc.true))} → ${name(byId(tc.predicted))}</span><b>${pct(tc.percent)}</b></li>`)
      .join('');

    const head = c.tableHead.map((h) => `<th scope="col">${h}</th>`).join('');
    $('.data-table thead tr').innerHTML = head;
    $('.data-table tbody').innerHTML = labels.classes
      .map((info, i) => {
        const row = m.confusion_matrix[i];
        let worst = -1;
        row.forEach((v, j) => {
          if (j !== i && (worst < 0 || v > row[worst])) worst = j;
        });
        const total = row.reduce((s, v) => s + v, 0);
        return {
          label: name(info),
          html: `<tr><th scope="row">${name(info)}</th><td>${pct(m.per_class[i].accuracy * 100)}</td><td>${name(labels.classes[worst])} (${pct((row[worst] / total) * 100)})</td></tr>`,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label, state.lang))
      .map((r) => r.html)
      .join('');

    redraws.forEach((r) => r());
  }

  // Charts: drawn at the real width, re-drawn on resize, language or theme change.
  const curvesBox = $('.chart.curves');
  const curvesTip = attachTooltip(curvesBox);
  redraws.push(
    responsive(curvesBox, (w) => {
      if (!metrics) return;
      const c = copy(state.lang);
      const h = metrics.history;
      lineChart(curvesBox, curvesTip, {
        series: [
          { name: c.validation, color: CHART_1, values: h.map((e) => e.val_top1 * 100) },
          { name: c.train, color: CHART_2, values: h.map((e) => e.train_acc * 100) },
        ],
        xLabels: h.map((e) => String(e.epoch)),
        xTitle: c.epoch,
        yMin: 60,
        yMax: 100,
        yTicks: [60, 70, 80, 90, 100],
        format: (v) => pct(v, v % 1 === 0 ? 0 : 1),
        ariaLabel: c.curvesTitle,
      }, w);
    }),
  );

  const augBox = $('.chart.aug');
  const augTip = attachTooltip(augBox);
  redraws.push(
    responsive(augBox, (w) => {
      if (!metrics) return;
      const c = copy(state.lang);
      const a = metrics.augmentation_comparison;
      const row = (label: string, key: 'test_clean' | 'test_perturbed') => ({
        label,
        values: [
          { series: c.withAug, color: CHART_1, value: a.aug[key].top1 * 100 },
          { series: c.withoutAug, color: CHART_2, value: a.noaug[key].top1 * 100 },
        ],
      });
      dotPlot(augBox, augTip, [row(c.cleanTest, 'test_clean'), row(c.distortedTest, 'test_perturbed')], (v) => pct(v, v % 1 === 0 ? 0 : 1), c.accuracy, c.augTitle, w);
    }),
  );

  const classBox = $('.chart.per-class');
  const classTip = attachTooltip(classBox);
  redraws.push(
    responsive(classBox, (w) => {
      if (!metrics) return;
      const c = copy(state.lang);
      const items = metrics.per_class.map((p) => ({ label: name(byId(p.id)), value: p.accuracy * 100 }));
      classDots(classBox, classTip, items, CHART_1, (v) => pct(v, v % 1 === 0 ? 0 : 1), c.accuracy, c.perClassTitle, w);
    }),
  );

  const matrixBox = $('.chart.matrix');
  const matrixTip = attachTooltip($('.matrix-card'));
  redraws.push(
    responsive($('.matrix-scroll'), (w) => {
      if (!metrics) return;
      const c = copy(state.lang);
      const order = labels.classes.map((_, i) => i).sort((a, b) => name(labels.classes[a]).localeCompare(name(labels.classes[b]), state.lang));
      const counts = order.map((r) => order.map((col) => metrics!.confusion_matrix[r][col]));
      const names = order.map((i) => name(labels.classes[i]));
      confusionMatrix(matrixBox, matrixTip, {
        labels: names,
        counts,
        cap: MATRIX_CAP,
        tip: (r, col, p, count, total) => c.cellTip(names[r], names[col], pct(p), int(count), int(total)),
        ariaLabel: `${c.confusionTitle}. ${c.topConfusions}: ${metrics.top_confusions
          .slice(0, 3)
          .map((tc) => `${name(byId(tc.true))} → ${name(byId(tc.predicted))} ${pct(tc.percent)}`)
          .join(', ')}`,
      }, w);
    }),
  );

  async function load(): Promise<void> {
    const [m, head] = await Promise.all([
      fetch(assetUrl('model/metrics.json')).then((r) => r.json() as Promise<Metrics>),
      fetch(assetUrl(`model/${labels.model}`), { method: 'HEAD' }).catch(() => null),
    ]);
    metrics = m;
    const length = Number(head?.headers.get('content-length'));
    modelKb = length > 0 ? length / 1024 : null;
    renderNumbers();
  }

  /** Times the real model on this device (median of a few runs, inference only). */
  async function measure(): Promise<void> {
    if (measured) return;
    measured = true;
    try {
      await recognizer.ready;
      const times: number[] = [];
      for (let i = 0; i < 12; i++) {
        const p = await recognizer.predict(new Float32Array(28 * 28));
        if (p) times.push(p.ms);
      }
      times.sort((a, b) => a - b);
      inferenceMs = times[Math.floor(times.length / 2)] ?? null;
      renderNumbers();
    } catch {
      measured = false;
    }
  }

  renderStatic();
  load().catch((e: unknown) => console.error(e));
  // Charts use theme tokens, so only the language needs a re-render.
  onStateChange(() => {
    renderStatic();
    renderNumbers();
  });

  return {
    element,
    setActive(active: boolean) {
      if (active) {
        measure();
        redraws.forEach((r) => r());
      }
    },
  };
}
