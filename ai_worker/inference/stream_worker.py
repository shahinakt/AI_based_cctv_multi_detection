"""
WebSocket Stream Worker
Handles dynamic input streams (camera, files, etc.) from frontend/backend
"""
import asyncio
import websockets
import json
import logging
import cv2
import numpy as np
import base64
from typing import Dict, Any
import torch

from ai_worker.models.yolo_detector import YOLODetector
from ai_worker.inference.incident_detector import IncidentDetector

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class StreamProcessor:
    """Process incoming streams in real-time"""
    
    def __init__(self, device: str = 'cuda:0'):
        self.device = device
        self.detector = None
        self.incident_detector = None
        self.active_streams = {}
        self._initialize_models()
    
    def _initialize_models(self):
        """Initialize AI models"""
        try:
            logger.info("Loading YOLO for stream processing...")
            self.detector = YOLODetector('yolov8n.pt', device=self.device)
            logger.info("✅ Stream processor ready")
        except Exception as e:
            logger.error(f"❌ Failed to load models: {e}")
            # Fallback to CPU
            self.device = 'cpu'
            self.detector = YOLODetector('yolov8n.pt', device='cpu')
    
    async def process_frame(self, frame_data: dict, stream_id: str) -> dict:
        """
        Process a single frame from stream
        
        Args:
            frame_data: {'image': base64_string, 'timestamp': float}
            stream_id: Unique stream identifier
            
        Returns:
            Detection results with incidents
        """
        try:
            # Decode frame
            img_bytes = base64.b64decode(frame_data['image'])
            nparr = np.frombuffer(img_bytes, np.uint8)
            frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if frame is None:
                return {'error': 'Failed to decode frame'}
            
            # Run detection
            detections = self.detector.predict(frame, conf=0.5)
            
            # Initialize incident detector for this stream if needed
            if stream_id not in self.active_streams:
                self.active_streams[stream_id] = {
                    'incident_detector': IncidentDetector(stream_id),
                    'frame_count': 0
                }
            
            stream_info = self.active_streams[stream_id]
            stream_info['frame_count'] += 1
            
            # Analyze for incidents
            incidents = stream_info['incident_detector'].analyze_frame(
                detections, frame, stream_info['frame_count']
            )
            
            # Prepare response
            response = {
                'stream_id': stream_id,
                'timestamp': frame_data.get('timestamp'),
                'frame_number': stream_info['frame_count'],
                'detections': [
                    {
                        'class': d['class_name'],
                        'confidence': float(d['conf']),
                        'bbox': [float(x) for x in d['bbox']]
                    }
                    for d in detections
                ],
                'incidents': [
                    {
                        'type': inc['type'],
                        'severity': inc['severity'],
                        'confidence': float(inc['confidence']),
                        'description': inc['description']
                    }
                    for inc in incidents
                ],
                'stats': {
                    'num_detections': len(detections),
                    'num_incidents': len(incidents),
                    'device': self.device
                }
            }
            
            return response
            
        except Exception as e:
            logger.error(f"Frame processing error: {e}")
            return {'error': str(e)}
    
    def cleanup_stream(self, stream_id: str):
        """Remove stream from active tracking"""
        if stream_id in self.active_streams:
            del self.active_streams[stream_id]
            logger.info(f"Stream {stream_id} cleaned up")


# Global processor instance
processor = StreamProcessor()


async def handle_client(websocket, path):
    """Handle incoming WebSocket connections"""
    client_id = f"{websocket.remote_address[0]}:{websocket.remote_address[1]}"
    logger.info(f"📡 New connection: {client_id}")
    
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                
                if data.get('type') == 'frame':
                    # Process frame
                    stream_id = data.get('stream_id', client_id)
                    frame_data = data.get('data')
                    
                    result = await processor.process_frame(frame_data, stream_id)
                    
                    # Send back results
                    await websocket.send(json.dumps(result))
                
                elif data.get('type') == 'ping':
                    # Health check
                    await websocket.send(json.dumps({'type': 'pong'}))
                
                elif data.get('type') == 'close':
                    # Client closing stream
                    stream_id = data.get('stream_id', client_id)
                    processor.cleanup_stream(stream_id)
                    break
                    
            except json.JSONDecodeError:
                await websocket.send(json.dumps({'error': 'Invalid JSON'}))
            except Exception as e:
                logger.error(f"Message processing error: {e}")
                await websocket.send(json.dumps({'error': str(e)}))
    
    except websockets.exceptions.ConnectionClosed:
        logger.info(f"Connection closed: {client_id}")
    finally:
        processor.cleanup_stream(client_id)


def start_stream_server(host: str = '0.0.0.0', port: int = 8765):
    """Start WebSocket server for stream processing"""
    logger.info(f"🌊 Starting Stream Server on {host}:{port}")
    
    start_server = websockets.serve(handle_client, host, port)
    
    asyncio.get_event_loop().run_until_complete(start_server)
    logger.info("✅ Stream server running")
    asyncio.get_event_loop().run_forever()


if __name__ == '__main__':
    start_stream_server()