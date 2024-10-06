import modal
from fastapi import Body
from pydantic import BaseModel

app = modal.App("ocr_function")

image = (
    modal.Image.debian_slim()
    .apt_install("tesseract-ocr")
    .pip_install("Pillow", "pytesseract")
)


class ImageData(BaseModel):
    image_data: str


@app.function(image=image)
@modal.web_endpoint(method="POST")
async def extract_text(data: ImageData):
    import base64
    import pytesseract
    from PIL import Image
    import io

    try:
        # Remove the "data:image/jpeg;base64," prefix if present
        image_data = data.image_data.split(",")[-1]

        # Decode the base64 string
        image_bytes = base64.b64decode(image_data)

        # Open the image using PIL
        image = Image.open(io.BytesIO(image_bytes))

        # Perform OCR
        text = pytesseract.image_to_string(image)

        return {"text": text}
    except Exception as e:
        return {"error": str(e)}
