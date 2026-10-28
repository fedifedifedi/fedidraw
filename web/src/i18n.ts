import type { Answer } from './answer';
import type { ClassInfo } from './labels';
import { state, type Lang } from './state';

const STRINGS = {
  en: {
    navLabel: 'Main navigation',
    navDraw: 'Draw',
    navPlay: 'Play',
    navHow: 'How it works',
    navHowShort: 'How?',
    langLabel: 'Language',
    themeToDark: 'Switch to the blackboard theme',
    themeToLight: 'Switch to the paper theme',
    prompt: 'Draw something. I’ll guess as you go.',
    canvasLabel: 'Drawing sheet: draw with your mouse, pen or finger',
    undo: 'Undo',
    clear: 'Clear',
    debug: '28×28 view',
    top5: 'My top 5 guesses',
    brain: 'Inside my head',
    sees: 'What I see · 28×28',
    seesAlt: '28 by 28 pixel image sent to the model',
    lights: 'What lights up',
    layer: 'layer',
    filter: 'filter',
    privacy: 'Everything runs in your browser: your drawings never leave it.',
    loading: 'Warming up my pencil…',
    loadError: 'The model could not be loaded. Run “npm run build” then “npm run preview” again.',
    debugTitle: 'What the model receives',
    debugInput: 'Model input',
    debugSample: 'Real Quick Draw drawing',
    debugStats: (ink: number, mass: string, ms: string) => `${ink} ink pixels · ink mass ${mass} · inference ${ms} ms`,
    debugHint: 'Quick Draw drawings have 147–312 ink pixels (5th–95th percentile).',
    playTitle: 'The pencil challenge',
    playLead: 'Six words, twenty seconds each. Draw, and I have to guess before the pencil is worn out!',
    playRule1: 'I give you a word.',
    playRule2: 'You draw it while the pencil shrinks.',
    playRule3: 'As soon as I recognise it, you score a point.',
    playStart: 'Start',
    playBest: (n: number, total: number) => `Your best: ${n}/${total}`,
    roundOf: (n: number, total: number) => `Round ${n}/${total}`,
    score: (n: number) => `Score: ${n}`,
    drawThis: 'Draw',
    skip: 'Skip',
    secondsLeft: (s: number) => `${s} s`,
    timerLabel: 'Time left',
    aiWatching: 'I’m watching…',
    aiThinking: 'Hmm…',
    aiGuess: (thing: string) => `I see… ${thing}?`,
    aiWon: (thing: string) => `Got it! It’s ${thing}!`,
    aiLost: (thing: string) => `I couldn’t get it… It was ${thing}.`,
    resultsChip: 'Game over',
    resultsScore: (n: number, total: number) => `${n} / ${total}`,
    resultsPerfect: 'Perfect! You draw like a pro.',
    resultsGreat: 'Great job, we make a good team!',
    resultsGood: 'Not bad! One more?',
    resultsPractice: 'Shall we practise a bit more?',
    newBest: 'New record!',
    foundIn: (s: string) => `Found in ${s} s`,
    notFound: 'Not found',
    thoughtItWas: (thing: string) => `I thought it was ${thing}`,
    playAgain: 'Play again',
    freeDraw: 'Free drawing',
  },
  fr: {
    navLabel: 'Navigation principale',
    navDraw: 'Dessiner',
    navPlay: 'Jouer',
    navHow: 'Comment ça marche',
    navHowShort: 'Comment ?',
    langLabel: 'Langue',
    themeToDark: 'Passer au thème tableau noir',
    themeToLight: 'Passer au thème papier',
    prompt: 'Dessine quelque chose, je devine en direct.',
    canvasLabel: 'Feuille de dessin : dessine à la souris, au stylet ou au doigt',
    undo: 'Annuler',
    clear: 'Effacer',
    debug: 'Vue 28×28',
    top5: 'Mes 5 idées',
    brain: 'Dans ma tête',
    sees: 'Ce que je vois · 28×28',
    seesAlt: 'Image de 28 par 28 pixels envoyée au modèle',
    lights: 'Ce qui s’allume',
    layer: 'couche',
    filter: 'filtre',
    privacy: 'Tout se passe dans ton navigateur : aucun dessin n’est envoyé.',
    loading: 'Je taille mon crayon…',
    loadError: 'Impossible de charger le modèle. Relance « npm run build » puis « npm run preview ».',
    debugTitle: 'Ce que reçoit le modèle',
    debugInput: 'Entrée du modèle',
    debugSample: 'Vrai dessin Quick Draw',
    debugStats: (ink: number, mass: string, ms: string) => `${ink} pixels d’encre · masse ${mass} · inférence ${ms} ms`,
    debugHint: 'Les dessins Quick Draw ont 147 à 312 pixels d’encre (5e–95e centile).',
    playTitle: 'Le défi du crayon',
    playLead: 'Six mots, vingt secondes chacun. Dessine, et je dois deviner avant que le crayon soit usé !',
    playRule1: 'Je te donne un mot.',
    playRule2: 'Tu le dessines pendant que le crayon raccourcit.',
    playRule3: 'Dès que je le reconnais, tu marques un point.',
    playStart: 'Commencer',
    playBest: (n: number, total: number) => `Ton record : ${n}/${total}`,
    roundOf: (n: number, total: number) => `Manche ${n}/${total}`,
    score: (n: number) => `Score : ${n}`,
    drawThis: 'Dessine',
    skip: 'Passer',
    secondsLeft: (s: number) => `${s} s`,
    timerLabel: 'Temps restant',
    aiWatching: 'Je regarde…',
    aiThinking: 'Hmm…',
    aiGuess: (thing: string) => `Je vois… ${thing} ?`,
    aiWon: (thing: string) => `Je l’ai ! C’est ${thing} !`,
    aiLost: (thing: string) => `Je n’ai pas trouvé… C’était ${thing}.`,
    resultsChip: 'Fin de partie',
    resultsScore: (n: number, total: number) => `${n} / ${total}`,
    resultsPerfect: 'Parfait ! Tu dessines comme un pro.',
    resultsGreat: 'Bravo, on fait une sacrée équipe !',
    resultsGood: 'Pas mal ! On en refait une ?',
    resultsPractice: 'On s’entraîne encore un peu ?',
    newBest: 'Nouveau record !',
    foundIn: (s: string) => `Trouvé en ${s} s`,
    notFound: 'Pas trouvé',
    thoughtItWas: (thing: string) => `J’ai cru voir ${thing}`,
    playAgain: 'Rejouer',
    freeDraw: 'Dessin libre',
  },
};

type Strings = typeof STRINGS.en;
type TextKey = { [K in keyof Strings]: Strings[K] extends string ? K : never }[keyof Strings];

export function t(key: TextKey, lang: Lang = state.lang): string {
  return STRINGS[lang][key] as string;
}

export function strings(lang: Lang = state.lang): Strings {
  return STRINGS[lang];
}

/** Updates every element marked with data-i18n / data-i18n-aria-label. */
export function applyI18n(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n as TextKey);
  });
  root.querySelectorAll<HTMLElement>('[data-i18n-aria-label]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel as TextKey));
  });
}

const FEMININE_FR = new Set([
  'apple', 'banana', 'car', 'clock', 'crown', 'flower', 'guitar', 'house', 'key', 'light bulb', 'moon', 'pizza', 'star',
]);

export function className(info: ClassInfo, lang: Lang = state.lang): string {
  return lang === 'fr' ? info.fr : info.en;
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "une lune", "un œil", "a moon", "an apple". */
export function withArticle(info: ClassInfo, lang: Lang = state.lang): string {
  if (lang === 'fr') return `${FEMININE_FR.has(info.id) ? 'une' : 'un'} ${info.fr}`;
  return `${/^[aeiou]/.test(info.en) ? 'an' : 'a'} ${info.en}`;
}

export function percent(p: number, lang: Lang = state.lang): string {
  const value = Math.round(p * 100);
  return lang === 'fr' ? `${value} %` : `${value}%`;
}

/** Tips for the pairs the model confuses most (see training/reports/metrics.json). */
const PAIR_TIPS: Record<string, Record<Lang, string>> = {
  'banana|moon': {
    en: 'Those two look a lot alike to me. Add craters to the moon, or a little stem to the banana!',
    fr: 'Les deux se ressemblent beaucoup pour moi. Ajoute des cratères à la lune, ou une petite queue à la banane !',
  },
  'moon|pizza': {
    en: 'A pizza has slices and toppings; a moon is usually a crescent.',
    fr: 'Une pizza a des parts et des garnitures ; une lune est souvent un croissant.',
  },
  'clock|moon': {
    en: 'A clock is a full circle with hands in the middle.',
    fr: 'Une horloge, c’est un cercle complet avec des aiguilles au milieu.',
  },
  'guitar|key': {
    en: 'Strings would make it a guitar. Teeth at the end, a key.',
    fr: 'Avec des cordes, je dirais guitare. Avec des dents au bout, plutôt une clé.',
  },
  'mushroom|umbrella': {
    en: 'Give it a J-shaped handle and I’ll go with umbrella.',
    fr: 'Ajoute un manche en J, et je pencherai pour le parapluie.',
  },
  'mushroom|tree': {
    en: 'A thin trunk and cloudy leaves say tree; a rounded cap says mushroom.',
    fr: 'Un tronc fin et un feuillage en nuage, c’est un arbre ; un chapeau arrondi, un champignon.',
  },
  'palm tree|tree': {
    en: 'Drooping fronds would make it a palm tree.',
    fr: 'Des palmes qui retombent, et je dirai palmier.',
  },
  'hammer|palm tree': {
    en: 'A hammer has a straight, solid head; a palm tree has fronds.',
    fr: 'Un marteau a une tête droite et pleine ; un palmier, des palmes.',
  },
  'airplane|cactus': {
    en: 'Wings and windows for the airplane, spines for the cactus.',
    fr: 'Des ailes et des hublots pour l’avion, des épines pour le cactus.',
  },
  'clock|pizza': {
    en: 'Hands for the clock, slices for the pizza.',
    fr: 'Des aiguilles pour l’horloge, des parts pour la pizza.',
  },
  'clock|sun': {
    en: 'Rays around it make a sun; hands inside make a clock.',
    fr: 'Des rayons autour, c’est un soleil ; des aiguilles dedans, une horloge.',
  },
};

export function hesitationTip(a: ClassInfo, b: ClassInfo, lang: Lang = state.lang): string {
  const tip = PAIR_TIPS[[a.id, b.id].sort().join('|')];
  if (tip) return tip[lang];
  return lang === 'fr'
    ? `J’hésite entre ${withArticle(a, 'fr')} et ${withArticle(b, 'fr')}. Ajoute un détail qui les distingue !`
    : `I’m torn between ${withArticle(a, 'en')} and ${withArticle(b, 'en')}. Add a detail that tells them apart!`;
}

export interface AnswerText {
  chip: string;
  message: string;
  tip: string;
}

/** What the AI "says" for each answer state. */
export function answerText(answer: Answer, classes: ClassInfo[], lang: Lang = state.lang): AnswerText {
  const fr = lang === 'fr';
  switch (answer.kind) {
    case 'idle':
      return {
        chip: fr ? 'Prêt' : 'Ready',
        message: fr ? 'À toi de dessiner !' : 'Your turn to draw!',
        tip: fr ? 'Souris, stylet ou doigt : tout marche.' : 'Mouse, pen or finger: anything works.',
      };
    case 'searching':
      return {
        chip: fr ? 'Je cherche encore' : 'Still looking',
        message: fr ? 'Hmm… je cherche encore.' : 'Hmm… still looking.',
        tip: fr ? 'Continue, ajoute quelques traits.' : 'Keep going, add a few more strokes.',
      };
    case 'hesitant': {
      const a = classes[answer.first.index], b = classes[answer.second.index];
      return {
        chip: fr ? 'J’hésite entre deux' : 'Torn between two',
        message: fr ? `Hmm… ${withArticle(a, 'fr')}… ou ${withArticle(b, 'fr')} ?` : `Hmm… ${withArticle(a, 'en')}… or ${withArticle(b, 'en')}?`,
        tip: hesitationTip(a, b, lang),
      };
    }
    case 'sure': {
      const a = classes[answer.first.index];
      const p = percent(answer.first.probability, lang);
      const thing = withArticle(a, lang);
      return {
        chip: fr ? `Sûr à ${p}` : `${p} sure`,
        message: answer.certain
          ? (fr ? `C’est ${thing} !` : `It’s ${thing}!`)
          : (fr ? `Hmm… je crois que c’est ${thing} !` : `Hmm… I think it’s ${thing}!`),
        tip: '',
      };
    }
  }
}
