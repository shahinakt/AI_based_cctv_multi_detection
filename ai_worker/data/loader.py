
import torch
from torch.utils.data import Dataset, DataLoader
import cv2
import os
from PIL import Image
import json
from typing import List, Dict, Any

class VisionDataset(Dataset):
    def __init__(self, data_dir: str, split: str = 'train', transform=None):
        self.data_dir = os.path.join(data_dir, split)
        self.transform = transform
        self.samples = []
        # Assume COCO/YOLO format: images/ and labels/ with .txt files
        for img_file in os.listdir(os.path.join(self.data_dir, 'images')):
            if img_file.endswith(('.jpg', '.png')):
                label_file = img_file.replace('.jpg', '.txt').replace('.png', '.txt')
                self.samples.append({
                    'image': os.path.join(self.data_dir, 'images', img_file),
                    'label': os.path.join(self.data_dir, 'labels', label_file) if os.path.exists(os.path.join(self.data_dir, 'labels', label_file)) else None
                })

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        sample = self.samples[idx]
        image = cv2.imread(sample['image'])
        image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        if self.transform:
            image = self.transform(image)
        labels = []
        if sample['label']:
            with open(sample['label'], 'r') as f:
                labels = [line.strip().split() for line in f.readlines()]
        return {'image': torch.tensor(image).permute(2, 0, 1), 'labels': labels}

def get_dataloader(data_dir: str, batch_size: int = 32, num_workers: int = 4, split: str = 'train') -> DataLoader:
    dataset = VisionDataset(data_dir, split)
    return DataLoader(dataset, batch_size=batch_size, shuffle=(split == 'train'), num_workers=num_workers, collate_fn=lambda x: {
        'images': torch.stack([item['image'] for item in x]),
        'labels': [item['labels'] for item in x]
    })