// Run: npm test   (starts the server on a temp database in M-Pesa simulation mode)
const { spawn } = require('child_process'), crypto = require('crypto'), fs = require('fs'), os = require('os'), path = require('path');
const PORT = 3457, BASE = 'http://localhost:' + PORT, dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chem-'));
let aiSeen = null;
const fakeAI = require('http').createServer((q, s) => { let b = ''; q.on('data', x => b += x); q.on('end', () => { const j = JSON.parse(b); aiSeen = { key: q.headers['x-api-key'], sys: j.system, user: j.messages[0].content }; s.setHeader('content-type', 'application/json');
  if (JSON.parse(j.messages[0].content).title === 'FAIL') { s.statusCode = 500; return s.end('{"error":{"message":"boom"}}'); }
  s.end(JSON.stringify({ content: [{ type: 'text', text: 'Here you go:\n```json\n' + JSON.stringify({ objectives: ['To determine the molarity of NaOH.'], introduction: 'Titration is a method.', steps: ['25 mL of NaOH was measured.', 'We added the indicator.'], discussion: 'Results agreed.', conclusion: 'Objective achieved.', calculations: 'M1V1 = M2V2', references: ['Vogel, Textbook of Quantitative Chemical Analysis'] }) + '\n```' }] })); }); }).listen(4998);
const srv = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, ANTHROPIC_API_KEY: 'test-key', ANTHROPIC_BASE_URL: 'http://localhost:4998', PORT, DATA_DIR: dir, MPESA_SIMULATE: 'true', ADMIN_PASS: 'adminpass', APP_URL: BASE, SMTP_HOST: '' }, stdio: 'ignore' });
const sha = d => crypto.createHash('sha256').update(d).digest(), b64u = b => Buffer.from(b).toString('base64url');
const hdr = (mt, n) => n < 24 ? Buffer.from([mt << 5 | n]) : n < 256 ? Buffer.from([mt << 5 | 24, n]) : Buffer.from([mt << 5 | 25, n >> 8, n & 255]);
const enc = v => Buffer.isBuffer(v) ? Buffer.concat([hdr(2, v.length), v]) : typeof v === 'string' ? Buffer.concat([hdr(3, Buffer.byteLength(v)), Buffer.from(v)]) : typeof v === 'number' ? (v >= 0 ? hdr(0, v) : hdr(1, -1 - v)) : Buffer.concat([hdr(5, v.size), ...[...v].flatMap(([k, x]) => [enc(k), enc(x)])]);
function client() { let c = ''; return async (p, m = 'GET', b) => { const r = await fetch(BASE + '/api' + p, { method: m, headers: { 'Content-Type': 'application/json', cookie: c }, body: b ? JSON.stringify(b) : undefined }); const s = r.headers.get('set-cookie'); if (s) c = s.split(';')[0]; return { s: r.status, j: await r.json() }; }; }
let fails = 0; const ok = (n, c) => { console.log((c ? '  ✓ ' : '  ✗ ') + n); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  for (let i = 0; i < 30; i++) { try { await fetch(BASE); break; } catch (e) { await wait(200); } }
  const S = client(), A = client();
  let r = await S('/register', 'POST', { name: 'Test Student', regNo: 'R1', phone: '0712345678', email: 'a@b.co', password: 'secret1' }); ok('register', r.s === 200);
  r = await S('/register', 'POST', { name: 'X', regNo: 'R2', phone: '+254712345678', email: 'c@d.co', password: 'secret1' }); ok('duplicate phone rejected', r.s === 400);
  r = await S('/me'); ok('payments on, no access yet', r.j.paymentsEnabled && !r.j.hasAccess);
  const subj = (await S('/subjects')).j[0];
  r = await S('/reports', 'POST', { subjectId: subj.id, title: 't', data: {} }); ok('report blocked without subscription (402)', r.s === 402);
  r = await S('/subscribe', 'POST', { subjectId: subj.id }); const pid = r.j.paymentId; ok('STK push started (simulated)', !!pid);
  let st = 'pending'; for (let i = 0; i < 12 && st === 'pending'; i++) { await wait(1000); st = (await S('/payment/' + pid)).j.status; } ok('payment completes', st === 'success');
  r = await S('/me'); ok('subscription active with countdown', r.j.hasAccess && r.j.subs[0].active && r.j.subs[0].endsAt > Date.now());
  r = await S('/reports', 'POST', { subjectId: subj.id, title: 'Titration', data: { intro: 'hi' } }); ok('report saved', r.s === 200);
  r = await S('/reports'); ok('report in storage', r.j.length === 1);
  const inp = { topic: 'Acid-base titration', title: 'Titration of HCl against NaOH', procedure: '1. Measure 25 mL of NaOH with a pipette and pour it into a flask.\n2. We added 3 drops of indicator.', reagents: ['HCl'], apparatus: ['Burette'], table: { h: ['Trial', 'Vol'], r: [['1', '24.5']] } };
  r = await S('/generate', 'POST', { subjectId: subj.id, input: inp }); ok('AI report generated from inputs', r.s === 200 && r.j.ai && r.j.objectives.length && r.j.introduction && r.j.calculations);
  ok('AI got key, data table and instructor instructions', aiSeen.key === 'test-key' && aiSeen.user.includes('24.5') && aiSeen.sys.includes('Show every calculation step'));
  ok('personal pronouns scrubbed from AI procedure steps', r.j.steps.every(x => !/\b(we|I)\b/i.test(x)) && r.j.steps.length === 2);
  r = await S('/generate', 'POST', { subjectId: subj.id, input: { ...inp, title: 'FAIL' } }); ok('AI outage falls back to offline rewrite', r.s === 200 && !r.j.ai && r.j.steps[0] === '25 mL of NaOH was measured with a pipette.' && r.j.steps[1] === 'It was poured into a flask.' && !!r.j.note);
  r = await S('/generate', 'POST', { subjectId: subj.id, input: { ...inp, procedure: '' } }); ok('generate needs a procedure', r.s === 400);
  r = await S('/account/change', 'POST', { token: 'nope', email: 'x@y.co' }); ok('change without fingerprint refused', r.s === 403);
  // simulated fingerprint authenticator
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }), jwk = publicKey.export({ format: 'jwk' }), credId = crypto.randomBytes(16), rp = sha('localhost');
  r = await S('/webauthn/register/options', 'POST', { password: 'wrong' }); ok('passkey setup needs password', r.s === 403);
  r = await S('/webauthn/register/options', 'POST', { password: 'secret1' });
  const cose = new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, 'base64url')], [-3, Buffer.from(jwk.y, 'base64url')]]);
  const ad = Buffer.concat([rp, Buffer.from([0x45]), Buffer.alloc(4), Buffer.alloc(16), Buffer.from([0, credId.length]), credId, enc(cose)]);
  let cd = Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: r.j.challenge, origin: BASE }));
  r = await S('/webauthn/register/verify', 'POST', { clientDataJSON: b64u(cd), attestationObject: b64u(enc(new Map([['fmt', 'none'], ['attStmt', new Map()], ['authData', ad]]))) }); ok('passkey registered', r.s === 200 && r.j.passkeys === 1);
  const assert = async (counter, origin = BASE) => {
    const o = (await S('/webauthn/auth/options', 'POST', {})).j, a = Buffer.concat([rp, Buffer.from([0x05]), Buffer.from([0, 0, 0, counter])]);
    const c = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge: o.challenge, origin }));
    return S('/webauthn/auth/verify', 'POST', { id: b64u(credId), clientDataJSON: b64u(c), authenticatorData: b64u(a), signature: b64u(crypto.sign('sha256', Buffer.concat([a, sha(c)]), privateKey)) });
  };
  r = await assert(1, 'https://evil.example'); ok('wrong-origin assertion rejected', r.s === 400);
  r = await assert(1); ok('fingerprint assertion verified', r.s === 200 && !!r.j.token);
  r = await S('/account/change', 'POST', { token: r.j.token, email: 'new@mail.co', password: 'newsecret' }); ok('email + password changed after fingerprint', r.s === 200 && r.j.user.email === 'new@mail.co');
  r = await S('/account/change', 'POST', { token: 'reuse', email: 'z@z.co' }); ok('token cannot be reused', r.s === 403);
  const L = client(); r = await L('/login', 'POST', { phone: '0712345678', password: 'newsecret' }); ok('login by phone with new password', r.s === 200 && r.j.hasAccess);
  r = await L('/login', 'POST', { phone: '0712345678', password: 'secret1' }); ok('old password rejected', r.s === 401);
  r = await S('/profile/photo', 'PUT', { photo: 'data:image/jpeg;base64,AAAA' }); ok('photo saved', r.s === 200);
  // admin
  r = await A('/admin/students'); ok('admin routes locked', r.s === 401);
  r = await A('/admin/login', 'POST', { username: 'admin', password: 'adminpass' }); ok('admin login', r.s === 200);
  r = await A('/admin/students'); ok('admin sees students, no password exposed', r.j.length === 1 && !JSON.stringify(r.j).includes('"pass"') && !JSON.stringify(r.j).includes('scrypt') && r.j[0].email === 'new@mail.co');
  r = await A('/admin/live'); ok('admin sees live activities + online', r.j.recent.length > 3 && r.j.online.length >= 1);
  r = await A('/admin/subjects', 'POST', { id: subj.id, name: 'Chemistry', price: 100, days: 30, instructions: ['one', 'two', 'three'] }); ok('admin adds instructions', r.j.instructions.length === 3);
  r = await A('/admin/email-all', 'POST', { subject: 'Hello', message: 'Test' }); ok('email all students', r.j.logged === 1);
  r = await A('/admin/settings', 'POST', { paymentsEnabled: false }); ok('payments switched off', r.j.paymentsEnabled === false);
  const F = client(); await F('/register', 'POST', { name: 'Free One', regNo: 'R9', phone: '0799000111', email: 'f@f.co', password: 'secret1' });
  r = await F('/reports', 'POST', { subjectId: subj.id, title: 'free', data: {} }); ok('free mode: new student writes report without paying', r.s === 200);
  r = await A('/admin/reset-activities', 'POST', {}); r = await A('/admin/live'); ok('reset activities', r.j.recent.length === 1);
  r = await A('/admin/students/' + (await A('/admin/students')).j.find(u => u.name === 'Free One').id + '/reset-password', 'POST', {}); ok('admin password reset', !!r.j.temp);
  r = await S('/account/delete', 'POST', { password: 'bad' }); ok('delete needs password', r.s === 403);
  r = await S('/account/delete', 'POST', { password: 'newsecret' }); ok('account deleted', r.s === 200);
  r = await S('/me'); ok('session ends after deletion', r.s === 401);
  console.log(fails ? `\n${fails} FAILED` : '\nAll checks passed'); srv.kill(); fakeAI.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); srv.kill(); process.exit(1); });
