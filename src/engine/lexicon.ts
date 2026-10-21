// Concept lexicon used by the deterministic evaluation path.
//
// A "concept" is a conversational event the policy compiler can reference by name
// (e.g. charge_disclosure, transaction_confirm). Each concept carries English and
// romanised Hindi / Hinglish surface patterns plus the keywords the compiler uses to
// resolve a plain-English criterion onto it. Patterns are intentionally incomplete:
// paraphrases they miss are exactly what the Calibration Ledger is there to measure.

import type { Speaker } from './types';

export interface Concept {
  id: string;
  label: string;
  speaker: Speaker;
  /** words/phrases in a criterion that point at this concept (compiler resolution); a leading ~ marks a weak cue */
  keywords: string[];
  patterns: RegExp[];
  /** where a missing occurrence is anchored as evidence */
  anchor?: 'opening' | 'closing';
}

const r = (s: string) => new RegExp(s, 'i');

export const CONCEPTS: Concept[] = [
  {
    id: 'greeting_selfid',
    anchor: 'opening',
    label: 'Greeting with self-identification',
    speaker: 'agent',
    keywords: ['greet', 'greeting', 'introduce', 'self-identif', 'identify themselves', 'own name', 'name'],
    // case-sensitive on purpose: a capitalised name must follow ("this is Rohan", not "I'm really")
    patterns: [
      /\b([Tt]his is|[Mm]y name is|I am|I'm) [A-Z][a-z]+/,
      /\b[Mm]ain [A-Z][a-z]+ baat kar (rahi|raha) (hoon|hu)/,
      /\b[A-Z][a-z]+ (here|speaking)\b/,
    ],
  },
  {
    id: 'recording_disclosure',
    anchor: 'opening',
    label: 'Call-recording disclosure',
    speaker: 'agent',
    keywords: ['record', 'recording', 'recorded', 'monitored', 'monitoring'],
    patterns: [
      r('\\b(call|conversation)( may| will| is)?( be| being)? (recorded|monitored)'),
      r('\\brecorded for (quality|training)'),
      r('\\brecord (ki|kiya) ja (rahi|raha|sakti|sakta)'),
      r('\\brecording (ho|kiya ja) rah[ai]'),
    ],
  },
  {
    id: 'account_details',
    label: 'Agent discusses account / policy details',
    speaker: 'agent',
    keywords: ['policy details', 'account details', 'discussing', 'discuss', 'account information'],
    patterns: [
      r('\\bi can see (the|your|two|a|that)\\b'),
      r('\\b(your|the) (policy|account|loan|card) (shows|is showing|has|on a|on your)\\b'),
      r('\\bdekh (rahi|raha) (hoon|hu)\\b'),
      r('\\b(total )?outstanding( amount)? is\\b'),
      r('\\bi am calling about your\\b'),
      r('\\bsystem (mein|me) (dikh|dikha) (raha|rahi)'),
    ],
  },
  {
    id: 'charge_disclosure',
    label: 'Disclosure of applicable charges',
    speaker: 'agent',
    keywords: ['charge', 'charges', 'fee', 'fees', 'penalty', 'deduction', 'cost'],
    patterns: [
      r('\\b(cancellation|late|processing|foreclosure|closure|service)? ?(charge|fee|penalty)s? of\\b'),
      r('\\b(charge|fee|penalty)s? (applies|apply|will apply|is applicable|are applicable|will be (deducted|levied|applied))'),
      r('\\b(carries|attracts|includes) a (\\w+ )?(charge|fee|penalty)'),
      r('\\b(charge|fee|penalty|charges) (lagega|lagegi|lagenge|lagta hai|katega|kategi)'),
      r('\\b(deducted|deduct) from (your|the) refund'),
    ],
  },
  {
    id: 'transaction_confirm',
    label: 'Confirmation of the transaction',
    speaker: 'agent',
    keywords: ['confirm', 'confirming', 'confirmation', 'process', 'processing', 'transaction', 'proceed', '~cancellation', '~cancel'],
    patterns: [
      r("\\bi('ll| will| am)( now)?( go ahead and)? (process|processing|cancel|cancelling|submit|submitting|confirm|confirming)\\b"),
      r('\\b(policy|request|cancellation) will be (cancelled|processed|submitted)'),
      r('\\b(cancel|process|block|submit) kar (diya|di|rahi|raha|deti|deta|dungi|dunga)'),
      r("\\b(that's|that is) (done|processed|cancelled) for you"),
    ],
  },
  {
    id: 'empathy',
    label: 'Empathy / acknowledgement',
    speaker: 'agent',
    keywords: ['empathy', 'empathise', 'empathize', 'acknowledge', 'acknowledged', 'apolog', 'understanding'],
    patterns: [
      r('\\b(i|we) (completely |totally |really |fully )?(understand|can understand|appreciate)\\b'),
      r("\\bi('m| am) (so |really |very |truly )?sorry\\b"),
      r('\\bapologi[sz]e'),
      r('\\bsamajh (sakti|sakta) (hoon|hu)'),
      r('\\btension mat\\b'),
      r('\\bthat must (be|have been)\\b'),
      r('\\bmaafi chah'),
    ],
  },
  {
    id: 'frustration',
    label: 'Customer frustration, worry or distress',
    speaker: 'customer',
    keywords: ['frustration', 'frustrated', 'upset', 'angry', 'worried', 'distress', 'complain', 'dissatisf'],
    patterns: [
      r("\\b(not fair|isn't fair|unfair|frustrat\\w*|annoy\\w*|ridiculous|harassment|worried|upset|angry|unacceptable)"),
      r('\\b(wasting my time|been waiting|on hold for|third time|fed up)'),
      r("\\bwhy am i only hearing"),
      r('\\b(pareshan|bahut bura|bakwas|tang aa gay)'),
    ],
  },
  {
    id: 'hardship',
    label: 'Customer reports financial hardship',
    speaker: 'customer',
    keywords: ['hardship', 'financial difficulty', 'unable to pay', 'lost job'],
    patterns: [
      r('\\b(lost my job|laid off|no income|medical emergency|in hospital|salary (is )?(delayed|not credited))'),
      r('\\b(naukri (chali gayi|chhoot gayi)|paise nahi hain|hospital mein)'),
      r("\\b(can't|cannot|unable to) (afford|pay)"),
    ],
  },
  {
    id: 'hardship_option',
    label: 'Hardship option offered',
    speaker: 'agent',
    keywords: ['hardship option', 'payment plan', 'restructur', 'extension', 'relief'],
    patterns: [
      r('\\b(restructur\\w*|payment plan|instal?ment plan|part(ial)? payment|extension|emi holiday|hardship (programme|program|team|desk))'),
      r('\\b(more time|grace period) (to pay|for (the )?payment)'),
    ],
  },
  {
    id: 'next_steps',
    label: 'Next steps and timelines explained',
    speaker: 'agent',
    keywords: ['next steps', 'timeline', 'timelines', 'what happens next', '~resolution', '~explain', '~explained', '~expect'],
    patterns: [
      r('\\b(within|in) (\\w+|\\d+)( working| business)? days\\b'),
      r('\\byou will (receive|get) (an?|the|your)\\b'),
      r('\\b(reference|dispute|ticket|complaint|request) (number|id)\\b'),
      r('\\bworking days? (mein|me|lagte|lagenge)'),
      r('\\b(pahunch|credit ho|ho|aa) jayeg[ai]\\b'),
      r('\\b(temporary credit|reversed)\\b'),
    ],
  },
  {
    id: 'summary_check',
    label: 'Summary / understanding check',
    speaker: 'agent',
    keywords: ['summar', 'recap', 'understanding', 'understood', 'check understanding'],
    patterns: [
      r('\\b(just )?to (summari[sz]e|recap)\\b'),
      r('\\bso to confirm\\b'),
      r('\\bdoes (that|this) (make sense|answer)'),
      r('\\b(is|was) (that|everything) clear\\b'),
      r('\\bsummary (yeh|ye) hai\\b'),
    ],
  },
  {
    id: 'further_assistance',
    label: 'Offer of further assistance',
    speaker: 'agent',
    keywords: ['further assistance', 'anything else', 'further help', 'additional help', 'closing'],
    patterns: [
      r('\\b(is there )?anything else (i|we) can\\b'),
      r('\\bis there anything else\\b'),
      r('\\banything more i can\\b'),
      r('\\baur (kisi|koi) (cheez|baat|help)\\b'),
      r('\\baur kuch (help|madad)'),
    ],
  },
  {
    id: 'prohibited_pressure',
    label: 'Threat, coercion or third-party disclosure',
    speaker: 'agent',
    keywords: ['threat', 'threaten', 'coerc', 'pressure', 'intimidat', 'prohibited', 'harass', 'third party', 'third-party', 'abusive'],
    patterns: [
      r('\\b(send|sending) (our|my|a|the) (team|people|agents?|recovery team|officers?) to your (house|home|office|workplace)'),
      r('\\b(inform|tell|call|contact) your (employer|relatives|family|neighbou?rs|colleagues|boss)'),
      r('\\b(police|arrest|jail|criminal case)\\b'),
      r('\\b(ghar|office) (pe )?(aa jayenge|bhej denge|aayegi)'),
    ],
  },
  {
    id: 'misselling_claim',
    label: 'Guaranteed-return or no-risk claim',
    speaker: 'agent',
    keywords: ['guarantee', 'guaranteed', 'mis-sell', 'misselling', 'mis-selling', 'no risk'],
    patterns: [r('\\bguarantee(d)? (returns?|profit|approval)'), r('\\b(no risk at all|100% (safe|guaranteed))')],
  },
  {
    id: 'tagline',
    anchor: 'opening',
    label: 'Brand tagline in greeting',
    speaker: 'agent',
    keywords: ['tagline', 'brand tagline', 'brand promise', 'slogan'],
    patterns: [r('\\bprotecting every journey\\b'), r('\\bbanking that stands by you\\b')],
  },
  {
    id: 'dues_disclosure',
    label: 'Outstanding dues stated',
    speaker: 'agent',
    keywords: ['dues', 'outstanding', 'amount due', 'overdue'],
    patterns: [r('\\b(total )?outstanding\\b'), r('\\b(amount|emi) (due|overdue)\\b'), r('\\bis overdue\\b'), r('\\bbaaki (hai|amount)')],
  },
];

export const CONCEPT_BY_ID: Record<string, Concept> = Object.fromEntries(CONCEPTS.map((c) => [c.id, c]));

/** Verification factors, counted by distinct type. */
export const FACTORS: { type: string; label: string; pattern: RegExp }[] = [
  { type: 'dob', label: 'date of birth', pattern: r('\\b(date of birth|dob|janam ?tithi)\\b') },
  { type: 'mobile', label: 'registered mobile', pattern: r('\\b(registered )?(mobile|phone) (number|no)\\b') },
  { type: 'pan', label: 'PAN', pattern: r('\\bpan\\b') },
  { type: 'otp', label: 'OTP', pattern: r('\\b(otp|one[- ]time password)\\b') },
  { type: 'address', label: 'registered address', pattern: r('\\b(registered|billing|communication) address|pin ?code\\b') },
  { type: 'email', label: 'registered email', pattern: r('\\bregistered email( id| address)?\\b') },
  { type: 'card4', label: 'card last four digits', pattern: r('\\blast four digits of (your|the) card\\b') },
  { type: 'maiden', label: "mother's maiden name", pattern: r("\\bmaiden name\\b") },
];
