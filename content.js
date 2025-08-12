chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "extract") {
    sendLogToPopup("Extracting images...");
    
    // Get total page count from toolbar
    const pageIndicator = document.querySelector(".toolbar-page-indicator #page-number");
    const totalPagesText = pageIndicator.parentElement.textContent.trim();
    // const totalPages = parseInt(totalPagesText.split(" / ")[1]);
    let totalPages = parseInt(totalPagesText.split(" / ")[1]);

    
    sendLogToPopup("Found " + totalPages + " pages");

    //totalPages = 1;
    //sendLogToPopup("DEBUG MODE -> " + totalPages + " pages");
    
    
    // Extract document ID from URL
    const documentId = window.location.pathname.split('/')[2];
    
    fetchPagesData(documentId, totalPages);
    sendLogToPopup("Fetching page data...");
  } else {
    console.log("Received unknown action:", request.action);
  }
});

async function fetchPagesData(documentId, totalPages) {
  const imageUrls = [];

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    try {
      const url = `https://docsend.com/view/${documentId}/page_data/${pageNum}`;
      const response = await fetch(url, { credentials: "include" });
      const data = await response.json();
      
      if (data.imageUrl) {
        imageUrls.push(data.imageUrl);
        sendLogToPopup(`Got image URL for page ${pageNum}`);
      }
    } catch (error) {
      console.error(`Error fetching page ${pageNum}:`, error);
      sendLogToPopup(`Failed to get page ${pageNum}`);
    }
  }

  // Send the imageUrls to the background script
  chrome.runtime.sendMessage({ action: "processUrls", urls: imageUrls });
  sendLogToPopup(`Collected ${imageUrls.length} image URLs`);
}

function sendLogToPopup(message, ...args) {
  const msg = message + " " + args.join(" ");
  console.log("Sending log to popup:", msg);
  chrome.runtime.sendMessage({ type: "log", content: msg });
}
