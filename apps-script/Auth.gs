/**
 * App login (the web app runs as the owner, so users log in with email + password
 * stored hashed in the Users tab). Sessions live 12 hours in the script cache.
 */
var Auth = (function () {
  var TTL = 12 * 60 * 60;

  function hash(password, salt) { return sha256(salt + '|' + password); }

  function login(email, password) {
    email = str(email).toLowerCase();
    var u = Db.all('Users').filter(function (r) { return r.email.toLowerCase() === email && bool(r.is_active); })[0];
    if (!u || hash(str(password), u.salt) !== u.password_hash) {
      Utilities.sleep(800);
      fail('err.login');
    }
    var token = randomToken();
    CacheService.getScriptCache().put('s_' + token, u.id, TTL);
    return { token: token, user: publicUser(u) };
  }

  function userFromToken(token) {
    var id = token && CacheService.getScriptCache().get('s_' + token);
    if (!id) fail('err.session');
    var u = Db.find('Users', id);
    if (!u || !bool(u.is_active)) fail('err.session');
    u._token = token;
    return u;
  }

  function logout(u) { CacheService.getScriptCache().remove('s_' + u._token); }

  function hasRole(u, role) { return u.role === 'admin' || u.role === role; }

  /** require(user, 'accounts', 'registry_officer') – admin always passes. */
  function require(u) {
    var roles = Array.prototype.slice.call(arguments, 1);
    for (var i = 0; i < roles.length; i++) if (hasRole(u, roles[i])) return;
    fail('err.not_allowed');
  }

  function publicUser(u) {
    return { id: u.id, name: u.name, email: u.email, role: u.role, department: u.department, locale: u.locale || 'en', is_active: bool(u.is_active) };
  }

  function setPassword(id, password) {
    if (str(password).length < 8) fail('err.password_short');
    var salt = Utilities.getUuid();
    Db.update('Users', id, { salt: salt, password_hash: hash(password, salt) });
  }

  function changePassword(u, current, password) {
    if (hash(str(current), u.salt) !== u.password_hash) fail('err.login');
    setPassword(u.id, password);
    return true;
  }

  function saveUser(admin, p) {
    var email = required(p.email, 'email').toLowerCase();
    if (ENUM.roles.indexOf(p.role) < 0) fail('err.required', { field: 'role' });
    var dup = Db.all('Users').filter(function (r) { return r.email.toLowerCase() === email && r.id !== String(p.id || ''); })[0];
    if (dup) fail('err.duplicate', { field: 'email' });
    var data = { name: required(p.name, 'name'), email: email, role: p.role, department: str(p.department), is_active: p.is_active !== false };
    var id;
    if (p.id) { Db.update('Users', p.id, data); id = p.id; }
    else { id = Db.insert('Users', Object.assign(data, { locale: 'en' })).id; }
    if (str(p.password)) setPassword(id, p.password);
    else if (!p.id) fail('err.required', { field: 'password' });
    audit(admin, 'user.saved', 'Users', id, { email: email, role: p.role });
    return true;
  }

  return {
    login: login, userFromToken: userFromToken, logout: logout, hasRole: hasRole, require: require,
    publicUser: publicUser, setPassword: setPassword, changePassword: changePassword, saveUser: saveUser,
  };
})();
