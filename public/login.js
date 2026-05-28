import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { ref, set, update } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { auth, db } from "./firebase-config.js";

const form = document.getElementById("authForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const authMessage = document.getElementById("authMessage");
const submitButton = document.getElementById("authSubmit");
const loginMode = document.getElementById("loginMode");
const signupMode = document.getElementById("signupMode");

let mode = "login";

function setMode(nextMode) {
  mode = nextMode;
  loginMode.classList.toggle("active", mode === "login");
  signupMode.classList.toggle("active", mode === "signup");
  submitButton.textContent = mode === "login" ? "Login" : "Create account";
  authMessage.textContent = "";
}

function setMessage(message, tone = "muted") {
  authMessage.textContent = message;
  authMessage.className = `helper ${tone}`;
}

function getRedirectTarget() {
  const redirect = new URLSearchParams(window.location.search).get("redirect");
  return redirect && !redirect.startsWith("http") ? redirect : "index.html";
}

async function createUserProfile(user) {
  await set(ref(db, `users/${user.uid}`), {
    email: user.email,
    role: "citizen",
    createdAt: Date.now(),
    updatedAt: Date.now()
  });
}

async function touchUserProfile(user) {
  await update(ref(db, `users/${user.uid}`), {
    email: user.email,
    lastLoginAt: Date.now(),
    updatedAt: Date.now()
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  submitButton.disabled = true;
  setMessage(mode === "login" ? "Signing you in..." : "Creating your account...");

  try {
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const credential = mode === "login"
      ? await signInWithEmailAndPassword(auth, email, password)
      : await createUserWithEmailAndPassword(auth, email, password);

    if (mode === "signup") {
      await createUserProfile(credential.user);
    } else {
      await touchUserProfile(credential.user);
    }

    window.location.href = getRedirectTarget();
  } catch (error) {
    console.error("Authentication failed", error);
    setMessage(error.message || "Authentication failed. Please try again.", "error");
  } finally {
    submitButton.disabled = false;
  }
});

loginMode.addEventListener("click", () => setMode("login"));
signupMode.addEventListener("click", () => setMode("signup"));
