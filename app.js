/* =========================================================
   THE ROYAL DATE BUREAU
   A 100% static, serverless date-booking kingdom.

   How two people talk without a server:
     Princess mode  -> encodes her availability into a link  (#/book/<data>)
     Suitor mode    -> encodes his booking into a link       (#/booked/<data>)
   Nothing is stored anywhere except the URL + localStorage.
   ========================================================= */
(() => {
'use strict';

/* ---------------------------------------------------------
   0. tiny helpers
   --------------------------------------------------------- */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const app = $('#app');

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DOW    = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const DOW_LONG = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

const prettyDate = (s) => {
  const d = fromYmd(s);
  const dow = DOW_LONG[(d.getDay() + 6) % 7];
  return `${dow} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

const nf = (n) => n.toLocaleString('en-US');

/* url-safe base64 that survives emoji */
function b64e(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64d(s) {
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(t + '==='.slice((t.length + 3) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
const packState   = (o) => b64e(JSON.stringify(o));
const unpackState = (s) => { try { return JSON.parse(b64d(s)); } catch (e) { return null; } };

const store = {
  get(k, fb) { try { const v = localStorage.getItem('rdb:' + k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; } },
  set(k, v)  { try { localStorage.setItem('rdb:' + k, JSON.stringify(v)); } catch (e) {} }
};

/* deterministic pseudo-random so "statistics" feel stable-but-alive */
function seeded(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/* ---------------------------------------------------------
   1. toasts + confetti
   --------------------------------------------------------- */
function toast(msg, ms = 2600) {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = msg;
  box.appendChild(el);
  setTimeout(() => {
    el.classList.add('bye');
    setTimeout(() => el.remove(), 320);
  }, ms);
}

const CONF_COLORS = ['#ff5fa2', '#ffd23f', '#5fe3c0', '#b78cff', '#66d9ff', '#ff2e88'];
function confetti(count = 90) {
  const layer = $('#confetti');
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'conf';
    const c = CONF_COLORS[i % CONF_COLORS.length];
    const heart = Math.random() < 0.35;
    p.innerHTML = heart
      ? `<svg viewBox="0 0 32 30" style="color:${c}"><use href="#i-heart"/></svg>`
      : `<svg viewBox="0 0 24 24" style="color:${c}"><use href="#i-star"/></svg>`;
    p.style.left = Math.random() * 100 + 'vw';
    p.style.width = 10 + Math.random() * 16 + 'px';
    p.style.height = 'auto';
    p.style.animationDuration = 2.2 + Math.random() * 2.4 + 's';
    p.style.animationDelay = Math.random() * 0.7 + 's';
    layer.appendChild(p);
    setTimeout(() => p.remove(), 5600);
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
    ta.remove();
    return ok;
  }
}

/* ---------------------------------------------------------
   2. floating background hearts
   --------------------------------------------------------- */
(function floaters() {
  const box = $('#floaters');
  const glyphs = ['#i-heart', '#i-star', '#i-spark'];
  const cols = ['#ff5fa2', '#ffd23f', '#b78cff', '#5fe3c0'];
  for (let i = 0; i < 16; i++) {
    const f = document.createElement('div');
    f.className = 'floater';
    const g = glyphs[i % glyphs.length];
    f.innerHTML = `<svg viewBox="0 0 32 30" style="color:${cols[i % cols.length]}"><use href="${g}"/></svg>`;
    f.style.left = (Math.random() * 100) + 'vw';
    f.style.width = (16 + Math.random() * 26) + 'px';
    f.style.animationDuration = (13 + Math.random() * 16) + 's';
    f.style.animationDelay = (-Math.random() * 22) + 's';
    box.appendChild(f);
  }
})();

/* ---------------------------------------------------------
   3. content: slots, plans, rules, rivals, quiz
   --------------------------------------------------------- */
const SLOTS = [
  { t: '11:00', label: '🥞 Brunch Ambush' },
  { t: '15:00', label: '🫖 Afternoon Tea' },
  { t: '18:00', label: '🌅 Sunset Stroll' },
  { t: '19:30', label: '🍝 Dinner Quest' },
  { t: '21:30', label: '🌙 Moonlight Mischief' }
];

const PLANS = [
  { e: '🍕', t: 'Pizza & a terrible movie' },
  { e: '🍣', t: 'Sushi (my treat, obviously)' },
  { e: '🎡', t: 'Overpriced funfair' },
  { e: '🧺', t: 'Picnic, ants included' },
  { e: '🎬', t: 'Cinema + smuggled snacks' },
  { e: '🎮', t: 'Co-op game night' },
  { e: '🥾', t: 'A walk I will complain about' },
  { e: '💆', t: 'Spa day, I carry the bags' }
];

const RULES = [
  'Snacks are mandatory 🍿',
  'Zero (0) work talk 💼',
  'Minimum three compliments ✨',
  'He carries the bag 👜',
  'Phone stays in the pocket 📵',
  'Must end in dessert 🍰',
  'Doors get opened 🚪',
  'Playlist pre-approved 🎧',
  'One (1) photo of me, taken well 📸'
];

const RIVALS = [
  { n: 'Sir Reginald Bufflepuff III', h: '@horse_owner_1847', q: 'I have written her 41 poems. Two of them rhyme. I am ready.', likes: 12 },
  { n: 'Duke Gymothy',                h: '@leg_day_forever',  q: 'Told her my bench press. She said "cool". I think that means yes??', likes: 3 },
  { n: 'Baron von Textback',          h: '@wyd_specialist',   q: 'Sent "wyd" at 2am. Been 6 months. Still hopeful. Still typing…', likes: 0 },
  { n: 'Lord Cryptomir',              h: '@to_the_moon_pls',  q: 'I offered her 0.004 of a coin. She blocked me. Bear market problems.', likes: 1 },
  { n: 'Prince Overshare',            h: '@my_ex_though',     q: 'Opened with a 9-minute voice note about my ex. Felt honest.', likes: 2 },
  { n: 'Count Fingerguns',            h: '@pew_pew_charm',    q: 'Did the finger guns. Did them again. Committed to the bit.', likes: 27 },
  { n: 'Sir Nice-Guy-Actually',       h: '@but_im_nice',      q: 'I opened a door in 2019 and have been waiting patiently since.', likes: 4 },
  { n: 'Chad of the Northern Gym',    h: '@protein_knight',   q: 'Brought a bouquet of beef jerky. Romance is dead. I killed it.', likes: 18 },
  { n: 'Squire Beige',                h: '@nothing_special',  q: 'My hobbies include agreeing and being slightly damp.', likes: 0 },
  { n: 'The Mysterious Stranger',     h: '@no_pic_no_bio',    q: 'hey', likes: 0 },
  { n: 'Earl Grey (yes, like the tea)', h: '@steeped_in_love', q: 'I am 60% water and 40% wanting to know if she is free Thursday.', likes: 9 },
  { n: 'DJ Bassdrop',                 h: '@drops_beats_only', q: 'Made her a 4-hour mix. It is all one song. Slowed. Reverbed.', likes: 6 },
  { n: 'Sir Rides-A-Loud-Scooter',    h: '@vroom_vroom_king', q: 'She heard me coming from three streets away. That is presence.', likes: 5 },
  { n: 'Lord Fantasy Football',       h: '@my_team_my_life',  q: 'I can do Saturday, but only between 14:00 and 14:06.', likes: 2 }
];

const STAMPS = ['REJECTED', 'GHOSTED', 'LEFT ON READ', 'DENIED', 'BLOCKED', 'LOL NO', 'SEEN 👀', 'ARCHIVED'];

const QUIZ = [
  {
    q: 'She says "I\'m fine." What is your move, brave suitor?',
    opts: [
      { t: 'Snacks. Immediately. No questions.', s: 30, r: 'Correct. Snacks are a love language.' },
      { t: 'Ask what\'s wrong 4 times in a row', s: 12, r: 'Bold. Chaotic. Survivable.' },
      { t: '"ok"', s: -5, r: 'Guards have been notified.' },
      { t: 'Blanket, film, zero questions', s: 28, r: 'Elite emotional engineering.' }
    ]
  },
  {
    q: 'How many photos of her do you take before one is approved?',
    opts: [
      { t: 'As many as it takes 📸', s: 30, r: 'The kingdom respects this stamina.' },
      { t: 'Around 40. I have a system.', s: 25, r: 'A professional.' },
      { t: 'One. It was blurry. I sent it anyway.', s: 2, r: 'Straight to the dungeon.' },
      { t: 'I hand her the phone and flee', s: 15, r: 'Cowardly, yet efficient.' }
    ]
  },
  {
    q: 'The final boss: what do you order for her when she "isn\'t hungry"?',
    opts: [
      { t: 'Fries. Obviously fries.', s: 30, r: 'You have done this before.' },
      { t: 'Nothing, she said she\'s not hungry', s: -10, r: 'Rookie. Devastating. Reported.' },
      { t: 'Dessert, and a second dessert', s: 26, r: 'Dangerously correct.' },
      { t: 'My own food, to be shared 60/40', s: 20, r: 'Realistic. Slightly greedy.' }
    ]
  },
  {
    q: 'Pick your emotional support item for the date.',
    opts: [
      { t: 'A hoodie she will steal forever', s: 30, r: 'Sacrificial. Noble. Gone forever.' },
      { t: 'A power bank at 100%', s: 24, r: 'Practical royalty.' },
      { t: 'A backup plan for when plan A dies', s: 22, r: 'Strategic mind.' },
      { t: 'Vibes only 😎', s: 8, r: 'The guards are laughing at you.' }
    ]
  }
];

/* ---------------------------------------------------------
   4. cartoon suitor faces (procedural SVG)
   --------------------------------------------------------- */
function svgFace(i) {
  const rnd = seeded(i * 977 + 13);
  const skins = ['#ffd9b8', '#f0b98a', '#c98b5f', '#8a5a3b', '#ffe3c4'];
  const hairs = ['#3a2a1d', '#9b3f1f', '#1b1033', '#e8b93f', '#7a4de0', '#2e8b8b'];
  const shirts = ['#ff5fa2', '#66d9ff', '#5fe3c0', '#ffd23f', '#b78cff'];
  const skin = skins[Math.floor(rnd() * skins.length)];
  const hair = hairs[Math.floor(rnd() * hairs.length)];
  const shirt = shirts[Math.floor(rnd() * shirts.length)];
  const style = Math.floor(rnd() * 4);
  const brow = rnd() < 0.5 ? 'M28 40 l14 -5' : 'M28 36 l14 5';
  const mouth = rnd() < 0.5
    ? 'M38 66 q12 12 24 0'                 // hopeful smile
    : 'M38 72 q12 -10 24 0';               // devastated frown

  const hairShapes = [
    `<path d="M22 44C22 22 78 22 78 44c0 6-4 6-6 2-4-9-42-9-46 0-2 4-4 4-4-2Z" fill="${hair}" stroke="#1b1033" stroke-width="3.5" stroke-linejoin="round"/>`,
    `<path d="M24 46C18 20 82 18 76 46c-3-4-6-14-14-10-6 3-18 3-24-1-6-4-11 3-14 11Z" fill="${hair}" stroke="#1b1033" stroke-width="3.5" stroke-linejoin="round"/>`,
    `<circle cx="50" cy="30" r="16" fill="${hair}" stroke="#1b1033" stroke-width="3.5"/><path d="M26 46c0-14 48-14 48 0" fill="${hair}" stroke="#1b1033" stroke-width="3.5"/>`,
    `<path d="M26 46c2-18 46-18 48 0-6-2-10-6-14-2s-16 4-20 0-10 0-14 2Z" fill="${hair}" stroke="#1b1033" stroke-width="3.5" stroke-linejoin="round"/><path d="M70 26c8-6 14 2 8 8" fill="none" stroke="#1b1033" stroke-width="3.5"/>`
  ];

  return `<svg class="reel-face" viewBox="0 0 100 118" role="img" aria-label="A hopeful cartoon suitor">
    <path d="M18 118c0-20 14-30 32-30s32 10 32 30Z" fill="${shirt}" stroke="#1b1033" stroke-width="4" stroke-linejoin="round"/>
    <rect x="26" y="34" width="48" height="56" rx="24" fill="${skin}" stroke="#1b1033" stroke-width="4"/>
    ${hairShapes[style]}
    <circle cx="40" cy="56" r="4.5" fill="#1b1033"/>
    <circle cx="60" cy="56" r="4.5" fill="#1b1033"/>
    <circle cx="41.6" cy="54.4" r="1.5" fill="#fff"/>
    <circle cx="61.6" cy="54.4" r="1.5" fill="#fff"/>
    <path d="${brow}" stroke="#1b1033" stroke-width="3.5" stroke-linecap="round" fill="none"/>
    <path d="${brow.replace(/(\d+)/, (m) => m)}" transform="translate(100,0) scale(-1,1)" stroke="#1b1033" stroke-width="3.5" stroke-linecap="round" fill="none"/>
    <path d="${mouth}" stroke="#1b1033" stroke-width="4" stroke-linecap="round" fill="none"/>
    <circle cx="31" cy="68" r="5" fill="#ff5fa2" opacity=".45"/>
    <circle cx="69" cy="68" r="5" fill="#ff5fa2" opacity=".45"/>
  </svg>`;
}

/* the royal seal, for certificates */
function svgSeal() {
  return `<svg class="seal" viewBox="0 0 100 100" aria-hidden="true">
    <circle cx="50" cy="50" r="42" fill="#ff5fa2" stroke="#1b1033" stroke-width="5"/>
    <circle cx="50" cy="50" r="33" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="6 6">
      <animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="16s" repeatCount="indefinite"/>
    </circle>
    <use href="#i-crown" x="26" y="30" width="48" height="36" style="color:#ffd23f"/>
    <text x="50" y="76" text-anchor="middle" font-family="Bungee, sans-serif" font-size="11" fill="#fff">APPROVED</text>
  </svg>`;
}

/* ---------------------------------------------------------
   5. live (definitely real) kingdom statistics
   --------------------------------------------------------- */
function kingdomStats() {
  const now = new Date();
  const mins = Math.floor(now.getTime() / 60000);
  const r = seeded(mins);
  const inQueue   = 3800 + Math.floor(r() * 2200) + (now.getSeconds() % 17);
  const today     = 120 + Math.floor(r() * 90);
  const rejected  = Math.floor(today * (0.82 + r() * 0.1));
  const accepted  = 1;
  return { inQueue, today, rejected, accepted };
}

function statsMarkup() {
  const s = kingdomStats();
  return `<div class="stats" id="statBoard">
    <div class="stat"><b data-num="${s.inQueue}">${nf(s.inQueue)}</b><span>suitors in the royal queue</span></div>
    <div class="stat"><b data-num="${s.today}">${nf(s.today)}</b><span>applications today</span></div>
    <div class="stat"><b data-num="${s.rejected}">${nf(s.rejected)}</b><span>rejected before lunch</span></div>
    <div class="stat"><b data-num="1">1</b><span>lucky man (it's you)</span></div>
  </div>`;
}

function liveStats(root) {
  const board = $('#statBoard', root);
  if (!board) return () => {};
  const id = setInterval(() => {
    const cells = $$('b', board);
    [0, 1, 2].forEach((i) => {
      const cur = Number(cells[i].dataset.num) + Math.floor(Math.random() * 4);
      cells[i].dataset.num = cur;
      cells[i].textContent = nf(cur);
    });
  }, 2500);
  return () => clearInterval(id);
}

/* ---------------------------------------------------------
   6. THE HANDMADE CALENDAR
   Built from scratch: month maths, Monday-first grid,
   per-day state hooks, keyboard-friendly buttons.
   --------------------------------------------------------- */
function Calendar(opts) {
  const today = startOfToday();
  const state = {
    view: opts.startMonth ? new Date(opts.startMonth) : new Date(today.getFullYear(), today.getMonth(), 1)
  };
  const minMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const maxMonth = new Date(today.getFullYear(), today.getMonth() + 11, 1);
  const root = document.createElement('div');
  root.className = 'cal';

  function monthKey(d) { return d.getFullYear() * 12 + d.getMonth(); }

  function draw() {
    const y = state.view.getFullYear();
    const m = state.view.getMonth();
    const first = new Date(y, m, 1);
    const lead = (first.getDay() + 6) % 7;            // Monday-first offset
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    let cells = '';
    for (let i = 0; i < lead; i++) cells += `<span class="day blank"></span>`;

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(y, m, d);
      const key = ymd(date);
      const isPast = date < today;
      const isToday = key === ymd(today);
      const st = isPast ? { cls: 'past', disabled: true } : (opts.dayState ? opts.dayState(key, date) : {});
      const cls = ['day', st.cls || '', isToday ? 'today' : ''].filter(Boolean).join(' ');
      const dis = st.disabled ? 'disabled' : '';
      const label = st.label ? ` — ${st.label}` : '';
      cells += `<button type="button" class="${cls}" ${dis} data-day="${key}"
        aria-label="${prettyDate(key)}${label}" aria-pressed="${st.cls === 'picked' || st.cls === 'chosen' ? 'true' : 'false'}">
        ${d}${st.inner || ''}</button>`;
    }

    root.innerHTML = `
      <div class="cal-top">
        <button type="button" class="cal-nav" data-nav="-1" aria-label="Previous month"
          ${monthKey(state.view) <= monthKey(minMonth) ? 'disabled' : ''}>◀</button>
        <div class="cal-title">${MONTHS[m]} ${y}</div>
        <button type="button" class="cal-nav" data-nav="1" aria-label="Next month"
          ${monthKey(state.view) >= monthKey(maxMonth) ? 'disabled' : ''}>▶</button>
      </div>
      <div class="cal-dow">${DOW.map((d) => `<span>${d}</span>`).join('')}</div>
      <div class="cal-grid">${cells}</div>
      ${opts.legend || ''}`;
  }

  root.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-nav]');
    if (nav) {
      state.view = new Date(state.view.getFullYear(), state.view.getMonth() + Number(nav.dataset.nav), 1);
      draw();
      return;
    }
    const day = e.target.closest('[data-day]');
    if (day && !day.disabled && opts.onDay) opts.onDay(day.dataset.day, day);
  });

  draw();
  return { el: root, redraw: draw, get view() { return state.view; } };
}

const TICK = `<svg class="tick" viewBox="0 0 24 24" style="color:#ffd23f"><use href="#i-star"/></svg>`;

/* ---------------------------------------------------------
   7. the reel ("SuitorTok")
   --------------------------------------------------------- */
function mountReel(container, { duration = 4200, count = 7, startAt = 0 } = {}) {
  const rnd = seeded(Date.now() % 100000 + startAt);
  const picks = [];
  const used = new Set();
  while (picks.length < Math.min(count, RIVALS.length)) {
    const i = Math.floor(rnd() * RIVALS.length);
    if (!used.has(i)) { used.add(i); picks.push(i); }
  }

  let idx = 0;
  let timer = null;

  container.innerHTML = `
    <div class="reel-bars">${picks.map(() => `<div class="reel-bar"><i></i></div>`).join('')}</div>
    <div class="reel-stage" id="reelStage"></div>`;

  const stage = $('#reelStage', container);
  const bars = $$('.reel-bar', container);

  function show(i) {
    const rv = RIVALS[picks[i]];
    const stamp = STAMPS[(picks[i] + i) % STAMPS.length];
    const views = 300 + ((picks[i] * 137) % 900);
    stage.innerHTML = `
      <div class="reel-slide">
        ${svgFace(picks[i] + 1)}
        <div>
          <div class="reel-name">${esc(rv.n)}</div>
          <div class="reel-handle">${esc(rv.h)}</div>
          <div class="reel-quote">“${esc(rv.q)}”</div>
          <div class="reel-meta">
            <span>❤️ ${rv.likes}</span>
            <span>👀 ${views}</span>
            <span>⏳ waiting ${1 + (picks[i] % 9)}yr</span>
          </div>
        </div>
      </div>
      <div class="stamp">${stamp}</div>`;

    bars.forEach((b, bi) => {
      b.classList.remove('active', 'done');
      b.style.setProperty('--reel-dur', duration + 'ms');
      if (bi < i) b.classList.add('done');
      if (bi === i) { void b.offsetWidth; b.classList.add('active'); }
    });
  }

  function next() {
    idx = (idx + 1) % picks.length;
    show(idx);
    schedule();
  }
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(next, duration);
  }

  stage.addEventListener('click', next);
  show(0);
  schedule();

  return () => clearTimeout(timer);
}

/* ---------------------------------------------------------
   8. screen plumbing
   --------------------------------------------------------- */
let cleanups = [];
function render(html) {
  cleanups.forEach((fn) => { try { fn(); } catch (e) {} });
  cleanups = [];
  app.innerHTML = `<div class="screen">${html}</div>`;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  return app.firstElementChild;
}
const onCleanup = (fn) => cleanups.push(fn);
const go = (hash) => { location.hash = hash; };

function shareUrl(path) {
  return location.origin + location.pathname + location.search + '#' + path;
}

/* reusable share row */
function shareRow(url, id) {
  return `<div class="share-box">
    <input type="text" id="${id}" value="${esc(url)}" readonly onclick="this.select()" aria-label="Shareable link" />
    <button type="button" class="btn pink" data-copy="${id}">📋 Copy link</button>
  </div>`;
}
function bindCopy(root) {
  $$('[data-copy]', root).forEach((btn) => {
    btn.addEventListener('click', async () => {
      const input = $('#' + btn.dataset.copy, root);
      const ok = await copyText(input.value);
      toast(ok ? '📋 Copied! Now go paste it at him.' : '😖 Copy failed — select it and copy manually.');
      if (ok) { btn.textContent = '✅ Copied!'; setTimeout(() => { btn.textContent = '📋 Copy link'; }, 1800); }
    });
  });
}

/* ---------------------------------------------------------
   9. HOME — mode picker
   --------------------------------------------------------- */
function screenHome() {
  const saved = store.get('decree', null);
  const root = render(`
    <section class="hero">
      <span class="kicker">EST. TODAY · POPULATION: 1 PRINCESS</span>
      <h1 class="stroke-text">The Royal<br>Date Bureau</h1>
      <p class="hero-sub">The only officially unofficial portal where suitors queue,
      grovel, and occasionally get a date. Applications close when she gets bored.</p>
      <div class="ticker">
        <span>🚨 <b id="tk1">…</b> suitors queuing right now</span>
        <span>·</span>
        <span>💔 <b id="tk2">…</b> rejected today</span>
      </div>
    </section>

    <div class="modes mt">
      <button type="button" class="mode princess" data-goto="/princess">
        <span class="mode-tag">HER MAJESTY</span>
        <svg class="mode-avatar" viewBox="0 0 100 100" aria-hidden="true">
          <g><use href="#i-crown" x="26" y="4" width="48" height="36" style="color:#ffd23f"/></g>
          <rect x="28" y="38" width="44" height="50" rx="22" fill="#ffd9b8" stroke="#1b1033" stroke-width="4"/>
          <path d="M24 52c0-22 52-22 52 0 0 8-6-4-10-6-8 4-24 4-32 0-4 2-10 14-10 6Z" fill="#7a4de0" stroke="#1b1033" stroke-width="4" stroke-linejoin="round"/>
          <circle cx="42" cy="60" r="4" fill="#1b1033"/><circle cx="58" cy="60" r="4" fill="#1b1033"/>
          <path d="M42 74q8 8 16 0" stroke="#1b1033" stroke-width="4" fill="none" stroke-linecap="round"/>
          <circle cx="34" cy="70" r="4.5" fill="#ff5fa2" opacity=".5"/>
          <circle cx="66" cy="70" r="4.5" fill="#ff5fa2" opacity=".5"/>
        </svg>
        <h3>👑 Princess Mode</h3>
        <p>Open the royal calendar, decide which days are worthy, set your demands, then hand out a link. Absolute power. Zero effort.</p>
      </button>

      <button type="button" class="mode suitor" data-goto="${saved ? '/book/' + packState(saved) : '/queue'}">
        <span class="mode-tag">HOPEFUL</span>
        <svg class="mode-avatar" viewBox="0 0 100 118" aria-hidden="true">${svgFace(4).replace('<svg class="reel-face" viewBox="0 0 100 118" role="img" aria-label="A hopeful cartoon suitor">', '').replace('</svg>', '')}</svg>
        <h3>🤵 Suitor Mode</h3>
        <p>Join the queue behind several thousand desperate men, pass the vibe check, and beg for a slot. Good luck, champ.</p>
      </button>
    </div>

    <div class="card cream tilt-r mt">
      <h2>📜 How this ancient magic works</h2>
      <ol style="padding-left:20px;line-height:1.7">
        <li><b>She</b> picks her free days → gets a <b>Royal Decree link</b>.</li>
        <li><b>She</b> sends that link to <b>him</b> (text, whatever).</li>
        <li><b>He</b> queues, suffers, books a slot → gets a <b>Receipt link</b>.</li>
        <li><b>He</b> sends it back. Date confirmed. Kingdom rejoices. 🎉</li>
      </ol>
      <p class="muted">No servers, no accounts, no database. The whole date lives inside the link.</p>
    </div>`);

  $$('[data-goto]', root).forEach((b) => b.addEventListener('click', () => go(b.dataset.goto)));

  const bump = () => {
    const s = kingdomStats();
    $('#tk1', root).textContent = nf(s.inQueue);
    $('#tk2', root).textContent = nf(s.rejected);
  };
  bump();
  const id = setInterval(bump, 2000);
  onCleanup(() => clearInterval(id));
}

/* ---------------------------------------------------------
   10. PRINCESS MODE
   --------------------------------------------------------- */
function screenPrincess() {
  const decree = store.get('decree', { v: 1, n: '', d: {}, r: [0, 1, 2], m: '' });
  if (!decree.d) decree.d = {};

  const root = render(`
    <div class="card blush tilt-l">
      <span class="badge">STEP 1 · IDENTIFY YOURSELF</span>
      <h1 style="font-size:clamp(24px,6.5vw,40px)">👑 Princess Mode</h1>
      <p>Welcome, Your Majesty. Tap the days you would <em>consider</em> tolerating his presence.
      Everything else stays locked behind the royal guards.</p>
      <label class="fld"><span>Your royal name</span>
        <input type="text" id="pName" maxlength="28" placeholder="e.g. Princess Lucka" value="${esc(decree.n || '')}" />
      </label>
    </div>

    <div class="card">
      <span class="badge">STEP 2 · THE ROYAL CALENDAR</span>
      <h2>🗓️ Which days are worthy?</h2>
      <p class="muted">Tap a day to open it. Tap again to slam it shut. Past days are already dead to us.</p>
      <div id="calMount"></div>
      <div class="btn-row mt">
        <button type="button" class="btn mint" id="allWeekends">✨ All weekends this month</button>
        <button type="button" class="btn ghost" id="clearAll">🧹 Clear everything</button>
      </div>
    </div>

    <div class="card sun tilt-r">
      <span class="badge">STEP 3 · TIME SLOTS</span>
      <h2>⏰ When, exactly?</h2>
      <p class="muted">Each open day gets its own slots. He may only choose from these. Cruelty is encouraged.</p>
      <div id="slotList"></div>
    </div>

    <div class="card mint">
      <span class="badge">STEP 4 · YOUR DEMANDS</span>
      <h2>📜 Non-negotiable terms</h2>
      <div class="chips" id="ruleChips">
        ${RULES.map((r, i) => `<button type="button" class="chip ${decree.r.includes(i) ? 'on' : ''}" data-rule="${i}">${esc(r)}</button>`).join('')}
      </div>
      <label class="fld mt"><span>A personal message for the peasant</span>
        <textarea id="pMsg" maxlength="240" placeholder="Impress me. Bring snacks. Do not be late.">${esc(decree.m || '')}</textarea>
      </label>
    </div>

    <div class="card cream center">
      <span class="badge">STEP 5 · ISSUE THE DECREE</span>
      <h2>💌 Send him the link</h2>
      <p class="muted">This generates a link containing your availability. Send it to him. Then wait, powerfully.</p>
      <button type="button" class="btn pink big wiggle" id="makeLink">👑 Issue the Royal Decree</button>
      <div id="linkOut" class="mt"></div>
      <div class="hr"></div>
      <h3>📬 Already got his application?</h3>
      <p class="muted">Paste the receipt link he sent back to open it.</p>
      <div class="share-box">
        <input type="text" id="inboxUrl" placeholder="paste his link here…" />
        <button type="button" class="btn lilac" id="openInbox">Open it 👀</button>
      </div>
    </div>

    <div class="center mt"><button type="button" class="btn ghost" data-home>← back to the gates</button></div>`);

  /* --- calendar --- */
  const cal = Calendar({
    dayState: (key) => (decree.d[key] ? { cls: 'picked', inner: TICK, label: 'open for suitors' } : {}),
    legend: `<div class="cal-legend">
      <span><i class="lg-picked"></i>open for applications</span>
      <span><i style="background:#fff"></i>locked</span></div>`,
    onDay: (key) => {
      if (decree.d[key]) delete decree.d[key];
      else decree.d[key] = [2, 3];   // sensible default: sunset + dinner
      cal.redraw();
      drawSlots();
      save();
    }
  });
  $('#calMount', root).appendChild(cal.el);

  /* --- per-day slot editor --- */
  function drawSlots() {
    const box = $('#slotList', root);
    const days = Object.keys(decree.d).sort();
    if (!days.length) {
      box.innerHTML = `<p class="muted center" style="padding:14px 0">No days open yet. The kingdom is closed. 🚪</p>`;
      return;
    }
    box.innerHTML = days.map((key) => `
      <div class="dayslot">
        <header>
          <h4>${prettyDate(key)}</h4>
          <button type="button" class="x-btn" data-del="${key}" aria-label="Close ${prettyDate(key)}">✕</button>
        </header>
        <div class="chips">
          ${SLOTS.map((s, i) => `<button type="button" class="chip ${decree.d[key].includes(i) ? 'on mint' : ''}"
            data-slot="${key}:${i}">${esc(s.label)} · ${s.t}</button>`).join('')}
        </div>
      </div>`).join('');
  }

  $('#slotList', root).addEventListener('click', (e) => {
    const del = e.target.closest('[data-del]');
    if (del) {
      delete decree.d[del.dataset.del];
      cal.redraw(); drawSlots(); save();
      return;
    }
    const chip = e.target.closest('[data-slot]');
    if (!chip) return;
    const [key, iStr] = chip.dataset.slot.split(':');
    const i = Number(iStr);
    const list = decree.d[key];
    const at = list.indexOf(i);
    if (at >= 0) {
      if (list.length === 1) { toast('👑 A day needs at least one slot, Majesty.'); return; }
      list.splice(at, 1);
    } else {
      list.push(i); list.sort((a, b) => a - b);
    }
    drawSlots(); save();
  });

  /* --- quick actions --- */
  $('#allWeekends', root).addEventListener('click', () => {
    const v = cal.view;
    const y = v.getFullYear(), m = v.getMonth();
    const total = new Date(y, m + 1, 0).getDate();
    const today = startOfToday();
    let n = 0;
    for (let d = 1; d <= total; d++) {
      const date = new Date(y, m, d);
      if (date < today) continue;
      const dw = date.getDay();
      if (dw === 0 || dw === 6) { decree.d[ymd(date)] = decree.d[ymd(date)] || [2, 3]; n++; }
    }
    cal.redraw(); drawSlots(); save();
    toast(n ? `✨ ${n} weekend days unlocked. Generous.` : 'No weekends left this month, sorry!');
  });

  $('#clearAll', root).addEventListener('click', () => {
    decree.d = {};
    cal.redraw(); drawSlots(); save();
    toast('🧹 The kingdom is closed. Iconic.');
  });

  /* --- rules --- */
  $('#ruleChips', root).addEventListener('click', (e) => {
    const chip = e.target.closest('[data-rule]');
    if (!chip) return;
    const i = Number(chip.dataset.rule);
    const at = decree.r.indexOf(i);
    if (at >= 0) decree.r.splice(at, 1); else decree.r.push(i);
    chip.classList.toggle('on');
    save();
  });

  /* --- fields --- */
  $('#pName', root).addEventListener('input', (e) => { decree.n = e.target.value.trim(); save(); });
  $('#pMsg',  root).addEventListener('input', (e) => { decree.m = e.target.value; save(); });

  function save() { store.set('decree', decree); }

  /* --- generate link --- */
  $('#makeLink', root).addEventListener('click', () => {
    const days = Object.keys(decree.d);
    if (!days.length) { toast('👑 Open at least one day first, Majesty!'); return; }
    if (!decree.n) decree.n = 'The Princess';
    save();
    const url = shareUrl('/book/' + packState(decree));
    const out = $('#linkOut', root);
    out.innerHTML = `
      <div class="speech mt">Decree issued! ${days.length} day${days.length > 1 ? 's' : ''} unlocked,
      ${decree.r.length} demand${decree.r.length === 1 ? '' : 's'} attached. Send this to him:</div>
      ${shareRow(url, 'decreeUrl')}
      <div class="btn-row center mt">
        <a class="btn sky" href="${esc(url)}" target="_blank" rel="noopener">👀 Preview his side</a>
        <a class="btn mint" href="${esc('sms:?&body=' + encodeURIComponent('Your application portal is open, peasant: ' + url))}">💬 Text it</a>
      </div>`;
    bindCopy(out);
    confetti(60);
    toast('👑 Royal Decree issued!');
  });

  /* --- inbox --- */
  $('#openInbox', root).addEventListener('click', () => {
    const raw = $('#inboxUrl', root).value.trim();
    const at = raw.indexOf('#/booked/');
    if (at < 0) { toast('🤨 That doesn\'t look like his receipt link.'); return; }
    location.hash = raw.slice(at + 1);
  });

  drawSlots();
  $$('[data-home]', root).forEach((b) => b.addEventListener('click', () => go('/')));
}

/* ---------------------------------------------------------
   11. SUITOR MODE — the queue
   --------------------------------------------------------- */
const QUEUE_LINES = [
  'Verifying you are not one of her exes…',
  'Counting the men ahead of you… (this may hurt)',
  'Cross-checking your Spotify Wrapped… concerning.',
  'Asking her best friend for approval… she is laughing.',
  'Scanning old messages for the word "k"…',
  'Weighing your snack-buying potential…',
  'Consulting the royal cat. The cat is undecided.',
  'Measuring vibes. Vibes: acceptable-ish.',
  'Escorting 4,000 other men out of the building…'
];

function screenQueue(payload) {
  const decree = payload ? unpackState(payload) : null;
  const her = (decree && decree.n) || 'The Princess';
  const start = kingdomStats().inQueue;

  const root = render(`
    <div class="card blush tilt-l center queue-box">
      <span class="badge">ROYAL WAITING ROOM</span>
      <h1 style="font-size:clamp(22px,6vw,38px)">🤵 You are in the queue</h1>
      <p class="muted">Applications for <b>${esc(her)}</b> are currently... competitive.</p>
      <span class="queue-num" id="qNum">${nf(start)}</span>
      <p style="margin-top:4px"><b>men ahead of you</b></p>
      <div class="queue-bar"><i id="qBar"></i></div>
      <p id="qLine" style="min-height:3em">${esc(QUEUE_LINES[0])}</p>
      <div id="qActions" class="btn-row center"></div>
    </div>

    <div class="card">
      <div class="reel-head">
        <h2>📱 Live from the queue</h2>
        <span class="badge">#SuitorTok</span>
      </div>
      <p class="muted">Other applicants. Do not be like them.</p>
      <div class="reel-wrap" id="reel"></div>
    </div>

    ${statsMarkup()}

    <div class="center mt"><button type="button" class="btn ghost" data-home>← flee the kingdom</button></div>`);

  onCleanup(mountReel($('#reel', root)));
  onCleanup(liveStats(root));

  /* animated countdown */
  const numEl = $('#qNum', root), barEl = $('#qBar', root), lineEl = $('#qLine', root);
  const DUR = 9000;
  const t0 = performance.now();
  let done = false, raf = 0, skipped = false;

  function finish() {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    numEl.textContent = '1';
    barEl.style.width = '100%';
    lineEl.innerHTML = `<b>🎺 IT IS YOUR TURN, BRAVE ONE.</b>`;
    $('#qActions', root).innerHTML =
      `<button type="button" class="btn pink big wiggle" id="qGo">🚪 Enter the throne room</button>`;
    $('#qGo', root).addEventListener('click', () => {
      go(payload ? '/quiz/' + payload : '/quiz');
    });
    confetti(30);
  }

  function tick(now) {
    const p = Math.min(1, (now - t0) / DUR);
    const eased = 1 - Math.pow(1 - p, 3);
    const left = Math.max(1, Math.round(start - (start - 1) * eased));
    numEl.textContent = nf(left);
    barEl.style.width = (eased * 100).toFixed(1) + '%';
    const li = Math.min(QUEUE_LINES.length - 1, Math.floor(p * QUEUE_LINES.length));
    if (lineEl.textContent !== QUEUE_LINES[li]) lineEl.textContent = QUEUE_LINES[li];
    if (p < 1) raf = requestAnimationFrame(tick); else finish();
  }
  raf = requestAnimationFrame(tick);
  onCleanup(() => cancelAnimationFrame(raf));

  /* bribe button */
  setTimeout(() => {
    if (done || skipped) return;
    const acts = $('#qActions', root);
    if (!acts) return;
    acts.innerHTML = `<button type="button" class="btn sun" id="qSkip">💰 Bribe the guards (500 kisses)</button>`;
    $('#qSkip', root).addEventListener('click', () => {
      skipped = true;
      toast('💋 500 kisses accepted. The guards are blushing.');
      setTimeout(finish, 700);
    });
  }, 2200);

  $$('[data-home]', root).forEach((b) => b.addEventListener('click', () => go('/')));
}

/* ---------------------------------------------------------
   12. SUITOR MODE — the vibe check
   --------------------------------------------------------- */
function screenQuiz(payload) {
  let step = 0, score = 0;
  const root = render(`
    <div class="card sun tilt-r center">
      <span class="badge">SECURITY CHECKPOINT</span>
      <h1 style="font-size:clamp(22px,6vw,36px)">🧠 The Vibe Check</h1>
      <p class="muted">Four questions stand between you and the calendar. The guards are watching. So is she.</p>
    </div>
    <div class="card" id="quizCard"></div>
    <div class="center mt"><button type="button" class="btn ghost" data-home>← surrender</button></div>`);

  function drawQ() {
    const q = QUIZ[step];
    $('#quizCard', root).innerHTML = `
      <div class="progress-dots">${QUIZ.map((_, i) => `<i class="${i <= step ? 'on' : ''}"></i>`).join('')}</div>
      <div class="quiz-q">${esc(q.q)}</div>
      <div class="opts">
        ${q.opts.map((o, i) => `<button type="button" class="opt" data-opt="${i}">${esc(o.t)}</button>`).join('')}
      </div>`;
  }

  $('#quizCard', root).addEventListener('click', (e) => {
    const btn = e.target.closest('[data-opt]');
    if (!btn || btn.classList.contains('picked')) return;
    const opt = QUIZ[step].opts[Number(btn.dataset.opt)];
    btn.classList.add('picked');
    score += opt.s;
    toast(`${opt.s >= 20 ? '✅' : opt.s > 0 ? '😬' : '💀'} ${esc(opt.r)}`, 2000);
    setTimeout(() => {
      step++;
      if (step < QUIZ.length) drawQ();
      else finish();
    }, 700);
  });

  function finish() {
    const max = QUIZ.reduce((a, q) => a + Math.max(...q.opts.map((o) => o.s)), 0);
    const pct = Math.max(38, Math.round((score / max) * 100));
    const verdict = pct >= 90 ? 'ELITE HUSBAND MATERIAL'
      : pct >= 70 ? 'ACCEPTABLE. BARELY.'
      : pct >= 50 ? 'SHE WILL FIX YOU. PROBABLY.'
      : 'HOW ARE YOU EVEN DATING HER';
    store.set('score', pct);
    $('#quizCard', root).innerHTML = `
      <div class="center">
        <h2>📊 Results are in</h2>
        <span class="queue-num" style="color:#5fe3c0">${pct}%</span>
        <p><b>${esc(verdict)}</b></p>
        <p class="muted">You beat ${nf(3000 + pct * 27)} other applicants. They are crying. You are not.</p>
        <button type="button" class="btn mint big wiggle" id="toCal">🗓️ Open the royal calendar</button>
      </div>`;
    confetti(50);
    $('#toCal', root).addEventListener('click', () => go(payload ? '/pick/' + payload : '/pick'));
  }

  drawQ();
  $$('[data-home]', root).forEach((b) => b.addEventListener('click', () => go('/')));
}

/* ---------------------------------------------------------
   13. SUITOR MODE — pick a day, beg, book
   --------------------------------------------------------- */
function screenPick(payload) {
  const decree = payload ? unpackState(payload) : store.get('decree', null);
  if (!decree || !decree.d || !Object.keys(decree.d).length) return screenNoDecree();

  const her = decree.n || 'The Princess';
  const openDays = Object.keys(decree.d).sort();
  const firstMonth = fromYmd(openDays[0]);
  const pick = { day: null, slot: null, plan: null };

  const root = render(`
    <div class="card blush tilt-l">
      <span class="badge">APPLICATION FORM 7B</span>
      <h1 style="font-size:clamp(22px,6vw,36px)">🗓️ Choose your moment</h1>
      <p>Her Majesty <b>${esc(her)}</b> has unlocked <b>${openDays.length}</b> day${openDays.length > 1 ? 's' : ''}.
      Everything else is guarded by men with very large hats.</p>
      ${decree.m ? `<div class="speech mt">💬 “${esc(decree.m)}”<br><span class="muted">— ${esc(her)}</span></div>` : ''}
    </div>

    <div class="card">
      <h2>👑 The royal calendar</h2>
      <p class="muted">Green days are yours for the taking. Grey days will insult you if tapped.</p>
      <div id="calMount"></div>
    </div>

    <div class="card sun" id="slotCard" style="display:none">
      <h2>⏰ Pick your slot</h2>
      <div class="chips" id="slotChips"></div>
    </div>

    <div class="card mint" id="planCard" style="display:none">
      <h2>🎯 What's the plan, genius?</h2>
      <div class="chips" id="planChips"></div>
      <label class="fld mt"><span>Your name (as it will appear on the certificate)</span>
        <input type="text" id="sName" maxlength="24" placeholder="e.g. Alexander the Hopeful" value="${esc(store.get('suitorName', ''))}" />
      </label>
      <label class="fld"><span>Your grovel (optional but strongly advised)</span>
        <textarea id="sVow" maxlength="240" placeholder="I promise snacks, punctuality, and at least three (3) compliments."></textarea>
      </label>
      <button type="button" class="btn pink big wide wiggle" id="submitBtn">💍 Submit my application</button>
    </div>

    ${decree.r && decree.r.length ? `<div class="card cream tilt-r">
      <h2>📜 Terms you are agreeing to</h2>
      <ul class="rules-list">${decree.r.map((i) => `<li>${esc(RULES[i] || '')}</li>`).join('')}</ul>
    </div>` : ''}

    <div class="center mt"><button type="button" class="btn ghost" data-home>← back to the gates</button></div>`);

  const cal = Calendar({
    startMonth: new Date(firstMonth.getFullYear(), firstMonth.getMonth(), 1),
    dayState: (key) => {
      if (pick.day === key) return { cls: 'chosen', inner: TICK, label: 'your chosen day' };
      if (decree.d[key]) return { cls: 'free', inner: `<span class="dot-row">${decree.d[key].slice(0, 4).map(() => '<b style="width:5px;height:5px;border-radius:50%;background:#1b1033;display:block"></b>').join('')}</span>`, label: 'available' };
      return { cls: 'locked', inner: `<span class="bar"></span>`, disabled: false, label: 'locked by royal decree' };
    },
    legend: `<div class="cal-legend">
      <span><i class="lg-free"></i>she is free</span>
      <span><i class="lg-locked"></i>denied by decree</span>
      <span><i class="lg-picked" style="background:#ffd23f"></i>your choice</span></div>`,
    onDay: (key, el) => {
      if (!decree.d[key]) {
        el.animate(
          [{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }],
          { duration: 260, iterations: 2 }
        );
        toast(DENIALS[Math.floor(Math.random() * DENIALS.length)]);
        return;
      }
      pick.day = key; pick.slot = null;
      cal.redraw();
      drawSlots();
    }
  });
  $('#calMount', root).appendChild(cal.el);

  function drawSlots() {
    const card = $('#slotCard', root);
    card.style.display = '';
    $('#slotChips', root).innerHTML = decree.d[pick.day]
      .map((i) => `<button type="button" class="chip ${pick.slot === i ? 'sel' : ''}" data-s="${i}">${esc(SLOTS[i].label)} · ${SLOTS[i].t}</button>`)
      .join('');
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  $('#slotChips', root).addEventListener('click', (e) => {
    const c = e.target.closest('[data-s]');
    if (!c) return;
    pick.slot = Number(c.dataset.s);
    drawSlots();
    const pc = $('#planCard', root);
    pc.style.display = '';
    pc.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  $('#planChips', root).innerHTML = PLANS
    .map((p, i) => `<button type="button" class="chip" data-p="${i}">${p.e} ${esc(p.t)}</button>`).join('');
  $('#planChips', root).addEventListener('click', (e) => {
    const c = e.target.closest('[data-p]');
    if (!c) return;
    pick.plan = Number(c.dataset.p);
    $$('#planChips .chip', root).forEach((x) => x.classList.toggle('sel', x === c));
  });

  $('#submitBtn', root).addEventListener('click', () => {
    if (pick.day == null || pick.slot == null) { toast('🤨 Pick a day and a slot first, hero.'); return; }
    if (pick.plan == null) { toast('🎯 Choose a plan. "We\'ll see" is not a plan.'); return; }
    const name = ($('#sName', root).value || '').trim() || 'A Nameless Hopeful';
    store.set('suitorName', name);
    const booking = {
      v: 1,
      s: name,
      n: her,
      d: pick.day,
      t: pick.slot,
      p: pick.plan,
      w: ($('#sVow', root).value || '').trim().slice(0, 240),
      q: store.get('score', 88),
      r: decree.r || []
    };
    go('/booked/' + packState(booking));
  });

  $$('[data-home]', root).forEach((b) => b.addEventListener('click', () => go('/')));
}

const DENIALS = [
  '🛡️ The guards say NO. Loudly.',
  '👑 That day belongs to her and her alone.',
  '🚫 Denied by royal decree. Try harder.',
  '😴 She is busy being unavailable that day.',
  '📵 That day is reserved for ignoring you.',
  '🐉 There is a dragon on that day. Sorry.'
];

/* ---------------------------------------------------------
   14. THE RECEIPT / CERTIFICATE
   --------------------------------------------------------- */
function screenBooked(payload) {
  const b = unpackState(payload);
  if (!b || !b.d) return screenBroken();

  const slot = SLOTS[b.t] || SLOTS[0];
  const plan = PLANS[b.p] || PLANS[0];
  const code = 'RDB-' + b.d.replace(/-/g, '').slice(4) + '-' + String(b.t) + String(b.p) + (b.s || 'X')[0].toUpperCase();
  const url = shareUrl('/booked/' + payload);

  const root = render(`
    <div class="cert">
      ${svgSeal()}
      <span class="badge">OFFICIAL · IRREVERSIBLE · LEGALLY NONSENSE</span>
      <h2>🎉 DATE SECURED 🎉</h2>
      <p>Against overwhelming competition, <b>${esc(b.s)}</b> has been granted an audience with
      <b>${esc(b.n || 'The Princess')}</b>.</p>
      <dl>
        <div><dt>DATE</dt><dd>${esc(prettyDate(b.d))}</dd></div>
        <div><dt>TIME</dt><dd>${esc(slot.label)} · ${slot.t}</dd></div>
        <div><dt>THE PLAN</dt><dd>${plan.e} ${esc(plan.t)}</dd></div>
        <div><dt>VIBE SCORE</dt><dd>${Number(b.q) || 88}% approved</dd></div>
        <div><dt>SUITORS DEFEATED</dt><dd>${nf(kingdomStats().inQueue)}</dd></div>
        <div><dt>CONFIRMATION CODE</dt><dd>${esc(code)}</dd></div>
      </dl>
      ${b.w ? `<div class="speech" style="text-align:left">💬 “${esc(b.w)}”<br><span class="muted">— ${esc(b.s)}, under oath</span></div>` : ''}
    </div>

    ${b.r && b.r.length ? `<div class="card cream tilt-l mt">
      <h2>📜 Binding terms</h2>
      <ul class="rules-list">${b.r.map((i) => `<li>${esc(RULES[i] || '')}</li>`).join('')}</ul>
      <p class="muted mt">Breach of terms results in immediate dessert forfeiture.</p>
    </div>` : ''}

    <div class="card center">
      <h2>📤 Send this back to her</h2>
      <p class="muted">This link <em>is</em> the booking. No servers involved — just vibes and base64.</p>
      ${shareRow(url, 'bookedUrl')}
      <div class="btn-row center mt">
        <button type="button" class="btn sun" id="againBtn">🎊 More confetti</button>
        <button type="button" class="btn ghost" data-home>🏰 Back to the kingdom</button>
      </div>
    </div>

    <div class="card blush tilt-r">
      <div class="reel-head"><h2>💔 Meanwhile, the rejected</h2><span class="badge">LIVE</span></div>
      <p class="muted">They queued. They failed. You did not.</p>
      <div class="reel-wrap" id="reel"></div>
    </div>`);

  confetti(150);
  onCleanup(mountReel($('#reel', root), { duration: 3600, startAt: 5 }));
  bindCopy(root);
  $('#againBtn', root).addEventListener('click', () => { confetti(120); toast('🎉 The kingdom celebrates again.'); });
  $$('[data-home]', root).forEach((btn) => btn.addEventListener('click', () => go('/')));
}

/* ---------------------------------------------------------
   15. fallback screens
   --------------------------------------------------------- */
function screenNoDecree() {
  const root = render(`
    <div class="card cream center tilt-l">
      <h1 style="font-size:clamp(22px,6vw,36px)">🔒 No decree found</h1>
      <p>The royal calendar hasn't been opened yet, or your link lost its magic on the way here.</p>
      <p class="muted">Ask her nicely for a fresh <b>Royal Decree link</b>. Nicely. With snacks.</p>
      <div class="btn-row center mt">
        <button type="button" class="btn pink" data-goto="/princess">👑 I am the Princess</button>
        <button type="button" class="btn ghost" data-goto="/">🏰 Back to the gates</button>
      </div>
    </div>`);
  $$('[data-goto]', root).forEach((b) => b.addEventListener('click', () => go(b.dataset.goto)));
}

function screenBroken() {
  const root = render(`
    <div class="card center tilt-r">
      <h1 style="font-size:clamp(22px,6vw,36px)">🐉 This link is cursed</h1>
      <p>A dragon ate part of it. Ask for the full link again — they break if copied halfway.</p>
      <button type="button" class="btn pink mt" data-goto="/">🏰 Back to the gates</button>
    </div>`);
  $$('[data-goto]', root).forEach((b) => b.addEventListener('click', () => go(b.dataset.goto)));
}

/* ---------------------------------------------------------
   16. router
   --------------------------------------------------------- */
function route() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [, head, payload] = raw.split('/');
  switch (head) {
    case '':          return screenHome();
    case 'princess':  return screenPrincess();
    case 'queue':     return screenQueue(payload);
    case 'book':      return screenQueue(payload);      // decree link lands in the queue first 😈
    case 'quiz':      return screenQuiz(payload);
    case 'pick':      return screenPick(payload);
    case 'booked':    return screenBooked(payload);
    default:          return screenHome();
  }
}

window.addEventListener('hashchange', route);
route();

})();
