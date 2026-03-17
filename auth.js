//2026.3.17版
const GAS_URL = "https://script.google.com/macros/s/AKfycbzwiLcSMXpXxQD3Z17X8CnipLfueqd9kHPHBPYKvowO5SxzYZStxCtI0qhh-mfEFO1ndA/exec";
const AUTH_KEY = "kian_auth";

function setAuth(auth) {
  sessionStorage.setItem(AUTH_KEY, JSON.stringify(auth));
}

function getAuth() {
  try {
    return JSON.parse(sessionStorage.getItem(AUTH_KEY) || "null");
  } catch {
    return null;
  }
}

function clearAuth() {
  sessionStorage.removeItem(AUTH_KEY);
}

async function authLogin(pin) {
  const res = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "login",
      authPin: pin
    })
  });

  const text = await res.text();
  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("ログイン応答が不正です。");
  }

  if (!data.ok) {
    throw new Error(data.message || "PINが違います。");
  }

  const auth = {
    pin,
    role: data.role,
    name: data.name
  };

  setAuth(auth);
  return auth;
}

function appendAuth(payload = {}) {
  const auth = getAuth();
  return {
    ...payload,
    authPin: auth?.pin || ""
  };
}

function logoutToRoot() {
  clearAuth();
  location.href = "../index.html";
}

function requirePageAuth(allowedRoles) {
  const auth = getAuth();
  if (!auth || !allowedRoles.includes(auth.role)) {
    location.href = "../index.html";
    return null;
  }
  return auth;
}
