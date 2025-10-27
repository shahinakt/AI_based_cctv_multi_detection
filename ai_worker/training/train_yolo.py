# ai_worker/training/train_yolo.py
from ultralytics import YOLO
import argparse
import os

def train_yolo(data_path: str, epochs: int = 50, imgsz: int = 640, model_path: str = 'yolov8n.pt'):
    # Create data.yaml if doesn't exist
    data_yaml = f"""
train: {os.path.join(data_path, 'train')}
val: {os.path.join(data_path, 'val')}
nc: 3  # person, vehicle, other
names: ['person', 'vehicle', 'other']
"""
    with open('data.yaml', 'w') as f:
        f.write(data_yaml)
    
    model = YOLO(model_path)
    model.train(data='data.yaml', epochs=epochs, imgsz=imgsz)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--data_path', type=str, required=True)
    parser.add_argument('--epochs', type=int, default=50)
    parser.add_argument('--imgsz', type=int, default=640)
    parser.add_argument('--model_path', type=str, default='yolov8n.pt')
    args = parser.parse_args()
    train_yolo(args.data_path, args.epochs, args.imgsz, args.model_path)