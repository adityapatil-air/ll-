// Handle Google Login
function handleGoogleLogin(response) {
    console.log("Google Login Response:", response);
    // You can send the response.credential to your backend for verification
    alert("Google login successful! Check the console for details.");
  }
  
  // Initialize Google OAuth
  function initializeGoogleLogin() {
    google.accounts.id.initialize({
      client_id: "YOUR_GOOGLE_CLIENT_ID", // Replace with your Google Client ID
      callback: handleGoogleLogin,
    });
  
    google.accounts.id.renderButton(
      document.getElementById("google-login"),
      {
        theme: "filled_blue",
        size: "large",
        text: "continue_with",
        shape: "rectangular",
      }
    );
  }
  
  // Initialize the Google Login button when the page loads
  window.onload = initializeGoogleLogin;
  
  // Handle form submission
  document.getElementById("login-form").addEventListener("submit", function (event) {
    event.preventDefault();
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;
    console.log("Username:", username, "Password:", password);
    alert("Form submitted! Check the console for details.");
  });