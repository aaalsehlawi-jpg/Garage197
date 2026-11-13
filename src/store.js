// Garage store. Signed out: cars stay in this browser. Signed in: cars, logbooks and files live in the user's cloud account.
(function () {
  var SB = 'https://rystuaujaihcvulyettd.supabase.co', KEY = 'sb_publishable_fhBGLIojcBo9DXkJQRS01A_GXE4-uUx';
  var LKEY = 'g197-cars', SKEY = 'g197-session', BUCKET = 'car-files';
  var subs = [], authSubs = [], session = null, cloud = {}, urlCache = {};
  function jget(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function jset(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function local() { return jget(LKEY) || {}; }
  function current() { return session ? cloud : local(); }
  function snap() { var o = current(); return { docs: Object.keys(o).map(function (id) { return { id: id, data: function () { return o[id]; } }; }) }; }
  function emit() { var s = snap(); subs.forEach(function (f) { f(s); }); }
  function emitAuth() { authSubs.forEach(function (f) { f(api); }); }
  function setSession(j) {
    session = j && j.access_token ? { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600), user: { id: j.user.id, email: j.user.email } } : null;
    jset(SKEY, session); api.user = session ? session.user : null;
  }
  async function parse(r) {
    var t = await r.text(), j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {}
    if (!r.ok) { var e = new Error((j && (j.msg || j.message || j.error_description || j.error)) || ('Error ' + r.status)); e.status = r.status; e.code = j && (j.error_code || j.code); throw e; }
    return j;
  }
  var refreshing = null;
  function refresh() {
    if (!refreshing) refreshing = (async function () {
      var r = await fetch(SB + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: session.refresh_token }) });
      if (!r.ok) { if (r.status >= 400 && r.status < 500) { setSession(null); cloud = {}; emit(); emitAuth(); } throw new Error('Your sign-in has expired. Sign in again.'); }
      var j = await r.json(); setSession(j);
    })().finally(function () { refreshing = null; });
    return refreshing;
  }
  async function call(path, opt, retried) {
    opt = opt || {};
    if (session && session.expires_at - 60 < Date.now() / 1000) await refresh();
    var h = Object.assign({ apikey: KEY }, opt.headers || {});
    if (session) h.Authorization = 'Bearer ' + session.access_token;
    var r = await fetch(SB + path, { method: opt.method || 'GET', headers: h, body: opt.body });
    if (r.status === 401 && session && !retried) { await refresh(); return call(path, opt, true); }
    return r;
  }
  var JSONH = { 'Content-Type': 'application/json' };
  async function loadCloud() {
    api.setupError = ''; api.loaded = false;
    try {
      var rows = await parse(await call('/rest/v1/cars?select=id,data'));
      cloud = {}; rows.forEach(function (r) { cloud[r.id] = r.data; });
    } catch (e) {
      cloud = {};
      api.setupError = e.status === 404 || e.code === 'PGRST205' || e.code === '42P01' ? 'You are signed in, but the cloud tables are not set up yet, so nothing can be saved. The setup text still needs to be run in Supabase.' : 'You are signed in, but your garage could not be loaded (' + e.message + '). Check the connection and reload.';
    }
    api.shared = false; api.links = {}; api.social = true;
    try { var g = await parse(await call('/rest/v1/garages?select=name,shared,links')); api.garageName = g && g[0] && g[0].name ? g[0].name : ''; api.shared = !!(g && g[0] && g[0].shared); api.links = (g && g[0] && g[0].links) || {}; }
    catch (e) { api.social = false; try { var g2 = await parse(await call('/rest/v1/garages?select=name')); api.garageName = g2 && g2[0] && g2[0].name ? g2[0].name : ''; } catch (e2) { api.garageName = ''; } }
    api.profile = { name: '', city: '', avatar: '' }; api.profiles = false;
    try { var pr = await parse(await call('/rest/v1/garages?select=display_name,city,avatar')); api.profiles = true; if (pr && pr[0]) api.profile = { name: pr[0].display_name || '', city: pr[0].city || '', avatar: pr[0].avatar || '', username: '' }; } catch (e) {}
    try { var un = await parse(await call('/rest/v1/garages?select=username')); api.usernames = true; if (un && un[0]) api.profile.username = un[0].username || ''; } catch (e) { api.usernames = false; }
    api.prefsOn = false; api.prefs = {};
    try { var pf = await parse(await call('/rest/v1/garages?select=prefs')); api.prefsOn = true; api.prefs = (pf && pf[0] && pf[0].prefs) || {}; } catch (e) {}
    api.loaded = true; emit(); emitAuth();
    if (api.social) api.loadSocial();
  }
  function upsertCar(id, d) {
    return call('/rest/v1/cars?on_conflict=user_id,id', { method: 'POST', headers: Object.assign({ Prefer: 'resolution=merge-duplicates,return=minimal' }, JSONH), body: JSON.stringify({ id: id, user_id: session.user.id, data: d, updated_at: new Date().toISOString() }) }).then(parse);
  }
  function rpc(name, args) { return call('/rest/v1/rpc/' + name, { method: 'POST', headers: JSONH, body: JSON.stringify(args || {}) }).then(parse); }
  function ins(table, row) { return call('/rest/v1/' + table, { method: 'POST', headers: Object.assign({ Prefer: 'return=minimal' }, JSONH), body: JSON.stringify(row) }).then(parse); }
  function del(q) { return call('/rest/v1/' + q, { method: 'DELETE' }).then(parse); }
  function enc(p) { return p.split('/').map(encodeURIComponent).join('/'); }
  var col = {
    doc: function (id) { id = id || 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      return { id: id,
        set: async function (d) { if (session) { await upsertCar(id, d); cloud[id] = d; emit(); } else { var o = local(); o[id] = d; jset(LKEY, o); emit(); } },
        delete: async function () { if (session) { await parse(await call('/rest/v1/cars?id=eq.' + encodeURIComponent(id), { method: 'DELETE' })); delete cloud[id]; emit(); } else { var o = local(); delete o[id]; jset(LKEY, o); emit(); } } }; },
    onSnapshot: function (f) { subs.push(f); setTimeout(function () { f(snap()); }, 0); return function () {}; }
  };
  var api = {
    user: null, garageName: '', setupError: '', maxFile: 10 * 1024 * 1024,
    onAuth: function (f) { authSubs.push(f); },
    newId: function () { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); },
    sign: async function (email, password, create) {
      var j = await parse(await fetch(SB + (create ? '/auth/v1/signup?redirect_to=' + encodeURIComponent(location.origin + location.pathname) : '/auth/v1/token?grant_type=password'), { method: 'POST', headers: Object.assign({ apikey: KEY }, JSONH), body: JSON.stringify({ email: email, password: password }) }));
      if (!j || !j.access_token) return { confirm: true };
      setSession(j); await loadCloud(); return { ok: true };
    },
    signOut: async function () { try { await call('/auth/v1/logout', { method: 'POST' }); } catch (e) {} setSession(null); cloud = {}; api.garageName = ''; api.setupError = ''; api.friends = []; api.feed = []; api.communities = []; api.events = []; api.notes = []; api.blocks = []; api.projects = []; api.activity = []; api.chats = []; api.profile = { name: '', city: '', avatar: '', username: '' }; api.seenAt = ''; api.shared = false; api.links = {}; api.socialLoaded = false; emit(); emitAuth(); },
    saveGarageName: function (name) { return call('/rest/v1/garages?on_conflict=user_id', { method: 'POST', headers: Object.assign({ Prefer: 'resolution=merge-duplicates,return=minimal' }, JSONH), body: JSON.stringify({ user_id: session.user.id, name: name, updated_at: new Date().toISOString() }) }).then(parse).then(function () { api.garageName = name; }); },
    // Friends, shared garages and social links
    profile: { name: '', city: '', avatar: '' }, profiles: false,
    shared: false, links: {}, social: true, friends: [], feed: [], socialLoaded: false,
    loadSocial: async function () {
      if (!session) return;
      try {
        var r = await Promise.all([rpc('my_friends', {}), rpc('friends_cars', {})]);
        api.friends = r[0] || []; api.feed = r[1] || []; api.social = true;
      } catch (e) { api.friends = []; api.feed = []; if (e.status === 404 || e.code === 'PGRST202') api.social = false; }
      try { var c = await Promise.all([rpc('list_communities', {}), rpc('list_events', {})]); api.communities = c[0] || []; api.events = c[1] || []; api.groups = true; }
      catch (e) { api.communities = []; api.events = []; if (e.status === 404 || e.code === 'PGRST202') api.groups = false; }
      try { var n = await Promise.all([rpc('my_notifications', {}), rpc('my_blocks', {}), call('/rest/v1/garages?select=seen_at').then(parse)]); api.notes = n[0] || []; api.blocks = n[1] || []; api.seenAt = (n[2] && n[2][0] && n[2][0].seen_at) || ''; api.extras = true; }
      catch (e) { api.notes = []; api.blocks = []; api.extras = false; }
      try { api.projects = (await rpc('list_projects', {})) || []; api.projectsOn = true; } catch (e) { api.projects = []; api.projectsOn = false; }
      try { api.activity = (await rpc('friends_activity', {})) || []; api.activityOn = true; } catch (e) { api.activity = []; api.activityOn = false; }
      try { api.chats = (await rpc('my_chats', {})) || []; api.chatsOn = true; } catch (e) { api.chats = []; api.chatsOn = false; }
      api.socialLoaded = true; emitAuth();
    },
    notes: [], blocks: [], seenAt: '', extras: false,
    // AI logbook (Edge Function logbook-ai)
    aiDraft: async function (car, files) { return parse(await call('/functions/v1/logbook-ai', { method: 'POST', headers: JSONH, body: JSON.stringify({ car: { name: car.name || '', year: car.year || '' }, files: files.map(function (f) { return { path: f.path, name: f.name, type: f.type }; }) }) })); },
    // AI helper (Edge Function garage-ai): ask, car_photo, summary, market, project_plan, project_update
    aiHelp: async function (body) { return parse(await call('/functions/v1/garage-ai', { method: 'POST', headers: JSONH, body: JSON.stringify(body) })); },
    aiProbe: async function () { try { return await parse(await call('/functions/v1/logbook-ai', { method: 'POST', headers: JSONH, body: JSON.stringify({ probe: true }) })); } catch (e) { return null; } },
    // Car projects
    projects: [], projectsOn: false, activity: [], activityOn: false,
    createProject: async function (row) { var id = (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, function () { return (Math.random() * 16 | 0).toString(16); })); await ins('projects', Object.assign({ id: id, user_id: session.user.id }, row)); await api.loadSocial(); return id; },
    updateProject: async function (id, patch) { await parse(await call('/rest/v1/projects?id=eq.' + id, { method: 'PATCH', headers: Object.assign({ Prefer: 'return=minimal' }, JSONH), body: JSON.stringify(Object.assign({ updated_at: new Date().toISOString() }, patch)) })); await api.loadSocial(); },
    deleteProject: async function (id) { await del('projects?id=eq.' + id); await api.loadSocial(); },
    projectDetail: async function (id) { var r = await Promise.all([rpc('list_project_updates', { p_project: id }), rpc('list_project_suggestions', { p_project: id })]); return { updates: r[0] || [], suggestions: r[1] || [] }; },
    addUpdate: function (pid, body, photo) { var row = { project_id: pid, user_id: session.user.id, body: body || '' }; if (photo) row.photo = photo; return ins('project_updates', row); },
    deleteUpdate: function (id) { return del('project_updates?id=eq.' + id); },
    suggest: function (pid, kind, body, link) { var row = { project_id: pid, user_id: session.user.id, kind: kind, body: body }; if (link) row.link = link; return ins('project_suggestions', row); },
    deleteSuggestion: function (id) { return del('project_suggestions?id=eq.' + id); },
    answerSuggestion: function (id, helpful, reply) { return rpc('answer_suggestion', { p_id: id, p_helpful: helpful, p_reply: reply }); },
    cheer: async function (pid, on) { if (on) await ins('project_cheers', { project_id: pid, user_id: session.user.id }); else await del('project_cheers?project_id=eq.' + pid + '&user_id=eq.' + session.user.id); await api.loadSocial(); },
    unread: function () { var s = api.seenAt ? Date.parse(api.seenAt) : 0; return api.notes.filter(function (n) { return Date.parse(n.at) > s; }).length; },
    markSeen: async function () { var now = new Date().toISOString(); try { await api.saveProfile({ seen_at: now }); api.seenAt = now; emitAuth(); } catch (e) {} },
    blockUser: async function (id) { await rpc('block_user', { p_user: id }); await api.loadSocial(); },
    unblock: async function (id) { await del('blocks?blocked=eq.' + id + '&blocker=eq.' + session.user.id); await api.loadSocial(); },
    report: function (kind, ref, reason, snapshot) { return ins('reports', { reporter: session.user.id, kind: kind, ref: String(ref).slice(0, 80), reason: (reason || '').slice(0, 500) || null, snapshot: (snapshot || '').slice(0, 2500) || null }); },
    communities: [], events: [], groups: true,
    createCommunity: async function (name, about) { var id = await rpc('create_community', { p_name: name, p_about: about || '' }); await api.loadSocial(); return id; },
    joinCommunity: async function (id) { await ins('community_members', { community_id: id, user_id: session.user.id }); await api.loadSocial(); },
    leaveCommunity: async function (id) { await del('community_members?community_id=eq.' + id + '&user_id=eq.' + session.user.id); await api.loadSocial(); },
    deleteCommunity: async function (id) { await del('communities?id=eq.' + id); await api.loadSocial(); },
    posts: function (id) { return rpc('list_posts', { p_community: id }); },
    post: function (id, body, photo) { var row = { community_id: id, user_id: session.user.id, body: body }; if (photo) row.photo = photo; return ins('community_posts', row); },
    deletePost: function (id) { return del('community_posts?id=eq.' + id); },
    createEvent: async function (ev) { await ins('events', Object.assign({ creator: session.user.id }, ev)); await api.loadSocial(); },
    deleteEvent: async function (id) { await del('events?id=eq.' + id); await api.loadSocial(); },
    rsvp: async function (id, on) { if (on) await ins('event_rsvps', { event_id: id, user_id: session.user.id }); else await del('event_rsvps?event_id=eq.' + id + '&user_id=eq.' + session.user.id); await api.loadSocial(); },
    requestFriend: async function (email) { var r = await rpc('request_friend', { p_email: email }); await api.loadSocial(); return r; },
    chats: [], chatsOn: false, usernames: false,
    findPeople: function (q) { return rpc('find_people', { p_q: q }); },
    chatWith: function (uid) { return rpc('chat_with', { p_user: uid }); },
    sendMessage: function (uid, body) { return rpc('send_message', { p_to: uid, p_body: body }); },
    loadChats: async function () { if (!api.chatsOn) return; try { api.chats = (await rpc('my_chats', {})) || []; } catch (e) {} },
    listGoing: function (id) { return rpc('list_going', { p_event: id }); },
    listMembers: function (id) { return rpc('list_members', { p_community: id }); },
    memberProfile: async function (uid) { var r = await rpc('member_profile', { p_user: uid }); return (r && r[0]) || null; },
    requestFriendMember: async function (uid) { var r = await rpc('request_friend_member', { p_user: uid }); await api.loadSocial(); return r; },
    acceptFriend: async function (id) { await rpc('accept_friend', { p_id: id }); await api.loadSocial(); },
    removeFriend: async function (id) { await parse(await call('/rest/v1/friendships?id=eq.' + encodeURIComponent(id), { method: 'DELETE' })); await api.loadSocial(); },
    friendCars: function (owner) { return rpc('friends_cars', { p_owner: owner }); },
    savePrefs: function (prefs) { if (!api.prefsOn || !session) return Promise.resolve(); api.prefs = prefs; return call('/rest/v1/garages?on_conflict=user_id', { method: 'POST', headers: Object.assign({ Prefer: 'resolution=merge-duplicates,return=minimal' }, JSONH), body: JSON.stringify({ user_id: session.user.id, prefs: prefs }) }).then(parse).catch(function () {}); },
    saveProfile: function (patch) { return call('/rest/v1/garages?on_conflict=user_id', { method: 'POST', headers: Object.assign({ Prefer: 'resolution=merge-duplicates,return=minimal' }, JSONH), body: JSON.stringify(Object.assign({ user_id: session.user.id, updated_at: new Date().toISOString() }, patch)) }).then(parse).then(function () { if ('shared' in patch) api.shared = patch.shared; if ('links' in patch) api.links = patch.links; if ('display_name' in patch) api.profile.name = patch.display_name || ''; if ('city' in patch) api.profile.city = patch.city || ''; if ('username' in patch) api.profile.username = patch.username || ''; if ('avatar' in patch) api.profile.avatar = patch.avatar || ''; }); },
    localCount: function () { return Object.keys(local()).length; },
    importLocal: async function () { var o = local(), ids = Object.keys(o); for (var i = 0; i < ids.length; i++) { var id = cloud[ids[i]] ? ids[i] + '-d' : ids[i]; await upsertCar(id, o[ids[i]]); cloud[id] = o[ids[i]]; } jset(LKEY, null); emit(); return ids.length; },
    upload: async function (carId, file) {
      var safe = (file.name || 'file').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-60);
      var path = session.user.id + '/' + carId + '/' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + '-' + safe;
      await parse(await call('/storage/v1/object/' + BUCKET + '/' + enc(path), { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'true' }, body: file }));
      return { path: path, name: file.name || safe, type: file.type || '', size: file.size || 0 };
    },
    fileUrl: async function (path) {
      var c = urlCache[path]; if (c && c.until > Date.now()) return c.url;
      var j = await parse(await call('/storage/v1/object/sign/' + BUCKET + '/' + enc(path), { method: 'POST', headers: JSONH, body: JSON.stringify({ expiresIn: 3600 }) }));
      var url = SB + '/storage/v1' + (j.signedURL || j.signedUrl); urlCache[path] = { url: url, until: Date.now() + 50 * 60 * 1000 }; return url;
    },
    recover: async function (email) {
      await parse(await fetch(SB + '/auth/v1/recover?redirect_to=' + encodeURIComponent(location.origin + location.pathname), { method: 'POST', headers: Object.assign({ apikey: KEY }, JSONH), body: JSON.stringify({ email: email }) }));
    },
    // Reads the tokens a password-reset or confirmation email link leaves in the address. Returns 'recovery', 'signin', an {error} or null.
    fromLink: async function () {
      var h = location.hash || ''; if (!/access_token=|error_description=/.test(h)) return null;
      var q = new URLSearchParams(h.replace(/^#\/?/, '')); history.replaceState(null, '', location.pathname);
      if (q.get('error_description')) return { error: q.get('error_description').replace(/\+/g, ' ') };
      var tok = q.get('access_token');
      var u = await parse(await fetch(SB + '/auth/v1/user', { headers: { apikey: KEY, Authorization: 'Bearer ' + tok } }));
      setSession({ access_token: tok, refresh_token: q.get('refresh_token'), expires_in: +q.get('expires_in') || 3600, user: u });
      await loadCloud();
      return q.get('type') === 'recovery' ? 'recovery' : 'signin';
    },
    setPassword: async function (password) { await parse(await call('/auth/v1/user', { method: 'PUT', headers: JSONH, body: JSON.stringify({ password: password }) })); },
    // Deletes every stored file, then the account and all its data. Cannot be undone.
    deleteAccount: async function () {
      var uid = session.user.id, paths = [];
      await rpc('delete_my_account', { p_confirm: false });
      async function list(prefix) { return parse(await call('/storage/v1/object/list/' + BUCKET, { method: 'POST', headers: JSONH, body: JSON.stringify({ prefix: prefix, limit: 1000, offset: 0 }) })); }
      try { var top = await list(uid + '/'); for (var i = 0; i < top.length; i++) { if (top[i].id) paths.push(uid + '/' + top[i].name); else { var inner = await list(uid + '/' + top[i].name + '/'); inner.forEach(function (f) { if (f.id) paths.push(uid + '/' + top[i].name + '/' + f.name); }); } } } catch (e) {}
      for (var k = 0; k < paths.length; k += 100) await api.removeFiles(paths.slice(k, k + 100));
      await rpc('delete_my_account', { p_confirm: true });
      setSession(null); cloud = {}; api.garageName = ''; api.friends = []; api.feed = []; api.communities = []; api.events = []; api.notes = []; api.blocks = []; api.socialLoaded = false; emit(); emitAuth();
    },
    removeFiles: async function (paths) { if (!paths || !paths.length || !session) return; try { await call('/storage/v1/object/' + BUCKET, { method: 'DELETE', headers: JSONH, body: JSON.stringify({ prefixes: paths }) }); } catch (e) {} }
  };
  window.g197cloud = api;
  window.claude = { use: async function (n) { return n === 'db' ? { collection: function () { return col; } } : null; } };
  setSession(jget(SKEY));
  if (session) loadCloud();
  if ('serviceWorker' in navigator) window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
})();
