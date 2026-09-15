const loginForm = document.getElementById("loginForm");
const loginMessage = document.getElementById("loginMessage");
const registerBtn = document.getElementById("registerBtn");


// ============================================
// LOGIN
// ============================================

if (loginForm) {

    loginForm.addEventListener("submit", async (event) => {

        event.preventDefault();

        const email = document.getElementById("email").value.trim();
        const password = document.getElementById("password").value;

        loginMessage.textContent = "Logging in...";

        const { data, error } =
            await supabaseClient.auth.signInWithPassword({
                email: email,
                password: password
            });

        if (error) {

            loginMessage.textContent =
                "Login failed: " + error.message;

            return;
        }

        loginMessage.textContent = "Login successful!";

        window.location.href = "dashboard.html";
    });
}


// ============================================
// REGISTER
// ============================================

if (registerBtn) {

    registerBtn.addEventListener("click", async (event) => {

        event.preventDefault();

        const email = prompt("Enter your email:");
        const password = prompt("Create a password:");

        if (!email || !password) {
            return;
        }

        const { data, error } =
            await supabaseClient.auth.signUp({
                email: email,
                password: password
            });

        if (error) {

            alert(
                "Registration failed:\n" +
                error.message
            );

            return;
        }

        alert(
            "Account created successfully!\n\n" +
            "Check your email if email confirmation is enabled."
        );
    });
}