
import psycopg2
import logging
import os
from typing import Dict, List, Optional
import torch

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ConfigManager:
    """
    Dynamic configuration manager that loads camera settings from database
    Replaces static config.py for production deployments
    """
    
    def __init__(self, db_url: Optional[str] = None):
        """
        Initialize config manager
        
        Args:
            db_url: PostgreSQL connection string
                    Format: postgresql://user:password@host:port/database
        """
        self.db_url = db_url or os.getenv(
            'DATABASE_URL',
            'postgresql://postgres:password@localhost:5432/cctv_db'
        )
        
        # Device detection
        self.device_gpu = 'cuda:0' if torch.cuda.is_available() else 'cpu'
        self.device_cpu = 'cpu'
        
        # Connection
        self.conn = None
        
        logger.info("ConfigManager initialized")
        if torch.cuda.is_available():
            logger.info(f"✅ GPU: {torch.cuda.get_device_name(0)}")
        else:
            logger.warning("⚠️ No GPU available, all cameras will use CPU")
    
    def connect_db(self):
        """Connect to PostgreSQL database"""
        try:
            self.conn = psycopg2.connect(self.db_url)
            logger.info("✅ Database connected")
            return True
        except Exception as e:
            logger.error(f"❌ Database connection failed: {e}")
            return False
    
    def disconnect_db(self):
        """Disconnect from database"""
        if self.conn:
            self.conn.close()
            logger.info("Database connection closed")
    
    def get_active_cameras(self) -> Dict[str, Dict]:
        """
        Fetch all enabled cameras from database
        
        Returns:
            Dictionary of camera configs in same format as static config.py
        """
        if not self.conn or self.conn.closed:
            if not self.connect_db():
                logger.error("Cannot fetch cameras: No database connection")
                return {}
        
        try:
            cursor = self.conn.cursor()
            
            # Fetch cameras with their settings
            query = """
                SELECT 
                    c.camera_id,
                    c.name,
                    c.description,
                    c.stream_url,
                    c.device,
                    c.resolution_width,
                    c.resolution_height,
                    c.process_every_n_frames,
                    c.priority,
                    cs.enable_incidents,
                    cs.enable_pose,
                    cs.confidence_threshold
                FROM cameras c
                LEFT JOIN camera_settings cs ON c.camera_id = cs.camera_id
                WHERE c.enabled = true
                ORDER BY 
                    CASE c.priority 
                        WHEN 'high' THEN 1 
                        WHEN 'medium' THEN 2 
                        WHEN 'low' THEN 3 
                        ELSE 4 
                    END
            """
            
            cursor.execute(query)
            rows = cursor.fetchall()
            
            cameras = {}
            
            for row in rows:
                camera_id = row[0]
                
                # Validate device (ensure GPU is available if requested)
                requested_device = row[4]
                if requested_device.startswith('cuda') and not torch.cuda.is_available():
                    logger.warning(f"⚠️ {camera_id}: GPU requested but not available, using CPU")
                    device = self.device_cpu
                else:
                    device = requested_device
                
                cameras[camera_id] = {
                    'name': row[1],
                    'description': row[2],
                    'stream_url': row[3],
                    'device': device,
                    'model_size': 'yolov8n.pt',  # Always use nano for 2GB GPU
                    'resolution': (row[5], row[6]),
                    'process_every_n_frames': row[7],
                    'priority': row[8],
                    'enable_incidents': row[9] if row[9] is not None else True,
                    'enable_pose': row[10] if row[10] is not None else False,
                    'confidence_threshold': row[11] if row[11] is not None else 0.5,
                }
            
            cursor.close()
            
            logger.info(f"✅ Loaded {len(cameras)} active cameras from database")
            
            # Log GPU vs CPU distribution
            gpu_count = sum(1 for c in cameras.values() if c['device'].startswith('cuda'))
            cpu_count = len(cameras) - gpu_count
            logger.info(f"   GPU cameras: {gpu_count}")
            logger.info(f"   CPU cameras: {cpu_count}")
            
            # Warn if multiple cameras on GPU
            if gpu_count > 1:
                logger.warning(
                    f"⚠️ WARNING: {gpu_count} cameras assigned to GPU with 2GB VRAM. "
                    "This may cause memory issues!"
                )
            
            return cameras
            
        except Exception as e:
            logger.error(f"❌ Error fetching cameras: {e}")
            return {}
    
    def get_camera_config(self, camera_id: str) -> Optional[Dict]:
        """Get configuration for a specific camera"""
        cameras = self.get_active_cameras()
        return cameras.get(camera_id)
    
    def update_camera_status(self, camera_id: str, status: str, error_msg: str = None):
        """
        Update camera status in database
        
        Args:
            camera_id: Camera identifier
            status: 'running', 'stopped', 'error'
            error_msg: Error message if status is 'error'
        """
        if not self.conn or self.conn.closed:
            if not self.connect_db():
                return
        
        try:
            cursor = self.conn.cursor()
            
            # Create status table if doesn't exist
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS camera_status (
                    camera_id VARCHAR(50) PRIMARY KEY,
                    status VARCHAR(20),
                    error_message TEXT,
                    last_frame_time TIMESTAMP,
                    fps FLOAT,
                    total_frames INT,
                    total_incidents INT,
                    updated_at TIMESTAMP DEFAULT NOW()
                )
            """)
            
            # Upsert status
            cursor.execute("""
                INSERT INTO camera_status (camera_id, status, error_message, updated_at)
                VALUES (%s, %s, %s, NOW())
                ON CONFLICT (camera_id) 
                DO UPDATE SET 
                    status = EXCLUDED.status,
                    error_message = EXCLUDED.error_message,
                    updated_at = EXCLUDED.updated_at
            """, (camera_id, status, error_msg))
            
            self.conn.commit()
            cursor.close()
            
        except Exception as e:
            logger.error(f"Error updating camera status: {e}")
    
    def update_camera_metrics(self, camera_id: str, fps: float, total_frames: int, 
                             total_incidents: int):
        """Update camera performance metrics"""
        if not self.conn or self.conn.closed:
            return
        
        try:
            cursor = self.conn.cursor()
            
            cursor.execute("""
                UPDATE camera_status 
                SET fps = %s, 
                    total_frames = %s, 
                    total_incidents = %s,
                    last_frame_time = NOW(),
                    updated_at = NOW()
                WHERE camera_id = %s
            """, (fps, total_frames, total_incidents, camera_id))
            
            self.conn.commit()
            cursor.close()
            
        except Exception as e:
            logger.error(f"Error updating metrics: {e}")
    
    def reload_cameras(self) -> Dict[str, Dict]:
        """
        Reload camera configurations from database
        Useful for hot-reloading without restarting workers
        """
        logger.info("🔄 Reloading camera configurations...")
        return self.get_active_cameras()
    
    def validate_stream_url(self, stream_url: str) -> bool:
        """
        Validate if stream URL is accessible
        
        Args:
            stream_url: Camera stream URL (RTSP, HTTP, or device ID)
            
        Returns:
            True if stream is accessible
        """
        import cv2
        
        try:
            cap = cv2.VideoCapture(stream_url)
            if cap.isOpened():
                ret, _ = cap.read()
                cap.release()
                return ret
            return False
        except Exception as e:
            logger.error(f"Stream validation error: {e}")
            return False


# Singleton instance
_config_manager = None

def get_config_manager() -> ConfigManager:
    """Get singleton ConfigManager instance"""
    global _config_manager
    if _config_manager is None:
        _config_manager = ConfigManager()
    return _config_manager


# For backward compatibility with static config.py
def load_cameras_from_db() -> Dict[str, Dict]:
    """
    Load cameras from database
    This function can replace the static CAMERAS dict in config.py
    """
    manager = get_config_manager()
    return manager.get_active_cameras()


# Quick test
if __name__ == '__main__':
    print("=== Testing ConfigManager ===\n")
    
    manager = ConfigManager()
    
    if manager.connect_db():
        cameras = manager.get_active_cameras()
        
        print(f"Found {len(cameras)} cameras:\n")
        for cam_id, config in cameras.items():
            print(f"📹 {cam_id}:")
            print(f"   Name: {config['name']}")
            print(f"   URL: {config['stream_url']}")
            print(f"   Device: {config['device']}")
            print(f"   Resolution: {config['resolution']}")
            print()
        
        manager.disconnect_db()
    else:
        print("❌ Could not connect to database")
        print("Using fallback static configuration...")