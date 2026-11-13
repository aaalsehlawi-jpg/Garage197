/* ----- engagement: likes, comments, mentions, photo feed, car of the week, group chats, invites ----- */
Object.assign(ICONS, {
  heart: '<path d="M12 20.3s-7.6-4.5-7.6-10.2a4.4 4.4 0 0 1 7.6-3 4.4 4.4 0 0 1 7.6 3c0 5.700-7.600 10.200-7.600 10.200z"/>',
  share: '<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M12 15V3.500"/><path d="m7.500 8 4.500-4.500L16.500 8"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 5.500H4.500V7A3.500 3.500 0 0 0 8 10.500M16 5.500h3.500V7a3.500 3.500 0 0 1-3.500 3.500"/><path d="M12 13v4M8.500 20h7M9.500 17h5v3h-5z"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1"/><path d="M14 10a4 4 0 0 0-5.700 0l-3 3a4 4 0 0 0 5.700 5.700l1-1"/>',
  group: '<circle cx="9" cy="8.500" r="3.200"/><path d="M2.800 19.500c.5-3.300 3-5.200 6.200-5.200s5.700 1.900 6.200 5.200"/><path d="M15.500 5.600a3.200 3.200 0 0 1 0 5.900M17.800 14.700c1.800.700 3 2.400 3.400 4.800"/>'
});
const engOn = () => !!CLOUD.engageOn;
const myPage = () => '#/member/' + (CLOUD.user ? CLOUD.user.id : '');
const rich = (text) => String(text || '').split(/(@[A-Za-z0-9_]{3,20})(?![A-Za-z0-9_])/).map((s, i) => i % 2 ? el('a', { class: 'mention', href: '#/u/' + s.slice(1).toLowerCase(), text: s }) : document.createTextNode(s));
const richP = (text, cls) => el('p', { class: 'rich' + (cls ? ' ' + cls : '') }, rich(text));
function ago(iso) {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (!(s >= 0)) return fmtWhen(iso);
  if (s < 60) return t('Just now');
  if (s < 3600) return t('{n} min ago', { n: Math.floor(s / 60) });
  if (s < 86400) return t('{n} h ago', { n: Math.floor(s / 3600) });
  if (s < 7 * 86400) return t('{n} d ago', { n: Math.floor(s / 86400) });
  return fmtWhen(iso);
}
const who = (uid, name, mine) => el('a', { class: 'who', href: mine ? myPage() : '#/member/' + uid, text: name });
function engState(kind, ref, seed) {
  S.eng = S.eng || {};
  const k = kind + '|' + ref, st = S.eng[k] = S.eng[k] || { likes: 0, me: false, comments: 0 };
  if (seed && st.seed !== seed) { st.seed = seed; st.likes = Number(seed.likes || 0); st.me = !!seed.me_liked; st.comments = Number(seed.comments || 0); }
  return st;
}
function ensureSeeds(kind, refs) {
  if (!engOn() || !refs.length) return;
  S.engAsked = S.engAsked || {};
  const key = kind + ':' + refs.join(',');
  if (Date.now() - (S.engAsked[key] || 0) < 45000) return;
  S.engAsked[key] = Date.now();
  CLOUD.engagement(kind, refs).then((rows) => { for (const r of rows || []) engState(kind, r.ref, r); render(); }).catch(() => {});
}
async function likeToggle(kind, ref, on) {
  const st = engState(kind, ref);
  if (st.busy || st.me === on) return;
  st.busy = true; st.me = on; st.likes = Math.max(0, st.likes + (on ? 1 : -1)); st.likers = null; render();
  try { st.likes = Number(await CLOUD.setLike(kind, ref, on)); } catch (e) { st.me = !on; st.likes = Math.max(0, st.likes + (on ? -1 : 1)); toast(t('Couldn’t save. Try again.')); }
  st.busy = false; render();
}
function loadComments(kind, ref) {
  const st = engState(kind, ref);
  return CLOUD.listComments(kind, ref).then((rows) => { st.rows = rows || []; st.comments = st.rows.length; st.failed = false; }).catch(() => { st.rows = st.rows || []; st.failed = true; }).then(render);
}
function engageBar(kind, ref, seed) {
  if (!engOn()) return null;
  const st = engState(kind, ref, seed), id = kind + '-' + String(ref).replace(/[^A-Za-z0-9]/g, '').slice(0, 12);
  const like = el('button', { type: 'button', class: 'eng like' + (st.me ? ' on' : ''), 'aria-pressed': st.me ? 'true' : 'false', 'aria-label': st.me ? t('Unlike') : t('Like'), title: st.me ? t('Unlike') : t('Like'), onclick: () => likeToggle(kind, ref, !st.me) }, svgIcon(ICONS.heart));
  const nLikes = el('button', { type: 'button', class: 'linkbtn small eng-n', 'aria-expanded': st.showLikers ? 'true' : 'false', text: st.likes === 1 ? t('1 like') : t('{n} likes', { n: st.likes }), onclick: () => { st.showLikers = !st.showLikers; if (st.showLikers && !st.likers) CLOUD.listLikers(kind, ref).then((r) => { st.likers = r || []; render(); }).catch(() => { st.likers = []; render(); }); render(); } });
  const cm = el('button', { type: 'button', class: 'eng cm', 'aria-expanded': st.open ? 'true' : 'false', 'aria-label': t('Comments'), title: t('Comments'), onclick: () => { st.open = !st.open; if (st.open) { loadComments(kind, ref); S.cmFocus = id; } render(); } }, svgIcon(ICONS.chat), el('span', { text: st.comments ? String(st.comments) : '' }));
  const out = el('div', { class: 'engage', id: 'eng-' + id }, el('div', { class: 'row engrow' }, like, st.likes ? nLikes : null, cm, !st.open && st.comments ? el('button', { type: 'button', class: 'linkbtn small', text: st.comments === 1 ? t('View 1 comment') : t('View all {n} comments', { n: st.comments }), onclick: () => cm.click() }) : null));
  if (st.showLikers && st.likes) out.append(!st.likers ? skel('2rem') : el('div', { class: 'facerow likers' }, st.likers.map((p) => el('a', { class: 'face', href: p.me ? myPage() : '#/member/' + p.user_id }, avatarEl(p.avatar, memberName(p.name), 'sm'), el('span', { class: 'small', text: p.me ? t('You') : memberName(p.name) })))));
  if (st.open) {
    const box = el('div', { class: 'thread' });
    if (!st.rows) box.append(skel('3rem'));
    else {
      if (st.failed) box.append(el('p', { class: 'muted small', text: t('Comments could not be loaded. Try again later.') }));
      for (const c of st.rows) box.append(el('div', { class: 'cmt' }, avatarEl(c.avatar, memberName(c.author), 'sm'), el('div', { class: 'col', style: 'gap:2px;min-width:0;flex:1' },
        el('p', { class: 'rich' }, who(c.author_id, c.mine ? t('You') : memberName(c.author), c.mine), document.createTextNode(' '), rich(c.body)),
        el('span', { class: 'row small muted', style: 'gap:12px' }, el('span', { text: ago(c.created_at) }),
          c.can_remove ? el('button', { type: 'button', class: 'linkbtn small', text: t('Remove'), onclick: async () => { try { await CLOUD.deleteComment(c.id); } catch (e) { toast(t('Couldn’t save. Try again.')); } loadComments(kind, ref); } }) : null,
          !c.mine && CLOUD.extras ? el('button', { type: 'button', class: 'linkbtn small', text: t('Report'), onclick: () => reportAsk('comment', c.id, c.author + ': ' + c.body) }) : null))));
      const input = el('input', { type: 'text', class: 'cmt-in', id: 'cin-' + id, maxlength: 1000, placeholder: t('Add a comment'), 'aria-label': t('Add a comment'), autocomplete: 'off', value: st.draft || '' });
      input.addEventListener('input', () => { st.draft = input.value; });
      box.append(el('form', { class: 'row cmtform', onsubmit: async (ev) => { ev.preventDefault(); const v = input.value.trim(); if (!v || st.sending) return; st.sending = true; try { await CLOUD.addComment(kind, ref, v); st.draft = ''; input.value = ''; input.blur(); await loadComments(kind, ref); } catch (e) { toast(/slow/i.test((e && e.message) || '') ? t('You are commenting very quickly. Wait a moment.') : t('Couldn’t save. Try again.')); } st.sending = false; } },
        avatarEl(CLOUD.profile.avatar, CLOUD.profile.name || '?', 'sm'), input, el('button', { type: 'submit', class: 'btn sm primary', text: t('Send') })),
        el('p', { class: 'muted small', text: t('Type @ and a username to mention someone.') }));
      if (S.cmFocus === id) { S.cmFocus = null; setTimeout(() => { const i = document.getElementById('cin-' + id); if (i) i.focus(); }, 0); }
    }
    out.append(box);
  }
  return out;
}
function tapLike(node, kind, ref) {
  let last = 0;
  node.addEventListener('click', () => {
    const now = Date.now();
    if (now - last < 400) { last = 0; const h = el('span', { class: 'burst', 'aria-hidden': 'true' }, svgIcon(ICONS.heart)); node.append(h); setTimeout(() => h.remove(), 700); if (!engState(kind, ref).me) setTimeout(() => likeToggle(kind, ref, true), 450); }
    else last = now;
  });
}
function bigPhoto(path, kind, ref) {
  const b = el('div', { class: 'fphoto', role: 'img', 'aria-label': t('Photo. Double tap to like.') });
  CLOUD.fileUrl(path).then((url) => { const im = el('img', { src: url, alt: '', loading: 'lazy' }); im.addEventListener('error', () => b.remove()); b.prepend(im); }).catch(() => b.remove());
  if (kind) tapLike(b, kind, ref);
  return b;
}
const faces = (list, extra) => { const f = (list || []).slice(0, 5); return f.length ? el('span', { class: 'faces', 'aria-hidden': 'true' }, f.map((p) => avatarEl(p.avatar, memberName(p.name), 'sm')), extra > f.length ? el('span', { class: 'avatar sm more', text: '+' + (extra - f.length) }) : null) : null; };

/* ----- people you may know ----- */
function peoplePanel(max) {
  if (!engOn()) return null;
  S.asked = S.asked || {};
  const list = (CLOUD.people || []).filter((p) => !S.asked[p.user_id]).slice(0, max || 12);
  if (!list.length) return null;
  return el('section', { class: 'panel', id: 'people' }, el('h2', { text: t('People you may know') }), el('div', { class: 'hscroll' }, list.map((p) => el('div', { class: 'pcard' },
    el('a', { class: 'col', style: 'align-items:center;gap:6px;text-decoration:none;color:inherit', href: '#/member/' + p.user_id }, avatarEl(p.avatar, memberName(p.name), 'lg'), el('b', { class: 'clamp1', text: memberName(p.name) })),
    el('span', { class: 'muted small clamp2', text: p.why === 'mutual' ? t('Friend of {n}', { n: memberName(p.via) }) : t('Also in {n}', { n: p.via }) }),
    el('button', { type: 'button', class: 'btn sm primary', text: t('Add friend'), onclick: async () => { try { const r = await CLOUD.requestFriendMember(p.user_id); S.asked[p.user_id] = 1; toast(r === 'accepted' ? t('You are now friends.') : r === 'sent' || r === 'exists' ? t('Friend request sent') : r === 'limit' ? t('You have sent a lot of requests today. Try again tomorrow.') : t('The request could not be sent.')); } catch (e) { toast(t('The request could not be sent.')); } render(); } })))));
}

/* ----- photo-first home feed ----- */
function feedCard(x) {
  const name = x.mine ? t('You') : memberName(x.who_name), k = x.kind, href = '#/' + x.link.split('/').map(encodeURIComponent).join('/');
  const line = k === 'post' ? t('posted in') : k === 'pupdate' ? t('posted an update on') : k === 'car' ? t('added a car to their garage') : k === 'project' ? t('started a {k} project', { k: t(PKIND[x.body] || 'Maintenance').toLowerCase() }) : t('joined');
  const head = el('div', { class: 'fhead' }, el('a', { href: x.mine ? myPage() : '#/member/' + x.who, 'aria-label': name }, avatarEl(x.avatar, name)), el('div', { class: 'col', style: 'gap:1px;min-width:0;flex:1' },
    el('span', {}, who(x.who, name, x.mine), el('span', { class: 'muted', text: ' ' + line + ' ' }), k === 'car' ? null : el('a', { class: 'ftitle', href, text: x.title })),
    el('span', { class: 'muted small', text: ago(x.at) })));
  if (k === 'project' || k === 'joined') return el('article', { class: 'fcard slim' }, head);
  return el('article', { class: 'fcard' }, head,
    x.photo ? bigPhoto(x.photo, k, x.ref) : null,
    k === 'car' ? el('a', { class: 'fcar', href }, el('b', { text: x.title || t('Unnamed car') }), x.body ? el('span', { class: 'muted small', text: x.body }) : null) : x.body ? richP(x.body, x.photo ? 'clamp' : '') : null,
    engageBar(k, x.ref, x));
}
function feedPanel2() {
  const req = incoming(), evs = CLOUD.events.slice(0, 4), items = CLOUD.home || [], n = S.feedN || 10, friends = CLOUD.friends.some((f) => f.status === 'accepted'), any = friends || CLOUD.communities.some((c) => c.joined);
  return el('section', { class: 'feedwrap', id: 'home-community' }, el('h2', { text: t('What’s new') }),
    req.length ? el('p', {}, el('a', { href: '#/friends', id: 'a-requests', text: req.length === 1 ? t('You have a friend request') : t('You have {n} friend requests', { n: req.length }) })) : null,
    items.length ? el('div', { class: 'fcards', id: 'feed' }, items.slice(0, n).map(feedCard))
      : el('section', { class: 'panel' }, starter(t(any ? 'Nothing new yet. Posts, new cars, projects and updates from your friends and communities will show here.' : 'Add friends or join a community to see their photos, cars and projects here.'), any ? null : el('a', { class: 'btn primary', href: '#/friends' }, ico('plus', t('Find a friend'))), any ? null : el('a', { class: 'btn', href: '#/communities', text: t('Browse communities') }))),
    items.length > n ? el('button', { type: 'button', class: 'btn', id: 'b-feed-more', style: 'align-self:center', text: t('Show more'), onclick: () => { S.feedN = n + 10; render(); } }) : null,
    peoplePanel(8),
    el('section', { class: 'panel' }, el('h2', { text: t('Upcoming events') }),
      evs.length ? el('ul', { class: 'due-list' }, evs.map((e) => el('li', {}, el('span', {}, el('a', { href: '#/events', text: e.title }), el('span', { class: 'muted', text: ' · ' + (e.community || t('Friends')) + (e.place ? ' · ' + e.place : '') })), el('span', { class: 'row', style: 'gap:8px;flex-wrap:nowrap' }, faces(e.faces, Number(e.going)), el('span', { class: 'tag', text: fmtWhen(e.starts_at) })))))
        : el('p', { class: 'muted small', text: t('No upcoming events. Create one for your friends or a community.') })));
}

/* ----- members shown as a row of photos ----- */
function storiesPanel(id, all) {
  return panel(t('Members'), null, el('div', { class: 'hscroll stories', id: 'members' }, all.map((m) => el('a', { class: 'story', href: m.me ? myPage() : '#/member/' + m.user_id }, el('span', { class: 'ring' + (m.founder ? ' gold' : '') }, avatarEl(m.avatar, memberName(m.name), 'lg')), el('span', { class: 'small clamp1', text: m.me ? t('You') : memberName(m.name) }), m.founder ? el('span', { class: 'muted small', text: t('Founder') }) : null))),
    all.length > 1 ? null : el('p', { class: 'muted small', text: t('You are the only member so far. Invite people to join.') }));
}

/* ----- richer member page ----- */
function coverEl(path) { const c = el('div', { class: 'cover' }); if (path) CLOUD.fileUrl(path).then((url) => { c.style.backgroundImage = 'url("' + url + '")'; c.classList.add('has'); }).catch(() => {}); return c; }
function memberHead(m, name) {
  const count = (n, label, href) => n == null ? null : el(href ? 'a' : 'span', { class: 'pcount', href }, el('b', { text: String(n) }), el('span', { class: 'muted small', text: label }));
  return el('div', { class: 'phead' }, coverEl(m.cover), el('div', { class: 'pmain' }, avatarEl(m.avatar, name, 'xl'),
    el('div', { class: 'col', style: 'gap:4px;min-width:0' }, el('h1', { text: name, style: 'overflow-wrap:anywhere' }), el('span', { class: 'muted small', style: 'overflow-wrap:anywhere', text: [m.username ? '@' + m.username : '', m.garage && m.garage !== m.name ? m.garage : '', m.city].filter(Boolean).join(' · ') }))),
    m.bio ? richP(m.bio, 'bio') : null, socialLinks(m.links),
    el('div', { class: 'pcounts' }, count(m.n_cars, t('Cars'), m.relation === 'self' ? '#/garage' : m.shared && m.relation === 'friends' ? '#/friend/' + m.user_id : null), count(m.n_friends, t('Friends'), m.relation === 'self' ? '#/friends' : null), count(m.n_communities, t('Communities'), m.relation === 'self' ? '#/communities' : null)));
}
function memberCars(m) {
  const tile = (c, href) => el('a', { class: 'gcar', href }, photoBox(c), el('span', { class: 'small clamp1', text: c.name || t('Unnamed car') }));
  if (m.relation === 'self') return S.cars.length ? panel(t('Garage'), null, el('div', { class: 'gcars', id: 'member-cars' }, S.cars.map((c) => tile(c, '#/car/' + c.id)))) : null;
  if (m.relation !== 'friends' || !m.shared) return null;
  S.fcars = S.fcars || {};
  const got = S.fcars[m.user_id];
  if (!got) { S.fcars[m.user_id] = { loading: true }; CLOUD.friendCars(m.user_id).then((rows) => { S.fcars[m.user_id] = { rows: rows || [] }; }).catch(() => { S.fcars[m.user_id] = { rows: [], failed: true }; }).then(render); return skel('6rem'); }
  if (got.loading) return skel('6rem');
  const rows = got.rows || [];
  return rows.length ? panel(t('Garage'), null, el('div', { class: 'gcars', id: 'member-cars' }, rows.map((x) => tile(x.car || x, '#/friend/' + m.user_id + '/' + encodeURIComponent(x.car_id || x.id))))) : null;
}

/* ----- car of the week ----- */
function loadCotw(id) { S.cotw = S.cotw || {}; return CLOUD.cotw(id).then((d) => { S.cotw[id] = { d: d || { entries: [] }, at: Date.now() }; }).catch(() => { S.cotw[id] = { off: true, at: Date.now() }; }).then(render); }
function cotwCard(e, id, voting) {
  const name = e.mine ? t('You') : memberName(e.name);
  return el('div', { class: 'cw' + (voting ? '' : ' win') }, e.photo ? bigPhoto(e.photo) : el('div', { class: 'fphoto blank', 'aria-hidden': 'true' }, svgIcon(ICONS.garage)),
    el('div', { class: 'col', style: 'gap:4px;min-width:0' }, el('b', { text: e.car_name, style: 'overflow-wrap:anywhere' }), el('span', { class: 'row small', style: 'gap:6px;flex-wrap:nowrap' }, avatarEl(e.avatar, name, 'sm'), who(e.user_id, name, e.mine)), e.caption ? richP(e.caption, 'small') : null,
      voting ? el('div', { class: 'row', style: 'gap:10px' }, e.mine ? el('button', { type: 'button', class: 'btn sm', text: t('Withdraw'), onclick: async () => { try { await CLOUD.cotwWithdraw(e.id); } catch (x) { toast(t('Couldn’t save. Try again.')); } loadCotw(id); } })
        : el('button', { type: 'button', class: 'btn sm' + (e.me_voted ? '' : ' primary'), 'aria-pressed': e.me_voted ? 'true' : 'false', text: e.me_voted ? t('Voted ✓') : t('Vote'), onclick: async () => { try { const r = await CLOUD.cotwVote(e.id); if (r === 'closed') toast(t('Voting for this week has closed.')); } catch (x) { toast(t('Couldn’t save. Try again.')); } loadCotw(id); } }),
        el('span', { class: 'muted small', text: Number(e.votes) === 1 ? t('1 vote') : t('{n} votes', { n: e.votes }) })) : el('span', { class: 'muted small', text: Number(e.votes) === 1 ? t('1 vote') : t('{n} votes', { n: e.votes }) })));
}
function cotwPanel(c) {
  if (!engOn()) return null;
  S.cotw = S.cotw || {};
  const got = S.cotw[c.id];
  if (!got) { S.cotw[c.id] = { loading: true, at: Date.now() }; loadCotw(c.id); return skel('5rem'); }
  if (got.loading) return skel('5rem');
  if (got.off) return null;
  if (Date.now() - got.at > 60000) { got.at = Date.now(); loadCotw(c.id); }
  const d = got.d, mine = d.entries.find((e) => e.mine), f = S.cwForm === c.id;
  const out = el('section', { class: 'panel', id: 'cotw' }, el('h2', { class: 'row', style: 'gap:8px;flex-wrap:nowrap' }, svgIcon(ICONS.trophy), el('span', { text: t('Car of the week') })));
  if (d.winner) out.append(el('span', { class: 'label', text: t('Last week’s winner') }), cotwCard(d.winner, c.id, false));
  out.append(el('p', { class: 'muted small', text: t('Members enter one car each week and everyone votes. Voting closes on {d}, and the winner stays at the top for a week.', { d: fmtDate(d.ends) }) }));
  if (d.entries.length) out.append(el('div', { class: 'cws' }, d.entries.map((e) => cotwCard(e, c.id, true))));
  if (f) {
    const cars = S.cars, pick = select(cars.map((x) => [x.id, x.name || t('Unnamed car')]).concat([['', t('Another car')]]), cars[0] ? cars[0].id : '', { id: 'cw-car' }), other = el('input', { type: 'text', id: 'cw-name', maxlength: 120, placeholder: t('Car name') }), cap = el('input', { type: 'text', id: 'cw-cap', maxlength: 300, placeholder: t('Why this car? (optional)') }), file = el('input', { type: 'file', accept: 'image/*', id: 'cw-photo' }), st = el('span', { class: 'status', role: 'status' });
    const otherF = field(t('Car name'), other), fileF = field(t('Photo'), file, t('Leave empty to use the car’s main photo.'));
    const sync = () => { otherF.hidden = !!pick.value; }; pick.addEventListener('change', sync); sync();
    out.append(el('form', { class: 'col', style: 'gap:12px', id: 'cw-form', onsubmit: async (ev) => {
      ev.preventDefault(); const car = cars.find((x) => x.id === pick.value), name = (car ? car.name || '' : other.value).trim(); if (!name) { st.textContent = t('Give the car a name.'); return; }
      st.textContent = t('Saving…');
      try { let ph = car && car.photo && car.photo.path ? car.photo.path : null; if (file.files[0]) ph = (await CLOUD.upload('cotw-' + c.id, await shrink(file.files[0]))).path; await CLOUD.cotwEnter(c.id, name, ph, cap.value.trim()); S.cwForm = null; document.activeElement && document.activeElement.blur(); toast(t('Your car is entered')); await loadCotw(c.id); } catch (e) { st.textContent = t('Couldn’t save. Try again.'); }
    } }, field(t('Which car'), pick), otherF, fileF, field(t('Caption'), cap), el('div', { class: 'row' }, el('button', { type: 'submit', class: 'btn primary', id: 'b-cw-save', text: t('Enter') }), el('button', { type: 'button', class: 'btn', text: t('Cancel'), onclick: () => { S.cwForm = null; render(); } }), st)));
  } else if (!mine) out.append(el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn' + (d.entries.length ? '' : ' primary'), id: 'b-cw-enter', onclick: () => { S.cwForm = c.id; render(); } }, ico('plus', t('Enter my car')))));
  return out;
}

/* ----- invite link and QR code ----- */
const inviteUrl = (id) => location.origin + location.pathname + '#/community/' + id;
function qrSvg(text) {
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  const n = q.getModuleCount(); let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += 'M' + (c + 2) + ' ' + (r + 2) + 'h1v1h-1z';
  const box = el('div', { class: 'qr', role: 'img', 'aria-label': t('QR code for the invite link') });
  box.innerHTML = '<svg viewBox="0 0 ' + (n + 4) + ' ' + (n + 4) + '" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path fill="#000" d="' + d + '"/></svg>';
  return box;
}
function inviteSheet() {
  const v = S.invite; if (!v) return null;
  const url = inviteUrl(v.id), msg = t('Join {n} on Garage 197', { n: v.name }) + ': ' + url, close = () => { S.invite = null; render(); };
  const copy = async () => { try { await navigator.clipboard.writeText(url); toast(t('Link copied')); } catch (e) { const i = document.getElementById('inv-url'); if (i) { i.select(); try { document.execCommand('copy'); toast(t('Link copied')); } catch (x) {} } } };
  return el('div', { class: 'sheetback', id: 'invite-sheet', onclick: (ev) => { if (ev.target === ev.currentTarget) close(); } }, el('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('Invite people') },
    el('h2', { text: t('Invite people to {n}', { n: v.name }) }), el('p', { class: 'muted small', text: t('Anyone who opens this link can sign in or create an account and then join the community.') }),
    qrSvg(url), el('input', { type: 'text', id: 'inv-url', readonly: true, value: url, dir: 'ltr', onfocus: (ev) => ev.target.select() }),
    el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn primary', id: 'b-inv-copy', onclick: copy }, ico('link', t('Copy link'))),
      el('a', { class: 'btn', id: 'a-inv-wa', href: 'https://wa.me/?text=' + encodeURIComponent(msg), target: '_blank', rel: 'noopener noreferrer', text: t('Send on WhatsApp') }),
      navigator.share ? el('button', { type: 'button', class: 'btn', onclick: () => { navigator.share({ title: 'Garage 197', text: t('Join {n} on Garage 197', { n: v.name }), url }).catch(() => {}); } }, ico('share', t('Share'))) : null),
    el('button', { type: 'button', class: 'btn', text: t('Close'), onclick: close })));
}

/* ----- sharing a car or a model into a chat ----- */
function shareBtn(attach, label) { return engOn() && CLOUD.chatsOn ? el('button', { type: 'button', class: 'btn', id: 'b-share', onclick: () => { S.share = attach; render(); } }, ico('share', label || t('Send to a friend'))) : null; }
function shareSheet() {
  const a = S.share; if (!a) return null;
  const close = () => { S.share = null; render(); }, friends = CLOUD.friends.filter((f) => f.status === 'accepted');
  const note = el('input', { type: 'text', id: 'sh-note', maxlength: 500, placeholder: t('Add a message (optional)') });
  const send = async (f) => { try { const r = await CLOUD.sendMessage(f.other, note.value.trim(), null, a); if (r === 'sent') { toast(t('Sent to {n}', { n: friendName(f) })); S.share = null; CLOUD.loadChats(); } else toast(r === 'slow' ? t('You are sending messages very quickly. Wait a moment.') : t('Couldn’t send. Try again.')); } catch (e) { toast(t('Couldn’t send. Try again.')); } render(); };
  return el('div', { class: 'sheetback', id: 'share-sheet', onclick: (ev) => { if (ev.target === ev.currentTarget) close(); } }, el('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('Send to a friend') },
    el('h2', { text: t('Send to a friend') }), attachCard(a, true),
    a.type === 'car' && !CLOUD.shared ? el('p', { class: 'muted small', text: t('Your garage is not shared with friends, so they will see the car’s name only.') }) : null,
    friends.length ? note : null,
    friends.length ? el('div', { class: 'menu' }, friends.map((f) => el('button', { type: 'button', class: 'menurow', onclick: () => send(f) }, avatarEl(f.avatar, friendName(f), 'sm'), el('b', { style: 'flex:1;min-width:0;overflow-wrap:anywhere', text: friendName(f) }), el('span', { class: 'muted small', text: t('Send') }))))
      : starter(t('Add a friend first, then you can send them cars and market models.'), el('a', { class: 'btn primary', href: '#/friends', onclick: close, text: t('Find a friend') })),
    el('button', { type: 'button', class: 'btn', text: t('Close'), onclick: close })));
}
function attachCard(a, plain) {
  if (!a || typeof a !== 'object') return null;
  const me = CLOUD.user && CLOUD.user.id;
  if (a.type === 'car' && a.name) { const href = a.owner === me ? '#/car/' + encodeURIComponent(a.id) : '#/friend/' + a.owner + '/' + encodeURIComponent(a.id); return el(plain ? 'div' : 'a', { class: 'acard', href: plain ? null : href }, svgIcon(ICONS.garage), el('span', { class: 'col', style: 'gap:1px;min-width:0' }, el('b', { text: String(a.name).slice(0, 120) }), el('span', { class: 'muted small', text: t('Car') }))); }
  if (a.type === 'model' && a.name) return el(plain ? 'div' : 'a', { class: 'acard', href: plain ? null : '#/model/' + encodeURIComponent(a.name) }, svgIcon(ICONS.market), el('span', { class: 'col', style: 'gap:1px;min-width:0' }, el('b', { text: shortModel(String(a.name).slice(0, 120)) }), el('span', { class: 'muted small', text: t('Market values and recent sales') })));
  return null;
}
const msgBody = (s) => s === '[photo]' ? t('Photo') : s === '[shared]' ? t('Shared a car') : s || '';

/* ----- group chats for communities and events ----- */
const groupUnread = () => (CLOUD.gchats || []).reduce((n, c) => n + Number(c.unread || 0), 0);
function loadGroup(scope, ref, quiet) {
  S.gchat = S.gchat || {}; const k = scope + '/' + ref;
  if (!quiet) S.gchat[k] = S.gchat[k] || { loading: true };
  return CLOUD.groupChat(scope, ref).then((rows) => { const old = S.gchat[k] || {}, same = old.rows && rows && old.rows.length === rows.length && (!rows.length || old.rows[old.rows.length - 1].id === rows[rows.length - 1].id); S.gchat[k] = { rows: rows || [] }; if (same && quiet) return false; CLOUD.loadGroups(); return true; })
    .catch(() => { if (!quiet) S.gchat[k] = { rows: [], failed: true }; return !quiet; })
    .then((ch) => { const r = route(); if (ch && r.name === 'gchat' && r.a === scope && r.b === ref) { if (quiet) { const ta = document.getElementById('c-body'); if (ta) S.chatDraft = ta.value; if (ta && document.activeElement === ta) S.chatRefocus = true; } S.chatDown = true; render(); } });
}
function chatForm(send, key) {
  const body = el('textarea', { id: 'c-body', rows: 2, maxlength: 2000, placeholder: t('Write a message'), 'aria-label': t('Write a message') }), st = el('span', { class: 'status', role: 'status' }); body.value = S.chatDraft || '';
  body.addEventListener('input', () => { S.chatDraft = body.value; });
  S.chatPick = S.chatPick && S.chatPick.key === key ? S.chatPick : { key, file: null };
  const pk = S.chatPick, file = el('input', { type: 'file', accept: 'image/*', id: 'c-photo', style: 'display:none' }), prev = el('div', { class: 'attach', id: 'c-attach' });
  const show = () => { prev.replaceChildren(); if (!pk.file) return; const im = el('img', { alt: '' }); try { im.src = URL.createObjectURL(pk.file); } catch (e) {} prev.append(im, el('button', { type: 'button', class: 'linkbtn small', text: t('Remove'), onclick: () => { pk.file = null; file.value = ''; show(); } })); };
  file.addEventListener('change', () => { if (file.files[0]) pk.file = file.files[0]; show(); }); show();
  const go = async () => {
    const v = body.value.trim(); if ((!v && !pk.file) || pk.busy) return;
    pk.busy = true; st.textContent = pk.file ? t('Uploading the photo…') : t('Sending…');
    try { let ph = null; if (pk.file) ph = (await CLOUD.upload('chat', await shrink(pk.file))).path; const r = await send(v, ph); if (r === 'sent') { S.chatDraft = ''; body.value = ''; pk.file = null; st.textContent = ''; } else st.textContent = r === 'slow' ? t('You are sending messages very quickly. Wait a moment.') : r === 'not_friends' ? t('You can only message friends.') : r === 'closed' ? t('You can no longer write in this chat.') : t('Couldn’t send. Try again.'); }
    catch (e) { st.textContent = t('Couldn’t send. Try again.'); }
    pk.busy = false; show();
  };
  body.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.shiftKey && !matchMedia('(pointer: coarse)').matches) { ev.preventDefault(); go(); } });
  if (S.chatRefocus) { S.chatRefocus = false; setTimeout(() => { const b = document.getElementById('c-body'); if (b) { b.focus(); b.setSelectionRange(b.value.length, b.value.length); } }, 0); }
  return [prev, el('form', { class: 'row chatform', style: 'flex-wrap:nowrap;align-items:flex-end', onsubmit: (ev) => { ev.preventDefault(); go(); } }, engOn() ? el('button', { type: 'button', class: 'btn iconbtn', id: 'b-c-photo', 'aria-label': t('Add a photo'), title: t('Add a photo'), onclick: () => file.click() }, svgIcon(ICONS.camera)) : null, file, body, el('button', { type: 'submit', class: 'btn primary', id: 'b-send', text: t('Send') })), st];
}
function viewGroupChat(scope, ref) {
  const out = el('div', { class: 'col chat', style: 'max-width:40rem' }, el('a', { class: 'small', href: '#/messages', text: '‹ ' + t('Messages') }));
  if (!CLOUD.socialLoaded) { out.append(skel('10rem')); return out; }
  const g = (CLOUD.gchats || []).find((x) => x.scope === scope && x.ref === ref), k = scope + '/' + ref;
  if (!engOn() || !g) { out.append(el('p', { class: 'empty', text: t(scope === 'event' ? 'This chat is for people going to the event. Say you are going to join it.' : 'This chat is for members of the community. Join to take part.') })); return out; }
  out.append(el('div', { class: 'row', style: 'gap:12px;flex-wrap:nowrap' }, el('span', { class: 'avatar', 'aria-hidden': 'true' }, svgIcon(ICONS.group)), el('div', { class: 'col', style: 'gap:2px;min-width:0' }, el('h1', { text: g.title, style: 'overflow-wrap:anywhere;font-size:1.3rem' }),
    el('a', { class: 'muted small', href: scope === 'event' ? '#/events' : '#/community/' + ref, text: scope === 'event' ? t('Event chat') + ' · ' + fmtWhen(g.sub) : t('Community chat') }))));
  const key = 'g:' + k;
  if (S.chatFor !== key) { S.chatFor = key; S.chatDraft = ''; loadGroup(scope, ref); }
  clearInterval(viewChat.h); viewChat.h = setInterval(() => { const r = route(); if (r.name !== 'gchat') { clearInterval(viewChat.h); S.chatFor = null; return; } if (!document.hidden) loadGroup(r.a, r.b, true); }, 10000);
  const got = (S.gchat || {})[k];
  if (!got || got.loading) { out.append(skel('10rem')); return out; }
  out.append(el('div', { class: 'bubbles', id: 'bubbles' }, got.rows.length ? got.rows.map((m, i) => { const first = !m.mine && (i === 0 || got.rows[i - 1].author_id !== m.author_id); return el('div', { class: 'brow' + (m.mine ? ' mine' : '') }, m.mine ? null : first ? el('a', { href: '#/member/' + m.author_id, 'aria-label': memberName(m.author) }, avatarEl(m.avatar, memberName(m.author), 'sm')) : el('span', { class: 'avatar sm ghost' }),
    el('div', { class: 'bubble' + (m.mine ? ' mine' : '') }, first ? el('b', { class: 'small', text: memberName(m.author) }) : null, m.photo ? postPhoto(m.photo) : null, m.body ? richP(m.body) : null,
      el('span', { class: 'row small', style: 'gap:10px' }, el('span', { text: fmtWhen(m.created_at) }), m.mine ? el('button', { type: 'button', class: 'linkbtn small', text: t('Remove'), onclick: async () => { try { await CLOUD.deleteGroupMessage(m.id); if (m.photo) CLOUD.removeFiles([m.photo]); } catch (e) { toast(t('Couldn’t save. Try again.')); } loadGroup(scope, ref, false); } }) : CLOUD.extras ? el('button', { type: 'button', class: 'linkbtn small', text: t('Report'), onclick: () => reportAsk('gmessage', m.id, m.author + ': ' + m.body) }) : null))); })
    : el('p', { class: 'muted small', text: t(got.failed ? 'Messages could not be loaded. Try again later.' : 'No messages yet. Say hello.') })));
  out.append(...chatForm(async (v, ph) => { const r = await CLOUD.sendGroup(scope, ref, v, ph); if (r === 'sent') await loadGroup(scope, ref, true); return r; }, key),
    el('p', { class: 'muted small' }, el('span', { text: t(scope === 'event' ? 'Everyone going to this event can read this chat. Messages follow the' : 'Every member of this community can read this chat. Messages follow the') + ' ' }), el('a', { href: '#/guidelines', text: t('community guidelines') }), el('span', { text: '.' })));
  if (S.chatDown) { S.chatDown = false; setTimeout(() => { const b = document.getElementById('bubbles'); if (b) b.scrollTop = b.scrollHeight; }, 0); }
  return out;
}
function groupsPanel() {
  if (!engOn()) return null;
  const gs = CLOUD.gchats || [];
  if (!gs.length) return null;
  return panel(t('Group chats'), null, el('ul', { class: 'chats', id: 'gchats' }, gs.map((c) => el('li', {}, el('a', { class: 'chatrow', href: '#/gchat/' + c.scope + '/' + c.ref }, el('span', { class: 'avatar', 'aria-hidden': 'true' }, svgIcon(ICONS.group)), el('span', { class: 'col', style: 'gap:2px;min-width:0;flex:1' },
    el('span', { class: 'row between', style: 'flex-wrap:nowrap' }, el('b', { text: c.title, style: 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }), c.last_at ? el('span', { class: 'muted small', style: 'flex:none', text: ago(c.last_at) }) : null),
    el('span', { class: 'muted small', style: 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap', text: c.last_at ? memberName(c.last_author) + ': ' + msgBody(c.last_body) : c.scope === 'event' ? t('Event chat') + ' · ' + fmtWhen(c.sub) : t('Community chat') })), Number(c.unread) ? el('span', { class: 'count', text: String(c.unread) }) : null)))));
}
function viewU(name) {
  const out = el('div', { class: 'col' }, skel('8rem'));
  if (!CLOUD.socialLoaded) return out;
  if (S.uFor !== name) { S.uFor = name; S.uMiss = false; CLOUD.userByUsername(name).then((id) => { if (route().name !== 'u') return; if (id) location.replace('#/member/' + id); else { S.uMiss = true; render(); } }).catch(() => { S.uMiss = true; render(); }); }
  if (S.uMiss) out.replaceChildren(el('p', { class: 'empty', text: t('Nobody here uses the name @{n}.', { n: name }) }));
  return out;
}
