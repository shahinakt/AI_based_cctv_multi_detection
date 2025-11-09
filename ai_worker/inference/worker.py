
import asyncio
import multiprocessing as mp
from ai_worker.utils.stream_reader import StreamReader
from ai_worker.inference.event_detector import EventDetector
from ai_worker.utils.evidence_saver import EvidenceSaver
import time
from typing import Dict, Any

class CameraWorker:
    def __init__(self, camera_id: str, stream_url: str):
        self.camera_id = camera_id
        self.stream_url = stream_url
        self.reader = StreamReader(stream_url)
        self.event_detector = EventDetector()
        self.evidence_saver = EvidenceSaver(camera_id)
        self.running = False

    async def process_frame(self, frame):
        events = self.event_detector.detect_events(frame)
        if events:
            for event in events:
                await self.evidence_saver.save_event(event, frame)
        return events

    async def run(self):
        self.running = True
        while self.running:
            frame = self.reader.read_frame()
            if frame is not None:
                await self.process_frame(frame)
            await asyncio.sleep(0.033)  # ~30 FPS

    def stop(self):
        self.running = False
        self.reader.release()

def start_worker(camera_id: str, stream_url: str):
    worker = CameraWorker(camera_id, stream_url)
    asyncio.run(worker.run())

def start_all_workers(cameras: Dict[str, str]):
    processes = []
    for cam_id, url in cameras.items():
        p = mp.Process(target=start_worker, args=(cam_id, url))
        p.start()
        processes.append(p)
    
    for p in processes:
        p.join()

if __name__ == '__main__':
    # Example: start worker for camera0
    start_worker('camera0', 'rtsp://admin:password@192.168.1.100/stream')