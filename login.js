const PIN_USERS = {
  "1111": { name: "起案者", role: "drafter" },
  "2222": { name: "承認者A", role: "approverA" },
  "3333": { name: "承認者B", role: "approverB" },
  "9999": { name: "管理者", role: "admin" }
};

function login(requiredRoles) {

  const pin = document.getElementById("pin").value.trim();

  if (!PIN_USERS[pin]) {
    document.getElementById("loginMsg").textContent = "PINが違います";
    return;
  }

  const user = PIN_USERS[pin];

  if (!requiredRoles.includes(user.role)) {
    document.getElementById("loginMsg").textContent = "このページの権限がありません";
    return;
  }

  sessionStorage.setItem("role", user.role);
  sessionStorage.setItem("name", user.name);

  document.getElementById("login").style.display = "none";
  document.getElementById("app").style.display = "block";
}

function autoLogin(requiredRoles){

  const role = sessionStorage.getItem("role");

  if(role && requiredRoles.includes(role)){
      document.getElementById("login").style.display="none";
      document.getElementById("app").style.display="block";
  }

}
