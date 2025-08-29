import os
import cv2
import numpy as np
import insightface
from insightface.app import FaceAnalysis
from flask import Flask, request, jsonify
import base64
from io import BytesIO
import traceback

app = Flask(__name__)

# --- Global variable for models ---
face_analyzer = None
face_swapper = None

def load_models():
    """Loads models into global variables to ensure they are loaded only once."""
    global face_analyzer, face_swapper
    if face_analyzer is None:
        print("Loading face analysis model...")
        face_analyzer = FaceAnalysis(name='buffalo_l', allowed_modules=['detection', 'recognition'])
        face_analyzer.prepare(ctx_id=0, det_size=(640, 640))
        print("Face analysis model loaded.")
    
    if face_swapper is None:
        print("Loading inswapper model...")
        face_swapper = insightface.model_zoo.get_model('inswapper_128.onnx', download=True, download_zip=True)
        print("Inswapper model loaded.")

# --- Helper Functions ---
def decode_image(base64_string):
    """Decodes a base64 string into an OpenCV image (numpy array)."""
    img_data = base64.b64decode(base64_string)
    img_np = np.frombuffer(img_data, np.uint8)
    img = cv2.imdecode(img_np, cv2.IMREAD_COLOR)
    return img

def encode_image(img_np, mime_type):
    """Encodes an OpenCV image (numpy array) into a base64 string."""
    ext = mime_type.split('/')[-1]
    if ext.lower() == 'jpeg':
        ext = 'jpg'
    _, buffer = cv2.imencode(f'.{ext}', img_np)
    return base64.b64encode(buffer).decode('utf-8')

# --- API Endpoint ---
@app.route('/api/python/swap', methods=['POST'])
def swap_face_endpoint():
    # Ensure models are loaded before handling the request
    load_models()

    if not request.json or 'targetImage' not in request.json or 'sourceImage' not in request.json:
        return jsonify({'error': 'Missing targetImage or sourceImage in request body'}), 400

    try:
        target_image_data = request.json['targetImage']
        source_image_data = request.json['sourceImage']

        # Decode images
        target_img = decode_image(target_image_data['data'])
        source_img = decode_image(source_image_data['data'])

        if target_img is None:
            return jsonify({'error': 'Could not decode target image. Check base64 data.'}), 400
        if source_img is None:
            return jsonify({'error': 'Could not decode source image. Check base64 data.'}), 400

        # Analyze faces
        target_faces = face_analyzer.get(target_img)
        source_faces = face_analyzer.get(source_img)

        if not target_faces:
            return jsonify({'error': 'No face found in the target image.'}), 400
        if not source_faces:
            return jsonify({'error': 'No face found in the source image.'}), 400
            
        # Perform swap
        # Using the first detected face from the source image
        # and swapping it onto the largest detected face in the target image for better results
        result_img = target_img.copy()
        
        # Sort target faces by area (width*height) to find the largest one
        target_faces = sorted(target_faces, key=lambda x: (x.bbox[2] - x.bbox[0]) * (x.bbox[3] - x.bbox[1]), reverse=True)
        
        # Swap onto the largest face
        result_img = face_swapper.get(result_img, target_faces[0], source_faces[0], paste_back=True)

        # Encode result
        result_base64 = encode_image(result_img, target_image_data['mimeType'])
        
        # Return response in the same format as Attachment
        return jsonify({
            'data': result_base64,
            'mimeType': target_image_data['mimeType'],
            'fileName': f"swapped_{target_image_data['fileName']}"
        })

    except Exception as e:
        print(f"Error during face swap: {str(e)}")
        print(traceback.format_exc())
        return jsonify({'error': 'An internal error occurred during the face swap process.', 'details': str(e)}), 500

# This block is executed when the script is run directly.
# Gunicorn will call the 'app' object directly, so this part won't run on Render.
if __name__ == '__main__':
    # Load models on startup for local dev
    load_models()
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 3001)))