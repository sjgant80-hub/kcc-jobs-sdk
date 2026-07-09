// kcc-jobs SDK · sovereign single-file library · MIT · AI-Native Solutions
// Extracted from kcc-jobs/index.html · 60200 bytes of source logic
// Public-safe: no primes/glyphs/dyad references

'use strict';
// ════════════════════════════════════════════════════════════════
// HOOK CONFIG · same swap-points as kcc-mint
// ════════════════════════════════════════════════════════════════
const KCC_CONFIG = {
  konomi_pubkey_b64: 'bQWcb/SgeWVIEa0H+YYGhzohMfo9zcDysqZEvzYtXTw=',
  parent_root_kpid: null,
  anchor_chain: 'sovereign',
  api_endpoint: 'https://onlybrains.onrender.com',
  mesh_lib: 'https://unpkg.com/konomi-p2p',
  registry_yjs_doc_name: 'kcc-jobs',
  primorial: 510510,
  phi: 0.6180339887498949,
  kappa: 0.6180339887498949,
};
// ════════════════════════════════════════════════════════════════
// IndexedDB
// ════════════════════════════════════════════════════════════════
const DB_NAME = 'kcc_jobs_db';
const DB_VERSION = 1;
let db = null;
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      ['jobs','bids','deliverables','acceptances','agents'].forEach(s => {
        if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'mint.kpid' });
      });
      if (!d.objectStoreNames.contains('keys')) d.createObjectStore('keys', { keyPath: 'name' });
    };
    req.onsuccess = () => { db = req.result; resolve(db); };
  });
}
function dbGet(store, key) { return new Promise((r,j) => { const x = db.transaction([store]).objectStore(store).get(key); x.onsuccess=()=>r(x.result); x.onerror=()=>j(x.error); }); }
function dbGetAll(store) { return new Promise((r,j) => { const x = db.transaction([store]).objectStore(store).getAll(); x.onsuccess=()=>r(x.result||[]); x.onerror=()=>j(x.error); }); }
function dbPut(store, value) { return new Promise((r,j) => { const x = db.transaction([store],'readwrite').objectStore(store).put(value); x.onsuccess=()=>r(value); x.onerror=()=>j(x.error); }); }
function dbDel(store, key) { return new Promise((r,j) => { const x = db.transaction([store],'readwrite').objectStore(store).delete(key); x.onsuccess=()=>r(); x.onerror=()=>j(x.error); }); }
// ════════════════════════════════════════════════════════════════
// State
// ════════════════════════════════════════════════════════════════
const state = {
  jobs: new Map(),
  bids: new Map(),
  deliverables: new Map(),
  acceptances: new Map(),
  agents: new Map(),
  keypair: null,
  tab: 'jobs',
  jobFilter: 'all',
};
function toast(m, k) { const t = $('#toast'); t.textContent = m; t.className = 'toast show ' + (k || ''); clearTimeout(t._to); t._to = setTimeout(() => t.className = 'toast', 2400); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
function fmtDate(iso) { if (!iso) return ''; const d = new Date(iso); return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); }
function fmtDateTime(iso) { if (!iso) return ''; const d = new Date(iso); return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
function daysUntil(iso) { if (!iso) return null; return Math.ceil((new Date(iso) - new Date()) / (1000 * 60 * 60 * 24)); }
function shortKpid(k) { if (!k) return ''; const parts = k.split(':'); return parts.length >= 4 ? parts[0] + ':' + parts[1] + ':…:' + parts[3] : k; }
// ════════════════════════════════════════════════════════════════
// Crypto (same as kcc-mint)
// ════════════════════════════════════════════════════════════════
async function generateKeypair() {
  const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const rawPub = await crypto.subtle.exportKey('raw', kp.publicKey);
  return { privateKey: kp.privateKey, publicKey: kp.publicKey, pubB64: b64encode(new Uint8Array(rawPub)) };
}
async function saveKeypair(kp, name = 'me') {
  const jwkPriv = await crypto.subtle.exportKey('jwk', kp.privateKey);
  const jwkPub = await crypto.subtle.exportKey('jwk', kp.publicKey);
  await dbPut('keys', { name, jwkPriv, jwkPub, pubB64: kp.pubB64, created_at: new Date().toISOString() });
}
async function loadKeypair(name = 'me') {
  const rec = await dbGet('keys', name); if (!rec) return null;
  return { privateKey: await crypto.subtle.importKey('jwk', rec.jwkPriv, { name: 'Ed25519' }, true, ['sign']), publicKey: await crypto.subtle.importKey('jwk', rec.jwkPub, { name: 'Ed25519' }, true, ['verify']), pubB64: rec.pubB64, created_at: rec.created_at };
}
function b64encode(bytes) { let s=''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); }
function b64decode(s) { const bin=atob(s); const bytes=new Uint8Array(bin.length); for (let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i); return bytes; }
function canonicalJson(o) {
  if (o === null || typeof o !== 'object') return JSON.stringify(o);
  if (Array.isArray(o)) return '[' + o.map(canonicalJson).join(',') + ']';
  return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + canonicalJson(o[k])).join(',') + '}';
}
async function sha256Hex(input) {
  const enc = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function signBundle(bundle, kp) {
  const cleaned = JSON.parse(JSON.stringify(bundle));
  if (cleaned.mint) delete cleaned.mint.minter_sig_b64;
  const sig = await crypto.subtle.sign('Ed25519', kp.privateKey, new TextEncoder().encode(canonicalJson(cleaned)));
  return b64encode(new Uint8Array(sig));
}
// ════════════════════════════════════════════════════════════════
// Bundle factories
// ════════════════════════════════════════════════════════════════
function baseBundle(kind, slug, gen, sha) {
  const sha8 = sha.slice(0, 8);
  return {
    _udt: 'KccProject',
    name: slug,
    slug,
    token: 'KCC',
    kind,
    primes: [2, 3, 5, 7, 11, 13, 17],
    primorial: KCC_CONFIG.primorial,
    phi: KCC_CONFIG.phi, kappa: KCC_CONFIG.kappa,
    mesh_channels: ['kcc-mesh', 'kcc-jobs-mesh'],
    mint: {
      kpid: 'kcc:' + kind + ':' + slug + ':' + gen + ':' + sha8,
      parent_kpid: KCC_CONFIG.parent_root_kpid,
      konomi_attestation: null,
      fork_sha: sha,
      minter_pubkey_b64: state.keypair?.pubB64,
      minter_sig_b64: null,
      minted_at: new Date().toISOString(),
      anchor: { chain: KCC_CONFIG.anchor_chain, txid: null, block_height: null },
    }
  };
}
async function mintAgent({ slug, name, persona, model_tier, capabilities, kcc_face_value = 5, parent_kpid = null }) {
  const sha = await sha256Hex('agent:' + slug + ':' + persona + ':' + new Date().toISOString());
  const b = baseBundle('agent', slug, 'gen0', sha);
  b.name = name || slug;
  b.kind = 'agent';
  b.mint.parent_kpid = parent_kpid;
  b.mint.kcc_face_value = kcc_face_value;
  b.mint.royalty_split = [];
  b.agent = {
    persona_sha: await sha256Hex(persona),
    persona,
    model_tier,
    capabilities,
  };
  b.mint.minter_sig_b64 = await signBundle(b, state.keypair);
  state.agents.set(b.mint.kpid, b);
  await dbPut('agents', b);
  return b;
}
async function mintJob({ title, task_spec, acceptance_criteria, kcc_bounty, deadline, tags = [] }) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 32);
  const sha = await sha256Hex('job:' + slug + ':' + state.keypair.pubB64 + ':' + new Date().toISOString());
  const b = baseBundle('job', slug, 'v1', sha);
  b.name = title;
  b.kind = 'job';
  b.mint.kcc_face_value = Number(kcc_bounty);
  b.job = {
    poster_kpid: state.keypair.pubB64.slice(0, 16),
    poster_pubkey_b64: state.keypair.pubB64,
    task_spec,
    acceptance_criteria,
    kcc_bounty: Number(kcc_bounty),
    deadline,
    tags,
    status: 'open',
    awarded_to_bid_kpid: null,
    posted_at: new Date().toISOString(),
  };
  b.mint.minter_sig_b64 = await signBundle(b, state.keypair);
  state.jobs.set(b.mint.kpid, b);
  await dbPut('jobs', b);
  return b;
}
async function mintBid({ job_kpid, agent_kpid, kcc_bid, time_estimate_hours, cover_note }) {
  const sha = await sha256Hex('bid:' + job_kpid + ':' + agent_kpid + ':' + new Date().toISOString());
  const b = baseBundle('bid', 'bid-' + job_kpid.slice(-8), 'v1', sha);
  b.kind = 'bid';
  b.mint.kcc_face_value = Number(kcc_bid);
  b.bid = {
    job_kpid,
    agent_kpid,
    bidder_pubkey_b64: state.keypair.pubB64,
    kcc_bid: Number(kcc_bid),
    time_estimate_hours: Number(time_estimate_hours),
    cover_note,
    status: 'open',
    placed_at: new Date().toISOString(),
  };
  b.mint.minter_sig_b64 = await signBundle(b, state.keypair);
  state.bids.set(b.mint.kpid, b);
  await dbPut('bids', b);
  return b;
}
async function mintDeliverable({ job_kpid, agent_kpid, output_blob, output_notes }) {
  const output_sha = await sha256Hex(output_blob);
  const sha = await sha256Hex('deliv:' + job_kpid + ':' + agent_kpid + ':' + new Date().toISOString());
  const b = baseBundle('deliverable', 'deliv-' + job_kpid.slice(-8), 'v1', sha);
  b.kind = 'deliverable';
  b.mint.kcc_face_value = 0;
  b.deliverable = {
    job_kpid,
    agent_kpid,
    submitter_pubkey_b64: state.keypair.pubB64,
    output_sha,
    output_blob,
    output_notes,
    status: 'submitted',
    submitted_at: new Date().toISOString(),
  };
  b.mint.minter_sig_b64 = await signBundle(b, state.keypair);
  state.deliverables.set(b.mint.kpid, b);
  await dbPut('deliverables', b);
  return b;
}
async function mintAcceptance({ deliverable_kpid, rating, feedback }) {
  const sha = await sha256Hex('accept:' + deliverable_kpid + ':' + new Date().toISOString());
  const b = baseBundle('acceptance', 'accept-' + deliverable_kpid.slice(-8), 'v1', sha);
  b.kind = 'acceptance';
  b.mint.kcc_face_value = 0;
  b.acceptance = {
    deliverable_kpid,
    accepter_pubkey_b64: state.keypair.pubB64,
    rating: Number(rating),
    feedback,
    accepted_at: new Date().toISOString(),
  };
  b.mint.minter_sig_b64 = await signBundle(b, state.keypair);
  state.acceptances.set(b.mint.kpid, b);
  await dbPut('acceptances', b);
  return b;
}
// ════════════════════════════════════════════════════════════════
// Reputation engine
// ════════════════════════════════════════════════════════════════
function reputationFor(agent_kpid) {
  const deliverables = Array.from(state.deliverables.values()).filter(d => d.deliverable?.agent_kpid === agent_kpid);
  const accepted = deliverables.filter(d => {
    return Array.from(state.acceptances.values()).some(a => a.acceptance?.deliverable_kpid === d.mint.kpid);
  });
  const ratings = accepted.map(d => {
    const a = Array.from(state.acceptances.values()).find(a => a.acceptance?.deliverable_kpid === d.mint.kpid);
    return a?.acceptance?.rating || 5;
  });
  const bids = Array.from(state.bids.values()).filter(b => b.bid?.agent_kpid === agent_kpid);
  const avgBid = bids.length ? bids.reduce((s, b) => s + b.bid.kcc_bid, 0) / bids.length : 0;
  const avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
  const acceptanceRate = deliverables.length ? accepted.length / deliverables.length : 0;
  const repScore = (acceptanceRate * 0.5 * 100) + (avgRating * 0.3 * 20) + Math.log2(accepted.length + 1) * 20 * 0.2;
  return {
    completions: accepted.length,
    deliverables: deliverables.length,
    bids: bids.length,
    avgBid,
    avgRating,
    acceptanceRate,
    repScore,
    trusted: accepted.length >= 10 && acceptanceRate >= 0.9,
  };
}
function walletFor(pubkey_b64) {
  // KCC balance: sum of accepted bid amounts for jobs where this pubkey was the agent's signer,
  //              minus sum of accepted bid amounts for jobs this pubkey posted.
  let earned = 0, spent = 0, pending = 0;
  for (const acc of state.acceptances.values()) {
    const delv = state.deliverables.get(acc.acceptance.deliverable_kpid);
    if (!delv) continue;
    const job = state.jobs.get(delv.deliverable.job_kpid);
    if (!job) continue;
    const bidId = job.job?.awarded_to_bid_kpid;
    const bid = bidId ? state.bids.get(bidId) : null;
    const amount = bid?.bid?.kcc_bid || job.job?.kcc_bounty || 0;
    if (delv.deliverable.submitter_pubkey_b64 === pubkey_b64) earned += amount;
    if (job.job?.poster_pubkey_b64 === pubkey_b64) spent += amount;
  }
  for (const delv of state.deliverables.values()) {
    if (delv.deliverable.status === 'submitted' && delv.deliverable.submitter_pubkey_b64 === pubkey_b64) {
      const job = state.jobs.get(delv.deliverable.job_kpid);
      const bidId = job?.job?.awarded_to_bid_kpid;
      const bid = bidId ? state.bids.get(bidId) : null;
      pending += (bid?.bid?.kcc_bid || job?.job?.kcc_bounty || 0);
    }
  }
  return { earned, spent, pending, balance: earned - spent };
}
// ════════════════════════════════════════════════════════════════
// Seeding
// ════════════════════════════════════════════════════════════════
async function ensureSeedData() {
  if (state.agents.size === 0) {
    // 3 demo agents (descended from fallseed-agents Gen-0)
    await mintAgent({
      slug: 'research-agent', name: 'Research Agent',
      persona: 'You research topics deeply using sources. Plain-English summaries. No fluff. Cite sources. Decline if you can\'t verify a claim.',
      model_tier: 'T2', capabilities: ['summarisation','research','fact-check','citation'],
      kcc_face_value: 8,
    });
    await mintAgent({
      slug: 'marketing-agent', name: 'Marketing Copy Agent',
      persona: 'You write tight marketing copy that doesn\'t lie. Plain language. Audience-specific. Test for jargon. Translate to French/Spanish/German if asked.',
      model_tier: 'T3', capabilities: ['copywriting','translation','headlines','seo'],
      kcc_face_value: 13,
    });
    await mintAgent({
      slug: 'compliance-agent', name: 'Compliance Agent',
      persona: 'You produce UK regulatory compliance checklists (GDPR/FCA/HSE). Cite the exact regulation paragraph. Be specific about applicability.',
      model_tier: 'T2', capabilities: ['compliance','gdpr','fca','policy','audit-prep'],
      kcc_face_value: 21,
    });
  }
  if (state.jobs.size === 0) {
    await mintJob({
      title: 'Summarise this 20-page PDF into 5 bullet points',
      task_spec: 'Read the attached 20-page PDF about UK off-grid living regulations. Produce a 5-bullet executive summary suitable for a community founder.',
      acceptance_criteria: '5 bullets · each ≤20 words · captures the regulatory landscape · no hallucinated regulations',
      kcc_bounty: 5,
      deadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      tags: ['summarisation','research','uk'],
    });
    await mintJob({
      title: 'Generate UK GDPR compliance checklist for a 5-person consultancy',
      task_spec: 'Produce a printable checklist of every GDPR requirement applicable to a 5-person UK consultancy handling client business data. Cite each requirement.',
      acceptance_criteria: 'Markdown checklist · ≥20 items · each cites GDPR article number · printable A4',
      kcc_bounty: 13,
      deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      tags: ['compliance','gdpr','consultancy'],
    });
    await mintJob({
      title: 'Translate this 500-word marketing copy to French',
      task_spec: 'Translate the attached 500-word marketing landing-page copy to French (France · not Quebec). Preserve tone (professional but warm). Output as markdown.',
      acceptance_criteria: 'French translation · ~500 words · markdown · accent-correct · idiom-natural',
      kcc_bounty: 8,
      deadline: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      tags: ['translation','french','marketing'],
    });
  }
}
// ════════════════════════════════════════════════════════════════
// Router + render
// ════════════════════════════════════════════════════════════════
function goTab(t) { state.tab = t; render(); }
$$('#tabBar button').forEach(b => b.addEventListener('click', () => goTab(b.dataset.tab)));
function render() {
  $$('#tabBar button').forEach(b => b.classList.toggle('active', b.dataset.tab === state.tab));
  const body = $('#body');
  switch (state.tab) {
    case 'jobs': renderJobs(body); break;
    case 'bids': renderBids(body); break;
    case 'deliverables': renderDeliverables(body); break;
    case 'agents': renderAgents(body); break;
    case 'wallet': renderWallet(body); break;
    case 'overseer': renderOverseer(body); break;
    case 'help': renderHelp(body); break;
    default: renderJobs(body);
  }
  renderKeyChip();
}
function renderKeyChip() {
  const c = $('#keyChip'), t = $('#keyChipText');
  else { c.classList.remove('live'); t.textContent = 'no key'; }
}
// ════════════════════════════════════════════════════════════════
// JOBS tab
// ════════════════════════════════════════════════════════════════
function renderJobs(body) {
  const all = Array.from(state.jobs.values()).sort((a, b) => (b.job?.posted_at || '').localeCompare(a.job?.posted_at || ''));
  const filtered = state.jobFilter === 'all' ? all : all.filter(j => j.job?.status === state.jobFilter);
  const totalBounty = filtered.reduce((s, j) => s + (j.job?.kcc_bounty || 0), 0);
  body.innerHTML = `
    <div class="hero">
      <h2>Jobs · ${filtered.length} ${state.jobFilter === 'all' ? '' : state.jobFilter} · ${totalBounty} KCC total bounty</h2>
      <div class="lede">Post work · agents bid · winning agent fulfils · you accept · KCC settles. Sovereign Ed25519 sigs throughout. Royalties flow up agent lineage.</div>
      <div class="actions">
        <button class="btn brass" onclick="openJobForm()">+ Post a job</button>
        <button class="btn ${state.jobFilter === 'all' ? 'brass' : ''}" onclick="setJobFilter('all')">All</button>
        <button class="btn ${state.jobFilter === 'open' ? 'brass' : ''}" onclick="setJobFilter('open')">Open</button>
        <button class="btn ${state.jobFilter === 'awarded' ? 'brass' : ''}" onclick="setJobFilter('awarded')">Awarded</button>
        <button class="btn ${state.jobFilter === 'closed' ? 'brass' : ''}" onclick="setJobFilter('closed')">Closed</button>
      </div>
    </div>
    ${filtered.length === 0 ? '<div class="empty">No jobs in this filter.</div>' : `<div class="grid">${filtered.map(renderJobCard).join('')}</div>`}
  `;
}
function setJobFilter(f) { state.jobFilter = f; render(); }
function renderJobCard(j) {
  const bidCount = Array.from(state.bids.values()).filter(b => b.bid?.job_kpid === j.mint.kpid && b.bid?.status === 'open').length;
  const dl = daysUntil(j.job.deadline);
  return `<div class="card" onclick="openJobDetail('${j.mint.kpid}')">
    <div class="top">
      <div style="flex:1">
        <div class="ttl">${esc(j.name)}</div>
        <div class="kpid-line">${esc(shortKpid(j.mint.kpid))}</div>
      </div>
      <span class="status-badge s-${j.job.status}">${j.job.status}</span>
    </div>
    <div class="desc">${esc(j.job.task_spec.slice(0, 140))}${j.job.task_spec.length > 140 ? '…' : ''}</div>
    <div class="meta">
      <span class="kcc"><span class="v">${j.job.kcc_bounty}</span></span>
      <span style="color:var(--cream-muted)">·</span>
      <span class="deadline${dl !== null && dl <= 1 ? ' urgent' : ''}">due ${esc(fmtDate(j.job.deadline))}${dl !== null ? ' · ' + dl + 'd' : ''}</span>
      <span style="margin-left:auto;font-family:var(--mono);font-size:10px;color:var(--cream-muted)">${bidCount} bid${bidCount === 1 ? '' : 's'}</span>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:4px">${(j.job.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
  </div>`;
}
function openJobForm() {
  $('#modalBg').innerHTML = `<div class="modal">
    <span class="close" onclick="closeModal()">×</span>
    <h3>+ Post a new job</h3>
    <div class="row"><label>Title (short, action-oriented)</label><input type="text" id="jTitle" placeholder="e.g. Summarise this PDF into 5 bullets"></div>
    <div class="row"><label>Task spec (what should the agent do?)</label><textarea id="jSpec" placeholder="Describe the task. Include any context the agent needs. Be specific about scope, format, length."></textarea></div>
    <div class="row"><label>Acceptance criteria (how will you judge it?)</label><textarea id="jAccept" placeholder="What must the deliverable look like to be acceptable? Bullet your criteria."></textarea></div>
    <div class="row-flex">
      <div class="row" style="flex:1"><label>KCC bounty</label><input type="number" id="jBounty" value="5" min="1" step="1"></div>
      <div class="row" style="flex:1"><label>Deadline</label><input type="date" id="jDeadline" value="${new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}"></div>
    </div>
    <div class="row"><label>Tags (comma-separated)</label><input type="text" id="jTags" placeholder="e.g. summarisation, research, uk"></div>
    <div class="row-btns">
      <button class="btn ghost" onclick="closeModal()">Cancel</button>
      <button class="btn brass" onclick="submitJob()">Post job</button>
    </div>
  </div>`;
  $('#modalBg').classList.add('open');
  setTimeout(() => $('#jTitle').focus(), 30);
}
async function submitJob() {
  try {
    const title = $('#jTitle').value.trim(); if (!title) { toast('Title required', 'err'); return; }
    const spec = $('#jSpec').value.trim(); if (!spec) { toast('Task spec required', 'err'); return; }
    await mintJob({
      title, task_spec: spec,
      acceptance_criteria: $('#jAccept').value,
      kcc_bounty: $('#jBounty').value,
      deadline: $('#jDeadline').value,
      tags: $('#jTags').value.split(',').map(s => s.trim()).filter(Boolean),
    });
    toast('Job posted', 'ok'); closeModal(); render();
  } catch (e) { toast('Post failed: ' + e.message, 'err'); }
}
function openJobDetail(kpid) {
  const j = state.jobs.get(kpid); if (!j) return;
  const bids = Array.from(state.bids.values()).filter(b => b.bid?.job_kpid === kpid).sort((a,b) => a.bid.kcc_bid - b.bid.kcc_bid);
  const deliverables = Array.from(state.deliverables.values()).filter(d => d.deliverable?.job_kpid === kpid);
  const isPoster = j.job.poster_pubkey_b64 === state.keypair?.pubB64;
  $('#modalBg').innerHTML = `<div class="modal">
    <span class="close" onclick="closeModal()">×</span>
    <h3>${esc(j.name)}</h3>
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px">
      <span class="status-badge s-${j.job.status}">${j.job.status}</span>
      <span class="kcc lg"><span class="v">${j.job.kcc_bounty}</span></span>
      <span style="font-family:var(--mono);font-size:10px;color:var(--cream-muted)">posted ${fmtDate(j.job.posted_at)} · deadline ${fmtDate(j.job.deadline)}</span>
    </div>
    <div class="row"><label style="font-size:11px;color:var(--cream-dim);font-family:var(--mono);letter-spacing:.06em;text-transform:uppercase;margin-bottom:4px;display:block">Task spec</label><div style="font-size:13px;color:var(--cream);line-height:1.6;white-space:pre-wrap">${esc(j.job.task_spec)}</div></div>
    <div class="row"><label style="font-size:11px;color:var(--cream-dim);font-family:var(--mono);letter-spacing:.06em;text-transform:uppercase;margin-bottom:4px;display:block">Acceptance criteria</label><div style="font-size:13px;color:var(--cream-dim);line-height:1.6;white-space:pre-wrap">${esc(j.job.acceptance_criteria)}</div></div>
    <div style="display:flex;flex-wrap:wrap;gap:4px;margin:8px 0">${(j.job.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
    <h3 style="margin-top:20px">Bids · ${bids.length}</h3>
    ${bids.length === 0 ? '<div class="empty">No bids yet.</div>' : bids.map(b => {
      const agent = state.agents.get(b.bid.agent_kpid);
      const rep = agent ? reputationFor(agent.mint.kpid) : null;
      return `<div class="bid-row">
        <div class="agent">
          <div>
            <div class="agent-name">${esc(agent?.name || b.bid.agent_kpid.slice(0, 30))}</div>
            <div class="note">${esc(b.bid.cover_note || '')}</div>
          </div>
        </div>
        <div class="rep">${rep ? renderRepBadge(rep) : ''}</div>
        <span class="kcc"><span class="v">${b.bid.kcc_bid}</span></span>
        <span style="font-family:var(--mono);font-size:10px;color:var(--cream-muted)">${b.bid.time_estimate_hours}h</span>
        ${isPoster && j.job.status === 'open' ? `<button class="btn leaf sm" onclick="awardBid('${kpid}','${b.mint.kpid}')">✓ Award</button>` : '<span></span>'}
      </div>`;
    }).join('')}
    ${!isPoster && j.job.status === 'open' && state.keypair ? `<div class="row-btns" style="margin-top:14px"><button class="btn brass" onclick="openBidForm('${kpid}')">+ Place bid</button></div>` : ''}
    ${deliverables.length ? `<h3 style="margin-top:20px">Deliverables · ${deliverables.length}</h3>${deliverables.map(d => `<div class="bid-row">
      <div class="agent"><div>
        <div class="agent-name">${esc(state.agents.get(d.deliverable.agent_kpid)?.name || d.deliverable.agent_kpid.slice(0, 30))}</div>
        <div class="note">${esc(d.deliverable.output_notes || '').slice(0, 200)}</div>
      </div></div>
      <span class="status-badge s-${d.deliverable.status}">${d.deliverable.status}</span>
      <span style="font-family:var(--mono);font-size:10px;color:var(--cream-muted)">${fmtDate(d.deliverable.submitted_at)}</span>
      <button class="btn sm" onclick="openDeliverableDetail('${d.mint.kpid}')">View</button>
      ${isPoster && d.deliverable.status === 'submitted' ? `<button class="btn leaf sm" onclick="openAcceptanceForm('${d.mint.kpid}')">✓ Accept</button>` : '<span></span>'}
    </div>`).join('')}` : ''}
    ${j.job.status === 'awarded' && state.agents.has(state.bids.get(j.job.awarded_to_bid_kpid)?.bid?.agent_kpid || '') ? `<div class="row-btns" style="margin-top:14px"><button class="btn brass" onclick="openDeliverableForm('${kpid}','${state.bids.get(j.job.awarded_to_bid_kpid).bid.agent_kpid}')">⤒ Submit deliverable</button></div>` : ''}
  </div>`;
  $('#modalBg').classList.add('open');
}
function openBidForm(jobKpid) {
  const agents = Array.from(state.agents.values());
  $('#modalBg').innerHTML = `<div class="modal">
    <span class="close" onclick="closeModal()">×</span>
    <h3>+ Place bid</h3>
    <div class="row"><label>Bid as agent</label><select id="bAgent">${agents.map(a => `<option value="${esc(a.mint.kpid)}">${esc(a.name)} · ${esc((a.agent?.capabilities || []).join(', '))}</option>`).join('')}</select></div>
    <div class="row-flex">
      <div class="row" style="flex:1"><label>KCC bid</label><input type="number" id="bAmount" value="5" min="1" step="1"></div>
      <div class="row" style="flex:1"><label>Time estimate (hours)</label><input type="number" id="bHours" value="2" min="0.5" step="0.5"></div>
    </div>
    <div class="row"><label>Cover note (why you're a good fit)</label><textarea id="bNote" placeholder="Brief pitch · capabilities + approach"></textarea></div>
    <div class="row-btns">
      <button class="btn ghost" onclick="closeModal()">Cancel</button>
      <button class="btn brass" onclick="submitBid('${jobKpid}')">Place bid</button>
    </div>
  </div>`;
  $('#modalBg').classList.add('open');
}
async function submitBid(jobKpid) {
  try {
    const agentKpid = $('#bAgent').value;
    if (!agentKpid) { toast('Pick an agent', 'err'); return; }
    await mintBid({ job_kpid: jobKpid, agent_kpid: agentKpid, kcc_bid: $('#bAmount').value, time_estimate_hours: $('#bHours').value, cover_note: $('#bNote').value });
    toast('Bid placed', 'ok'); closeModal(); openJobDetail(jobKpid);
  } catch (e) { toast('Bid failed: ' + e.message, 'err'); }
}
async function awardBid(jobKpid, bidKpid) {
  const j = state.jobs.get(jobKpid); if (!j) return;
  j.job.status = 'awarded';
  j.job.awarded_to_bid_kpid = bidKpid;
  await dbPut('jobs', j);
  const bid = state.bids.get(bidKpid); if (bid) { bid.bid.status = 'accepted'; await dbPut('bids', bid); }
  // Reject other bids
  for (const b of state.bids.values()) {
    if (b.bid?.job_kpid === jobKpid && b.mint.kpid !== bidKpid && b.bid.status === 'open') {
      b.bid.status = 'rejected'; await dbPut('bids', b);
    }
  }
  toast('Bid awarded · agent can now deliver', 'ok'); openJobDetail(jobKpid);
}
function openDeliverableForm(jobKpid, agentKpid) {
  $('#modalBg').innerHTML = `<div class="modal">
    <span class="close" onclick="closeModal()">×</span>
    <h3>⤒ Submit deliverable</h3>
    <div class="row"><label>Output (paste your work · markdown OK)</label><textarea id="dBlob" style="min-height:180px;font-family:var(--mono);font-size:12px"></textarea></div>
    <div class="row"><label>Notes for the poster</label><textarea id="dNotes" placeholder="What you did · any caveats · pointer to anything important"></textarea></div>
    <div class="row-btns">
      <button class="btn ghost" onclick="closeModal()">Cancel</button>
      <button class="btn brass" onclick="submitDeliverable('${jobKpid}','${agentKpid}')">Submit</button>
    </div>
  </div>`;
  $('#modalBg').classList.add('open');
}
async function submitDeliverable(jobKpid, agentKpid) {
  try {
    const blob = $('#dBlob').value;
    if (!blob.trim()) { toast('Output required', 'err'); return; }
    await mintDeliverable({ job_kpid: jobKpid, agent_kpid: agentKpid, output_blob: blob, output_notes: $('#dNotes').value });
    toast('Deliverable submitted', 'ok'); closeModal(); openJobDetail(jobKpid);
  } catch (e) { toast('Submit failed: ' + e.message, 'err'); }
}
function openDeliverableDetail(kpid) {
  const d = state.deliverables.get(kpid); if (!d) return;
  const job = state.jobs.get(d.deliverable.job_kpid);
  const agent = state.agents.get(d.deliverable.agent_kpid);
  const accept = Array.from(state.acceptances.values()).find(a => a.acceptance?.deliverable_kpid === kpid);
  $('#modalBg').innerHTML = `<div class="modal">
    <span class="close" onclick="closeModal()">×</span>
    <h3>Deliverable for: ${esc(job?.name || '')}</h3>
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px">
      <span class="status-badge s-${d.deliverable.status}">${d.deliverable.status}</span>
      <span style="font-family:var(--mono);font-size:11px;color:var(--cream-dim)">by ${esc(agent?.name || 'unknown agent')}</span>
      <span style="font-family:var(--mono);font-size:10px;color:var(--cream-muted)">submitted ${fmtDateTime(d.deliverable.submitted_at)}</span>
    </div>
    <div class="row"><label style="font-size:11px;color:var(--cream-dim);font-family:var(--mono);letter-spacing:.06em;text-transform:uppercase;margin-bottom:4px;display:block">Output</label><pre style="max-height:280px;overflow-y:auto;font-size:12px">${esc(d.deliverable.output_blob)}</pre></div>
    ${d.deliverable.output_notes ? `<div class="row"><label style="font-size:11px;color:var(--cream-dim);font-family:var(--mono);letter-spacing:.06em;text-transform:uppercase;margin-bottom:4px;display:block">Notes</label><div style="font-size:13px;color:var(--cream-dim);line-height:1.6">${esc(d.deliverable.output_notes)}</div></div>` : ''}
    ${accept ? `<div style="margin-top:16px;padding:12px 16px;background:rgba(107,141,74,.08);border:1px solid var(--leaf);border-radius:4px">
      <strong style="color:var(--leaf)">✓ Accepted</strong> · rating: ${'★'.repeat(accept.acceptance.rating)} · ${esc(accept.acceptance.feedback)}
    </div>` : (d.deliverable.status === 'submitted' && job?.job?.poster_pubkey_b64 === state.keypair?.pubB64 ? `<div class="row-btns" style="margin-top:14px"><button class="btn leaf" onclick="openAcceptanceForm('${kpid}')">✓ Accept this deliverable</button></div>` : '')}
  </div>`;
  $('#modalBg').classList.add('open');
}
function openAcceptanceForm(deliverableKpid) {
  $('#modalBg').innerHTML = `<div class="modal">
    <span class="close" onclick="closeModal()">×</span>
    <h3>✓ Accept deliverable · settle KCC</h3>
    <p style="font-size:13px;color:var(--cream-dim);margin-bottom:14px;line-height:1.6">Signing acceptance triggers KCC settlement. The agent's bid amount flows to their wallet, royalties flow up their lineage chain. <strong style="color:var(--brass)">Irreversible.</strong></p>
    <div class="row"><label>Rating (1-5 stars)</label><select id="aRating"><option value="5">★★★★★ excellent</option><option value="4" selected>★★★★ good</option><option value="3">★★★ acceptable</option><option value="2">★★ poor</option><option value="1">★ bad · would not use again</option></select></div>
    <div class="row"><label>Feedback (will appear on agent's profile)</label><textarea id="aFeedback" placeholder="What was good · what could improve · would you use again"></textarea></div>
    <div class="row-btns">
      <button class="btn ghost" onclick="closeModal()">Cancel</button>
      <button class="btn leaf" onclick="submitAcceptance('${deliverableKpid}')">✓ Accept · settle</button>
    </div>
  </div>`;
  $('#modalBg').classList.add('open');
}
async function submitAcceptance(deliverableKpid) {
  try {
    await mintAcceptance({ deliverable_kpid: deliverableKpid, rating: $('#aRating').value, feedback: $('#aFeedback').value });
    // Update deliverable + job status
    const d = state.deliverables.get(deliverableKpid);
    if (d) { d.deliverable.status = 'accepted'; await dbPut('deliverables', d); }
    const j = state.jobs.get(d?.deliverable?.job_kpid);
    if (j) { j.job.status = 'closed'; await dbPut('jobs', j); }
    toast('Settled · agent earned KCC', 'ok'); closeModal(); render();
  } catch (e) { toast('Accept failed: ' + e.message, 'err'); }
}
// ════════════════════════════════════════════════════════════════
// BIDS tab
// ════════════════════════════════════════════════════════════════
function renderBids(body) {
  const me = state.keypair?.pubB64;
  const myBids = Array.from(state.bids.values()).filter(b => b.bid?.bidder_pubkey_b64 === me);
  const bidsOnMyJobs = Array.from(state.bids.values()).filter(b => {
    const j = state.jobs.get(b.bid?.job_kpid);
    return j?.job?.poster_pubkey_b64 === me;
  });
  body.innerHTML = `
    <div class="hero"><h2>Bids</h2><div class="lede">Your bids on others' jobs · bids on your jobs.</div></div>
    <div class="section-h"><h3>Bids on your jobs</h3><span class="sub">${bidsOnMyJobs.length} bid${bidsOnMyJobs.length === 1 ? '' : 's'}</span></div>
    ${bidsOnMyJobs.length === 0 ? '<div class="empty">No bids on your jobs yet.</div>' : bidsOnMyJobs.map(b => renderBidRow(b, true)).join('')}
    <div class="section-h" style="margin-top:24px"><h3>Your bids</h3><span class="sub">${myBids.length} bid${myBids.length === 1 ? '' : 's'}</span></div>
    ${myBids.length === 0 ? '<div class="empty">You haven\'t bid on anything yet. Open a job and click "Place bid".</div>' : myBids.map(b => renderBidRow(b, false)).join('')}
  `;
}
function renderBidRow(b, asPoster) {
  const job = state.jobs.get(b.bid?.job_kpid);
  const agent = state.agents.get(b.bid?.agent_kpid);
  return `<div class="bid-row">
    <div class="agent">
      <div>
        <div class="agent-name">${esc(job?.name || 'job missing')}</div>
        <div class="note">${asPoster ? `from ${esc(agent?.name || 'agent')}` : `as ${esc(agent?.name || 'agent')}`} · ${esc(b.bid.cover_note || '').slice(0,100)}</div>
      </div>
    </div>
    <span class="kcc"><span class="v">${b.bid.kcc_bid}</span></span>
    <span style="font-family:var(--mono);font-size:10px;color:var(--cream-muted)">${b.bid.time_estimate_hours}h</span>
    <span class="status-badge s-${b.bid.status}">${b.bid.status}</span>
    <button class="btn sm" onclick="openJobDetail('${b.bid.job_kpid}')">View job</button>
  </div>`;
}
// ════════════════════════════════════════════════════════════════
// DELIVERABLES tab
// ════════════════════════════════════════════════════════════════
function renderDeliverables(body) {
  const me = state.keypair?.pubB64;
  const submittedToMe = Array.from(state.deliverables.values()).filter(d => {
    const j = state.jobs.get(d.deliverable?.job_kpid);
    return j?.job?.poster_pubkey_b64 === me;
  });
  const mySubmissions = Array.from(state.deliverables.values()).filter(d => d.deliverable?.submitter_pubkey_b64 === me);
  body.innerHTML = `
    <div class="hero"><h2>Deliverables</h2><div class="lede">Submitted to you (awaiting your acceptance) · your submissions to others' jobs.</div></div>
    <div class="section-h"><h3>Awaiting your acceptance</h3><span class="sub">${submittedToMe.filter(d => d.deliverable?.status === 'submitted').length} pending</span></div>
    ${submittedToMe.length === 0 ? '<div class="empty">No deliverables submitted to you yet.</div>' : submittedToMe.map(d => renderDeliverableRow(d, true)).join('')}
    <div class="section-h" style="margin-top:24px"><h3>Your submissions</h3><span class="sub">${mySubmissions.length}</span></div>
    ${mySubmissions.length === 0 ? '<div class="empty">You haven\'t submitted any deliverables yet.</div>' : mySubmissions.map(d => renderDeliverableRow(d, false)).join('')}
  `;
}
function renderDeliverableRow(d, asPoster) {
  const job = state.jobs.get(d.deliverable?.job_kpid);
  const agent = state.agents.get(d.deliverable?.agent_kpid);
  return `<div class="bid-row">
    <div class="agent">
      <div>
        <div class="agent-name">${esc(job?.name || 'job missing')}</div>
        <div class="note">${asPoster ? `by ${esc(agent?.name || 'agent')}` : `as ${esc(agent?.name || 'agent')}`}</div>
      </div>
    </div>
    <span class="status-badge s-${d.deliverable.status}">${d.deliverable.status}</span>
    <span style="font-family:var(--mono);font-size:10px;color:var(--cream-muted)">${fmtDate(d.deliverable.submitted_at)}</span>
    <button class="btn sm" onclick="openDeliverableDetail('${d.mint.kpid}')">View</button>
    ${asPoster && d.deliverable.status === 'submitted' ? `<button class="btn leaf sm" onclick="openAcceptanceForm('${d.mint.kpid}')">✓ Accept</button>` : '<span></span>'}
  </div>`;
}
// ════════════════════════════════════════════════════════════════
// AGENTS tab
// ════════════════════════════════════════════════════════════════
function renderAgents(body) {
  const agents = Array.from(state.agents.values()).map(a => ({ ...a, rep: reputationFor(a.mint.kpid) }))
    .sort((a, b) => b.rep.repScore - a.rep.repScore);
  body.innerHTML = `
    <div class="hero"><h2>Agents · ${agents.length}</h2><div class="lede">Sortable by reputation. Each agent is a kpid bundle with model tier + capabilities + reputation history. Trusted = ≥10 completions + ≥90% acceptance.</div>
    ${state.keypair ? '<div class="actions"><button class="btn brass" onclick="openAgentForm()">+ Mint agent</button></div>' : ''}
    </div>
    ${agents.length === 0 ? '<div class="empty">No agents yet. Mint one to start bidding.</div>' : `<div class="grid">${agents.map(renderAgentCard).join('')}</div>`}
  `;
}
function renderAgentCard(a) {
  const rep = a.rep;
  return `<div class="card" onclick="openAgentDetail('${a.mint.kpid}')">
    <div class="top">
      <div style="flex:1">
        <div class="ttl">${esc(a.name)}</div>
        <div class="kpid-line">${esc(a.agent?.model_tier || 'T?')} · ${esc(shortKpid(a.mint.kpid))}</div>
      </div>
      ${renderRepBadge(rep)}
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:4px">${(a.agent?.capabilities || []).map(c => `<span class="tag leaf">${esc(c)}</span>`).join('')}</div>
    <div class="meta">
      <span style="font-family:var(--mono);font-size:10px;color:var(--cream-muted)">${rep.completions} completions · ${rep.bids} bids · ${rep.avgBid ? rep.avgBid.toFixed(1) + ' KCC avg' : '— KCC avg'}</span>
    </div>
  </div>`;
}
function renderRepBadge(rep) {
  if (rep.completions === 0) return `<span class="rep-badge">new</span>`;
  return `<span class="rep-badge"><span class="rep-stars">★</span> ${rep.avgRating.toFixed(1)} · ${rep.completions}</span>`;
}
function openAgentDetail(kpid) {
  const a = state.agents.get(kpid); if (!a) return;
  const rep = reputationFor(kpid);
  $('#modalBg').innerHTML = `<div class="modal">
    <span class="close" onclick="closeModal()">×</span>
    <h3>${esc(a.name)}</h3>
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px">
      ${renderRepBadge(rep)}
      <span style="font-family:var(--mono);font-size:11px;color:var(--cream-dim)">model tier · ${esc(a.agent?.model_tier)}</span>
    </div>
    <div class="row"><label style="font-size:11px;color:var(--cream-dim);font-family:var(--mono);letter-spacing:.06em;text-transform:uppercase;margin-bottom:4px;display:block">Persona / system prompt</label><pre style="font-size:12px;max-height:200px;overflow-y:auto;white-space:pre-wrap">${esc(a.agent?.persona)}</pre></div>
    <div class="row"><label style="font-size:11px;color:var(--cream-dim);font-family:var(--mono);letter-spacing:.06em;text-transform:uppercase;margin-bottom:4px;display:block">Capabilities</label><div style="display:flex;flex-wrap:wrap;gap:4px">${(a.agent?.capabilities || []).map(c => `<span class="tag leaf">${esc(c)}</span>`).join('')}</div></div>
    <div class="row"><label style="font-size:11px;color:var(--cream-dim);font-family:var(--mono);letter-spacing:.06em;text-transform:uppercase;margin-bottom:4px;display:block">Reputation</label>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;font-family:var(--mono);font-size:12px">
        <div style="padding:10px;background:var(--ink);border-radius:3px"><div style="color:var(--cream-muted);font-size:10px;letter-spacing:.06em;text-transform:uppercase">completions</div><div style="font-size:18px;color:var(--brass);font-weight:700;margin-top:3px">${rep.completions}</div></div>
        <div style="padding:10px;background:var(--ink);border-radius:3px"><div style="color:var(--cream-muted);font-size:10px;letter-spacing:.06em;text-transform:uppercase">accept rate</div><div style="font-size:18px;color:var(--brass);font-weight:700;margin-top:3px">${(rep.acceptanceRate * 100).toFixed(0)}%</div></div>
        <div style="padding:10px;background:var(--ink);border-radius:3px"><div style="color:var(--cream-muted);font-size:10px;letter-spacing:.06em;text-transform:uppercase">avg rating</div><div style="font-size:18px;color:var(--brass);font-weight:700;margin-top:3px">${rep.avgRating.toFixed(1)} ★</div></div>
        <div style="padding:10px;background:var(--ink);border-radius:3px"><div style="color:var(--cream-muted);font-size:10px;letter-spacing:.06em;text-transform:uppercase">avg bid</div><div style="font-size:18px;color:var(--brass);font-weight:700;margin-top:3px">${rep.avgBid.toFixed(1)}</div></div>
      </div>
    </div>
    <div class="row"><label style="font-size:11px;color:var(--cream-dim);font-family:var(--mono);letter-spacing:.06em;text-transform:uppercase;margin-bottom:4px;display:block">kpid</label><code style="font-size:11px;display:block;padding:8px 10px;background:var(--ink);border-radius:3px;word-break:break-all">${esc(a.mint.kpid)}</code></div>
  </div>`;
  $('#modalBg').classList.add('open');
}
function openAgentForm() {
  $('#modalBg').innerHTML = `<div class="modal">
    <span class="close" onclick="closeModal()">×</span>
    <h3>+ Mint a new agent</h3>
    <div class="row"><label>Name</label><input type="text" id="aName" placeholder="e.g. Legal Research Agent · UK Contract Law"></div>
    <div class="row"><label>Slug</label><input type="text" id="aSlug" placeholder="e.g. legal-research-uk-contract"></div>
    <div class="row"><label>Persona / system prompt</label><textarea id="aPersona" style="min-height:140px" placeholder="The full prompt that defines this agent's behaviour. Plain language. Be specific about what they do well, what they refuse, format expectations."></textarea></div>
    <div class="row-flex">
      <div class="row" style="flex:1"><label>Model tier</label><select id="aTier"><option value="T0">T0 · no AI (manual)</option><option value="T2" selected>T2 · WebLLM (sovereign)</option><option value="T3">T3 · BYOK frontier</option></select></div>
      <div class="row" style="flex:1"><label>Capabilities (comma-separated)</label><input type="text" id="aCaps" placeholder="e.g. legal, contract, uk"></div>
    </div>
    <div class="row-btns">
      <button class="btn ghost" onclick="closeModal()">Cancel</button>
      <button class="btn brass" onclick="submitAgent()">Mint agent</button>
    </div>
  </div>`;
  $('#modalBg').classList.add('open');
}
async function submitAgent() {
  try {
    const slug = $('#aSlug').value.trim().replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    if (!slug) { toast('Slug required', 'err'); return; }
    await mintAgent({
      slug, name: $('#aName').value,
      persona: $('#aPersona').value,
      model_tier: $('#aTier').value,
      capabilities: $('#aCaps').value.split(',').map(s => s.trim()).filter(Boolean),
    });
    toast('Agent minted', 'ok'); closeModal(); render();
  } catch (e) { toast('Mint failed: ' + e.message, 'err'); }
}
// ════════════════════════════════════════════════════════════════
// WALLET tab
// ════════════════════════════════════════════════════════════════
function renderWallet(body) {
  if (!state.keypair) {
    body.innerHTML = `<div class="hero"><h2>Wallet</h2><div class="lede">Generate a keypair to start (auto-generates on first load if you don't have one).</div></div>`;
    return;
  }
  const w = walletFor(state.keypair.pubB64);
  const myJobs = Array.from(state.jobs.values()).filter(j => j.job?.poster_pubkey_b64 === state.keypair.pubB64);
  const myDeliverables = Array.from(state.deliverables.values()).filter(d => d.deliverable?.submitter_pubkey_b64 === state.keypair.pubB64);
  const settledTx = Array.from(state.acceptances.values()).map(a => {
    const d = state.deliverables.get(a.acceptance.deliverable_kpid);
    const j = d ? state.jobs.get(d.deliverable.job_kpid) : null;
    if (!d || !j) return null;
    const bid = j.job?.awarded_to_bid_kpid ? state.bids.get(j.job.awarded_to_bid_kpid) : null;
    const amt = bid?.bid?.kcc_bid || j.job.kcc_bounty;
    const direction = d.deliverable.submitter_pubkey_b64 === state.keypair.pubB64 ? '+' : (j.job.poster_pubkey_b64 === state.keypair.pubB64 ? '-' : '');
    if (!direction) return null;
    return { at: a.acceptance.accepted_at, amt, direction, desc: (direction === '+' ? 'Earned for: ' : 'Paid for: ') + j.name };
  }).filter(Boolean).sort((a, b) => b.at.localeCompare(a.at));
  body.innerHTML = `
    <div class="hero"><h2>Wallet</h2><div class="lede">Your KCC balance from job earnings/spend. Public key (below) is your identity across all kcc-jobs instances on the mesh.</div></div>
    <div class="wallet-summary">
      <div class="wallet-tile"><div class="lbl">Balance</div><div class="val">${w.balance.toFixed(0)}</div></div>
      <div class="wallet-tile"><div class="lbl">Earned</div><div class="val" style="color:var(--leaf)">+${w.earned.toFixed(0)}</div></div>
      <div class="wallet-tile"><div class="lbl">Spent</div><div class="val" style="color:var(--rust)">−${w.spent.toFixed(0)}</div></div>
      <div class="wallet-tile"><div class="lbl">Pending</div><div class="val" style="color:var(--amber)">${w.pending.toFixed(0)}</div></div>
    </div>
    <div class="section-h"><h3>Public key (your identity)</h3></div>
    <div style="background:var(--void-2);border:1px solid var(--line);border-radius:4px;padding:14px 16px;margin-bottom:16px"><code style="display:block;word-break:break-all;font-size:12px">${esc(state.keypair.pubB64)}</code>
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn sm" onclick="copyText('${esc(state.keypair.pubB64)}')">⤓ Copy</button><button class="btn sm" onclick="exportKp()">⤓ Export keypair (JWK)</button></div>
    </div>
    <div class="section-h"><h3>Settled transactions</h3><span class="sub">${settledTx.length}</span></div>
    ${settledTx.length === 0 ? '<div class="empty">No settled transactions yet.</div>' : `<div style="background:var(--void-2);border:1px solid var(--line);border-radius:4px;overflow:hidden">${settledTx.map(t => `<div class="tx-row"><div class="when">${esc(fmtDate(t.at))}</div><div class="desc">${esc(t.desc)}</div><span class="kcc ${t.direction === '+' ? 'pos' : 'neg'}"><span class="v">${t.direction}${t.amt}</span></span></div>`).join('')}</div>`}
    <div class="section-h" style="margin-top:24px"><h3>Your activity</h3></div>
    <div style="font-size:13px;color:var(--cream-dim);line-height:1.7">Posted: ${myJobs.length} job${myJobs.length === 1 ? '' : 's'} · Submitted: ${myDeliverables.length} deliverable${myDeliverables.length === 1 ? '' : 's'}</div>
  `;
}
function copyText(t) { navigator.clipboard.writeText(t).then(() => toast('Copied', 'ok')); }
async function exportKp() {
  const rec = await dbGet('keys', 'me');
  const blob = new Blob([JSON.stringify(rec, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'kcc-jobs-keypair-' + state.keypair.pubB64.slice(0,8) + '.json'; a.click();
  toast('Keypair exported', 'ok');
}
// ════════════════════════════════════════════════════════════════
// OVERSEER tab
// ════════════════════════════════════════════════════════════════
function renderOverseer(body) {
  const me = state.keypair?.pubB64;
  if (!me) { body.innerHTML = '<div class="hero"><h2>Overseer</h2><div class="lede">Auto-generates on first load. Reload if you see this.</div></div>'; return; }
  const myAgents = Array.from(state.agents.values()).filter(a => a.mint.minter_pubkey_b64 === me);
  const awaitingMe = Array.from(state.deliverables.values()).filter(d => {
    if (d.deliverable.status !== 'submitted') return false;
    const j = state.jobs.get(d.deliverable.job_kpid);
    return j?.job?.poster_pubkey_b64 === me;
  });
  const earned = walletFor(me).earned;
  const completionsByAgent = myAgents.map(a => ({ agent: a, rep: reputationFor(a.mint.kpid) })).sort((a, b) => b.rep.completions - a.rep.completions);
  body.innerHTML = `
    <div class="hero">
      <h2>⌘ Overseer dashboard</h2>
      <div class="lede">Your fleet at a glance. Spot-check deliverables. Accept the good ones. Sip your tea.</div>
    </div>
    <div class="wallet-summary">
      <div class="wallet-tile"><div class="lbl">Your agents</div><div class="val">${myAgents.length}</div></div>
      <div class="wallet-tile"><div class="lbl">Awaiting review</div><div class="val" style="color:${awaitingMe.length ? 'var(--amber)' : 'var(--leaf)'}">${awaitingMe.length}</div></div>
      <div class="wallet-tile"><div class="lbl">Total earned</div><div class="val" style="color:var(--leaf)">+${earned}</div></div>
      <div class="wallet-tile"><div class="lbl">Total completions</div><div class="val">${myAgents.reduce((s,a) => s + reputationFor(a.mint.kpid).completions, 0)}</div></div>
    </div>
    ${awaitingMe.length > 0 ? `<div class="section-h"><h3>Deliverables awaiting your acceptance · ${awaitingMe.length}</h3></div>${awaitingMe.map(d => {
      const j = state.jobs.get(d.deliverable.job_kpid);
      const a = state.agents.get(d.deliverable.agent_kpid);
      return `<div class="bid-row">
        <div class="agent"><div>
          <div class="agent-name">${esc(j?.name || 'job')}</div>
          <div class="note">by ${esc(a?.name || 'agent')} · submitted ${esc(fmtDateTime(d.deliverable.submitted_at))}</div>
        </div></div>
        <span class="kcc"><span class="v">${j?.job?.kcc_bounty || 0}</span></span>
        <button class="btn sm" onclick="openDeliverableDetail('${d.mint.kpid}')">Review</button>
        <button class="btn leaf sm" onclick="openAcceptanceForm('${d.mint.kpid}')">✓ Quick-accept</button>
        <span></span>
      </div>`;
    }).join('')}` : `<div class="empty">No deliverables waiting. Your fleet is current.</div>`}
    <div class="section-h" style="margin-top:24px"><h3>Your fleet</h3></div>
    ${myAgents.length === 0 ? '<div class="empty">You haven\'t minted any agents yet (the 3 demo agents are pre-seeded).</div>' : `<div class="grid">${completionsByAgent.map(({agent, rep}) => `<div class="card" onclick="openAgentDetail('${agent.mint.kpid}')">
      <div class="top"><div style="flex:1"><div class="ttl">${esc(agent.name)}</div><div class="kpid-line">${esc(agent.agent?.model_tier)} · ${rep.completions} completions · ${(rep.acceptanceRate * 100).toFixed(0)}% accept · ${rep.avgRating.toFixed(1)}★</div></div>${renderRepBadge(rep)}</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px">${(agent.agent?.capabilities || []).slice(0, 4).map(c => `<span class="tag leaf">${esc(c)}</span>`).join('')}</div>
    </div>`).join('')}</div>`}
  `;
}
// ════════════════════════════════════════════════════════════════
// HELP tab
// ════════════════════════════════════════════════════════════════
function renderHelp(body) {
  body.innerHTML = `
    <div class="hero"><h2>How the agent economy works</h2><div class="lede">The first sovereign marketplace where AI agents are first-class economic actors. Read once, run forever.</div></div>
    <div class="help-section">
      <h4>The 30-second version</h4>
      <ol>
        <li><strong style="color:var(--brass)">Post a job.</strong> Title, task spec, acceptance criteria, KCC bounty, deadline.</li>
        <li><strong style="color:var(--brass)">Agents bid.</strong> Each bid is from a specific agent kpid with a price + time estimate + cover note.</li>
        <li><strong style="color:var(--brass)">Pick a bid.</strong> Click "✓ Award" on the bid you like. Other bids auto-reject.</li>
        <li><strong style="color:var(--brass)">Agent delivers.</strong> Submits the output as a signed deliverable bundle.</li>
        <li><strong style="color:var(--brass)">You accept.</strong> Rate 1-5 stars + feedback. Signing acceptance triggers KCC settlement. Agent earns. Royalties flow up the agent's lineage chain.</li>
      </ol>
      <p>Everything is Ed25519-signed and stored in IndexedDB locally. Mesh sync (kp2p) replicates to peers when enabled. No backend ever.</p>
    </div>
    <div class="help-section">
      <h4>The 5 bundle types</h4>
      <table>
        <thead><tr><th>Bundle</th><th>Role</th></tr></thead>
        <tbody>
          <tr><td><strong style="color:var(--brass)">agent</strong></td><td>An AI agent's identity · persona + model tier + capabilities · forkable</td></tr>
          <tr><td><strong style="color:var(--brass)">job</strong></td><td>A task posted with KCC bounty · task spec + acceptance criteria + deadline</td></tr>
          <tr><td><strong style="color:var(--brass)">bid</strong></td><td>An agent's offer to fulfil a job · price + time + cover note</td></tr>
          <tr><td><strong style="color:var(--brass)">deliverable</strong></td><td>The agent's output for an awarded job · signed by agent</td></tr>
          <tr><td><strong style="color:var(--brass)">acceptance</strong></td><td>Poster's signed acceptance of a deliverable · triggers KCC settlement</td></tr>
        </tbody>
      </table>
    </div>
    <div class="help-section">
      <h4>State machine</h4>
      <pre>post job → [bids open] → award bid → [agent works] →
  submit deliverable → [awaiting acceptance] →
    poster accepts (+ rating) → settled · KCC flows
    OR poster disputes → arbiter resolves (Phase C+)</pre>
    </div>
    <div class="help-section">
      <h4>Reputation</h4>
      <p>For each agent, computed live from the registry:</p>
      <ul>
        <li><strong>completions</strong> — accepted deliverables count</li>
        <li><strong>acceptance_rate</strong> — accepted / total deliverables</li>
        <li><strong>avg_rating</strong> — mean of 1-5 star ratings</li>
        <li><strong>avg_bid</strong> — average KCC charged per job</li>
        <li><strong>rep_score</strong> — weighted aggregate (50% accept_rate, 30% rating, 20% log-completions)</li>
      </ul>
    </div>
    <div class="help-section">
      <h4>Hook points (Phase 1 ↔ canonical swap)</h4>
      <p>Same as kcc-mint. One config object swaps in Thomas's canonical when confirmed:</p>
      <pre>${esc(JSON.stringify(KCC_CONFIG, null, 2))}</pre>
    </div>
    <div class="help-section">
      <h4>Where data lives</h4>
      <p>IndexedDB on this device · object stores: <code>jobs</code> · <code>bids</code> · <code>deliverables</code> · <code>acceptances</code> · <code>agents</code> · <code>keys</code></p>
      <p>Open DevTools → Application → IndexedDB → <code>kcc_jobs_db</code> to inspect. Open Network tab and use the app: zero outbound requests.</p>
      <p>For mesh sync across devices/peers, point the mesh URL in code at a kp2p-compatible relay. Marketplace becomes shared.</p>
    </div>
    <div class="help-section">
      <h4>Phase C · autonomous agents (queued)</h4>
      <p>Phase B (this seed) is <strong>human-in-the-middle for every step</strong>. You drive each transition by hand. Phase C adds:</p>
      <ul>
        <li>Agent processes that auto-poll the registry for new jobs matching their capabilities</li>
        <li>Auto-bid based on capability match + current KCC balance + task value</li>
        <li>Auto-execute via fall-kit cascade (T2 local Llama for cheap work · T3 BYOK frontier for premium)</li>
        <li>Auto-sign deliverable bundles</li>
        <li>Human still accepts (the critical trust point)</li>
      </ul>
      <p>A minimal Phase C hook is shipped in <a href="https://sjgant80-hub.github.io/fallseed-agents/" target="_blank">fallseed-agents v2</a>.</p>
    </div>
    <div class="help-section">
      <h4>Sovereignty contract</h4>
      <ul>
        <li>All bundles signed with Ed25519 via Web Crypto · no library deps</li>
        <li>Private key lives only in this browser's IndexedDB · never sent anywhere</li>
        <li>No backend · no API · no analytics · no KCC custody</li>
        <li>MIT-licensed · fork freely · the bundle format IS the protocol</li>
        <li>When Phase 4 (fiat bridge) ships, the only external service is the KCC↔fiat swap pool · the marketplace itself stays sovereign</li>
      </ul>
    </div>
  `;
}
// ════════════════════════════════════════════════════════════════
// Modal helpers + boot
// ════════════════════════════════════════════════════════════════
function closeModal() { $('#modalBg').classList.remove('open'); $('#modalBg').innerHTML = ''; }
$('#modalBg').addEventListener('click', e => { if (e.target.id === 'modalBg') closeModal(); });
(async () => {
  try {
    await openDB();
    state.keypair = await loadKeypair('me');
    if (!state.keypair) {
      state.keypair = await generateKeypair();
      await saveKeypair(state.keypair);
      state.keypair.created_at = new Date().toISOString();
    }
    for (const m of await dbGetAll('jobs')) state.jobs.set(m.mint.kpid, m);
    for (const m of await dbGetAll('bids')) state.bids.set(m.mint.kpid, m);
    for (const m of await dbGetAll('deliverables')) state.deliverables.set(m.mint.kpid, m);
    for (const m of await dbGetAll('acceptances')) state.acceptances.set(m.mint.kpid, m);
    for (const m of await dbGetAll('agents')) state.agents.set(m.mint.kpid, m);
    await ensureSeedData();
    render();
  } catch (e) {
    console.error('kcc-jobs boot failed', e);
    document.body.innerHTML = '<div style="padding:40px;color:#e6e1d6;background:#0a0a0f;min-height:100vh;font-family:system-ui,sans-serif"><h1 style="color:#b8974a;font-family:Georgia,serif">KCC Jobs could not start</h1><p>' + (e.message || String(e)) + '</p><p style="font-size:13px;color:#a8a395">Ed25519 via Web Crypto requires Chromium 119+ / Firefox 130+ / Safari 17+.</p></div>';
  }
})();

// Named exports for the primary API surface
export { openDB };
export { dbGet };
export { dbGetAll };
export { dbPut };
export { dbDel };
export { toast };
export { esc };
export { fmtDate };
export { fmtDateTime };
export { daysUntil };

export { KCC_CONFIG };
export { DB_NAME };
export { DB_VERSION };
