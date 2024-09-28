chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "processUrls") {
    processUrls(request.urls);
  }
});

function processUrls(urls) {
  console.log("Processed Image URLs:", urls);
  // Here you can add any additional processing you want to do with the URLs
  // For example, you could save them to storage, or send them to a server

  // When processing is complete, send a message to the popup
  chrome.runtime.sendMessage({ action: "extractionComplete" });
}