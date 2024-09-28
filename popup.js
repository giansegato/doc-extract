document.addEventListener('DOMContentLoaded', function() {
  const extractButton = document.getElementById('extractButton');
  const loader = document.getElementById('loader');
  const errorMessage = document.getElementById('errorMessage');

  extractButton.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab.url.startsWith('https://docsend.com/view/')) {
      // Disable button and show loader
      extractButton.disabled = true;
      loader.style.display = 'block';
      errorMessage.style.display = 'none';

      chrome.tabs.sendMessage(tab.id, { action: "extract" });
    } else {
      console.log("This extension only works on DocSend view pages.");
      errorMessage.textContent = "This extension only works on DocSend view pages.";
      errorMessage.style.display = 'block';
    }
  });

  // Listen for messages from the background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "processingComplete") {
      // Re-enable button and hide loader
      extractButton.disabled = false;
      loader.style.display = 'none';
      // Optionally, show a success message
      errorMessage.textContent = "PDF downloaded successfully!";
      errorMessage.style.display = 'block';
    } else if (request.action === "processingError") {
      // Re-enable button, hide loader, and show error message
      extractButton.disabled = false;
      loader.style.display = 'none';
      errorMessage.textContent = `Error: ${request.error}`;
      errorMessage.style.display = 'block';
    }
  });
});