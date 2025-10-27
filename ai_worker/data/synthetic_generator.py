# ai_worker/data/synthetic_generator.py
import cv2
import os
import numpy as np
from typing import List
import random

def generate_synthetic(num_samples: int, output_dir: str, event_type: str = 'fall'):
    os.makedirs(os.path.join(output_dir, 'images'), exist_ok=True)
    os.makedirs(os.path.join(output_dir, 'labels'), exist_ok=True)
    # Mock backgrounds: assume pre-downloaded empty room videos
    bg_video = cv2.VideoCapture('data/backgrounds/empty_room.mp4')  # Placeholder path
    human_template = cv2.imread('data/templates/human_fall.png')  # Alpha-blended template
    for i in range(num_samples):
        ret, frame = bg_video.read()
        if not ret:
            bg_video.set(cv2.CAP_PROP_POS_FRAMES, 0)
            ret, frame = bg_video.read()
        # Overlay synthetic event
        x, y = random.randint(0, frame.shape[1]-human_template.shape[1]), random.randint(0, frame.shape[0]-human_template.shape[0])
        if len(human_template.shape) == 3 and human_template.shape[2] == 4:
            alpha = human_template[:, :, 3] / 255.0
            frame[y:y+human_template.shape[0], x:x+human_template.shape[1]] = alpha * human_template[:, :, :3] + (1 - alpha) * frame[y:y+human_template.shape[0], x:x+human_template.shape[1]]
        else:
            frame[y:y+human_template.shape[0], x:x+human_template.shape[1]] = human_template
        img_path = os.path.join(output_dir, 'images', f'synth_{i}.jpg')
        cv2.imwrite(img_path, frame)
        # Generate label (YOLO format: class x y w h)
        label = f"{0 if event_type == 'fall' else 1} {x/frame.shape[1]} {(y+human_template.shape[0]/2)/frame.shape[0]} {(human_template.shape[1]/frame.shape[1])} {(human_template.shape[0]/frame.shape[0])}\n"
        with open(os.path.join(output_dir, 'labels', f'synth_{i}.txt'), 'w') as f:
            f.write(label)
    bg_video.release()