import cv2

# Try webcam at index 0
cap = cv2.VideoCapture(0)

if not cap.isOpened():
    print("❌ Webcam could NOT be opened on index 0")
    exit()

print("✅ Webcam opened successfully!")

while True:
    ret, frame = cap.read()
    if not ret:
        print("❌ Failed to read frame")
        break

    cv2.imshow("Webcam Test - Press Q to quit", frame)

    # Press Q to close the window
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

# Release camera and close window
cap.release()
cv2.destroyAllWindows()
