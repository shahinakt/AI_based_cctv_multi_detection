"""
Stream Handler API - NEW FILE
Connects backend to AI Worker stream processing
"""
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
import asyncio
import base64
import json
import cv2
import numpy as np
from typing import AsyncGenerator
import tempfile

router = APIRouter()

# AI Worker WebSocket connection (singleton)
ai_worker_ws = None
AI_WORKER_URL = "ws://localhost:8765"


async def get_ai_worker_connection():
    """Get or create AI Worker WebSocket connection"""
    global ai_worker_ws
    
    if ai_worker_ws is None or ai_worker_ws.closed:
        import websockets
        try:
            ai_worker_ws = await websockets.connect(AI_WORKER_URL)
            print(f"✅ Connected to AI Worker at {AI_WORKER_URL}")
        except Exception as e:
            print(f"❌ Failed to connect to AI Worker: {e}")
            raise HTTPException(
                status_code=503,
                detail="AI Worker unavailable. Please start ai_worker service."
            )
    
    return ai_worker_ws


@router.post("/process-frame")
async def process_frame(
    image_base64: str,
    stream_id: str = "api_upload"
):
    """
    Process a single frame through AI Worker
    
    Args:
        image_base64: Base64-encoded image
        stream_id: Unique stream identifier
    
    Returns:
        Detection results with incidents
    """
    try:
        ws = await get_ai_worker_connection()
        
        # Send frame to AI Worker
        request = {
            'type': 'frame',
            'stream_id': stream_id,
            'data': {
                'image': image_base64,
                'timestamp': asyncio.get_event_loop().time()
            }
        }
        
        await ws.send(json.dumps(request))
        
        # Receive results
        response = await asyncio.wait_for(ws.recv(), timeout=10.0)
        result = json.loads(response)
        
        return result
        
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="AI Worker timeout")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upload-video")
async def upload_video(file: UploadFile = File(...)):
    """
    Upload video file for batch processing
    
    Args:
        file: Video file (MP4, AVI, etc.)
    
    Returns:
        Processing results for all frames
    """
    # Save uploaded file
    with tempfile.NamedTemporaryFile(delete=False, suffix='.mp4') as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name
    
    results = []
    
    try:
        # Open video
        cap = cv2.VideoCapture(tmp_path)
        frame_count = 0
        
        ws = await get_ai_worker_connection()
        
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            
            # Process every 5th frame
            if frame_count % 5 != 0:
                frame_count += 1
                continue
            
            # Encode frame
            _, buffer = cv2.imencode('.jpg', frame)
            img_base64 = base64.b64encode(buffer).decode('utf-8')
            
            # Send to AI Worker
            request = {
                'type': 'frame',
                'stream_id': f'upload_{file.filename}',
                'data': {
                    'image': img_base64,
                    'timestamp': frame_count / cap.get(cv2.CAP_PROP_FPS)
                }
            }
            
            await ws.send(json.dumps(request))
            response = await asyncio.wait_for(ws.recv(), timeout=10.0)
            result = json.loads(response)
            
            results.append(result)
            frame_count += 1
        
        cap.release()
        
        # Summary
        total_incidents = sum(len(r.get('incidents', [])) for r in results)
        total_detections = sum(len(r.get('detections', [])) for r in results)
        
        return {
            'status': 'success',
            'frames_processed': len(results),
            'total_detections': total_detections,
            'total_incidents': total_incidents,
            'results': results
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        import os
        os.unlink(tmp_path)


@router.get("/stream-status")
async def stream_status():
    """Check AI Worker connection status"""
    try:
        ws = await get_ai_worker_connection()
        
        # Send ping
        await ws.send(json.dumps({'type': 'ping'}))
        response = await asyncio.wait_for(ws.recv(), timeout=5.0)
        result = json.loads(response)
        
        if result.get('type') == 'pong':
            return {
                'status': 'connected',
                'ai_worker_url': AI_WORKER_URL,
                'latency_ms': 'OK'
            }
        else:
            return {
                'status': 'error',
                'message': 'Unexpected response from AI Worker'
            }
            
    except Exception as e:
        return {
            'status': 'disconnected',
            'error': str(e)
        }