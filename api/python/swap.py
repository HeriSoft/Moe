# ==================================================================================================
# === HƯỚNG DẪN QUAN TRỌNG =======================================================================
# ==================================================================================================
#
#   File này chứa mã nguồn Python. Để nó hoạt động, bạn BẮT BUỘC phải đổi tên nó từ `swap.js` thành `swap.py`.
#
#   TẠI SAO?
#   - Vercel sử dụng phần mở rộng của file để quyết định môi trường (runtime) nào sẽ chạy mã nguồn.
#   - Một file `.js` sẽ được chạy bằng Node.js, vốn không thể hiểu được mã Python.
#   - Một file `.py` sẽ được chạy một cách chính xác bởi môi trường Python mà bạn đã cấu hình trong vercel.json.
#
#   Sau khi đổi tên file này thành `api/python/swap.py`, ứng dụng của bạn sẽ hoạt động như mong đợi.
#
# ==================================================================================================

from flask import Flask, request, jsonify, send_file
import os
import insightface
from insightface.app import FaceAnalysis
import cv2
import numpy as np
import onnxruntime
import requests
import gfpgan
import io
import base64

# Initialize Flask app
app = Flask(__name__)

# --- Configuration ---
# Set ONNX session options
onnxruntime.set_default_logger_severity(3)
providers = ['CPUExecutionProvider']

# --- Model Paths ---
# Vercel provides a writable /tmp directory for serverless functions.
MODEL_DIR = '/tmp/models'
os.makedirs(MODEL_DIR, exist_ok=True)

# Define model file paths
FACE_SWAPPER_PATH = os.path.join(MODEL_DIR, 'inswapper_128.onnx')
FACE_ANALYSER_PATH = os.path.join(MODEL_DIR, 'buffalo_l')
GFPGAN_PATH = os.path.join(MODEL_DIR, 'GFPGANv1.4.pth')

# --- Model URLs ---
# ==================================================================================================
# === HÀNH ĐỘNG BẮT BUỘC! ==========================================================================
# ==================================================================================================
#
#   Bạn BẮT BUỘC phải thay thế các URL giữ chỗ bên dưới bằng các URL công khai của riêng bạn,
#   nơi bạn đã lưu trữ các file model này. Bạn có thể sử dụng các dịch vụ như GitHub Releases,
#   Amazon S3, Google Cloud Storage, hoặc bất kỳ dịch vụ lưu trữ file công khai nào khác.
#
#   1. inswapper_128.onnx: Tìm model này trong repository InsightFace hoặc các nguồn model đã được huấn luyện.
#   2. buffalo_l models: Đây là một thư mục. Bạn cần lưu trữ các file `det_10g.onnx` và `w600k_r50.onnx`
#      bên trong một thư mục có tên `buffalo_l`.
#   3. GFPGANv1.4.pth: Tải file này từ các bản phát hành của repository GFPGAN chính thức.
#
#   URL cuối cùng của bạn phải trỏ trực tiếp đến file có thể tải xuống.
#
# ==================================================================================================
MODELS_URLS = {
    FACE_SWAPPER_PATH: "https://huggingface.co/ashley-ha/inswapper-onnx/resolve/main/inswapper_128.onnx",
    GFPGAN_PATH: "https://github.com/TencentARC/GFPGAN/releases/download/v1.3.0/GFPGANv1.4.pth",
    os.path.join(FACE_ANALYSER_PATH, "det_10g.onnx"): "https://huggingface.co/ashley-ha/inswapper-onnx/resolve/main/models/det_10g.onnx",
    os.path.join(FACE_ANALYSER_PATH, "w600k_r50.onnx"): "https://huggingface.co/ashley-ha/inswapper-onnx/resolve/main/models/w600k_r50.onnx"
}

# --- Global Model Variables ---
face_swapper = None
face_analyser = None
gfpgan_enhancer = None

# --- Model Loading ---
def download_file(url, path):
    """Downloads a file from a URL to a local path if it doesn't exist."""
    if not os.path.exists(path):
        print(f"Downloading {os.path.basename(path)} from {url}...")
        try:
            response = requests.get(url, stream=True)
            response.raise_for_status()
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
            print("Download complete.")
        except requests.exceptions.RequestException as e:
            print(f"Error downloading {url}: {e}")
            if os.path.exists(path):
                os.remove(path)
            raise

def load_models():
    """Loads all necessary models into memory, downloading them if necessary."""
    global face_swapper, face_analyser, gfpgan_enhancer
    try:
        for path, url in MODELS_URLS.items():
             if not os.path.exists(path):
                download_file(url, path)

        if face_analyser is None:
            print("Loading Face Analyser model...")
            face_analyser = FaceAnalysis(name=os.path.basename(FACE_ANALYSER_PATH), root=MODEL_DIR, providers=providers)
            face_analyser.prepare(ctx_id=0, det_size=(640, 640))
            print("Face Analyser model loaded.")

        if face_swapper is None:
            print("Loading Face Swapper model...")
            face_swapper = insightface.model_zoo.get_model(FACE_SWAPPER_PATH, providers=providers)
            print("Face Swapper model loaded.")

        if gfpgan_enhancer is None:
            print("Loading GFPGAN model...")
            gfpgan_enhancer = gfpgan.GFPGANer(
                model_path=GFPGAN_PATH, upscale=1, arch='clean',
                channel_multiplier=2, bg_upsampler=None
            )
            print("GFPGAN model loaded.")
    except Exception as e:
        print(f"An error occurred during model loading: {e}")
        face_swapper = face_analyser = gfpgan_enhancer = None
        raise e

# This decorator ensures models are loaded before the first real request.
@app.before_first_request
def initial_load():
    print("Performing initial model load...")
    load_models()

# --- Image Processing Functions ---
def decode_image_from_payload(payload_key, payload):
    if payload_key not in payload or 'data' not in payload[payload_key]:
        raise ValueError(f"Missing '{payload_key}' in request payload.")
    img_b64 = payload[payload_key]['data']
    img_bytes = base64.b64decode(img_b64)
    img_np = np.frombuffer(img_bytes, np.uint8)
    img = cv2.imdecode(img_np, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image.")
    return img

def get_face(img_data):
    faces = face_analyser.get(img_data)
    if not faces:
        raise ValueError("No face detected in the source image.")
    faces.sort(key=lambda x: (x.bbox[2] - x.bbox[0]) * (x.bbox[3] - x.bbox[1]), reverse=True)
    return faces[0]

# --- Flask Route ---
@app.route('/api/python/swap', methods=['POST'])
def swap_face_route():
    if not all([face_swapper, face_analyser, gfpgan_enhancer]):
        try:
            print("Models not loaded, attempting to load now...")
            load_models()
        except Exception as e:
            return jsonify({'error': 'ModelLoadingError', 'details': str(e)}), 500

    try:
        payload = request.get_json()
        if not payload:
            return jsonify({'error': 'InvalidPayload', 'details': 'Request body must be JSON.'}), 400

        target_img = decode_image_from_payload('targetImage', payload)
        source_img = decode_image_from_payload('sourceImage', payload)
        source_face = get_face(source_img)
        result_img = face_swapper.get(target_img, source_face)

        _, _, restored_img = gfpgan_enhancer.enhance(
            result_img, has_aligned=False, only_center_face=False, paste_back=True
        )

        is_success, buffer = cv2.imencode(".png", restored_img)
        if not is_success:
            raise RuntimeError("Failed to encode the result image to PNG.")
        
        # Return the final image data in the JSON response
        img_b64 = base64.b64encode(buffer).decode('utf-8')
        
        # The frontend expects a JSON object matching the Attachment type
        return jsonify({
            'data': img_b64,
            'mimeType': 'image/png',
            'fileName': 'swapped_result.png'
        })

    except ValueError as e:
        return jsonify({'error': 'ProcessingError', 'details': str(e)}), 400
    except Exception as e:
        print(f"UNEXPECTED ERROR in swap_face_route: {e}")
        return jsonify({'error': 'InternalServerError', 'details': 'An unexpected error occurred.'}), 500
