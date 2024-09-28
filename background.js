importScripts("jspdf.umd.min.js");

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "processUrls") {
    console.log("Received processUrls request with URLs:", request.urls);
    processUrls(request.urls);
  }
});

async function processUrls(urls) {
  console.log("Starting to process URLs:", urls);
  // temporarily only run this on the first 2 urls
  urls = urls.slice(0, 2);
  try {
    console.log("Downloading images...");
    const imageBlobs = await Promise.all(urls.map(downloadImage));
    console.log("All images downloaded. Number of blobs:", imageBlobs.length);

    console.log("Creating PDF from images...");
    const pdfBlob = await createPDFFromImages(imageBlobs);
    console.log("PDF created successfully. Blob size:", pdfBlob.size);

    console.log("Initiating PDF download...");
    await downloadPDF(pdfBlob);
    console.log("PDF download initiated.");

    // Send processingComplete message to popup
    chrome.runtime.sendMessage({ action: "processingComplete" });
    console.log("Sent processingComplete message.");
  } catch (error) {
    console.error("Error processing URLs:", error);
    // Send processingError message to popup
    chrome.runtime.sendMessage({
      action: "processingError",
      error: error.message,
    });
    console.log("Sent processingError message.");
  }
}

async function downloadImage(url) {
  console.log("Downloading image from URL:", url);
  const headers = {
    Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    Connection: "keep-alive",
    DNT: "1",
    "Sec-Fetch-Dest": "image",
    "Sec-Fetch-Mode": "no-cors",
    "Sec-Fetch-Site": "cross-site",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  };

  try {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const blob = await response.blob();
    console.log("Image downloaded successfully. Blob size:", blob.size);
    return blob;
  } catch (error) {
    console.error("Error downloading image:", error);
    throw error;
  }
}

async function createPDFFromImages(imageBlobs) {
  console.log("Starting PDF creation with", imageBlobs.length, "images");

  // Get dimensions of the first image to set PDF size
  const firstImageDimensions = await getImageDimensions(imageBlobs[0]);
  const pdfWidth = firstImageDimensions.width;
  const pdfHeight = firstImageDimensions.height;

  const pdf = new jspdf.jsPDF({
    orientation: pdfWidth > pdfHeight ? "landscape" : "portrait",
    unit: "px",
    format: [pdfWidth, pdfHeight],
  });

  for (let i = 0; i < imageBlobs.length; i++) {
    console.log(`Processing image ${i + 1} of ${imageBlobs.length}`);
    try {
      let imgData = await blobToBase64(imageBlobs[i]);
      console.log(`Image ${i + 1} converted to base64`);

      // Ensure the correct MIME type
      imgData = imgData.replace(
        "data:application/octet-stream;base64,",
        "data:image/jpeg;base64,"
      );

      if (i > 0) {
        console.log(`Adding new page for image ${i + 1}`);
        pdf.addPage();
      }

      // Get image dimensions using createImageBitmap
      const dimensions = await getImageDimensions(imageBlobs[i]);
      console.log(`Image ${i + 1} dimensions:`, dimensions);

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

      pdf.addImage(imgData, "JPEG", x, y, renderWidth, renderHeight);
      console.log(`Image ${i + 1} added to PDF`);
    } catch (error) {
      console.error(`Error adding image ${i + 1} to PDF:`, error);
    }
  }

  console.log("PDF creation complete");
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
      console.log(
        "Blob converted to base64. Result length:",
        base64data.length
      );
      console.log("Base64 data starts with:", base64data.substring(0, 50));
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
    console.log("Image header (hex):", hexHeader);

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
      console.log("PDF converted to base64 for download");
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
            console.log("Download initiated with ID:", downloadId);
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
