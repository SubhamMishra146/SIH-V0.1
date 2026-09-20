# SIH-V0.1

A Legal Metrology Compliance Checker that uses EasyOCR to extract text from product-label images and checks the extracted text against the compliance rules.

## Requirements

Install the following software on the computer where you want to run the project:

- **Python 3.9 or newer** (Python 3.10 or 3.11 is recommended)
- **pip** (Python package installer)
- **Git** (only required if cloning the repository)

The frontend is written in plain HTML, CSS, and JavaScript, so **Node.js or npm is not required**. The Flask backend serves the frontend automatically.

## Python modules

The complete list of required Python packages is maintained in [`backend/requirements.txt`](backend/requirements.txt):

- Flask 3.0.3
- Flask-Cors 4.0.0
- EasyOCR 1.7.2
- Pillow 10.4.0

Installing EasyOCR also installs its required dependencies, including PyTorch and torchvision. Tesseract OCR does **not** need to be installed because this project uses EasyOCR.

## Installation

Clone the repository and move into the project directory:

```bash
git clone https://github.com/SubhamMishra146/SIH-V0.1.git
cd SIH-V0.1
```

Create and activate a virtual environment (recommended):

### Windows PowerShell

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
```

### Windows Command Prompt

```bat
python -m venv .venv
.venv\Scripts\activate.bat
```

### macOS/Linux

```bash
python3 -m venv .venv
source .venv/bin/activate
```

Install all backend modules:

```bash
python -m pip install --upgrade pip
python -m pip install -r backend/requirements.txt
```

## Run the application

Start the backend from the `backend` directory:

```bash
cd backend
python app.py
```

Open the following address in a browser:

<http://localhost:5001>

On the first launch, EasyOCR may download its English model files. An internet connection is required for this initial download, and startup may take a few minutes. Subsequent launches should be faster.

## Notes

- Uploaded images are stored in `backend/uploads/`.
- Scan history is stored in `backend/data.json`.
- The application runs on port `5001` by default. Set the `PORT` environment variable to use another port.
- Keep the terminal running while using the application.
- To deactivate the virtual environment, run:

```bash
deactivate
```
