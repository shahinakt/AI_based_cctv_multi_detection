
import torch
import torch.nn as nn
import torch.optim as optim
from ai_worker.data.loader import get_dataloader
from ai_worker.data.augmentation import get_augmentation
import argparse

class PoseNet(nn.Module):
    def __init__(self, num_keypoints=17):
        super().__init__()
        self.backbone = nn.Sequential(
            nn.Conv2d(3, 64, 3, padding=1),
            nn.ReLU(),
            nn.MaxPool2d(2),
            nn.Conv2d(64, 128, 3, padding=1),
            nn.ReLU(),
            nn.MaxPool2d(2),
            nn.Flatten()
        )
        self.fc = nn.Linear(128 * 160 * 160, num_keypoints * 2)  # 640x640 -> 160x160 after 2 maxpools

    def forward(self, x):
        x = self.backbone(x)
        return x.view(-1, 17, 2)  # 17 keypoints, (x,y)

def train_pose(data_path: str, epochs: int = 20):
    transform = get_augmentation(is_train=True, mode='pose')
    dataloader = get_dataloader(data_path, batch_size=16, split='train')
    
    model = PoseNet()
    optimizer = optim.Adam(model.parameters(), lr=0.001)
    criterion = nn.MSELoss()
    
    for epoch in range(epochs):
        for batch in dataloader:
            images = batch['images']
            # Mock labels: in production, load actual keypoints
            labels = torch.rand(images.shape[0], 17, 2)
            optimizer.zero_grad()
            outputs = model(images)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()
        print(f'Epoch {epoch}, Loss: {loss.item()}')
    
    torch.save(model.state_dict(), 'pose_model.pth')

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--data_path', type=str, required=True)
    parser.add_argument('--epochs', type=int, default=20)
    args = parser.parse_args()
    train_pose(args.data_path, args.epochs)