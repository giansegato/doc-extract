document.addEventListener('DOMContentLoaded', function() {
  const extractButton = document.getElementById('extractButton');
  const loader = document.getElementById('loader');

  extractButton.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab.url.startsWith('https://docsend.com/view/')) {
      // Disable button and show loader
      extractButton.disabled = true;
      loader.style.display = 'block';

      chrome.tabs.sendMessage(tab.id, { action: "extract" });
    } else {
      console.log("This extension only works on DocSend view pages.");
      // Optionally, you can display an error message to the user here
    }
  });

  // Listen for messages from the background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "extractionComplete") {
      // Re-enable button and hide loader
      extractButton.disabled = false;
      loader.style.display = 'none';
    }
  });
});