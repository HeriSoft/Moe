import cv2
import numpy as np
import insightface
from insightface.app import FaceAnalysis
from gfpgan import GFPGANer
import os
import torch
import warnings
import gradio as gr
import time
from datetime import datetime
import shutil
import traceback

# Suppress specific warnings
warnings.filterwarnings("ignore", category=UserWarning, module="gradio_client.documentation")
warnings.filterwarnings("ignore", category=FutureWarning)

# Paths (giữ nguyên như bạn cung cấp)
model_path = os.path.join("models", "inswapper_128.onnx")
gfpgan_path = os.path.join("gfpgan", "weights", "GFPGANv1.4.pth")
buffalo_l_path = os.path.join("models", "buffalo_l")
output_dir = "output"

# Initialize logging
log_messages = []

def log_message(message):
    """Append message to log with timestamp."""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_messages.append(f"[{timestamp}] {message}")
    print(f"[{timestamp}] {message}")  # Also print to console
    return "\n".join(log_messages)

def validate_paths():
    """Validate required file and directory paths."""
    log_message("Validating file paths...")
    for path in [model_path, gfpgan_path]:
        if not os.path.isfile(path):
            return False, f"Error: File not found at {path}"
    if not os.path.isdir(buffalo_l_path):
        return False, f"Error: buffalo_l directory not found at {buffalo_l_path}. Please download and extract buffalo_l.zip from https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_l.zip to {buffalo_l_path}"
    # Kiểm tra các file cần thiết trong buffalo_l
    required_files = ["1k3d68.onnx", "2d106det.onnx", "det_10g.onnx", "genderage.onnx", "w600k_r50.onnx"]
    if not all(os.path.exists(os.path.join(buffalo_l_path, f)) for f in required_files):
        return False, f"Error: buffalo_l directory at {buffalo_l_path} is incomplete. Please ensure it contains {', '.join(required_files)}"
    return True, "All paths validated successfully"

def initialize_face_analysis():
    """Initialize FaceAnalysis model."""
    providers = [
        ('CUDAExecutionProvider', {
            'device_id': 0,
            'gpu_mem_limit': 10 * 1024 * 1024 * 1024,
            'arena_extend_strategy': 'kNextPowerOfTwo',
            'cudnn_conv_algo_search': 'EXHAUSTIVE',
            'do_copy_in_default_stream': True,
        }),
        'CPUExecutionProvider',
    ]
    try:
        log_message("Initializing FaceAnalysis...")
        # Sử dụng root="models" để tìm đúng models\buffalo_l
        app = FaceAnalysis(name="buffalo_l", root=os.path.dirname(buffalo_l_path), providers=providers)
        app.prepare(ctx_id=0, det_size=(640, 640))
        log_message(f"PyTorch CUDA available: {torch.cuda.is_available()}")
        log_message("FaceAnalysis initialized successfully")
        return app, None
    except Exception as e:
        error_msg = f"Error initializing FaceAnalysis: {str(e)}\n{traceback.format_exc()}"
        return None, log_message(error_msg)

def load_and_detect_faces(app, source_img, target_img):
    """Load images and detect faces."""
    try:
        log_message("Loading and detecting faces...")
        if source_img is None or target_img is None:
            return None, None, "Error: Source or target image is None"
        
        source_img_np = cv2.cvtColor(np.array(source_img), cv2.COLOR_RGB2BGR)
        target_img_np = cv2.cvtColor(np.array(target_img), cv2.COLOR_RGB2BGR)
        
        source_faces = app.get(source_img_np)
        target_faces = app.get(target_img_np)
        
        log_message(f"Source image: {len(source_faces)} faces detected")
        log_message(f"Target image: {len(target_faces)} faces detected")
        
        if len(source_faces) == 0 or len(target_faces) == 0:
            return None, None, "Error: No faces detected in source or target image!"
        
        return source_faces, target_faces, None
    except Exception as e:
        error_msg = f"Error in load_and_detect_faces: {str(e)}\n{traceback.format_exc()}"
        return None, None, log_message(error_msg)

def select_source_face(source_faces):
    """Select the first source face."""
    try:
        log_message("Selecting source face...")
        source_face = source_faces[0]
        log_message("Using first detected source face")
        return source_face, None
    except Exception as e:
        error_msg = f"Error selecting source face: {str(e)}\n{traceback.format_exc()}"
        return None, log_message(error_msg)

def perform_face_swap(source_face, target_face, target_img):
    """Perform face swapping with edge smoothing."""
    try:
        log_message("Loading inswapper model...")
        swapper = insightface.model_zoo.get_model(model_path, providers=[
            ('CUDAExecutionProvider', {
                'device_id': 0,
                'gpu_mem_limit': 10 * 1024 * 1024 * 1024,
                'arena_extend_strategy': 'kNextPowerOfTwo',
                'cudnn_conv_algo_search': 'EXHAUSTIVE',
                'do_copy_in_default_stream': True,
            }),
            'CPUExecutionProvider',
        ])
        log_message("Inswapper model loaded successfully")
        
        target_img_np = cv2.cvtColor(np.array(target_img), cv2.COLOR_RGB2BGR)
        result = target_img_np.copy()
        result = swapper.get(result, target_face, source_face, paste_back=True)
        
        x, y, w, h = target_face.bbox.astype(int)
        mask = np.zeros(result.shape[:2], dtype=np.float32)
        cv2.rectangle(mask, (x, y), (x + w, y + h), 1.0, -1)
        mask = cv2.GaussianBlur(mask, (9, 9), 0)
        mask = np.stack([mask]*3, axis=-1)
        result = (result * mask + target_img_np * (1 - mask)).astype(np.uint8)
        
        log_message("Face swapping completed")
        return result, None
    except Exception as e:
        error_msg = f"Error during face swapping: {str(e)}\n{traceback.format_exc()}"
        return None, log_message(error_msg)

def enhance_with_gfpgan(result):
    """Enhance swapped image using GFPGAN without resizing."""
    try:
        log_message("Enhancing with GFPGAN...")
        enhancer = GFPGANer(
            model_path=gfpgan_path,
            upscale=1,
            arch='clean',
            channel_multiplier=2,
            device='cuda' if torch.cuda.is_available() else 'cpu',
            bg_upsampler=None
        )
        _, _, enhanced_result = enhancer.enhance(result, paste_back=True)
        output_path = os.path.join(output_dir, "output.jpg")
        cv2.imwrite(output_path, enhanced_result)
        log_message(f"Enhanced image saved to {output_path}")
        return output_path, None
    except Exception as e:
        error_msg = f"Error during GFPGAN enhancement: {str(e)}\n{traceback.format_exc()}"
        return None, log_message(error_msg)

def face_swap(source_img, target_img):
    """Main face swap function for Gradio."""
    global log_messages
    log_messages = []  # Reset logs
    start_time = time.time()
    
    try:
        log_message("Starting face swap process...")
        if os.path.exists(output_dir):
            shutil.rmtree(output_dir)
        os.makedirs(output_dir, exist_ok=True)
        
        valid, message = validate_paths()
        log_message(message)
        if not valid:
            return None, log_message("Path validation failed")
        
        app, error = initialize_face_analysis()
        if error:
            return None, log_message(error)
        
        source_faces, target_faces, error = load_and_detect_faces(app, source_img, target_img)
        if error:
            return None, log_message(error)
        
        source_face, error = select_source_face(source_faces)
        if error:
            return None, log_message(error)
        target_face = target_faces[0]
        log_message(f"Target face attributes: {target_face.__dict__}")
        
        result, error = perform_face_swap(source_face, target_face, target_img)
        if error:
            return None, log_message(error)
        
        output_path, error = enhance_with_gfpgan(result)
        if error:
            return None, log_message(error)
        
        log_message(f"Processing completed in {time.time() - start_time:.2f} seconds")
        return output_path, "\n".join(log_messages)
    except Exception as e:
        error_msg = f"Unexpected error in face_swap: {str(e)}\n{traceback.format_exc()}"
        return None, log_message(error_msg)

# Gradio Interface
with gr.Blocks() as demo:
    gr.Markdown("# Face Swap Application")
    gr.Markdown("Upload source and target images to swap faces. The first detected face in the source image will be used.")
    
    with gr.Row():
        with gr.Column():
            source_img = gr.Image(type="pil", label="Source Image")
            target_img = gr.Image(type="pil", label="Target Image")
            submit_btn = gr.Button("Swap Faces")
        with gr.Column():
            output = gr.Image(label="Final Output")
    
    logs = gr.Textbox(label="Logs", interactive=False, lines=10)
    
    submit_btn.click(
        fn=face_swap,
        inputs=[source_img, target_img],
        outputs=[output, logs],
        api_name="faceswap"  # Đảm bảo endpoint /face_swap
    )

if __name__ == "__main__":
    try:
        log_message("Launching Gradio interface...")
        demo.launch(
            share=True,
            debug=True,
            allowed_paths=["models", "gfpgan/weights", output_dir],
            server_name="0.0.0.0",
            server_port=7860
        )
    except Exception as e:
        log_message(f"Error launching Gradio: {str(e)}\n{traceback.format_exc()}")
        print(f"Error launching Gradio: {str(e)}\n{traceback.format_exc()}")