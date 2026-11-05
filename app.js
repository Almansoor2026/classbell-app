// Principal + teacher screens. Uses globals from index.html (sb, app, $, esc, toast, fail, me, DAYS).
const mins = t => { const [h, m] = t.split(':'); return +h * 60 + +m; };
const hm = t => t.slice(0, 5);
const roleView = () => me.role === 'principal' ? principalView('teachers') : teacherView();

// ================= PRINCIPAL =================
async function principalView(tab) {
  const sid = me.school_id;
  const [sc, tp, cl, sj, se] = await Promise.all([
    sb.from('schools').select('name').eq('id', sid).single(),
    sb.from('profiles').select('full_name,phone').eq('school_id', sid).eq('role', 'teacher'),
    sb.from('classes').select('*').eq('school_id', sid).order('name'),
    sb.from('subjects').select('*').eq('school_id', sid).order('name'),
    sb.from('sections').select('*').eq('school_id', sid)]);
  const teachers = tp.data || [], classes = cl.data || [], subjects = sj.data || [], sections = se.data || [];
  const secName = id => (sections.find(s => s.id === id) || {}).name || '';
  const tabs = ['teachers', 'classes', 'subjects'];
  let body = '';
  if (tab === 'teachers') body = `<div class="card">${teachers.length ? teachers.map(t => `<div class="item"><b>${esc(t.full_name)}</b><span class="mute">${esc(t.phone || '')}</span></div>`).join('') : '<p class="mute">No teachers yet.</p>'}
    <label>Add a teacher by email (they must create an account first)</label><input id="te" type="email">
    <button class="btn gold" id="ad">Add teacher</button></div>`;
  if (tab === 'classes') body = `<div class="card">${classes.length ? classes.map(c => `<div class="item"><b>${esc(c.name)}</b><span class="tag">${esc(secName(c.section_id))}</span></div>`).join('') : '<p class="mute">No classes yet.</p>'}
    <label>Class name</label><input id="cn" placeholder="Primary 4">
    <label>Section</label><select id="cs">${sections.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>
    <button class="btn gold" id="ad">Add class</button></div>`;
  if (tab === 'subjects') body = `<div class="card">${subjects.length ? subjects.map(s => `<div class="item"><b>${esc(s.name)}</b></div>`).join('') : '<p class="mute">No subjects yet.</p>'}
    <label>Subject name</label><input id="sn" placeholder="Mathematics">
    <button class="btn gold" id="ad">Add subject</button></div>`;
  app.innerHTML = `<h2>${esc((sc.data || {}).name || 'Your school')}</h2>
    <div>${tabs.map(t => `<button class="chip" data-t="${t}" ${t === tab ? 'style="background:var(--bell)"' : ''}>${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div>
    <h3></h3>${body}`;
  app.querySelectorAll('[data-t]').forEach(b => b.onclick = () => principalView(b.dataset.t));
  const done = r => r.error ? fail(r.error) : principalView(tab);
  $('ad').onclick = async () => {
    if (tab === 'teachers') { const e = $('te').value.trim(); if (!e) return toast('Enter an email.', true);
      return done(await sb.rpc('assign_user_to_school', { p_email: e, p_role: 'teacher', p_school_id: sid })); }
    if (tab === 'classes') { const n = $('cn').value.trim(); if (!n || !$('cs').value) return toast('Enter a class name and pick a section.', true);
      return done(await sb.from('classes').insert({ school_id: sid, section_id: $('cs').value, name: n })); }
    const n = $('sn').value.trim(); if (!n) return toast('Enter a subject name.', true);
    return done(await sb.from('subjects').insert({ school_id: sid, name: n }));
  };
}

// ================= TEACHER =================
const CK = 'cb_data_' + (typeof me !== 'undefined' && me ? me.id : '');
let remTimer = null;

async function loadTeacherData() {
  const key = 'cb_data_' + me.id;
  try {
    const [en, cl, sj, pr, st] = await Promise.all([
      sb.from('timetable_entries').select('*, classes(name), subjects(name), period_templates(label,start_time,end_time)').eq('teacher_id', me.id),
      sb.from('classes').select('id,name,section_id').eq('school_id', me.school_id).order('name'),
      sb.from('subjects').select('id,name').eq('school_id', me.school_id).order('name'),
      sb.from('period_templates').select('*').eq('school_id', me.school_id).eq('is_break', false).order('period_number'),
      sb.from('teacher_settings').select('*').eq('teacher_id', me.id).maybeSingle()]);
    for (const r of [en, cl, sj, pr, st]) if (r.error) throw r.error;
    const d = { entries: en.data, classes: cl.data, subjects: sj.data, periods: pr.data, settings: st.data || { reminder_lead_minutes: 10, reminder_method: 'push' }, at: Date.now() };
    localStorage.setItem(key, JSON.stringify(d));
    return { ...d, offline: false };
  } catch (e) {
    const c = JSON.parse(localStorage.getItem(key) || 'null');
    if (!c) throw e;
    return { ...c, offline: true };
  }
}

// An entry uses its own start/end if the teacher set a custom time, otherwise its period's times.
const norm = e => { const c = !!e.start_time, p = e.period_templates || {}; e.st = c ? e.start_time : p.start_time; e.en = c ? e.end_time : p.end_time; e.lbl = c ? 'Custom time' : p.label; };

async function teacherView() {
  let d;
  try { d = await loadTeacherData(); } catch (e) { return fail(e); }
  const { entries, classes, subjects, periods, settings, offline } = d;
  entries.forEach(norm);
  const sorted = [...entries].sort((a, b) => a.day - b.day || mins(a.st) - mins(b.st));
  const byDay = [1, 2, 3, 4, 5, 6, 7].map(n => ({ n, list: sorted.filter(e => e.day === n) })).filter(x => x.list.length);
  app.innerHTML = `<h2>${greet()}, ${esc(me.full_name)}</h2>
    <div class="today"><div id="today">${todayInner(sorted)}</div><button class="chip" id="pz">${localStorage.getItem('cb_paused') === '1' ? 'Turn alarms back on' : 'Pause all alarms (holiday)'}</button></div>
    ${offline ? '<div class="card brk">You are offline. Showing your saved timetable.</div>' : ''}
    <h3>My timetable</h3><div class="card">${byDay.length ? byDay.map(g => `<b>${DAYS[g.n]}</b><table>${g.list.map(e => `<tr><td>${hm(e.st)}</td><td><b>${esc(e.subjects.name)}</b><br><span class="mute">${esc(e.classes.name)}, ${esc(e.lbl)}</span>${noteLine(e)}</td>
      <td><button class="chip" data-note="${e.id}">Note</button> <button class="chip" data-del="${e.id}" ${offline ? 'disabled' : ''}>Remove</button></td></tr>`).join('')}</table>`).join('') : '<p class="mute">Nothing yet. Add your first class below.</p>'}</div>
    ${offline ? '' : `<h3>Add a class</h3><div class="card">
      <label>Day</label><select id="dy">${[1, 2, 3, 4, 5].map(n => `<option value="${n}">${DAYS[n]}</option>`).join('')}</select>
      <label>Class</label><select id="cl">${classes.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
      <label>Subject</label><select id="sj">${subjects.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>
      <label>Period</label><select id="pd"></select>
      <div id="cst" style="display:none"><div class="row"><div><label>Starts</label><input id="cs" type="time" value="08:00"></div><div><label>Ends</label><input id="ce" type="time" value="08:40"></div></div></div>
      <button class="btn gold" id="ad">Add to my timetable</button></div>`}
    <h3>Reminders</h3><div class="card">
      <label>Remind me this many minutes before class</label><input id="ld" type="number" min="0" max="120" value="${settings.reminder_lead_minutes}">
      <label>Snooze for how many minutes (Android app)</label><input id="sz" type="number" min="1" max="30" value="${localStorage.getItem('cb_snooze') || 5}">
      <label>Method</label><select id="rm"><option value="push" ${settings.reminder_method === 'push' ? 'selected' : ''}>Phone notification</option><option value="whatsapp" ${settings.reminder_method === 'whatsapp' ? 'selected' : ''}>WhatsApp message</option><option value="sms" ${settings.reminder_method === 'sms' ? 'selected' : ''}>SMS (coming soon)</option></select>
      ${isNative() ? `<label>Flashlight when the alarm rings</label><select id="fl"><option value="1" ${localStorage.getItem('cb_flash') !== '0' ? 'selected' : ''}>On</option><option value="0" ${localStorage.getItem('cb_flash') === '0' ? 'selected' : ''}>Off</option></select><button class="btn line" id="tn">Choose ringtone (${esc(localStorage.getItem('cb_tone_name') || 'phone default')})</button><button class="btn line" id="tt">Test the alarm now</button>` : ''}
      <button class="btn" id="sr">Save and turn on reminders</button></div>`;

  app.querySelectorAll('[data-note]').forEach(b => b.onclick = () => {
    const k = noteKey(b.dataset.note), v = prompt('Note for this lesson (leave empty to clear):', localStorage.getItem(k) || '');
    if (v === null) return;
    v.trim() ? localStorage.setItem(k, v.trim()) : localStorage.removeItem(k);
    teacherView();
  });
  $('pz').onclick = async () => {
    const on = localStorage.getItem('cb_paused') === '1';
    localStorage.setItem('cb_paused', on ? '0' : '1');
    if (isNative()) await nativeAlarms(sorted, settings.reminder_lead_minutes, false).catch(() => {});
    toast(on ? 'Alarms are back on.' : 'All alarms paused. Turn them back on when you return.');
    teacherView();
  };
  clearInterval(window._todayT);
  window._todayT = setInterval(() => { const el = $('today'); if (el) el.innerHTML = todayInner(sorted); }, 30000);
  app.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    const { error } = await sb.from('timetable_entries').delete().eq('id', b.dataset.del);
    error ? fail(error) : teacherView();
  });
  if (!offline) {
    const fillPeriods = () => {
      const c = classes.find(x => x.id === $('cl').value);
      $('pd').innerHTML = periods.filter(p => c && p.section_id === c.section_id && (p.day == null || p.day === +$('dy').value)).sort((a, b) => mins(a.start_time) - mins(b.start_time))
        .map(p => `<option value="${p.id}">${esc(p.label)} (${hm(p.start_time)} to ${hm(p.end_time)})</option>`).join('') + '<option value="custom">Set my own time…</option>';
      $('cst').style.display = 'none';
    };
    $('pd').onchange = () => { $('cst').style.display = $('pd').value === 'custom' ? 'block' : 'none'; };
    fillPeriods(); $('cl').onchange = fillPeriods; $('dy').onchange = fillPeriods;
    $('ad').onclick = async () => {
      const day = +$('dy').value, custom = $('pd').value === 'custom';
      const p = custom ? { id: null, start_time: $('cs').value, end_time: $('ce').value } : periods.find(x => x.id === $('pd').value);
      if (!p || !$('cl').value || !$('sj').value) return toast('Pick a day, class, subject and time.', true);
      if (custom && (!p.start_time || !p.end_time || p.end_time <= p.start_time)) return toast('Set a start time and a later end time.', true);
      const clash = entries.find(e => e.day === day && mins(e.st) < mins(p.end_time) && mins(p.start_time) < mins(e.en));
      if (clash) return toast(`You already teach ${clash.subjects.name} (${clash.classes.name}) at that time.`, true);
      const row = { school_id: me.school_id, teacher_id: me.id, class_id: $('cl').value, subject_id: $('sj').value, period_id: p.id, day };
      if (custom) { row.start_time = p.start_time; row.end_time = p.end_time; }
      const { error } = await sb.from('timetable_entries').insert(row);
      if (error) return toast(error.code === '23505' ? 'That class already has a teacher in that period.' : error.message, true);
      teacherView();
    };
  }
  if (isNative()) {
    const CA = Capacitor.Plugins.ClassAlarm, LN = Capacitor.Plugins.LocalNotifications;
    $('fl').onchange = async () => { localStorage.setItem('cb_flash', $('fl').value); await nativeAlarms(sorted, settings.reminder_lead_minutes, false).catch(() => {}); toast($('fl').value === '1' ? 'Flashlight will flash with the alarm.' : 'Alarm will ring without the flashlight.'); };
    $('tn').onclick = async () => { try { const r = await CA.pickTone(); localStorage.setItem('cb_tone_name', r.name || 'phone default'); teacherView(); } catch (e) { toast('Could not open the ringtone list.', true); } };
    $('tt').onclick = async () => {
      try { if (LN) await LN.requestPermissions(); await CA.test({ flash: localStorage.getItem('cb_flash') !== '0' }); toast('Ringing now. Tap Stop on the notification to end it.'); }
      catch (e) { toast('Test failed: ' + e.message, true); }
    };
  }
  $('sr').onclick = async () => {
    localStorage.setItem('cb_snooze', +$('sz').value || 5);
    const row = { teacher_id: me.id, reminder_lead_minutes: +$('ld').value || 0, reminder_method: $('rm').value };
    if (!offline) { const { error } = await sb.from('teacher_settings').upsert(row); if (error) return fail(error); }
    if (isNative()) {
      const r = await nativeAlarms(sorted, +$('ld').value || 0, true);
      toast(r.ok ? `Alarms set for ${r.n} class${r.n === 1 ? '' : 'es'}. They ring with your phone's alarm sound and flashlight until you tap Snooze or Stop.` : r.err, !r.ok);
      return teacherView();
    }
    if ('Notification' in window && Notification.permission !== 'granted') await Notification.requestPermission();
    let msg = 'Reminders are on, even when the app is closed.', bad = Notification.permission !== 'granted';
    if (bad) msg = 'Allow notifications in your phone settings to get alerts.';
    else { const r = await enablePush(); if (!r.ok) { msg = 'Saved, but background alerts failed: ' + r.err; bad = true; } }
    toast(msg, bad);
    teacherView();
  };
  if (isNative()) nativeAlarms(sorted, settings.reminder_lead_minutes, false).catch(() => {});
  else startReminders(sorted, settings.reminder_lead_minutes);
}

// Checks every 20 seconds while the app is open (works offline from saved data).
function startReminders(entries, lead) {
  clearInterval(remTimer);
  const check = () => {
    if (localStorage.getItem('cb_paused') === '1') return;
    const now = new Date(), day = now.getDay() || 7, nm = now.getHours() * 60 + now.getMinutes();
    const today = now.toISOString().slice(0, 10), fk = 'cb_fired_' + today;
    const fired = JSON.parse(localStorage.getItem(fk) || '[]');
    entries.filter(e => e.day === day).forEach(e => {
      const st = mins(e.st);
      if (nm >= st - lead && nm < st && !fired.includes(e.id)) {
        fired.push(e.id); localStorage.setItem(fk, JSON.stringify(fired));
        const title = `${e.subjects.name} in ${st - nm} min`, body = `${e.classes.name}, ${e.lbl} at ${hm(e.st)}`;
        toast(title + ': ' + body);
        if (navigator.vibrate) navigator.vibrate([300, 150, 300]);
        if ('Notification' in window && Notification.permission === 'granted' && navigator.serviceWorker && localStorage.getItem('cb_push') !== '1')
          navigator.serviceWorker.ready.then(r => r.showNotification(title, { body, tag: e.id, requireInteraction: true, vibrate: [300, 150, 300] }));
      }
    });
  };
  check(); remTimer = setInterval(check, 20000);
}

// ================= SUPER ADMIN: background pictures =================
async function bgManager() {
  const box = $('bgm'); if (!box) return;
  const { data } = await sb.storage.from('backgrounds').list('', { limit: 30 });
  const files = (data || []).filter(f => f.id);
  box.innerHTML = `<p class="mute">These pictures slide in the background for everyone. Use landscape photos under 1 MB each.</p>
    <div>${files.map(f => `<button class="chip" data-rm="${esc(f.name)}">Remove ${esc(f.name.slice(14, 28))}</button>`).join('') || '<span class="mute">None yet.</span>'}</div>
    <label>Add pictures</label><input id="bgf" type="file" accept="image/*" multiple>
    <button class="btn gold" id="bgu">Upload</button>`;
  box.querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => {
    const { error } = await sb.storage.from('backgrounds').remove([b.dataset.rm]);
    error ? fail(error) : (startBg(), bgManager());
  });
  $('bgu').onclick = async () => {
    const fs = [...$('bgf').files]; if (!fs.length) return toast('Choose one or more pictures.', true);
    for (const f of fs) {
      const name = Date.now() + '-' + f.name.replace(/\.\w+$/, '').replace(/[^\w-]/g, '_') + '.jpg';
      let body = f;
      try { body = await shrink(f); } catch (e) { }
      const { error } = await sb.storage.from('backgrounds').upload(name, body, { contentType: 'image/jpeg', cacheControl: '31536000' });
      if (error) return fail(error);
    }
    toast('Uploaded.'); startBg(); bgManager();
  };
}

// ================= Background push (works when the app is closed) =================
const VAPID_PUBLIC = 'BM0HnqLJ9y-D1EQqVt5M9CPbrdVBbxZ6rGfFwboTLoZDZudftKkTCjKnkNMCunmuPEXWYXqhB4GYmdm5-CLI5uo';
async function enablePush() {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return { ok: false, err: 'This browser does not support push.' };
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const k = VAPID_PUBLIC.replace(/-/g, '+').replace(/_/g, '/'), raw = atob(k + '='.repeat((4 - k.length % 4) % 4));
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(raw, c => c.charCodeAt(0)) });
    }
    const j = sub.toJSON();
    const { error } = await sb.from('push_subscriptions').upsert({ teacher_id: me.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }, { onConflict: 'endpoint' });
    if (error) return { ok: false, err: error.message };
    localStorage.setItem('cb_push', '1');
    return { ok: true };
  } catch (e) { return { ok: false, err: e.message }; }
}

// ================= Android app: alarms set on the phone itself =================
const isNative = () => !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform());

async function nativeAlarms(entries, lead, interactive) {
  const P = window.Capacitor && Capacitor.Plugins, LN = P && P.LocalNotifications, CA = P && P.ClassAlarm;
  if (!CA) return { ok: false, err: 'Alarm feature not available in this app build.' };
  if (LN) {
    let perm = await LN.checkPermissions();
    if (perm.display !== 'granted') {
      if (!interactive) return { ok: false, err: 'no permission' };
      perm = await LN.requestPermissions();
      if (perm.display !== 'granted') return { ok: false, err: 'Allow notifications for ClassBell in your phone settings, then try again.' };
    }
  }
  const items = [];
  entries.forEach((e, i) => {
    const m = mins(e.st) - lead;
    if (m < 0) return;
    items.push({ id: i + 1, day: e.day, hour: Math.floor(m / 60), minute: m % 60,
      title: lead ? `${e.subjects.name} in ${lead} min` : `${e.subjects.name} starts now`,
      body: `${e.classes.name}, ${e.lbl} at ${hm(e.st)}` });
  });
  const paused = localStorage.getItem('cb_paused') === '1';
  await CA.schedule({ items: paused ? [] : items, snooze: +localStorage.getItem('cb_snooze') || 5, flash: localStorage.getItem('cb_flash') !== '0' });
  return { ok: true, n: items.length };
}

// Shrinks big phone photos before upload so the background loads fast.
async function shrink(file) {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return await new Promise(r => c.toBlob(r, 'image/jpeg', 0.7));
}

// ================= Dashboard: greeting, today card, lesson notes =================
const greet = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
const noteKey = id => 'cb_note_' + id;
const noteLine = e => { const n = localStorage.getItem(noteKey(e.id)); return n ? `<br><span class="note">Note: ${esc(n)}</span>` : ''; };
const left = m => m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
function todayInner(entries) {
  const now = new Date(), day = now.getDay() || 7, nm = now.getHours() * 60 + now.getMinutes();
  const 
