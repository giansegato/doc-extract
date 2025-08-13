# DocSend PDF Extractor

A Chrome extension that extracts images from DocSend documents and creates a downloadable PDF with OCR text extraction.

## What it does

1. **Extracts images** from DocSend documents page by page
2. **Downloads images sequentially** to avoid signature expiration (DocSend URLs expire in ~60 seconds)
3. **Creates a PDF** with all pages in correct order
4. **Performs OCR** to extract text from each page and embeds it invisibly in the PDF
5. **Downloads the final PDF** with searchable text

## Architecture

### Chrome Extension Components

- **`manifest.json`** - Extension configuration and permissions
- **`popup.html/js`** - User interface with "Extract PDF" button and progress logs
- **`content.js`** - Runs on DocSend pages, handles sequential page processing
- **`background.js`** - Service worker that downloads images, creates PDF, handles OCR
- **`jspdf.umd.min.js`** - PDF generation library

### OCR Service (Optional)

- **`modal/ocr_function.py`** - Modal.com serverless function for OCR text extraction
- **`modal/requirements.txt`** - Python dependencies for OCR service

## How it works

### Sequential Processing Strategy

The extension uses a sequential fetch-and-download strategy to handle DocSend's short-lived signed URLs:

1. **content.js** extracts document ID and total page count from the DocSend interface
2. For each page (1 to N):
   - Fetches JSON from `https://docsend.com/view/{documentId}/page_data/{pageNum}` 
   - Immediately downloads the image from `directImageUrl`
   - Converts to base64 and sends blob to background script
3. **background.js** collects all image blobs and creates PDF when complete

### Key Technical Details

- **Session context**: JSON fetching must happen in content script (not background) to maintain cookies/session
- **URL expiration**: Images downloaded immediately after JSON fetch to prevent signature expiration
- **Blob passing**: Images converted to base64 for message passing between content and background scripts
- **Sequential processing**: Avoids parallel requests that could cause later URLs to expire

## Installation

1. Clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the project directory
5. Navigate to any DocSend document
6. Click the extension icon and hit "Extract PDF"

## OCR Setup (Optional)

The extension includes OCR functionality via Modal.com:

1. Install Modal CLI: `pip install modal`
2. Deploy the OCR function: `modal deploy modal/ocr_function.py`
3. The extension will automatically use OCR if the service is available

If OCR service is unavailable, the extension still works but PDFs won't have searchable text.

## Files Structure

```
docsend-ext/
├── manifest.json           # Extension config
├── popup.html             # UI interface  
├── popup.js               # UI logic
├── content.js             # Page processing logic
├── background.js          # PDF creation and download
├── jspdf.umd.min.js       # PDF library
└── modal/                 # OCR service (optional)
    ├── ocr_function.py    # Modal.com OCR endpoint
    └── requirements.txt   # Python dependencies
```

## Troubleshooting

- **403 errors**: Make sure you're logged into DocSend in the same browser
- **Empty PDFs**: Check if DocSend document has proper `directImageUrl` in page_data responses
- **Missing OCR**: OCR service is optional - PDFs will still be created without searchable text
- **URL expiration errors**: The sequential processing should prevent this, but very slow networks might still hit the 60-second limit

## Development Notes

- The extension requires `activeTab`, `scripting`, and `downloads` permissions
- Host permissions needed for DocSend, AWS S3, CloudFront, and Modal.com domains
- Background script uses global state to collect image blobs from sequential processing
- Content script maintains DocSend session context for API access