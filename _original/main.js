document.addEventListener("DOMContentLoaded", ()=>
{
    const themeButton = document.querySelector("#theme-toggle");
     if (themeButton) {
        themeButton.addEventListener("click", ()=>
        {
            document.body.classList.toggle("dark-mode");
            const darkMode = document.body.classList.contains("dark-mode");
            localStorage.setItem("shinkaTheme", darkMode ? "dark" : "light");
            themeButton.textContent = darkMode ? "+": "-";
        });
        const savedTheme = localStorage.getItem("shinkaTheme");
        if(savedTheme === "dark") {
            document.body.classList.add("dark-mode");
            themeButton.textContent="+";
        }
     }
})


const notificationButton = document.querySelector("#notification-toggle");
if (notificationButton) {
    const savedChoice = localStorage.getItem("notificationChoice");
    if (savedChoice === "enabled"){
        notificationButton.textContent = "Notifications Enabled";
    }
    if (savedChoice === "disabled") {
        notificationButton.textContent = "Notifications Disabled";
    }

    notificationButton.addEventListener("click", async() => {
        if (!("Notification" in window)) {
            alert("Notifications are not supported by your browser.");
            return;
        }
        if (!(Notification.permission === "granted")) {
            localStorage.setItem("notificationChoice", "enabled");
            notificationButton.textContent = "Notifications Enabled";
            return;
        }
        if (Notification.permission === "default") {
            const permission = await
            Notification.requestPermission();
            if (permission === "granted") {
                localStorage.setItem(
                    "notificationChoice", "enabled"
                );
                notificationButton.textContent = "Notifications Enabled";
                new Notification("ShinkaNotes", {
                    body: "Notificaions are now enabled!"
                });
            } else {
                localStorage.setItem(
                    "notificationChoice", "disabled"
                );
                notificationButton.textContent = "Notifications Disabled";
            }
            return;
        }
        if (Notification.permission === "denied") {
            localStorage.setItem("notificationChoice", "disabled");
            notificationButton.textContent = "Notification Disabled";
            alert("Notifications are blocked. You can enable them from your browser's site settings.");
        }
    });
}





const registrationForm = document.querySelector("#registration-form");
if (registrationForm) {
    registrationForm.addEventListener
    ("submit", (event) => {  
        event.preventDefault();
        const fullname = document.querySelector("#fullname").value.trim();
        const email = document.querySelector("#email").value.trim();
        const password = document.querySelector("#password").value;
        const confirmPassword = document.querySelector("#confirm-password").value;
        if (!registrationForm.checkValidity()) {
            registrationForm.reportValidity(); return;
        }
        if (password !== confirmPassword){
            alert("Passwords do not match."); return;
        }
    

        sessionStorage.setItem("registrationName", fullname);
        sessionStorage.setItem("registrationEmail", email);

        window.location.href = "profile.html"

    });
}

const finishButton = document.querySelector("#finish-registration");
if (finishButton) {
    finishButton.addEventListener("click", () => {
        const selectedAvatar = 
        document.querySelector(
            'input[name="avatar"]:checked'
        );
        if (!selectedAvatar) {
            alert("Please choose a profile picture.");
            return;
        }
        sessionStorage.setItem(
            "avatar",
            selectedAvatar.value
        );
        window.location.href = "index.html"
    });
}

const menuToggle = document.querySelector("#menu-toggle");
const sidebar = document.querySelector("#sidebar");
const closeSidebar = document.querySelector("#close-sidebar")
const sidebarOverlay = document.querySelector("#sidebar-overlay")
if (menuToggle && sidebar) {
    menuToggle.addEventListener("click", () => {
        sidebar.classList.add("open");
        sidebarOverlay.classList.add("show");
        menuToggle.setAttribute("aria-expanded", "true");
    });
}
if (closeSidebar) {
    closeSidebar.addEventListener("click", closeMenu);
}
if (sidebarOverlay) {
    sidebarOverlay.addEventListener("click", closeMenu);
}
function closeMenu() {
    sidebar.classList.remove("open");
    sidebarOverlay.classList.remove("show");
    if(menuToggle) {
        menuToggle.setAttribute("aria-expanded", "false");
    }
}

const activity = JSON.parse(
    localStorage.getItem("activityHistory") || "[]"
);
activity.unshift({
    action: "Viewed",
    item: "Differentiation",
    date: new
    Date().toLocaleString()
});
localStorage.setItem(
    "activityHistory",
    JSON.stringify(activity)
);

function signOut() {
    localStorage.removeItem("LoggedIn");
    sessionStorage.clear();
    window.location.href = "logreg.html";
}

const navProfilePicture = document.querySelector("#nav-profile-picture");
if (navProfilePicture) {
    const savedAvatar = localStorage.getItem("avatar");
    if (savedAvatar) {
        navProfilePicture.src = `assets/avatars/${savedAvatar}`;
    }
}

const searchButton = document.querySelector("#search-button");
const searchContainer = document.querySelector(".search-container");
const searchInput = document.querySelector("#site-search");
if (searchButton && searchContainer) {
    searchButton.addEventListener("click", () =>{
        searchContainer.classList.toggle("active");
        if (searchContainer.classList.contains("active")){
            searchInput.focus();
        }
    });
}

const searchableItems = document.querySelectorAll(".searchable-item");
if (searchInput) {
    searchInput.addEventListener("input", () => {
        const searchTerm = searchInput.value
        .toLowerCase()
        .trim();
        searchableItems.forEach((item) => {
            const content = item.textContent.toLowerCase();
            if (content.includes(searchTerm)) {
                item.style.display = "";
            }
            else {
                item.style.display = "none";
            }
        });
    });
}

const protectedPages = [
    "index.html",
    "subjects.html",
    "notes.html",
    "saved.html",
    "activity.html",
    "progress.html",
    "profile2.html",
    "settings.html"
];
const currentPage = window.location.pathname
.split("/")
.pop()
.toLowerCase();

const isLoggedIn = localStorage.getItem("isLoggedIn") === "true";
if (
    protectedPages.includes(currentPage) && !isLoggedIn
) {
    window.location.href = "logreg.html"
}

const loginForm = document.querySelector("#login-form");
if (loginForm) {
    loginForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const email = 
        document.querySelector("#login-email")
        .value
        .trim();
        const password = 
        document.querySelector("#login-password")
        .value;
        if (!email || !password){
            alert("Please enter your email and password.");
            return;
        }
        
        localStorage.setItem("isLoggedIn", "true");
    });
}

const profileName = document.querySelector("#profile-name");
const profileEmail = document.querySelector("#profile-email");
const profilePicture = document.querySelector("#profile-picture");
if (profileName) {
    const fullname = localStorage.getItem("fullname");
    profileName.textContent = fullname || "Student";
}
if (profileEmail) {
    const email = localStorage.getItem("email");
    profileEmail.textContent = email || "no email available";
}
if (profilePicture) {
    const avatar = localStorage.getItem("avatar");
    if(avatar) {
        profilePicture.src ='assets/avatar/${avatar}';
    }
}

const signOut = document.querySelector("#sign-out");
if (signOut) {
    signOut.addEventListener("click", () => {
        const confirmed = confirm("Are you sure you want to sign out?");
        if (!confirmed) {
            return;
        }
        localStorage.removeItem("isLoggedIn");
        window.location.href = "logreg.html"
    });
}