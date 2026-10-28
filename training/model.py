"""FediDraw CNN: three conv blocks and a small classifier head."""

from torch import nn


def conv_block(cin: int, cout: int) -> nn.Sequential:
    return nn.Sequential(
        nn.Conv2d(cin, cout, kernel_size=3, padding=1, bias=False),
        nn.BatchNorm2d(cout),
        nn.ReLU(inplace=True),
        nn.MaxPool2d(2),
    )


class FediDrawNet(nn.Module):
    """1x28x28 -> 32x14x14 -> 64x7x7 -> 128x3x3 -> 256 -> num_classes logits."""

    def __init__(self, num_classes: int = 30):
        super().__init__()
        self.block1 = conv_block(1, 32)
        self.block2 = conv_block(32, 64)
        self.block3 = conv_block(64, 128)
        self.head = nn.Sequential(
            nn.Flatten(),
            nn.Dropout(0.3),
            nn.Linear(128 * 3 * 3, 256),
            nn.ReLU(inplace=True),
            nn.Dropout(0.5),
            nn.Linear(256, num_classes),
        )

    def forward(self, x):
        return self.head(self.block3(self.block2(self.block1(x))))


def count_parameters(model: nn.Module) -> int:
    return sum(p.numel() for p in model.parameters())
