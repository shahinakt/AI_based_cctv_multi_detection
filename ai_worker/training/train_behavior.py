
import torch
import torch.nn as nn
import torch.optim as optim
from ai_worker.models.behavior_classifier import BehaviorClassifier
from ai_worker.data.loader import get_dataloader
import argparse

def train_behavior(data_path: str, epochs: int = 30):
    dataloader = get_dataloader(data_path, batch_size=8, split='train')
    
    model = BehaviorClassifier(num_classes=3)
    optimizer = optim.Adam(model.parameters(), lr=0.001)
    criterion = nn.CrossEntropyLoss()
    
    for epoch in range(epochs):
        for batch in dataloader:
            images = batch['images']
            # Mock labels: [0,1,2] for normal, fall, fight
            labels = torch.randint(0, 3, (images.shape[0],))
            optimizer.zero_grad()
            outputs = model(images)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()
        print(f'Epoch {epoch}, Loss: {loss.item()}')
    
    torch.save(model.state_dict(), 'behavior_model.pth')

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--data_path', type=str, required=True)
    parser.add_argument('--epochs', type=int, default=30)
    args = parser.parse_args()
    train_behavior(args.data_path, args.epochs)