import torch

print("🔍 GPU / CUDA TEST\n")

# 1. Basic CUDA availability
print(f"PyTorch version      : {torch.__version__}")
print(f"CUDA available       : {torch.cuda.is_available()}")

if not torch.cuda.is_available():
    print("\n❌ CUDA is NOT available. The GPU will not be used.")
    print("   Check: driver, CUDA toolkit, PyTorch CUDA build.")
else:
    # 2. GPU device info
    device_index = torch.cuda.current_device()
    device_name = torch.cuda.get_device_name(device_index)
    capability = torch.cuda.get_device_capability(device_index)
    total_mem = torch.cuda.get_device_properties(device_index).total_memory / (1024**3)

    print(f"\n✅ CUDA is available!")
    print(f"GPU index            : {device_index}")
    print(f"GPU name             : {device_name}")
    print(f"Compute capability   : {capability[0]}.{capability[1]}")
    print(f"Total GPU memory     : {total_mem:.2f} GB")

    # 3. Simple tensor test on GPU
    try:
        device = torch.device("cuda")
        print("\n➡ Creating tensors on GPU and running a small test...")

        a = torch.randn((1000, 1000), device=device)
        b = torch.randn((1000, 1000), device=device)
        c = torch.matmul(a, b)

        print("✅ Tensor operation on GPU succeeded!")
        print(f"Result tensor shape  : {c.shape}")
    except Exception as e:
        print("\n❌ Error while running tensor op on GPU:")
        print(e)

print("\n🎯 GPU test finished.")
