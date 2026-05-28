import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyBdEjoWI4pAkPHwEaM4uAWQ5jWe_uuWvs4",
  authDomain: "smart-community-helpdesk.firebaseapp.com",
  databaseURL: "https://smart-community-helpdesk-default-rtdb.firebaseio.com",
  projectId: "smart-community-helpdesk"
};

const app = initializeApp(firebaseConfig);

export const db = getDatabase(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
