// Synthetic contact-centre corpus (seeded, reproducible).
//
// ~230 calls over six weeks across three queues, twelve agents and two language registers
// (English, Hinglish). Each call is assembled from conversation moves whose ground truth is
// known to the generator. A "senior reviewer" labels a rotating blind sample of calls from
// that ground truth (with a small human-disagreement rate). The engine never sees the truth:
// it evaluates the transcripts like any other call, and the Calibration Ledger measures how
// often it agrees with the reviewer. Phrasings deliberately include paraphrases that the
// deterministic lexicon does not cover, and some it over-matches, so measured agreement is
// earned, varies by criterion and language, and is not a constant.

import { rng, type Rng } from '../engine/text';
import type { Call, Outcome, QueueId, Speaker, Utterance, Verdict } from '../engine/types';

export const AS_OF = '2026-10-20T18:00:00+05:30';

type B = 'greet' | 'tag' | 'rec' | 'ver' | 'dis' | 'emp' | 'hrd' | 'due' | 'nxt' | 'sum' | 'faa' | 'prh' | 'interrupt';

export interface AgentProfile {
  id: string;
  name: string;
  female: boolean;
  queue: QueueId;
  hinglish: number;
  p: Partial<Record<B, number>>;
  coaching?: { criterion: string; date: string; after: Partial<Record<B, number>>; module: string };
}

const BASE: Record<B, number> = { greet: 0.94, tag: 0.35, rec: 0.9, ver: 0.88, dis: 0.86, emp: 0.74, hrd: 0.7, due: 0.93, nxt: 0.84, sum: 0.5, faa: 0.84, prh: 0.015, interrupt: 0.07 };

export const AGENTS: AgentProfile[] = [
  { id: 'A-101', name: 'Rohan Mehta', female: false, queue: 'INS', hinglish: 0.1, p: { dis: 0.3, faa: 0.6, interrupt: 0.3, rec: 0.7, sum: 0.25 } },
  { id: 'A-102', name: 'Ananya Iyer', female: true, queue: 'INS', hinglish: 0.05, p: { dis: 0.97, emp: 0.92, sum: 0.85, tag: 0.8, faa: 0.97 } },
  {
    id: 'A-103', name: 'Farhan Qureshi', female: false, queue: 'INS', hinglish: 0.35, p: { ver: 0.55, nxt: 0.7 },
    coaching: { criterion: 'Q-VER', date: '2026-09-28', after: { ver: 0.94 }, module: 'Two-factor verification, every time (5 min)' },
  },
  {
    id: 'A-104', name: 'Sneha Kulkarni', female: true, queue: 'INS', hinglish: 0.25, p: { emp: 0.35 },
  },
  { id: 'A-201', name: 'Neha Sharma', female: true, queue: 'CRD', hinglish: 0.75, p: { emp: 0.9, nxt: 0.94 } },
  { id: 'A-202', name: 'Karthik Rao', female: false, queue: 'CRD', hinglish: 0.1, p: { rec: 0.55 } },
  { id: 'A-203', name: 'Pooja Verma', female: true, queue: 'CRD', hinglish: 0.65, p: { nxt: 0.6, sum: 0.3 } },
  { id: 'A-204', name: 'Imran Sheikh', female: false, queue: 'CRD', hinglish: 0.4, p: {} },
  { id: 'A-301', name: 'Vikram Singh', female: false, queue: 'COL', hinglish: 0.2, p: { prh: 0.3, emp: 0.4, hrd: 0.35, faa: 0.6 } },
  { id: 'A-302', name: 'Divya Nair', female: true, queue: 'COL', hinglish: 0.55, p: { hrd: 0.95, emp: 0.9 } },
  { id: 'A-303', name: 'Manoj Yadav', female: false, queue: 'COL', hinglish: 0.7, p: { hrd: 0.5, prh: 0.1 } },
  { id: 'A-304', name: 'Ritu Saxena', female: true, queue: 'COL', hinglish: 0.35, p: {} },
];

export const CLIENTS: Record<QueueId, { client: string; brand: string; tagline: string }> = {
  INS: { client: 'Suraksha General Insurance', brand: 'Suraksha General Insurance', tagline: 'protecting every journey' },
  CRD: { client: 'Unity Bank', brand: 'Unity Bank cards', tagline: 'banking that stands by you' },
  COL: { client: 'Unity Bank', brand: 'Unity Bank', tagline: '' },
};

/** Probability that a correct behaviour is phrased in a way the lexicon does not cover. */
const UNCOVERED: Record<string, [number, number]> = {
  greet: [0.02, 0.06], rec: [0.02, 0.08], ver: [0.04, 0.12], dis: [0.03, 0.2], emp: [0.12, 0.22],
  hrd: [0.12, 0.22], due: [0.04, 0.1], nxt: [0.06, 0.16], sum: [0.1, 0.22], faa: [0.03, 0.1],
  trigger: [0.08, 0.14],
};

const FIRST = ['Priya', 'Amit', 'Kavita', 'Rahul', 'Sunita', 'Deepak', 'Meena', 'Arjun', 'Shalini', 'Vivek', 'Nisha', 'Sanjay', 'Lakshmi', 'Ajay', 'Fatima', 'Gaurav', 'Rekha', 'Harish', 'Swati', 'Naveen', 'Jyoti', 'Tarun', 'Bhavna', 'Kiran'];
const LAST = ['Nair', 'Gupta', 'Reddy', 'Joshi', 'Khan', 'Patel', 'Das', 'Bose', 'Menon', 'Chopra', 'Pillai', 'Rao', 'Malhotra', 'Bhat', 'Ghosh', 'Sinha', 'Mishra', 'Kapoor'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const CARS = ['Hyundai Creta', 'Maruti Swift', 'Tata Nexon', 'Honda City', 'Mahindra XUV700', 'Kia Seltos', 'Maruti Baleno'];

interface Move {
  s: Speaker;
  text: string;
  overlapPrev?: number; // seconds this utterance starts before the previous one ends
  gapBefore?: number;
}

interface Truth {
  [criterion: string]: Verdict;
}

interface Ctx {
  r: Rng;
  date: string;
  hi: boolean;
  agent: AgentProfile;
  p: Record<B, number>;
  brand: string;
  tagline: string;
  cust: { first: string; last: string; title: string; dob: string; phone: string; email: string };
  moves: Move[];
  truth: Truth;
  triggers: { empathetic: boolean }[];
  unresolved: boolean;
}

const cov = (c: Ctx, key: string) => !c.r.chance(UNCOVERED[key][c.hi ? 1 : 0]);
const ag = (c: Ctx, en: string | string[], hi?: string | string[]) => {
  const pool = c.hi && hi ? hi : en;
  const t = Array.isArray(pool) ? c.r.pick(pool) : pool;
  return t.replace(/\{rahi\}/g, c.agent.female ? 'rahi' : 'raha').replace(/\{sakti\}/g, c.agent.female ? 'sakti' : 'sakta').replace(/\{karti\}/g, c.agent.female ? 'karti' : 'karta').replace(/\{deti\}/g, c.agent.female ? 'deti' : 'deta');
};
const say = (c: Ctx, s: Speaker, text: string, extra: Partial<Move> = {}) => c.moves.push({ s, text, ...extra });

function luhnCard(r: Rng) {
  const d = [4, ...Array.from({ length: 14 }, () => r.int(0, 9))];
  for (let x = 0; x < 10; x++) {
    let sum = 0;
    const all = [...d, x];
    for (let i = all.length - 1, dbl = false; i >= 0; i--, dbl = !dbl) {
      let n = all[i];
      if (dbl) n = n * 2 > 9 ? n * 2 - 9 : n * 2;
      sum += n;
    }
    if (sum % 10 === 0) {
      const s = all.join('');
      return `${s.slice(0, 4)} ${s.slice(4, 8)} ${s.slice(8, 12)} ${s.slice(12)}`;
    }
  }
  return '4111 1111 1111 1111';
}

// ---------------------------------------------------------------- conversation moves
function opening(c: Ctx, queue: QueueId) {
  const a = c.agent.name.split(' ')[0];
  const doGreet = c.r.chance(c.p.greet);
  const doTag = queue !== 'COL' && c.r.chance(c.p.tag);
  const doRec = c.r.chance(c.p.rec);
  c.truth['Q-GRT'] = doGreet ? 'pass' : 'fail';
  if (queue !== 'COL') c.truth['Q-TAG'] = doTag ? 'pass' : 'fail';
  c.truth['Q-REC'] = doRec ? 'pass' : 'fail';
  const brand = doTag ? `${c.brand}, ${c.tagline}` : c.brand;
  let g: string;
  if (queue === 'COL') {
    g = doGreet
      ? cov(c, 'greet')
        ? ag(c, [`Good afternoon, this is ${a} calling from ${c.brand} collections.`, `Hello, my name is ${a} from ${c.brand} collections.`], [`Namaste, main ${a} baat kar {rahi} hoon, ${c.brand} collections se.`])
        : ag(c, `Good afternoon, you're speaking to ${a} from ${c.brand} collections.`, `Namaste ji, ${c.brand} collections se ${a}.`)
      : ag(c, `Good afternoon, calling from ${c.brand} collections.`, `Namaste, ${c.brand} collections se call hai.`);
  } else {
    g = doGreet
      ? cov(c, 'greet')
        ? ag(c, [`Thank you for calling ${brand}, this is ${a}.`, `Good morning, ${brand}, my name is ${a}.`, `Welcome to ${brand}, ${a} here.`], [`Namaste, ${brand} mein aapka swagat hai, main ${a} baat kar {rahi} hoon.`])
        : ag(c, `Thank you for calling ${brand}. You're through to ${a}.`, `Namaste, ${brand}, ${a} se baat kijiye.`)
      : ag(c, `Thank you for calling ${brand}.`, `Namaste, ${brand} mein aapka swagat hai.`);
  }
  let rec = '';
  if (doRec) {
    rec = cov(c, 'rec')
      ? ' ' + ag(c, ['This call is recorded for quality and training purposes.', 'Please note this call may be recorded.'], ['Yeh call quality aur training ke liye record ki ja rahi hai.'])
      : ' ' + ag(c, 'Just so you know, we keep a copy of this conversation for quality checks.', 'Yeh conversation quality ke liye save hoti hai.');
  }
  if (queue === 'COL') {
    say(c, 'agent', `${g}${rec} ${ag(c, `Am I speaking with ${c.cust.title} ${c.cust.last}?`, `Kya meri baat ${c.cust.first} ${c.cust.last} ji se ho rahi hai?`)}`);
    say(c, 'customer', ag(c, ['Yes, speaking.', 'Yes, that is me.'], ['Haan ji, bol raha hoon.', 'Haan, boliye.']));
  } else {
    say(c, 'agent', `${g}${rec} ${ag(c, ['How may I help you today?', 'How can I help you?'], ['Bataiye, main aapki kya madad kar {sakti} hoon?'])}`);
  }
}

function verification(c: Ctx, detailLine: string, hiDetail: string, withDetails = true) {
  const ok = c.r.chance(c.p.ver);
  const detailsFirst = withDetails && !ok && c.r.chance(0.3);
  c.truth['Q-VER'] = ok ? 'pass' : 'fail';
  const details = () => say(c, 'agent', ag(c, `Thank you, ${c.cust.title} ${c.cust.last}. I can see ${detailLine}`, `Thank you. Main dekh {rahi} hoon, ${hiDetail}`));
  if (detailsFirst) {
    say(c, 'agent', ag(c, `Let me look that up. I can see ${detailLine}`, `Ek minute. Main dekh {rahi} hoon, ${hiDetail}`));
    say(c, 'agent', ag(c, 'Could you confirm your date of birth, please?', 'Apni date of birth bataiye please.'));
    say(c, 'customer', ag(c, `It's ${c.cust.dob}.`, `${c.cust.dob}.`));
    return;
  }
  if (ok) {
    if (cov(c, 'ver')) {
      say(c, 'agent', ag(c, ['For verification, could you confirm your date of birth and your registered mobile number?', 'May I have your date of birth and the PAN registered with us?', 'Could you confirm your date of birth and the OTP I have just sent to your registered mobile number?'], ['Verification ke liye apni date of birth aur registered mobile number bataiye.', 'Verification ke liye date of birth aur registered mobile number confirm kar dijiye.']));
    } else {
      say(c, 'agent', ag(c, 'Could you confirm your date of birth and the number we have on file for you?', 'Date of birth aur jo number hamare paas registered hai woh bataiye.'));
    }
    say(c, 'customer', ag(c, `It's ${c.cust.dob}, and the mobile is ${c.cust.phone}.`, `${c.cust.dob}, aur mobile ${c.cust.phone} hai.`));
  } else {
    say(c, 'agent', ag(c, 'Could you confirm your date of birth, please?', 'Apni date of birth bataiye please.'));
    say(c, 'customer', ag(c, `It's ${c.cust.dob}.`, `${c.cust.dob}.`));
  }
  if (withDetails) details();
}

function frustration(c: Ctx, en: string[], hi: string[]) {
  const covered = cov(c, 'trigger');
  const line = covered ? ag(c, en, hi) : ag(c, ["This is the third call I've made about this.", 'Honestly, I expected better from you people.'], ['Teesri baar call kar raha hoon iske liye.', 'Har baar yahi hota hai aapke yahan.']);
  say(c, 'customer', line);
  respondEmpathy(c);
}

function respondEmpathy(c: Ctx) {
  const empathetic = c.r.chance(c.p.emp);
  c.triggers.push({ empathetic });
  if (empathetic) {
    say(c, 'agent', cov(c, 'emp')
      ? ag(c, ["I completely understand, and I'm sorry for the trouble.", 'I understand how frustrating that is.', "I'm really sorry about this experience."], ['Main samajh {sakti} hoon, aap tension mat lijiye.', 'Main samajh {sakti} hoon, sorry for the trouble.'])
      : ag(c, ["That's a fair point, and you shouldn't have had to chase this.", "You're right to raise it, let me put this right for you."], ['Aapki baat bilkul sahi hai, main isko theek {karti} hoon.']));
  } else {
    say(c, 'agent', c.r.chance(0.15)
      ? ag(c, 'I understand, but that is the policy and I cannot do anything about it.', 'Main samajh {sakti} hoon, lekin policy yahi hai, main kuch nahi kar {sakti}.')
      : ag(c, ['Okay. Let me check.', 'Sir, that is the process.', 'Alright, one moment.'], ['Theek hai, process yahi hai.', 'Ek minute, check karne do.']));
  }
}

function nextSteps(c: Ctx, en: string, hi: string, uncoveredEn: string, uncoveredHi: string) {
  const ok = c.r.chance(c.p.nxt);
  c.truth['Q-NXT'] = ok ? 'pass' : 'fail';
  if (!ok) {
    c.unresolved = c.unresolved || c.r.chance(0.6);
    return;
  }
  // Seeded drift scenario: from 6 Oct the English-language floors rolled out a new closing script whose
  // timeline phrasing ("within 48 hours") the lexicon does not cover. Agreement on Q-NXT drops
  // in the recent window and the ledger reverts the criterion to advisory on its own.
  if (!c.hi && c.date >= '2026-10-06' && c.r.chance(0.7)) {
    say(c, 'agent', `${en.split(/[;,]/)[0].replace(/\.$/, '')}. Our team will contact you within 48 hours with an update.`.replace(/within (\w+|\d+) (working )?days[^.]*\./, 'shortly.'));
    return;
  }
  say(c, 'agent', cov(c, 'nxt') ? ag(c, en, hi) : ag(c, uncoveredEn, uncoveredHi));
}

function summary(c: Ctx, recapEn: string, recapHi: string) {
  const ok = c.r.chance(c.p.sum);
  c.truth['Q-SUM'] = ok ? 'pass' : 'fail';
  if (!ok) return;
  say(c, 'agent', cov(c, 'sum')
    ? ag(c, [`Just to summarise, ${recapEn}.`, `So to confirm, ${recapEn}.`], [`Summary yeh hai ki ${recapHi}.`])
    : ag(c, `Let me run through what we've agreed: ${recapEn}.`, `Ek baar dohra {deti} hoon: ${recapHi}.`));
  say(c, 'customer', ag(c, ['Yes, that is clear.', 'Okay, got it.'], ['Haan, samajh gaya.', 'Theek hai, clear hai.']));
}

function closing(c: Ctx) {
  const ok = c.r.chance(c.p.faa);
  c.truth['Q-FAA'] = ok ? 'pass' : 'fail';
  if (ok) {
    say(c, 'agent', cov(c, 'faa') ? ag(c, ['Is there anything else I can help you with today?', 'Is there anything else I can do for you?'], ['Kya main aapki aur kisi cheez mein madad kar {sakti} hoon?']) : ag(c, 'Can I help with any other query?', 'Koi aur sawaal hai?'));
    say(c, 'customer', ag(c, ['No, that is all. Thank you.', 'No, thanks.'], ['Nahi, bas itna hi. Thank you.', 'Nahi ji, shukriya.']));
  }
  say(c, 'agent', ag(c, [`Thank you for calling ${c.brand}. Have a good day.`, 'Thank you. Goodbye.'], [`${c.brand} ko call karne ke liye dhanyavaad.`, 'Dhanyavaad, aapka din shubh ho.']));
}

// ---------------------------------------------------------------- topics
type Topic = 'cancel_sold' | 'cancel_charge_dispute' | 'claim_status' | 'renewal_ncb' | 'address_update' | 'fraud_txn' | 'duplicate_charge' | 'limit_increase' | 'annual_fee' | 'emi_overdue' | 'settlement';

function insTopic(c: Ctx, topic: Topic) {
  const car = c.r.pick(CARS);
  const amt = c.r.pick(['850', '750', '1,000', '950']);
  const policyNo = `MV${c.r.int(10000000, 99999999)}`;
  if (topic === 'cancel_sold') {
    say(c, 'customer', ag(c, [`I sold my ${car} last month, so I want to cancel my motor policy. The policy number is ${policyNo}.`, `Hi, I need to cancel my car insurance, the car has been sold. Policy number ${policyNo}.`], [`Maine apni ${car} bech di hai, toh motor policy cancel karni hai. Policy number ${policyNo} hai.`]));
    verification(c, `the comprehensive policy on your ${car}, valid until ${c.r.pick(MONTHS)}.`, `aapki ${car} ki comprehensive policy hai, ${c.r.pick(MONTHS)} tak valid.`);
    // Charge disclosure vs confirmation ordering — the Q-DIS behaviour
    const correct = c.r.chance(c.p.dis);
    const late = !correct && c.r.chance(0.75);
    const chargeLine = () =>
      cov(c, 'dis')
        ? ag(c, [`Please note there is a cancellation charge of ${amt} rupees, deducted from the refund.`, `A cancellation fee of ${amt} rupees applies for mid-term cancellation.`], [`Ek baat note kijiye, ${amt} rupees ka cancellation charge lagega, jo refund se katega.`])
        : ag(c, `Please note ${amt} rupees will be retained from your refund as per the policy terms.`, `${amt} rupees refund mein se adjust honge, policy terms ke hisaab se.`);
    const confirmLine = () =>
      c.r.chance(0.95)
        ? ag(c, ['I will now process the cancellation for you.', "I'll go ahead and cancel the policy from today.", 'Alright, I am processing the cancellation now.'], ['Main policy cancel kar {rahi} hoon, aaj se effective.', 'Theek hai, main cancellation process kar {rahi} hoon.'])
        : ag(c, 'Your cancellation is now done from today.', 'Aapka cancellation aaj se ho gaya.');
    c.truth['Q-DIS'] = correct ? 'pass' : 'fail';
    if (correct) {
      say(c, 'agent', chargeLine());
      say(c, 'customer', ag(c, ['Okay, that is fine. Please go ahead.', 'Alright, understood. Go ahead.'], ['Theek hai, aap aage badhiye.']));
      say(c, 'agent', confirmLine());
    } else {
      say(c, 'agent', confirmLine());
      say(c, 'customer', ag(c, ['Okay, thanks.', 'Good.'], ['Theek hai.']));
      if (late) {
        say(c, 'agent', `${ag(c, 'One more thing,', 'Ek aur baat,')} ${chargeLine()}`, { gapBefore: c.r.range(2, 12) });
        frustration(c, ['Why am I only hearing about this charge now? That is not fair.', "Wait, you didn't tell me that before. That is really not fair."], ['Yeh charge ke baare mein pehle kyun nahi bataya? Yeh not fair hai.']);
      }
    }
    nextSteps(c, 'You will receive the confirmation by email, and the refund reaches your account within seven working days.', 'Aapko email pe confirmation aa jayega, aur refund seven working days mein ho jayega.', 'The refund should come through sometime next week.', 'Refund agle hafte tak aa jana chahiye.');
    summary(c, 'the policy is cancelled from today and the balance is refunded', 'policy aaj se cancel hai aur balance refund hoga');
  } else if (topic === 'cancel_charge_dispute') {
    say(c, 'customer', ag(c, [`I cancelled my policy last week and ${amt} rupees was deducted from my refund as a cancellation charge. Nobody told me about this deduction.`, `There is a deduction of ${amt} rupees on my cancellation refund. Why was a cancellation charge deducted without telling me?`, `My refund after cancelling the policy came short by ${amt} rupees. The agent never mentioned any cancellation deduction.`], [`Maine last week policy cancel ki thi aur refund se ${amt} rupees cancellation charge deduct ho gaya. Kisi ne yeh deduction bataya hi nahi.`]));
    verification(c, `the cancellation of your ${car} policy on ${c.r.int(2, 28)} ${c.r.pick(MONTHS.slice(8, 10))}.`, `aapki ${car} policy ka cancellation hua hai.`);
    frustration(c, ['This is really frustrating, I feel misled.', "Honestly, it's not fair to deduct money without telling me."], ['Yeh bilkul not fair hai, mujhe bahut bura laga.', 'Main bahut pareshan hoon is charge se.']);
    say(c, 'agent', ag(c, 'The charge is set in the policy wording for mid-term cancellation, but I can see it was not explained on your cancellation call.', 'Yeh charge policy wording mein hai mid-term cancellation ke liye, lekin aapke call pe explain nahi hua tha.'));
    c.unresolved = c.r.chance(0.5);
    nextSteps(c, `I have raised a review request, reference number DR${c.r.int(1000, 9999)}, and you will get an update within five working days.`, `Maine review request raise kar di hai, aapko five working days mein update mil jayega.`, 'Someone from the team should call you back about it.', 'Team aapko call back karegi.');
    summary(c, 'I have raised a review of the cancellation charge', 'cancellation charge ka review raise ho gaya hai');
  } else if (topic === 'claim_status') {
    say(c, 'customer', ag(c, [`I'm calling about my accident claim on the ${car}. It has been two weeks and nobody has called me.`, 'I want to know the status of my claim, the garage is still waiting for approval.'], ['Meri claim ka status janna hai, do hafte ho gaye, garage approval ka wait kar raha hai.']));
    verification(c, `your claim on the ${car} is pending the surveyor report.`, `aapka claim surveyor report ke liye pending hai.`);
    if (c.r.chance(0.5)) frustration(c, ["I'm really worried, I need the car for work.", "I have been waiting for two weeks, it's ridiculous."], ['Main bahut pareshan hoon, car kaam ke liye chahiye.']);
    nextSteps(c, 'The surveyor will call you within two working days, and you will get an SMS once the claim is approved.', 'Surveyor aapko two working days mein call karega, approval ka SMS aa jayega.', 'The surveyor should be in touch soon.', 'Surveyor jaldi contact karega.');
    summary(c, 'your claim is with the surveyor and the visit is being scheduled', 'claim surveyor ke paas hai aur visit schedule ho rahi hai');
  } else if (topic === 'renewal_ncb') {
    say(c, 'customer', ag(c, ['My policy is due for renewal next week. Will my no-claim bonus carry over?', 'I want to renew my motor policy and check the no-claim bonus.'], ['Meri policy next week renew honi hai, no-claim bonus milega kya?']));
    verification(c, `your policy on the ${car} with a 35 percent no-claim bonus.`, `aapki policy pe 35 percent no-claim bonus hai.`);
    say(c, 'agent', ag(c, 'Yes, the bonus carries over because there were no claims this year.', 'Haan, is saal koi claim nahi hai toh bonus carry over hoga.'));
    nextSteps(c, 'You will receive the renewal link by SMS, and the new policy is issued within one working day of payment.', 'Aapko renewal link SMS pe aa jayega, payment ke one working day mein policy issue ho jayegi.', 'We will send you the link.', 'Link bhej denge.');
    summary(c, 'your bonus carries over and the renewal link is on its way', 'bonus carry over hoga aur renewal link aayega');
  } else {
    say(c, 'customer', ag(c, ['I have moved house and need to update the address on my motor policy.', 'I want to change the communication address on my policy.'], ['Maine ghar shift kiya hai, policy pe address update karna hai.']));
    verification(c, `the registered address on your ${car} policy.`, `aapki policy ka registered address.`);
    say(c, 'customer', ag(c, `The new address is flat ${c.r.int(101, 905)}, ${c.r.pick(['Green Park', 'Lake Town', 'Banjara Hills', 'Koregaon Park'])}.`, `Naya address flat ${c.r.int(101, 905)}, ${c.r.pick(['Green Park', 'Lake Town', 'Gomti Nagar'])} hai.`));
    nextSteps(c, 'You will receive an updated policy schedule by email within two working days.', 'Updated policy schedule two working days mein email pe aa jayega.', 'The change will show on your policy soon.', 'Change jaldi dikh jayega.');
    summary(c, 'the address is updated and a new schedule will be emailed', 'address update ho gaya hai aur naya schedule email hoga');
  }
}

function crdTopic(c: Ctx, topic: Topic) {
  const amt = c.r.pick(['4,999', '12,000', '7,450', '2,300', '18,250']);
  if (topic === 'fraud_txn') {
    say(c, 'customer', ag(c, [`There is a transaction of ${amt} rupees on my credit card that I did not make. I'm really worried.`, `I just got an SMS for a ${amt} rupee transaction I didn't do. Please block my card.`], [`Mere card pe ${amt} rupees ka transaction hua hai jo maine nahi kiya. Main bahut worried hoon.`, `Ek ${amt} ka transaction aaya hai jo maine nahi kiya, card block kar dijiye.`]));
    respondEmpathy(c);
    verification(c, `a transaction of ${amt} rupees this morning at an online merchant.`, `aaj subah ${amt} ka online transaction hai.`);
    say(c, 'agent', ag(c, 'I am blocking the card now so no further transactions go through, and raising a dispute.', 'Main abhi card block kar {rahi} hoon aur dispute raise kar {rahi} hoon.'));
    nextSteps(c, `Your dispute reference number is DR${c.r.int(1000, 9999)}; the amount is credited back within ten working days if confirmed as fraud, and a new card reaches you in five working days.`, 'Dispute seven se ten working days mein close hoga, aur naya card five working days mein pahunch jayega.', 'We will look into it and get back to you.', 'Hum check karke batayenge.');
    summary(c, 'the card is blocked, a dispute is raised and a new card is on its way', 'card block hai, dispute raise hai aur naya card aayega');
  } else if (topic === 'duplicate_charge') {
    const card = c.r.chance(0.35) ? ` The card number is ${luhnCard(c.r)}.` : '';
    say(c, 'customer', ag(c, `I have been charged twice for the same booking, ${amt} rupees each time.${card}`, `Ek hi booking ke liye do baar ${amt} rupees charge hua hai.${card}`));
    verification(c, `two charges of ${amt} rupees from the same merchant.`, `same merchant se do charges hain ${amt} ke.`);
    if (c.r.chance(0.6)) frustration(c, ['This is the second time this has happened, it is so frustrating.', 'The merchant told me to call the bank, I am fed up.'], ['Yeh doosri baar hua hai, bahut pareshan hoon.']);
    nextSteps(c, 'The second charge will be reversed as a temporary credit within three working days, and you will get an SMS with the dispute number.', 'Duplicate charge three working days mein temporary credit ho jayega.', 'The duplicate should drop off on its own.', 'Duplicate apne aap hat jayega.');
    summary(c, 'the duplicate charge is disputed and will be reversed', 'duplicate charge dispute ho gaya hai aur reverse hoga');
  } else if (topic === 'limit_increase') {
    say(c, 'customer', ag(c, 'I would like to increase my credit limit, I have a big purchase coming up.', 'Mujhe credit limit badhani hai, ek bada purchase hai.'));
    verification(c, 'your current limit and that you are eligible for an increase.', 'aapki limit aur aap increase ke liye eligible hain.');
    nextSteps(c, 'You will receive an OTP to accept the new limit, and it is active within two working days.', 'Aapko OTP aayega, aur nayi limit two working days mein active ho jayegi.', 'The new limit should show up soon.', 'Nayi limit jaldi dikhegi.');
    summary(c, 'your limit increase is approved pending OTP', 'limit increase OTP ke baad active hoga');
  } else {
    say(c, 'customer', ag(c, `I have been charged an annual fee of ${amt} rupees, but I was told the card is lifetime free.`, `Mujhe annual fee ${amt} lagi hai, lekin card lifetime free bataya tha.`));
    verification(c, `an annual fee of ${amt} rupees on this month's statement.`, `is mahine ke statement mein ${amt} annual fee hai.`);
    if (c.r.chance(0.5)) frustration(c, ['That is really annoying, I was promised no fee.', 'This is unacceptable.'], ['Yeh bakwas hai, mujhe free bola tha.']);
    nextSteps(c, 'I have raised a waiver request; you will get an SMS within five working days.', 'Waiver request raise ho gayi hai, five working days mein SMS aa jayega.', 'I will ask the team to look at it.', 'Team ko bol {deti} hoon.');
    summary(c, 'a fee waiver request is raised', 'fee waiver request raise ho gayi hai');
  }
}

function colTopic(c: Ctx, topic: Topic) {
  const emi = c.r.pick(['12,400', '18,400', '9,850', '22,100']);
  // collections: the dues statement below is the first disclosure of account details
  verification(c, '', '', false);
  const dueOk = c.r.chance(c.p.due);
  c.truth['Q-DUE'] = dueOk ? 'pass' : 'fail';
  const dueLine = dueOk
    ? cov(c, 'due')
      ? ag(c, `I am calling about your personal loan. Your EMI of ${emi} rupees is overdue, and the total outstanding is ${emi} rupees plus a late fee of 590 rupees.`, `Main aapke personal loan ke baare mein call kar {rahi} hoon. ${emi} ki EMI overdue hai, total outstanding ${emi} plus late fee hai.`)
      : ag(c, `I am calling about your personal loan. You owe us ${emi} rupees and a late fee this month.`, `Main aapke personal loan ke baare mein call kar {rahi} hoon. Is mahine ${emi} aur late fee dena hai.`)
    : ag(c, 'I am calling about your personal loan payment.', 'Main aapke loan payment ke baare mein call kar {rahi} hoon.');
  say(c, 'agent', dueLine);
  const hardship = c.r.chance(topic === 'settlement' ? 0.6 : 0.4);
  if (hardship) {
    say(c, 'customer', cov(c, 'trigger')
      ? ag(c, ['I lost my job last month, I cannot pay the full amount right now.', 'There was a medical emergency at home, I cannot afford the full EMI this month.'], ['Meri naukri chali gayi hai, abhi poora paisa nahi de sakta.', 'Ghar mein medical emergency hai, paise nahi hain abhi.'])
      : ag(c, 'Things have been very tight since my business shut down.', 'Business band ho gaya hai, bahut mushkil chal raha hai.'));
    const offer = c.r.chance(c.p.hrd);
    c.truth['Q-HRD'] = offer ? 'pass' : 'fail';
    if (offer) {
      say(c, 'agent', cov(c, 'hrd')
        ? ag(c, ['We can set up a payment plan, or I can refer you to our hardship team.', 'I can offer a restructuring of the loan or an extension of thirty days.'], ['Hum aapke liye payment plan bana sakte hain, ya hardship team ko refer kar {sakti} hoon.'])
        : ag(c, 'We can split the amount into smaller parts over three months.', 'Hum amount ko teen hisson mein baant sakte hain.'));
    } else {
      say(c, 'agent', ag(c, 'The full amount is still due by Friday.', 'Poora amount Friday tak dena hoga.'));
    }
  }
  const threat = c.r.chance(c.p.prh);
  c.truth['Q-PRH'] = threat ? 'fail' : 'pass';
  if (threat) {
    say(c, 'agent', c.r.chance(0.8)
      ? ag(c, ['If you do not pay by tonight, we will inform your employer and your relatives.', 'If the payment is not made, we will send our team to your office.', 'We may have to involve the police if this continues.'], ['Agar aaj payment nahi hua toh hum aapke office aa jayenge.'])
      : ag(c, 'We know where you work, and it would be better for you to pay today.', 'Humein pata hai aap kahan kaam karte ho, aaj hi pay kar do.'));
    frustration(c, ['That is harassment, you cannot threaten me like that.', 'This is unacceptable, I will complain.'], ['Yeh harassment hai, aap aise dhamki nahi de sakte.']);
  } else if (!hardship && c.r.chance(0.3)) {
    frustration(c, ['I am already upset, I have been paying for three years without a miss.', 'You people keep calling me every day, it is so frustrating.'], ['Roz call aata hai, main bahut pareshan hoon.']);
  }
  nextSteps(c, `I am sending a payment link by SMS; once paid, the receipt reaches you within one working day, reference number PL${c.r.int(1000, 9999)}.`, 'Main payment link SMS pe bhej {rahi} hoon, payment ke baad receipt one working day mein aa jayegi.', 'You can pay through the app whenever you are ready.', 'App se pay kar dijiye.');
  summary(c, 'the dues and the payment arrangement are agreed', 'dues aur payment arrangement tay ho gaya hai');
}

// ---------------------------------------------------------------- timing
function toUtterances(moves: Move[], r: Rng, hi: boolean): Utterance[] {
  let t = r.range(0.8, 2.0);
  let prevEnd = 0;
  return moves.map((m, i) => {
    const toks = m.text.split(/\s+/).filter(Boolean);
    let start: number;
    if (m.overlapPrev) start = prevEnd - m.overlapPrev;
    else start = i === 0 ? t : prevEnd + (m.gapBefore ?? r.range(0.45, 1.1));
    let cur = start;
    const words = toks.map((w) => {
      const d = Math.min(0.75, Math.max(0.16, 0.12 + 0.052 * w.replace(/\W/g, '').length)) * (m.s === 'customer' ? 1.05 : 0.96);
      const s = cur;
      const e = s + d;
      cur = e + (/[,;]$/.test(w) ? 0.14 : /[.?!]$/.test(w) ? 0.28 : 0.035);
      const conf = Math.max(0.5, Math.min(0.995, r.gauss(hi ? 0.9 : 0.945, hi ? 0.05 : 0.03)));
      return { w, s: +s.toFixed(3), e: +e.toFixed(3), c: +conf.toFixed(3) };
    });
    const end = words.length ? words[words.length - 1].e : start + 0.5;
    prevEnd = m.overlapPrev ? Math.max(prevEnd, end) : end;
    t = end;
    return { id: `U${String(i + 1).padStart(2, '0')}`, speaker: m.s, start: +start.toFixed(3), end: +end.toFixed(3), text: m.text, words };
  });
}

function addInterruption(c: Ctx) {
  // the agent cuts in on the customer's longest turn after the opening
  const idx = c.moves.findIndex((m, i) => i > 0 && m.s === 'customer' && m.text.split(' ').length > 10);
  if (idx < 0) return;
  const m = c.moves[idx];
  const words = m.text.split(' ');
  m.text = words.slice(0, Math.max(8, words.length - 3)).join(' ').replace(/[.,?!]$/, '');
  c.moves.splice(idx + 1, 0, { s: 'agent', text: ag(c, ['Okay, okay, let me check.', 'Yes, yes, I got it.'], ['Haan haan, main dekh {rahi} hoon.']), overlapPrev: c.r.range(0.7, 1.4) });
}

// ---------------------------------------------------------------- outcomes & labels
const sig = (x: number) => 1 / (1 + Math.exp(-x));
function outcomes(r: Rng, t: Truth, unresolved: boolean): Outcome {
  const f = (k: string) => (t[k] === 'fail' ? 1 : 0);
  const pRepeat = sig(-2.4 + 1.5 * f('Q-NXT') + 1.5 * f('Q-DIS') + 1.2 * f('Q-EMP') + 1.0 * f('Q-HRD') + 1.1 * (unresolved ? 1 : 0) + 0.15 * f('Q-SUM'));
  const pEsc = sig(-3.3 + 2.8 * f('Q-PRH') + 1.1 * f('Q-EMP') + 0.8 * f('Q-DIS'));
  const responded = r.chance(0.55);
  const csatMu = 4.3 - 1.5 * f('Q-EMP') - 0.7 * f('Q-NXT') - 1.0 * f('Q-DIS') - 1.5 * f('Q-PRH') - 0.6 * (unresolved ? 1 : 0);
  return {
    repeatContact7d: r.chance(pRepeat),
    escalated: r.chance(pEsc),
    ticketReopened: r.chance(sig(-3 + 1.2 * f('Q-NXT') + (unresolved ? 1 : 0))),
    csat: responded ? Math.max(1, Math.min(5, Math.round(r.gauss(csatMu, 0.7)))) : null,
  };
}

/** Human calibration noise: senior reviewers disagree with ground truth more on subjective criteria. */
const REVIEWER_NOISE: Record<string, number> = {
  'Q-GRT': 0.01, 'Q-REC': 0.01, 'Q-TAG': 0.005, 'Q-PRH': 0.005, 'Q-DUE': 0.01, 'Q-FAA': 0.01,
  'Q-VER': 0.02, 'Q-DIS': 0.02, 'Q-NXT': 0.03, 'Q-SUM': 0.04, 'Q-HRD': 0.05, 'Q-EMP': 0.07,
};
function reviewerLabels(r: Rng, truth: Truth): Record<string, Verdict> {
  const out: Record<string, Verdict> = {};
  for (const [k, v] of Object.entries(truth)) {
    out[k] = v !== 'na' && r.chance(REVIEWER_NOISE[k] ?? 0.03) ? (v === 'pass' ? 'fail' : 'pass') : v;
  }
  return out;
}

// ---------------------------------------------------------------- driver
const TOPICS: Record<QueueId, [Topic, number][]> = {
  INS: [['cancel_sold', 0.44], ['claim_status', 0.22], ['renewal_ncb', 0.18], ['address_update', 0.16]],
  CRD: [['fraud_txn', 0.3], ['duplicate_charge', 0.3], ['limit_increase', 0.2], ['annual_fee', 0.2]],
  COL: [['emi_overdue', 0.7], ['settlement', 0.3]],
};

export interface GeneratedCall extends Call {
  topic: string;
}

export function generateCorpus(seed = 20261020): GeneratedCall[] {
  const r = rng(seed);
  const calls: GeneratedCall[] = [];
  const start = new Date('2026-09-07T00:00:00+05:30').getTime();
  const days = 44; // Sep 7 – Oct 20
  let serial = 0;
  for (let d = 0; d < days; d++) {
    const date = new Date(start + d * 864e5);
    const dow = date.getUTCDay();
    const n = dow === 0 ? 3 : dow === 6 ? 4 : 9;
    const week = Math.floor(d / 7);
    for (let k = 0; k < n; k++) {
      const queue = r.pick<QueueId>(['INS', 'INS', 'INS', 'CRD', 'CRD', 'COL']);
      const agent = r.pick(AGENTS.filter((a) => a.queue === queue));
      const iso = new Date(date.getTime() + (9.5 + r.range(0, 8.5)) * 3600e3).toISOString();
      const p = { ...BASE, ...agent.p, ...(agent.coaching && iso.slice(0, 10) >= agent.coaching.date ? agent.coaching.after : {}) } as Record<B, number>;
      const hi = r.chance(agent.hinglish);
      const first = r.pick(FIRST);
      const last = r.pick(LAST);
      const female = /a$|i$/.test(first) && !['Ajay', 'Sanjay'].includes(first);
      const cust = {
        first,
        last,
        title: female ? 'Ms.' : 'Mr.',
        dob: `${r.int(1, 28)} ${r.pick(MONTHS)} ${r.int(1962, 2001)}`,
        phone: `${r.pick(['98', '97', '91', '88', '70'])}${r.int(100, 999)} ${r.int(10000, 99999)}`,
        email: `${first.toLowerCase()}.${last.toLowerCase()}${r.int(1, 99)}@gmail.com`,
      };
      const c: Ctx = { r, date: iso.slice(0, 10), hi, agent, p, brand: CLIENTS[queue].brand, tagline: CLIENTS[queue].tagline, cust, moves: [], truth: {}, triggers: [], unresolved: false };
      // topic mix; the cancellation-charge dispute grows over the last three weeks (emerging issue)
      let topic: Topic;
      const disputeShare = week < 3 ? 0.04 : week === 3 ? 0.16 : week === 4 ? 0.24 : 0.3;
      if (queue === 'INS' && r.chance(disputeShare)) topic = 'cancel_charge_dispute';
      else {
        const pool = TOPICS[queue];
        let x = r.next();
        topic = pool[pool.length - 1][0];
        for (const [t, w] of pool) {
          if ((x -= w) < 0) {
            topic = t;
            break;
          }
        }
      }
      opening(c, queue);
      if (queue === 'INS') insTopic(c, topic);
      else if (queue === 'CRD') crdTopic(c, topic);
      else colTopic(c, topic);
      closing(c);
      if (r.chance(p.interrupt)) addInterruption(c);
      // ground truth for criteria not decided by a move
      if (queue === 'INS' && !c.truth['Q-DIS']) c.truth['Q-DIS'] = 'na';
      if (queue === 'COL' && !c.truth['Q-HRD']) c.truth['Q-HRD'] = 'na';
      if (queue === 'COL' && !c.truth['Q-PRH']) c.truth['Q-PRH'] = 'pass';
      if (queue !== 'COL') c.truth['Q-PRH'] = 'pass';
      c.truth['Q-EMP'] = c.triggers.length ? (c.triggers.every((x) => x.empathetic) ? 'pass' : 'fail') : 'na';
      const utterances = toUtterances(c.moves, r, hi);
      serial++;
      const id = `VRS-${queue === 'INS' ? 'INS' : queue === 'CRD' ? 'CRD' : 'COL'}-${String(serial).padStart(4, '0')}`;
      // rotating blind sample, stratified by risk: compliance-heavy work is over-sampled
      const sampled = r.chance(topic === 'cancel_sold' ? 0.9 : queue === 'COL' ? 0.75 : 0.45);
      calls.push({
        id,
        client: CLIENTS[queue].client,
        queue,
        agentId: agent.id,
        agentName: agent.name,
        date: iso,
        duration: utterances[utterances.length - 1].end + 1,
        utterances,
        outcome: outcomes(r, c.truth, c.unresolved),
        reviewerLabels: sampled ? reviewerLabels(r, c.truth) : undefined,
        source: 'synthetic-corpus',
        topic,
      });
    }
  }
  // golden set: 40 reviewer-labelled calls, stratified across queues
  const labelled = calls.filter((c) => c.reviewerLabels);
  for (const q of ['INS', 'CRD', 'COL'] as QueueId[]) {
    const pool = labelled.filter((c) => c.queue === q);
    const take = q === 'COL' ? 12 : 14;
    for (let i = 0; i < Math.min(take, pool.length); i++) pool[Math.floor((i * pool.length) / take)].golden = true;
  }
  return calls;
}
