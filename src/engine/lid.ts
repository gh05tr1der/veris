// Utterance-level language identification for code-mixed speech.
//
// Indian contact-centre speech is routinely Hindi-English within a single sentence,
// usually transcribed in Latin script. A call-level language tag hides that, so VERIS
// tags every utterance: Devanagari script share plus a romanised-Hindi function-word
// lexicon against an English function-word lexicon. Named entities and numbers are
// neutral. Calibration is later tracked separately per language tag.

import type { Lang } from './types';

const HI_ROMAN = new Set(
  `hai hain tha thi the ho hoon hu hun main mein me mera meri mere aap aapka aapki aapke apna apni apne tum tumhara
  kya kyun kaise kab kahan kaun nahi nahin na haan ji theek thik toh to bhi aur ya lekin par pe ke ki ka ko se
  tak liye wala wali wale yeh ye woh wo isko usko inko unko abhi kal aaj subah shaam raat kuch sab bahut thoda
  kar karo karna karke kiya kiye karte karti karta kar rahi raha rahe gaya gayi gaye diya di de dena dijiye lijiye
  bataiye batao bata sakti sakta sakte chahiye hoga hogi jayega jayegi jaayega lagte lagta lagega lagegi
  mat madad cheez baat paisa paise wapas aayega naya nayi purana pahunch dhanyavaad shukriya namaste swagat
  wahi bas itna itni maine humne hum hamara hamari unka unki iska iski uska uski dekh dekhiye samajh tension
  wala kripya zaroor accha acha haanji arre yaar chalo bilkul kyunki agar varna phir fir pehle baad jab tab`.split(/\s+/),
);

const EN = new Set(
  `the a an is are was were be been being am i you he she it we they me my your our their this that these those
  of to in on at for with from by about as into over after before under again then once here there when where why
  how all any both each few more most other some such no nor not only own same so than too very can will just
  should now do does did have has had having please thank thanks yes okay ok sure right alright what which who
  whom would could may might must shall let get got go going make made know need want help call calling sorry
  if or and but because until while during through above below up down out off again further`.split(/\s+/),
);

const DEVANAGARI = /[ऀ-ॿ]/;

export function identify(text: string): { lang: Lang; hi: number; en: number } {
  const tokens = text.toLowerCase().match(/[\p{L}']+/gu) ?? [];
  if (!tokens.length) return { lang: 'en', hi: 0, en: 1 };
  let hi = 0;
  let en = 0;
  for (const t of tokens) {
    if (DEVANAGARI.test(t)) hi += 1;
    else if (HI_ROMAN.has(t) && EN.has(t)) en += 1; // ambiguous in Latin script (to, me, the): English
    else if (HI_ROMAN.has(t)) hi += 1;
    else if (EN.has(t)) en += 1;
  }
  const scored = hi + en;
  if (scored === 0) return { lang: 'en', hi: 0, en: 1 };
  const hs = hi / scored;
  const es = en / scored;
  // A single Hindi function word in an English sentence (or vice versa) is noise;
  // two or more scored tokens on each side is code-mixing.
  let lang: Lang = 'en';
  if (hs >= 0.85 && hi >= 2) lang = 'hi';
  else if (hi >= 2 && hs >= 0.2) lang = 'hi-en';
  else if (hs > 0.6) lang = 'hi-en';
  return { lang, hi: +hs.toFixed(2), en: +es.toFixed(2) };
}

/** Dominant call-level language: any Hindi or code-mixed agent/customer speech makes it a hi-en call. */
export function callLanguage(tags: Lang[]): Lang {
  const mixed = tags.filter((t) => t !== 'en').length;
  return mixed / Math.max(1, tags.length) >= 0.2 ? 'hi-en' : 'en';
}

export const LANG_LABEL: Record<Lang, string> = { en: 'English', hi: 'Hindi', 'hi-en': 'Hinglish (code-mixed)' };
