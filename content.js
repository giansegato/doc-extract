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
    
    // Process pages sequentially to avoid URL expiration
    processPageSequentially(documentId, totalPages);
  } else {
    console.log("Received unknown action:", request.action);
  }
});

async function processPageSequentially(documentId, totalPages) {
  sendLogToPopup(`Starting sequential processing of ${totalPages} pages`);
  
  // Initialize processing in background
  chrome.runtime.sendMessage({
    action: "initializePDF",
    totalPages: totalPages
  });
  
  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    try {
      sendLogToPopup(`Processing page ${pageNum} of ${totalPages}`);
      
      // Fetch page data JSON
      const pageDataUrl = `https://docsend.com/view/${documentId}/page_data/${pageNum}`;
      const response = await fetch(pageDataUrl, { credentials: "include" });
      const data = await response.json();
      
      if (data.directImageUrl) {
        sendLogToPopup(`Downloading image for page ${pageNum}`);
        
        // Download the image immediately to avoid URL expiration
        const blob = await downloadImageInContent(data.directImageUrl);
        
        // Send blob to background script
        const reader = new FileReader();
        const base64Promise = new Promise((resolve, reject) => {
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        
        const base64Data = await base64Promise;
        
        chrome.runtime.sendMessage({
          action: "processImageBlob",
          base64Data: base64Data,
          pageIndex: pageNum - 1,
          pageNum: pageNum
        });
        
        sendLogToPopup(`Successfully sent page ${pageNum} to background`);
      } else {
        sendLogToPopup(`No directImageUrl found for page ${pageNum}`);
        // Send error message to background
        chrome.runtime.sendMessage({
          action: "pageError",
          pageNum: pageNum,
          error: "No directImageUrl found"
        });
      }
    } catch (error) {
      console.error(`Error processing page ${pageNum}:`, error);
      sendLogToPopup(`Failed to process page ${pageNum}:`, error.message);
      
      // Send error message to background
      chrome.runtime.sendMessage({
        action: "pageError",
        pageNum: pageNum,
        error: error.message
      });
    }
  }
  
  sendLogToPopup("All pages processed, signaling completion");
  
  // Signal completion to background
  chrome.runtime.sendMessage({ action: "allPagesProcessed" });
}

async function downloadImageInContent(url) {
  sendLogToPopup("Downloading image from URL:", url);
  const headers = {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "accept-language": "en-US,en;q=0.9",
    "dnt": "1",
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36"
  };

  try {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const blob = await response.blob();
    sendLogToPopup("Image downloaded successfully. Blob size:", blob.size);
    return blob;
  } catch (error) {
    console.error("Error downloading image:", error);
    throw error;
  }
}

function sendLogToPopup(message, ...args) {
  const msg = message + " " + args.join(" ");
  console.log("Sending log to popup:", msg);
  chrome.runtime.sendMessage({ type: "log", content: msg });
}
