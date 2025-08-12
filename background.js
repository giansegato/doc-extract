importScripts("jspdf.umd.min.js");

// Global state for collecting image blobs
let pdfState = {
  totalPages: 0,
  receivedPages: 0,
  imageBlobs: [],
  isProcessing: false
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "processUrls") {
    sendLogToPopup("Received processUrls request with URLs:", request.urls);
    (async () => {
      try {
        await processUrls(request.urls);
      } catch (error) {
        sendLogToPopup("Error in processUrls:", error);
        chrome.runtime.sendMessage({
          action: "processingError",
          error: error.message,
        });
      }
    })();
  } else if (request.action === "initializePDF") {
    sendLogToPopup("Initializing PDF processing for", request.totalPages, "pages");
    pdfState = {
      totalPages: request.totalPages,
      receivedPages: 0,
      imageBlobs: new Array(request.totalPages),
      isProcessing: true
    };
  } else if (request.action === "processImageBlob") {
    sendLogToPopup(`Received blob for page ${request.pageNum} (index ${request.pageIndex})`);
    
    // Convert base64 back to blob
    const base64Data = request.base64Data.split(',')[1];
    const mimeType = request.base64Data.split(',')[0].split(':')[1].split(';')[0];
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: mimeType });
    
    // Store in correct position
    pdfState.imageBlobs[request.pageIndex] = { blob, index: request.pageIndex };
    pdfState.receivedPages++;
    
    sendLogToPopup(`Stored page ${request.pageNum}, total received: ${pdfState.receivedPages}/${pdfState.totalPages}`);
  } else if (request.action === "pageError") {
    sendLogToPopup(`Error on page ${request.pageNum}: ${request.error}`);
    pdfState.receivedPages++;
    // Leave the slot empty for this page
  } else if (request.action === "allPagesProcessed") {
    sendLogToPopup("All pages processed, creating PDF...");
    (async () => {
      try {
        await createPDFFromCollectedBlobs();
      } catch (error) {
        sendLogToPopup("Error creating PDF:", error);
        chrome.runtime.sendMessage({
          action: "processingError",
          error: error.message,
        });
      }
    })();
  }
  return true; // Indicates that the response is sent asynchronously
});

async function createPDFFromCollectedBlobs() {
  try {
    // Filter out any empty slots (failed pages)
    const validImageData = pdfState.imageBlobs.filter(item => item && item.blob);
    
    sendLogToPopup(
      "Creating PDF from collected blobs. Valid images:",
      validImageData.length, "out of", pdfState.totalPages
    );

    if (validImageData.length === 0) {
      throw new Error("No valid images to create PDF");
    }

    const pdfBlob = await createPDFFromImages(validImageData);
    sendLogToPopup("PDF created successfully. Blob size:", pdfBlob.size);

    sendLogToPopup("Initiating PDF download...");
    await downloadPDF(pdfBlob);
    sendLogToPopup("PDF download initiated.");

    // Send processingComplete message to popup
    chrome.runtime.sendMessage({ action: "processingComplete" });
    sendLogToPopup("Sent processingComplete message.");
    
    // Reset state
    pdfState = { totalPages: 0, receivedPages: 0, imageBlobs: [], isProcessing: false };
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.stack);
    }
    sendLogToPopup("Error creating PDF from collected blobs:", error);
    chrome.runtime.sendMessage({
      action: "processingError",
      error: error.message,
    });
    sendLogToPopup("Sent processingError message.");
    
    // Reset state on error
    pdfState = { totalPages: 0, receivedPages: 0, imageBlobs: [], isProcessing: false };
  }
}

async function processUrls(urls) {
  sendLogToPopup("Starting to process URLs.");

  try {
    const imageData = await Promise.all(
      urls.map(async (url, index) => {
        const blob = await downloadImage(url);
        return { blob, index };
      })
    );
    sendLogToPopup(
      "All images downloaded. Number of images:",
      imageData.length
    );

    sendLogToPopup("Creating PDF from images...");
    const pdfBlob = await createPDFFromImages(imageData);
    sendLogToPopup("PDF created successfully. Blob size:", pdfBlob.size);

    sendLogToPopup("Initiating PDF download...");
    await downloadPDF(pdfBlob);
    sendLogToPopup("PDF download initiated.");

    // Send processingComplete message to popup
    chrome.runtime.sendMessage({ action: "processingComplete" });
    sendLogToPopup("Sent processingComplete message.");
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.stack);
    }
    sendLogToPopup("Error processing URLs:", error);
    // Send processingError message to popup
    chrome.runtime.sendMessage({
      action: "processingError",
      error: error.message,
    });
    sendLogToPopup("Sent processingError message.");
  }
}

async function downloadImage(url) {
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

async function extractTextFromImage(imageData) {
  try {
    const response = await fetch(
      "https://giansegato--ocr-function-extract-text.modal.run",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ image_data: imageData }),
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    if (result.error) {
      throw new Error(`OCR Error: ${result.error}`);
    }
    return result.text;
  } catch (error) {
    console.error("Error calling Modal function:", error);
    throw error;
  }
}

async function createPDFFromImages(imageData) {
  sendLogToPopup("Starting PDF creation with", imageData.length, "images");

  // Sort the imageData array based on the original index
  imageData.sort((a, b) => a.index - b.index);

  // Get dimensions of the first image to set PDF size
  const firstImageDimensions = await getImageDimensions(imageData[0].blob);
  const pdfWidth = firstImageDimensions.width;
  const pdfHeight = firstImageDimensions.height;

  const pdf = new jspdf.jsPDF({
    orientation: pdfWidth > pdfHeight ? "landscape" : "portrait",
    unit: "px",
    format: [pdfWidth, pdfHeight],
  });

  for (let i = 0; i < imageData.length; i++) {
    sendLogToPopup(`Processing image ${i + 1} of ${imageData.length}`);
    // try {
    let imgData = await blobToBase64(imageData[i].blob);
    sendLogToPopup(`Image ${i + 1} converted to base64`);

    // Fix MIME type based on actual image format
    const detectedType = await getImageType(imageData[i].blob);
    const correctMimeType = detectedType === "PNG" ? "image/png" : "image/jpeg";
    imgData = imgData.replace(/data:[^;]+;base64,/, `data:${correctMimeType};base64,`);

    if (i > 0) {
      sendLogToPopup(`Adding new page for image ${i + 1}`);
      pdf.addPage();
    }

    // Get image dimensions using createImageBitmap
    const dimensions = await getImageDimensions(imageData[i].blob);
    sendLogToPopup(`Image ${i + 1} dimensions:`, dimensions);

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const imgAspectRatio = dimensions.width / dimensions.height;
    const pdfAspectRatio = pdfWidth / pdfHeight;

    let renderWidth, renderHeight;
    if (imgAspectRatio > pdfAspectRatio) {
      renderWidth = pdfWidth;
      renderHeight = pdfWidth / imgAspectRatio;
    } else {
      renderHeight = pdfHeight;
      renderWidth = pdfHeight * imgAspectRatio;
    }

    const x = (pdfWidth - renderWidth) / 2;
    const y = (pdfHeight - renderHeight) / 2;

    // Detect actual image type instead of assuming JPEG
    const imageType = await getImageType(imageData[i].blob);
    const format = imageType || "JPEG"; // fallback to JPEG if detection fails
    sendLogToPopup(`Image ${i + 1} format detected: ${format}`);

    pdf.addImage(imgData, format, x, y, renderWidth, renderHeight);
    sendLogToPopup(`Image ${i + 1} added to PDF`);

    try {
      const text = await extractTextFromImage(imgData);
      sendLogToPopup(`OCR text extracted for image ${i + 1}`);

      pdf.setFontSize(1);
      pdf.setTextColor(0, 0, 0);
      pdf.text(text, 0, 10, {
        maxWidth: pdfWidth,
        align: "left",
        opacity: 1,
      });

      sendLogToPopup(`OCR text embedded in PDF for image ${i + 1}`);
    } catch (error) {
      sendLogToPopup(`OCR failed for image ${i + 1}: Modal service not available`);
      chrome.runtime.sendMessage({
        action: "modalError",
        message: "Modal OCR service not available - PDF will be created without text extraction"
      });
      console.error(`Error adding image ${i + 1} to PDF:`, error);
    }
  }

  sendLogToPopup("PDF creation complete");
  return pdf.output("blob");
}

// Updated function to get image dimensions using createImageBitmap
async function getImageDimensions(blob) {
  try {
    const bitmap = await createImageBitmap(blob);
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close(); // Release the bitmap
    return dimensions;
  } catch (error) {
    console.error("Error getting image dimensions:", error);
    throw error;
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64data = reader.result;
      sendLogToPopup(
        "Blob converted to base64. Result length:",
        base64data.length
      );
      sendLogToPopup("Base64 data starts with:", base64data.substring(0, 50));
      resolve(base64data);
    };
    reader.onerror = (error) => {
      console.error("Error converting blob to base64:", error);
      reject(error);
    };
    reader.readAsDataURL(blob);
  });
}

async function getImageType(blob) {
  try {
    const arr = new Uint8Array(await blob.arrayBuffer());
    const header = arr.subarray(0, 4);
    const hexHeader = Array.from(header)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    sendLogToPopup("Image header (hex):", hexHeader);

    switch (hexHeader) {
      case "89504e47":
        return "PNG";
      case "ffd8ffe0":
      case "ffd8ffe1":
      case "ffd8ffe2":
        return "JPEG";
      case "47494638":
        return "GIF";
      default:
        return null; // Unknown type
    }
  } catch (error) {
    console.error("Error determining image type:", error);
    return null;
  }
}

async function downloadPDF(pdfBlob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = function () {
      const base64data = reader.result;
      sendLogToPopup("PDF converted to base64 for download");
      chrome.downloads.download(
        {
          url: base64data,
          filename: "merged_images.pdf",
          saveAs: true,
        },
        (downloadId) => {
          if (chrome.runtime.lastError) {
            console.error(
              "Error initiating download:",
              chrome.runtime.lastError
            );
            reject(chrome.runtime.lastError);
          } else {
            sendLogToPopup("Download initiated with ID:", downloadId);
            resolve();
          }
        }
      );
    };
    reader.onerror = (error) => {
      console.error("Error reading PDF blob:", error);
      reject(error);
    };
    reader.readAsDataURL(pdfBlob);
  });
}

function sendLogToPopup(message, ...args) {
  const msg = message + " " + args.join(" ");
  console.log("Sending log to popup:", msg);
  chrome.runtime.sendMessage({ type: "log", content: msg });
}
