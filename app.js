
// Initialize Firebase App
const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();
const storage = firebase.storage();

let currentUser = null;
let replyTo = null;
let selectedFriend = null;

// Elements
const authScreen = document.getElementById("auth-screen");
const chatScreen = document.getElementById("chat-screen");
const messageForm = document.getElementById("message-form");
const messageInput = document.getElementById("message");
const messagesDiv = document.getElementById("messages");
const friendList = document.getElementById("friend-list");
const mediaInput = document.getElementById("media-upload");

// Emoji Picker
const emojiList = ['😀','😁','😂','😅','😊','😍','😎','😢','😡','❤️','👍','👏'];
const emojiContainer = document.createElement('div');
emojiContainer.style.display = 'flex';
emojiContainer.style.flexWrap = 'wrap';
emojiContainer.style.padding = '8px';
emojiContainer.style.borderTop = '1px solid #ccc';
emojiList.forEach(emoji => {
  const btn = document.createElement("button");
  btn.textContent = emoji;
  btn.style.fontSize = "20px";
  btn.style.margin = "4px";
  btn.onclick = () => {
    messageInput.value += emoji;
    messageInput.focus();
  };
  emojiContainer.appendChild(btn);
});
document.body.appendChild(emojiContainer);

// Auth
auth.onAuthStateChanged(user => {
  if (user) {
    currentUser = user.email || user.phoneNumber;
    document.getElementById("username").innerText = currentUser;
    document.getElementById("phone-link").innerText = currentUser;
    authScreen.style.display = "none";
    chatScreen.style.display = "flex";
    db.ref("users/" + currentUser).set({ online: true });
    loadFriends();
  } else {
    authScreen.style.display = "flex";
    chatScreen.style.display = "none";
  }
});

function login() {
  const email = document.getElementById("auth-email").value;
  const password = document.getElementById("auth-password").value;
  auth.signInWithEmailAndPassword(email, password)
    .catch(err => document.getElementById("auth-error").innerText = err.message);
}

function register() {
  const email = document.getElementById("auth-email").value;
  const password = document.getElementById("auth-password").value;
  auth.createUserWithEmailAndPassword(email, password)
    .catch(err => document.getElementById("auth-error").innerText = err.message);
}

function logout() {
  db.ref("users/" + currentUser).set({ online: false });
  auth.signOut();
}

function getChatId(user1, user2) {
  return [user1, user2].sort().join("_");
}

function loadFriends() {
  db.ref("users").on("value", snapshot => {
    friendList.innerHTML = "";
    snapshot.forEach(userSnap => {
      const name = userSnap.key;
      if (name !== currentUser) {
        const li = document.createElement("li");
        li.textContent = name;
        li.onclick = () => openChat(name);
        friendList.appendChild(li);
      }
    });
  });
}

function openChat(friendName) {
  selectedFriend = friendName;
  messagesDiv.innerHTML = "";
  messageForm.style.display = "flex";
  const chatId = getChatId(currentUser, friendName);
  db.ref("messages/" + chatId).off();
  db.ref("messages/" + chatId).on("child_added", snapshot => {
    const data = snapshot.val();
    const msg = document.createElement("div");
    msg.className = "message " + (data.name === currentUser ? "you" : "other");
    let content = "";
    if (data.replyTo) content += `<div style='font-size:12px;color:#555;'>Balas: ${data.replyTo}</div>`;
    if (data.mediaType === "image") {
      content += `<img src="${data.message}" style="max-width:100%;border-radius:12px;" />`;
    } else if (data.mediaType === "video") {
      content += `<video controls style="max-width:100%;border-radius:12px;"><source src="${data.message}"></video>`;
    } else {
      content += `<strong>${data.name}</strong><br>${data.message}`;
    }
    msg.innerHTML = content;
    msg.onclick = () => {
      replyTo = data.message;
      messageInput.placeholder = "Balas: " + data.message;
    };
    messagesDiv.appendChild(msg);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    if (data.name !== currentUser) playNotificationSound();
  });
}

function playNotificationSound() {
  const sound = new Audio("https://actions.google.com/sounds/v1/cartoon/wood_plank_flicks.ogg");
  sound.play().catch(() => {});
}

// Kirim pesan
messageForm.addEventListener("submit", function(e) {
  e.preventDefault();
  const message = messageInput.value.trim();
  if (!selectedFriend || !message) return;

  const chatId = getChatId(currentUser, selectedFriend);
  db.ref("messages/" + chatId).push({
    name: currentUser,
    message: message,
    replyTo: replyTo,
    mediaType: null
  });

  messageForm.reset();
  replyTo = null;
  messageInput.placeholder = "Tulis pesan...";
});

// Media Upload
document.querySelector(".message-form").insertAdjacentHTML("beforeend", '<button type="button" onclick="mediaInput.click()">📎</button>');

mediaInput.onchange = function(e) {
  const file = e.target.files[0];
  if (!file || !selectedFriend) return;
  const fileRef = storage.ref("media/" + Date.now() + "_" + file.name);
  const uploadTask = fileRef.put(file);

  uploadTask.on("state_changed", null, console.error, () => {
    uploadTask.snapshot.ref.getDownloadURL().then(url => {
      const type = file.type.startsWith("image") ? "image" : "video";
      const chatId = getChatId(currentUser, selectedFriend);
      db.ref("messages/" + chatId).push({
        name: currentUser,
        message: url,
        replyTo: replyTo,
        mediaType: type
      });
    });
  });
};

// STATUS / STORY
document.body.insertAdjacentHTML("beforeend", '<input type="file" id="status-file" accept="image/*,video/*" hidden />');
const statusInput = document.getElementById("status-file");

function uploadStatus() {
  statusInput.click();
}

statusInput.onchange = function(e) {
  const file = e.target.files[0];
  if (!file || !currentUser) return;

  const fileRef = storage.ref("status/" + Date.now() + "_" + file.name);
  const uploadTask = fileRef.put(file);

  uploadTask.on("state_changed", null, console.error, () => {
    uploadTask.snapshot.ref.getDownloadURL().then(url => {
      const type = file.type.startsWith("image") ? "image" : "video";
      db.ref("statuses/" + currentUser).set({
        url: url,
        type: type,
        timestamp: Date.now()
      });
    });
  });
};

function closeStatus() {
  document.getElementById("status-viewer").style.display = "none";
  document.getElementById("status-media").innerHTML = "";
}

function showStatus(username) {
  db.ref("statuses/" + username).once("value", snap => {
    const data = snap.val();
    if (!data || Date.now() - data.timestamp > 86400000) return;
    const media = data.type === "image" ? `<img src="${data.url}" />` : `<video src="${data.url}" controls autoplay></video>`;
    document.getElementById("status-media").innerHTML = media;
    document.getElementById("status-viewer").style.display = "flex";
  });
}

db.ref("statuses").on("value", snap => {
  const all = snap.val() || {};
  const now = Date.now();
  document.querySelectorAll("#friend-list li").forEach(li => {
    const name = li.textContent.trim();
    const status = all[name];
    if (status && now - status.timestamp < 86400000) {
      li.style.position = "relative";
      li.innerHTML += '<span style="position:absolute;right:10px;top:10px;width:10px;height:10px;border-radius:50%;background:#00c853;"></span>';
      li.onclick = () => showStatus(name);
    }
  });
});

// PWA INSTALLABLE
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  const installBtn = document.createElement("button");
  installBtn.textContent = "Install Hamutuk";
  installBtn.style.position = "fixed";
  installBtn.style.bottom = "20px";
  installBtn.style.right = "20px";
  installBtn.style.padding = "10px 20px";
  installBtn.style.background = "#007bff";
  installBtn.style.color = "white";
  installBtn.style.border = "none";
  installBtn.style.borderRadius = "8px";
  installBtn.style.cursor = "pointer";
  document.body.appendChild(installBtn);
  installBtn.addEventListener("click", () => {
    e.prompt();
    installBtn.remove();
  });
});
