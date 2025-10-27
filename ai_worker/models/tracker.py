# ai_worker/models/tracker.py
import numpy as np
from scipy.optimize import linear_sum_assignment
from filterpy.kalman import KalmanFilter
from typing import List, Dict, Any
import time

class Track:
    def __init__(self, bbox, conf, cls, track_id):
        self.bbox = bbox  # [x, y, w, h]
        self.conf = conf
        self.cls = cls
        self.track_id = track_id
        self.kf = KalmanFilter(dim_x=7, dim_z=4)
        # Initialize Kalman filter with bbox as state [x, y, w, h, vx, vy, vw]
        self.kf.x = np.array([bbox[0], bbox[1], bbox[2], bbox[3], 0, 0, 0])
        self.kf.F = np.array([[1,0,0,0,1,0,0],
                             [0,1,0,0,0,1,0],
                             [0,0,1,0,0,0,1],
                             [0,0,0,1,0,0,0],
                             [0,0,0,0,1,0,0],
                             [0,0,0,0,0,1,0],
                             [0,0,0,0,0,0,1]])
        self.kf.H = np.array([[1,0,0,0,0,0,0],
                             [0,1,0,0,0,0,0],
                             [0,0,1,0,0,0,0],
                             [0,0,0,1,0,0,0]])
        self.kf.P *= 1000
        self.kf.R = np.eye(4) * 5
        self.kf.Q = np.eye(7) * 0.1
        self.time_since_update = 0
        self.hit_streak = 1

    def predict(self):
        self.kf.predict()
        self.time_since_update += 1
        return [int(self.kf.x[0]), int(self.kf.x[1]), int(self.kf.x[2]), int(self.kf.x[3])]

    def update(self, bbox):
        self.kf.update(np.array(bbox))
        self.time_since_update = 0
        self.hit_streak += 1

class ByteTracker:
    def __init__(self, max_age=30, min_hits=3, iou_threshold=0.3):
        self.max_age = max_age
        self.min_hits = min_hits
        self.iou_threshold = iou_threshold
        self.trackers = []
        self.frame_count = 0
        self.next_id = 1

    def update(self, detections: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        self.frame_count += 1
        
        # Predict current tracks
        for trk in self.trackers:
            trk.predict()
        
        # Get predicted boxes
        trk_boxes = [trk.predict() for trk in self.trackers]
        det_boxes = [d['bbox'] for d in detections]
        
        # Match using Hungarian algorithm with IoU
        iou_matrix = np.zeros((len(trk_boxes), len(det_boxes)))
        for i, trk_box in enumerate(trk_boxes):
            for j, det_box in enumerate(det_boxes):
                iou_matrix[i, j] = self._iou(trk_box, det_box)
        
        matched_indices = linear_sum_assignment(-iou_matrix)
        matched_indices = list(zip(matched_indices[0], matched_indices[1]))
        
        # Update matched tracks
        for trk_idx, det_idx in matched_indices:
            if iou_matrix[trk_idx, det_idx] > self.iou_threshold:
                self.trackers[trk_idx].update(detections[det_idx]['bbox'])
        
        # Create new tracks for unmatched detections
        unmatched_dets = [j for j in range(len(detections)) if j not in [d[1] for d in matched_indices]]
        for j in unmatched_dets:
            new_trk = Track(detections[j]['bbox'], detections[j]['conf'], detections[j]['class'], self.next_id)
            self.next_id += 1
            self.trackers.append(new_trk)
        
        # Remove dead tracks
        self.trackers = [trk for trk in self.trackers if trk.time_since_update < self.max_age]
        
        # Return tracked objects with IDs
        output = []
        for trk in self.trackers:
            if trk.time_since_update == 0 and trk.hit_streak >= self.min_hits:
                output.append({
                    'bbox': trk.bbox,
                    'conf': trk.conf,
                    'class': trk.cls,
                    'track_id': trk.track_id
                })
        return output

    def _iou(self, box1, box2):
        # Calculate IoU between two boxes [x, y, w, h]
        x1, y1, w1, h1 = box1
        x2, y2, w2, h2 = box2
        
        x_left = max(x1, x2)
        y_top = max(y1, y2)
        x_right = min(x1 + w1, x2 + w2)
        y_bottom = min(y1 + h1, y2 + h2)
        
        if x_right < x_left or y_bottom < y_top:
            return 0.0
        
        intersection_area = (x_right - x_left) * (y_bottom - y_top)
        box1_area = w1 * h1
        box2_area = w2 * h2
        iou = intersection_area / (box1_area + box2_area - intersection_area + 1e-6)
        return iou